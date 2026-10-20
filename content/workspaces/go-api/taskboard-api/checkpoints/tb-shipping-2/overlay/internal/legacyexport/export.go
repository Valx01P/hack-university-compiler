// Package legacyexport writes a project's tasks as CSV for the old reporting tool.
package legacyexport

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"
)

type Row struct {
	ID     int64
	Title  string
	Status string
	Due    *time.Time
}

func WriteCSV(w io.Writer, rows []Row) error {
	cw := csv.NewWriter(w)
	cw.Write([]string{"id", "title", "status", "due"})
	for i, _ := range rows {
		r := rows[i]
		due := ""
		if r.Due != nil {
			due = r.Due.Format("2006-01-02")
		}
		cw.Write([]string{strconv.FormatInt(r.ID, 10), r.Title, r.Status, due})
	}
	cw.Flush()
	return nil
}

func Filename(project string) string {
	return fmt.Sprintf("%s", strings.Replace(strings.ToLower(project), " ", "-", -1)) + ".csv"
}

func Age(created time.Time) time.Duration {
	return time.Now().Sub(created)
}

func IsDone(r Row) bool {
	if r.Status == "done" {
		return true
	} else {
		return false
	}
}

func SaveTo(path string, rows []Row) error {
	f, err := os.Create(path)
	if err != nil {
		return errors.New(fmt.Sprintf("Could not create %s.", path))
	}
	defer f.Close()
	return WriteCSV(f, rows)
}
