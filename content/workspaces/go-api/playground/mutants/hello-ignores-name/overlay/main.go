// A small server to start from: go run . and send the requests in requests.http.
// GET /hello answers without a database, and GET /notes reads the table that
// scratch.sql creates, through pgx, the PostgreSQL driver the course uses.
package main

import (
	"cmp"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
)

func main() {
	addr := ":" + cmp.Or(os.Getenv("PORT"), "8080")
	log.Printf("listening on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, routes()))
}

func routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /hello", func(w http.ResponseWriter, r *http.Request) {
		name := "world"
		writeJSON(w, http.StatusOK, map[string]string{"message": "hello, " + name})
	})
	mux.HandleFunc("GET /notes", func(w http.ResponseWriter, r *http.Request) {
		conn, err := pgx.Connect(r.Context(), os.Getenv("DATABASE_URL"))
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
			return
		}
		defer conn.Close(r.Context())
		rows, _ := conn.Query(r.Context(), "SELECT id, title, done, created_at FROM notes ORDER BY id")
		notes, err := pgx.CollectRows(rows, pgx.RowToStructByName[note])
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"error": err.Error(), "hint": `create the table with: psql "$DATABASE_URL" -f scratch.sql`})
			return
		}
		writeJSON(w, http.StatusOK, notes)
	})
	return mux
}

// note is one row of the notes table. The db tags name its columns for pgx.
type note struct {
	ID        int64     `db:"id" json:"id"`
	Title     string    `db:"title" json:"title"`
	Done      bool      `db:"done" json:"done"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}
