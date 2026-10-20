package files

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveOpenRemove(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	name, size, err := s.Save(strings.NewReader("hello"), ".pdf")
	if err != nil || size != 5 || !strings.HasSuffix(name, ".pdf") || len(name) != 30 {
		t.Fatalf("Save = %q, %d, %v", name, size, err)
	}
	f, err := s.Open(name)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(f)
	f.Close()
	if string(data) != "hello" {
		t.Errorf("read back %q", data)
	}
	if err := s.Remove(name); err != nil {
		t.Fatal(err)
	}
	if err := s.Remove(name); err != nil {
		t.Errorf("removing a file that is gone: %v", err)
	}
}

func TestNamesCannotLeaveTheFolder(t *testing.T) {
	dir := t.TempDir()
	uploads := filepath.Join(dir, "uploads")
	s, err := Open(uploads)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := os.WriteFile(filepath.Join(dir, "secret.txt"), []byte("s3cret"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"../secret.txt", "/etc/passwd", "a/../../secret.txt"} {
		if f, err := s.Open(name); err == nil {
			f.Close()
			t.Errorf("Open(%q) escaped the upload folder", name)
		}
		if err := s.Remove(name); err == nil {
			if _, statErr := os.Stat(filepath.Join(dir, "secret.txt")); statErr != nil {
				t.Errorf("Remove(%q) deleted a file outside the folder", name)
			}
		}
	}
}
