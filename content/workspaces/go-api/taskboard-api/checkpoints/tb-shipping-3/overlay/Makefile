# Taskboard's everyday commands. Run `make` to list them. Settings come from the
# environment, and from .env when you made one (cp .env.example .env).

ifneq (,$(wildcard .env))
include .env
export
endif

# goose reads these. The workspace sets DATABASE_URL.
export GOOSE_DRIVER ?= postgres
export GOOSE_DBSTRING ?= $(DATABASE_URL)
export GOOSE_MIGRATION_DIR ?= db/migrations

VERSION ?= dev

.DEFAULT_GOAL := help
.PHONY: help run build test test-short test-race test-integration vet fmt generate \
	migrate-up migrate-down migrate-status sqlc seed seed-perf db-reset lint

help: ## list the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-17s %s\n", $$1, $$2}'

run: ## start the API, which prints the URL it listens on
	go run ./cmd/api

build: ## build bin/api for release: make build VERSION=1.4.2
	go build -trimpath -ldflags "-s -w -X main.version=$(VERSION)" -o bin/api ./cmd/api

test: ## run every test (the database tests use DATABASE_URL)
	go test ./...

test-short: ## run only the tests that need no database
	go test -short ./...

test-race: ## run every test with the race detector
	go test -race ./...

test-integration: ## run the tests that use PostgreSQL
	go test -count=1 ./internal/store/
	go test -count=1 -run E2E ./internal/api/

vet: ## report suspicious code
	go vet ./...

fmt: ## format every Go file
	gofmt -w .

generate: ## rerun go:generate (domain/priority_string.go, by stringer)
	go generate ./...

migrate-up: ## apply every pending migration
	scripts/wait-for-db.sh
	goose up

migrate-down: ## roll back the newest migration
	goose down

migrate-status: ## list the migrations and which are applied
	goose status

sqlc: ## regenerate internal/store/sqlcdb from db/queries and db/migrations
	sqlc generate

seed: ## load the Taskboard contract's rows (db/seed.sql)
	go run ./cmd/seed

seed-perf: ## also load 5,000 tasks and 50,000 comments (db/seed_perf.sql)
	go run ./cmd/seed -file db/seed_perf.sql

db-reset: ## drop everything, migrate from scratch, and load the seed
	goose reset
	goose up
	psql "$(DATABASE_URL)" --quiet -v ON_ERROR_STOP=1 -f db/seed.sql

lint: ## run golangci-lint with .golangci.yml
	golangci-lint run ./...
