// Package files keeps uploaded files in one folder.
package files

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

// Storage is the upload folder.
type Storage struct {
	dir string
}

// Open opens dir as the upload folder, creating it when it does not exist.
func Open(dir string) (*Storage, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("create upload folder: %w", err)
	}
	return &Storage{dir: dir}, nil
}

// Save writes r to the file called name in the upload folder, and returns the name
// and the size written.
func (s *Storage) Save(r io.Reader, name string) (string, int64, error) {
	f, err := os.Create(filepath.Join(s.dir, name))
	if err != nil {
		return "", 0, fmt.Errorf("create %s: %w", name, err)
	}
	n, err := io.Copy(f, r)
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return "", 0, fmt.Errorf("write %s: %w", name, err)
	}
	return name, n, nil
}

// Open opens a stored file for reading.
func (s *Storage) Open(name string) (io.ReadSeekCloser, error) {
	f, err := os.Open(filepath.Join(s.dir, name))
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", name, err)
	}
	return f, nil
}

// Remove deletes a stored file. A file that is already gone is not an error.
func (s *Storage) Remove(name string) error {
	if err := os.Remove(filepath.Join(s.dir, name)); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove %s: %w", name, err)
	}
	return nil
}

// Close releases the folder.
func (s *Storage) Close() error { return nil }
