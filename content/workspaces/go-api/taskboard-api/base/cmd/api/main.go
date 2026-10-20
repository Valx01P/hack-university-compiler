// Command api serves the Taskboard API. Everything happens in run (run.go): main only
// hands it the real process, its arguments, environment, and stdout, and turns an
// error into exit code 1.
package main

import (
	"context"
	"fmt"
	"os"
)

// version is set when a release is built:
//
//	go build -ldflags "-X main.version=1.4.2" -o bin/api ./cmd/api
var version = "dev"

func main() {
	if err := run(context.Background(), os.Args[1:], os.Getenv, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "taskboard:", err)
		os.Exit(1)
	}
}
