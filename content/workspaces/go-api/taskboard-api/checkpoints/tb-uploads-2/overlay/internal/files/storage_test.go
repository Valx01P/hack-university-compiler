package files

import (
	"io"
	"strings"
	"testing"
)

func TestSaveOpenRemove(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	name, size, err := s.Save(strings.NewReader("hello"), "hello.pdf")
	if err != nil || size != 5 || name != "hello.pdf" {
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
}
