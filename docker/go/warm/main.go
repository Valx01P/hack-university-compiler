// The warm-up program hu/go compiles while it is built, so the first build in
// a workspace finds the standard library and the course's packages already
// compiled in the shared build cache. It imports what a Go API in the course
// imports. It is never run.
package main

import (
	"cmp"
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"expvar"
	"flag"
	"fmt"
	"log/slog"
	"maps"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-playground/validator/v10"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/sync/errgroup"
	"golang.org/x/sync/semaphore"
	"golang.org/x/time/rate"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

//go:embed main.go
var files embed.FS

func main() {
	_ = []any{cmp.Compare[int], context.Background, sql.Open, files, json.Marshal, errors.Join, expvar.Publish,
		flag.Parse, fmt.Println, slog.Info, maps.Keys[map[int]int], http.NewServeMux, pprof.Index, os.Getenv,
		signal.NotifyContext, slices.Sort[[]int], strconv.Itoa, strings.Cut, sync.OnceValue[int], syscall.SIGTERM,
		time.Now, chi.NewRouter, middleware.Logger, validator.New, jwt.Parse, pgx.Connect, pgconn.Connect,
		pgtype.Text{}, pgxpool.New, stdlib.OpenDBFromPool, goose.NewProvider, argon2.IDKey,
		bcrypt.GenerateFromPassword, errgroup.WithContext, semaphore.NewWeighted, rate.NewLimiter,
		postgres.Open, gorm.Open}
}
