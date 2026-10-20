# Go API playground

A free-play Go module with its own PostgreSQL database, for trying anything from the
lessons: a handler, a query, a goroutine, a test. Nothing here is checked, and Reset
puts it back the way it started.

```sh
go run .                            # start the server: GET /hello and GET /notes
psql "$DATABASE_URL" -f scratch.sql # make the notes table that /notes reads
go test ./...                       # run main_test.go
```

## What is here

| File | What it is |
| --- | --- |
| `main.go` | A small server: `GET /hello?name=` answers JSON, and `GET /notes` reads the notes table with pgx. It listens on `$PORT` |
| `main_test.go` | A table test of `/hello` with `httptest`, to copy from |
| `scratch.sql` | The notes table with three rows. Loading it again starts it over |
| `requests.http` | The two requests, for the API panel |
| `go.mod`, `go.sum` | Module `example.com/playground` on Go 1.27, with pgx v5.11.0 already required, so `import "github.com/jackc/pgx/v5"` works at once |

## The database

`DATABASE_URL` is already set, to an empty database of your own. Try:

```sh
psql "$DATABASE_URL"                         # then \dt, \d notes, SELECT * FROM notes;
psql "$DATABASE_URL" -c 'SELECT version()'
```

From Go, `pgx.Connect(ctx, os.Getenv("DATABASE_URL"))` gives one connection (what
`/notes` does), and `pgxpool.New` gives a pool, which a long-running server should use.

## What is installed

Go 1.27.2 with `gofmt`, `go vet`, and the race detector (`go test -race`), plus `psql`
(PostgreSQL 18), `curl`, `jq`, `make`, `sqlc` 1.31.1, `goose` 3.29.0, and `hey` for load
tests. The workspace has no internet, but every module the course uses is in the local
module cache, so `go get` works for them at the course's versions, for example:

```sh
go get github.com/pressly/goose/v3@v3.29.0
go get golang.org/x/crypto@v0.58.0
```

A module the course does not use cannot be downloaded here.

## Resetting

Reset all files puts every file back as it was (and takes a save point first, so Undo
works). Reset database empties the database. Reset everything does both. Every
codebase from the course is also here in its finished state, in the playground's
codebase menu, with its own files and seeded database to experiment in.
