// Package files keeps uploaded files in one folder, through an os.Root. A Root refuses
// every name that would lead outside its folder ("../../cmd/api/run.go", an absolute
// path, or a symlink that points out), so no upload can overwrite code or read
// secrets, whatever name it arrives with. Files are stored under random names anyway,
// and the name the uploader gave is only ever shown.
package files

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"strings"
)

// Storage is the upload folder.
type Storage struct {
	root *os.Root
}

// Open opens dir as the upload folder, creating it when it does not exist.
func Open(dir string) (*Storage, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("create upload folder: %w", err)
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("open upload folder: %w", err)
	}
	return &Storage{root: root}, nil
}

// Save writes r to a new file named by 26 random characters plus ext, such as
// "q3zvxg7bkf2mtyhw5adnrc4ple.png", and returns the name and the size written. A
// failed write leaves no file behind.
func (s *Storage) Save(r io.Reader, ext string) (string, int64, error) {
	name := strings.ToLower(rand.Text()) + ext
	f, err := s.root.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return "", 0, fmt.Errorf("create %s: %w", name, err)
	}
	n, err := io.Copy(f, r)
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		_ = s.root.Remove(name)
		return "", 0, fmt.Errorf("write %s: %w", name, err)
	}
	return name, n, nil
}

// Open opens a stored file for reading.
func (s *Storage) Open(name string) (io.ReadSeekCloser, error) {
	f, err := s.root.Open(name)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", name, err)
	}
	return f, nil
}

// Remove deletes a stored file. A file that is already gone is not an error.
func (s *Storage) Remove(name string) error {
	if err := s.root.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove %s: %w", name, err)
	}
	return nil
}

// Close releases the folder.
func (s *Storage) Close() error { return s.root.Close() }
