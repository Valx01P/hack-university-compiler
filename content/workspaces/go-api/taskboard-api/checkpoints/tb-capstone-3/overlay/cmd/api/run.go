package main

import (
	"context"
	"errors"
	"expvar"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"

	"example.com/taskboard/db"
	"example.com/taskboard/internal/api"
	"example.com/taskboard/internal/auth"
	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/config"
	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/files"
	"example.com/taskboard/internal/jobs"
	"example.com/taskboard/internal/service"
	"example.com/taskboard/internal/store"
)

// run is the composition root: the one place that knows every concrete type. It
// builds the app from the bottom up (config, logger, database, stores, services,
// handlers), serves until ctx ends or a signal arrives, then shuts down in reverse:
// the servers stop taking requests and finish the ones in flight, the job worker
// finishes its job, and only then does the database pool close.
func run(ctx context.Context, args []string, getenv func(string) string, stdout io.Writer) error {
	cfg, err := config.Load(getenv, args)
	if err != nil {
		return err
	}
	if cfg.ShowVersion {
		_, err := fmt.Fprintf(stdout, "taskboard %s (%s)\n", version, runtime.Version())
		return err
	}
	clk, err := clock.FromEnv(getenv)
	if err != nil {
		return err
	}
	log := slog.New(slog.NewJSONHandler(stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	log.Info("starting", "version", version, "go", runtime.Version(), "config", cfg)
	if _, fixed := clk.(clock.Fixed); fixed {
		log.Info("the clock is fixed", "now", clk.Now())
	}
	if cfg.SecretGenerated {
		log.Warn("TOKEN_SECRET is not set, so a random one was made: JWTs will stop working when the server restarts")
	}

	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := store.NewPool(ctx, cfg.DatabaseURL, store.NewTracer(log, cfg.SlowQuery))
	if err != nil {
		return err
	}
	defer pool.Close()
	if cfg.MigrateOnStart {
		n, err := db.Migrate(ctx, pool, log)
		if err != nil {
			return err
		}
		log.Info("migrations applied", "count", n)
	}

	uploads, err := files.Open(cfg.UploadDir)
	if err != nil {
		return err
	}
	defer func() { _ = uploads.Close() }()

	st := store.New(pool)
	jobRepo := store.NewJobRepo(st)
	stores := service.Stores{
		Tasks:       store.NewTaskRepo(st),
		Projects:    store.NewProjectRepo(st),
		Users:       store.NewUserRepo(st),
		Comments:    store.NewCommentRepo(st),
		Watchers:    store.NewWatcherRepo(st),
		Sessions:    store.NewSessionRepo(st),
		Jobs:        jobRepo,
		Attachments: store.NewAttachmentRepo(st),
		Files:       uploads,
		Labels:      store.NewLabelRepo(st),
		Tx:          st,
	}
	hooks := &service.Hooks{
		BeforeCreateTask: []func(context.Context, *domain.Task) error{service.TidyTitle},
		BeforeUpdateTask: []func(context.Context, *domain.Task) error{service.TidyTitle},
	}
	hasher, err := auth.NewHasher(cfg.BcryptCost)
	if err != nil {
		return err
	}
	jwt := auth.NewJWT(cfg.TokenSecret, clk)

	handler := api.NewServer(api.Deps{
		Log:          log,
		Auth:         service.NewAuthService(stores, hasher, jwt, service.AuthMode(cfg.AuthMode), clk, log),
		Users:        service.NewUserService(stores),
		Projects:     service.NewProjectService(stores, clk),
		Tasks:        service.NewTaskService(stores, hooks, clk, log),
		Comments:     service.NewCommentService(stores, clk),
		Watchers:     service.NewWatcherService(stores, clk, log),
		Attachments:  service.NewAttachmentService(stores, clk, log),
		Ready:        st.Ping,
		CORSOrigins:  cfg.CORSOrigins,
		TrustedProxy: cfg.TrustedProxy,
		Development:  cfg.IsDevelopment(),
	})
	servers := []*http.Server{{
		Addr:              ":" + strconv.Itoa(cfg.Port),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       2 * time.Minute,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}}
	if cfg.AdminPort != 0 {
		servers = append(servers, &http.Server{
			Addr:              "127.0.0.1:" + strconv.Itoa(cfg.AdminPort),
			Handler:           adminRoutes(),
			ReadHeaderTimeout: 5 * time.Second,
		})
	}
	worker := jobs.NewWorker(jobRepo, jobs.Handlers(jobRepo, clk), clk, log)

	g, gctx := errgroup.WithContext(ctx)
	for _, srv := range servers {
		g.Go(func() error { return serve(log, srv) })
	}
	g.Go(func() error { return worker.Run(gctx) })
	g.Go(func() error {
		<-gctx.Done()
		log.Info("shutting down", "timeout", cfg.ShutdownTimeout.String())
		sctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), cfg.ShutdownTimeout)
		defer cancel()
		var errs []error
		for _, srv := range servers {
			errs = append(errs, srv.Shutdown(sctx))
		}
		return errors.Join(errs...)
	})
	err = g.Wait()
	log.Info("stopped", "err", err)
	return err
}

// serve listens first, so "listening" is logged only once the port is really taken,
// then serves until Shutdown.
func serve(log *slog.Logger, srv *http.Server) error {
	ln, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		return err
	}
	port := ln.Addr().(*net.TCPAddr).Port
	log.Info("listening", "addr", ln.Addr().String(), "url", "http://localhost:"+strconv.Itoa(port))
	if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// adminRoutes is the admin server: metrics at /debug/vars and profiles at
// /debug/pprof/. It listens on 127.0.0.1 only, since a profile shows the program's
// insides to whoever asks.
func adminRoutes() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /debug/vars", expvar.Handler())
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	return mux
}
