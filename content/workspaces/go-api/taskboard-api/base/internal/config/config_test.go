package config

import (
	"bytes"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"
)

// env turns a map into the getenv function Load takes.
func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

const testDB = "postgres://app:s3cret@db:5432/taskboard"

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(env(map[string]string{"DATABASE_URL": testDB}), nil)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Port != 8080 || cfg.AdminPort != 6060 || cfg.AppEnv != "development" || cfg.AuthMode != "session" {
		t.Errorf("defaults = port %d, admin %d, env %q, auth %q", cfg.Port, cfg.AdminPort, cfg.AppEnv, cfg.AuthMode)
	}
	if cfg.LogLevel != slog.LevelInfo || cfg.BcryptCost != 10 || cfg.SlowQuery != 200*time.Millisecond {
		t.Errorf("defaults = level %v, cost %d, slow %v", cfg.LogLevel, cfg.BcryptCost, cfg.SlowQuery)
	}
	if !cfg.SecretGenerated || len(cfg.TokenSecret) < 32 {
		t.Errorf("development should generate a secret of 32 bytes or more, got %d bytes", len(cfg.TokenSecret))
	}
}

func TestLoad(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		args    []string
		wantErr []string // each must appear in the error; nil means no error
		check   func(t *testing.T, cfg Config)
	}{
		{
			name: "environment",
			env: map[string]string{
				"DATABASE_URL": testDB, "PORT": "23017", "ADMIN_PORT": "0", "LOG_LEVEL": "debug",
				"AUTH_MODE": "jwt", "MIGRATE_ON_START": "true", "SLOW_QUERY_MS": "50",
				"CORS_ORIGINS":  "http://localhost:20013, https://app.example.com",
				"TRUSTED_PROXY": "10.0.0.2",
			},
			check: func(t *testing.T, cfg Config) {
				if cfg.Port != 23017 || cfg.AdminPort != 0 || cfg.LogLevel != slog.LevelDebug || cfg.AuthMode != "jwt" {
					t.Errorf("got port %d, admin %d, level %v, auth %q", cfg.Port, cfg.AdminPort, cfg.LogLevel, cfg.AuthMode)
				}
				if !cfg.MigrateOnStart || cfg.SlowQuery != 50*time.Millisecond || cfg.TrustedProxy.String() != "10.0.0.2" {
					t.Errorf("got migrate %v, slow %v, proxy %v", cfg.MigrateOnStart, cfg.SlowQuery, cfg.TrustedProxy)
				}
				want := []string{"http://localhost:20013", "https://app.example.com"}
				if !slices.Equal(cfg.CORSOrigins, want) {
					t.Errorf("CORSOrigins = %q, want %q", cfg.CORSOrigins, want)
				}
			},
		},
		{
			name: "flags win over the environment",
			env:  map[string]string{"DATABASE_URL": testDB, "PORT": "9000", "LOG_LEVEL": "error"},
			args: []string{"-port", "7000", "-log-level", "warn"},
			check: func(t *testing.T, cfg Config) {
				if cfg.Port != 7000 || cfg.LogLevel != slog.LevelWarn {
					t.Errorf("got port %d and level %v, want 7000 and WARN", cfg.Port, cfg.LogLevel)
				}
			},
		},
		{
			name:    "every problem at once",
			env:     map[string]string{"PORT": "http", "LOG_LEVEL": "loud", "AUTH_MODE": "magic"},
			wantErr: []string{"PORT: must be a whole number", "LOG_LEVEL: must be debug", "AUTH_MODE: must be one of session, jwt", "DATABASE_URL: is required"},
		},
		{
			name:    "a bad flag",
			env:     map[string]string{"DATABASE_URL": testDB},
			args:    []string{"-port", "70000"},
			wantErr: []string{"must be a whole number from 1 to 65535"},
		},
		{
			name:    "production needs a real secret",
			env:     map[string]string{"DATABASE_URL": testDB, "APP_ENV": "production", "TOKEN_SECRET": "too short"},
			wantErr: []string{"TOKEN_SECRET"},
		},
		{
			name: "production with a secret",
			env: map[string]string{
				"DATABASE_URL": testDB, "APP_ENV": "production",
				"TOKEN_SECRET": "0123456789abcdef0123456789abcdef",
			},
			check: func(t *testing.T, cfg Config) {
				if cfg.SecretGenerated || string(cfg.TokenSecret) != "0123456789abcdef0123456789abcdef" {
					t.Errorf("production must keep the secret it was given")
				}
			},
		},
		{
			name:    "an origin with a path",
			env:     map[string]string{"DATABASE_URL": testDB, "CORS_ORIGINS": "http://localhost:3000/app"},
			wantErr: []string{"CORS_ORIGINS", "is not an origin"},
		},
		{
			name: "-version needs nothing else",
			env:  map[string]string{},
			args: []string{"-version"},
			check: func(t *testing.T, cfg Config) {
				if !cfg.ShowVersion {
					t.Error("ShowVersion is false")
				}
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg, err := Load(env(tc.env), tc.args)
			if tc.wantErr == nil {
				if err != nil {
					t.Fatalf("Load: %v", err)
				}
				tc.check(t, cfg)
				return
			}
			if err == nil {
				t.Fatalf("Load succeeded, want an error with %q", tc.wantErr)
			}
			for _, want := range tc.wantErr {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("error %q does not contain %q", err, want)
				}
			}
		})
	}
}

func TestLogValueHidesSecrets(t *testing.T) {
	secret := "0123456789abcdef0123456789abcdef"
	cfg, err := Load(env(map[string]string{"DATABASE_URL": testDB, "TOKEN_SECRET": secret}), nil)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	var buf bytes.Buffer
	slog.New(slog.NewJSONHandler(&buf, nil)).Info("config", "config", cfg)
	out := buf.String()
	for _, leaked := range []string{secret, "s3cret"} {
		if strings.Contains(out, leaked) {
			t.Errorf("the log line contains %q: %s", leaked, out)
		}
	}
	for _, want := range []string{`"database_url":"postgres://app:xxxxx@db:5432/taskboard"`, `"token_secret":"set"`, `"port":8080`} {
		if !strings.Contains(out, want) {
			t.Errorf("the log line lacks %s: %s", want, out)
		}
	}
}
