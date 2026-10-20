// Package deps names every module the Go APIs course uses, so go mod tidy
// keeps them all in go.mod and go.sum. Nothing imports it. A single-file
// program builds beside it in work/, and its imports resolve from these
// requirements and the image's module cache.
package deps

import (
	_ "github.com/go-chi/chi/v5"
	_ "github.com/go-chi/chi/v5/middleware"
	_ "github.com/go-playground/validator/v10"
	_ "github.com/golang-jwt/jwt/v5"
	_ "github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/pgtype"
	_ "github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	_ "github.com/pressly/goose/v3"
	_ "golang.org/x/crypto/argon2"
	_ "golang.org/x/crypto/bcrypt"
	_ "golang.org/x/sync/errgroup"
	_ "golang.org/x/sync/semaphore"
	_ "golang.org/x/time/rate"
	_ "gorm.io/driver/postgres"
	_ "gorm.io/gorm"
)
