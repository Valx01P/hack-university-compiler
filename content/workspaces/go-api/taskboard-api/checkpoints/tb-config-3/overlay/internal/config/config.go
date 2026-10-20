// Package config loads everything the server can be told at startup. Load reads the
// environment and the command line once, checks every value, and reports all the
// problems together, so a bad deployment fails at once and says exactly why.
package config

import (
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Config is the server's settings. Nothing else in the app reads the environment.
type Config struct {
	Port            int
	AdminPort       int // 0 turns the admin server off
	DatabaseURL     string
	AppEnv          string // development, test, or production
	LogLevel        slog.Level
	TokenSecret     []byte
	SecretGenerated bool   // true when development made up TokenSecret because none was set
	AuthMode        string // session or jwt
	BcryptCost      int
	MigrateOnStart  bool
	SlowQuery       time.Duration // 0 turns slow query logs off
	CORSOrigins     []string
	TrustedProxy    net.IP // nil trusts no X-Forwarded-For
	UploadDir       string
	ShutdownTimeout time.Duration
	ShowVersion     bool
}

// IsProduction reports whether production's stricter rules apply.
func (c Config) IsProduction() bool { return c.AppEnv == "production" }

// IsDevelopment reports whether development helpers, such as X-Query-Count, are on.
func (c Config) IsDevelopment() bool { return c.AppEnv == "development" }

// Load builds the Config from defaults, then the environment, then flags in args
// (which win). getenv is os.Getenv in main and a map lookup in tests. The error joins
// every problem found, one per line.
func Load(getenv func(string) string, args []string) (Config, error) {
	cfg := Config{
		Port:            8080,
		AdminPort:       6060,
		AppEnv:          "development",
		LogLevel:        slog.LevelInfo,
		AuthMode:        "session",
		BcryptCost:      10,
		SlowQuery:       200 * time.Millisecond,
		UploadDir:       "data/uploads",
		ShutdownTimeout: 10 * time.Second,
	}
	var errs []error
	env := func(name string, parse func(string) error) {
		if v := getenv(name); v != "" {
			if err := parse(v); err != nil {
				errs = append(errs, fmt.Errorf("%s: %w", name, err))
			}
		}
	}

	env("PORT", intIn(&cfg.Port, 1, 65535))
	env("ADMIN_PORT", intIn(&cfg.AdminPort, 0, 65535))
	cfg.DatabaseURL = getenv("DATABASE_URL")
	env("APP_ENV", oneOf(&cfg.AppEnv, "development", "test", "production"))
	env("LOG_LEVEL", level(&cfg.LogLevel))
	env("AUTH_MODE", oneOf(&cfg.AuthMode, "session", "jwt"))
	env("BCRYPT_COST", intIn(&cfg.BcryptCost, 4, 31))
	env("MIGRATE_ON_START", boolean(&cfg.MigrateOnStart))
	env("SLOW_QUERY_MS", millis(&cfg.SlowQuery))
	env("CORS_ORIGINS", origins(&cfg.CORSOrigins))
	env("TRUSTED_PROXY", ip(&cfg.TrustedProxy))
	if v := getenv("UPLOAD_DIR"); v != "" {
		cfg.UploadDir = v
	}
	env("SHUTDOWN_TIMEOUT", duration(&cfg.ShutdownTimeout))

	fs := flag.NewFlagSet("api", flag.ContinueOnError)
	var usage strings.Builder
	fs.SetOutput(&usage)
	fs.Func("port", "port for the API (overrides PORT)", intIn(&cfg.Port, 1, 65535))
	fs.Func("admin-port", "port for /debug/vars and pprof, 0 for none (overrides ADMIN_PORT)", intIn(&cfg.AdminPort, 0, 65535))
	fs.Func("log-level", "debug, info, warn, or error (overrides LOG_LEVEL)", level(&cfg.LogLevel))
	fs.BoolVar(&cfg.ShowVersion, "version", false, "print the version and exit")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return Config{}, fmt.Errorf("%w\n%s", err, usage.String())
		}
		errs = append(errs, err)
	}
	if cfg.ShowVersion && len(errs) == 0 {
		return cfg, nil
	}

	if cfg.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL: is required"))
	}
	if cfg.AdminPort != 0 && cfg.AdminPort == cfg.Port {
		errs = append(errs, errors.New("ADMIN_PORT: must differ from PORT"))
	}
	if cfg.IsProduction() && cfg.BcryptCost < 10 {
		errs = append(errs, errors.New("BCRYPT_COST: production needs at least 10"))
	}
	if err := errors.Join(errs...); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// The parsers below each set one field from text. Load uses them for both the
// environment and the flags, so a value is checked the same way wherever it comes from.

func intIn(dst *int, lo, hi int) func(string) error {
	return func(s string) error {
		n, err := strconv.Atoi(s)
		if err != nil || n < lo || n > hi {
			return fmt.Errorf("must be a whole number from %d to %d, not %q", lo, hi, s)
		}
		*dst = n
		return nil
	}
}

func oneOf(dst *string, allowed ...string) func(string) error {
	return func(s string) error {
		for _, a := range allowed {
			if s == a {
				*dst = s
				return nil
			}
		}
		return fmt.Errorf("must be one of %s, not %q", strings.Join(allowed, ", "), s)
	}
}

func level(dst *slog.Level) func(string) error {
	return func(s string) error {
		switch strings.ToLower(s) {
		case "debug", "info", "warn", "error":
			return dst.UnmarshalText([]byte(s))
		}
		return fmt.Errorf("must be debug, info, warn, or error, not %q", s)
	}
}

func boolean(dst *bool) func(string) error {
	return func(s string) error {
		b, err := strconv.ParseBool(s)
		if err != nil {
			return fmt.Errorf("must be true or false, not %q", s)
		}
		*dst = b
		return nil
	}
}

func millis(dst *time.Duration) func(string) error {
	return func(s string) error {
		n, err := strconv.Atoi(s)
		if err != nil || n < 0 {
			return fmt.Errorf("must be a whole number of milliseconds, not %q", s)
		}
		*dst = time.Duration(n) * time.Millisecond
		return nil
	}
}

func duration(dst *time.Duration) func(string) error {
	return func(s string) error {
		d, err := time.ParseDuration(s)
		if err != nil || d <= 0 {
			return fmt.Errorf("must be a positive duration such as 10s, not %q", s)
		}
		*dst = d
		return nil
	}
}

// origins parses a comma-separated list of exact origins such as
// "http://localhost:20013,https://app.example.com".
func origins(dst *[]string) func(string) error {
	return func(s string) error {
		var list []string
		for o := range strings.SplitSeq(s, ",") {
			o = strings.TrimSpace(o)
			if o == "" {
				continue
			}
			u, err := url.Parse(o)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || (u.Path != "" && u.Path != "/") || u.RawQuery != "" {
				return fmt.Errorf("%q is not an origin such as http://localhost:5173", o)
			}
			list = append(list, u.Scheme+"://"+u.Host)
		}
		*dst = list
		return nil
	}
}

func ip(dst *net.IP) func(string) error {
	return func(s string) error {
		addr := net.ParseIP(strings.TrimSpace(s))
		if addr == nil {
			return fmt.Errorf("must be an IP address, not %q", s)
		}
		*dst = addr
		return nil
	}
}
