package legacyexport

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWriteCSV(t *testing.T) {
	due := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
	rows := []Row{
		{ID: 1, Title: "Fix login redirect", Status: "doing", Due: &due},
		{ID: 2, Title: "Write release notes, then publish", Status: "todo"},
	}
	var buf bytes.Buffer
	if err := WriteCSV(&buf, rows); err != nil {
		t.Fatal(err)
	}
	want := "id,title,status,due\n1,Fix login redirect,doing,2026-10-14\n2,\"Write release notes, then publish\",todo,\n"
	if buf.String() != want {
		t.Errorf("WriteCSV wrote %q, want %q", buf.String(), want)
	}
}

func TestFilename(t *testing.T) {
	if got := Filename("Website Relaunch"); got != "website-relaunch.csv" {
		t.Errorf("Filename = %q", got)
	}
}

func TestIsDone(t *testing.T) {
	if !IsDone(Row{Status: "done"}) || IsDone(Row{Status: "doing"}) {
		t.Error("IsDone is wrong")
	}
}

func TestSaveTo(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tasks.csv")
	if err := SaveTo(path, []Row{{ID: 1, Title: "One", Status: "todo"}}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "id,title,status,due\n1,One,todo,\n" {
		t.Errorf("saved %q, %v", data, err)
	}
	if err := SaveTo(filepath.Join(t.TempDir(), "missing", "tasks.csv"), nil); err == nil {
		t.Error("SaveTo into a missing folder succeeded")
	}
}
