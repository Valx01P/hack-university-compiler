package service_test

import (
	"errors"
	"io"
	"log/slog"
	"testing"

	"example.com/taskboard/internal/clock"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/jobs"
	"example.com/taskboard/internal/service"
)

func newLabels(t *testing.T) (*service.LabelService, app) {
	t.Helper()
	a := newApp(t, nil)
	return service.NewLabelService(a.db.Stores(), clock.Fixed(fixedNow), slog.New(slog.NewTextHandler(io.Discard, nil))), a
}

func TestAttachRules(t *testing.T) {
	labels, a := newLabels(t)
	var ids []int64
	for _, name := range []string{"bug", "design", "docs", "urgent", "backend", "frontend"} {
		l, err := labels.Create(ctx(t), grace, 1, name, "")
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, l.ID)
	}
	for _, id := range ids[:5] {
		if err := labels.Attach(ctx(t), grace, 1, id); err != nil {
			t.Fatalf("label %d: %v", id, err)
		}
	}
	if err := labels.Attach(ctx(t), grace, 1, ids[0]); err != nil {
		t.Errorf("attaching a label twice: %v, want nothing to happen", err)
	}
	if err := labels.Attach(ctx(t), grace, 1, ids[5]); !errors.Is(err, domain.ErrConflict) {
		t.Errorf("a sixth label: err = %v, want a conflict", err)
	}
	other, err := labels.Create(ctx(t), grace, 2, "bug", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := labels.Attach(ctx(t), grace, 2, other.ID); err == nil {
		t.Error("a label of project 2 went onto task 2 of project 1")
	}
	if got := len(a.db.Jobs()); got != 5 {
		t.Errorf("%d label.added jobs, want 5 (one per label actually added)", got)
	}
	if a.db.Jobs()[0].Kind != jobs.KindLabelAdded {
		t.Errorf("job kind = %s", a.db.Jobs()[0].Kind)
	}
	list, err := labels.List(ctx(t), ada, 1)
	if err != nil || len(list) != 6 || list[0].Name != "backend" || list[1].TaskCount != 1 {
		t.Errorf("List = %+v, %v", list, err)
	}
}

func TestCreateLabelNormalizes(t *testing.T) {
	labels, _ := newLabels(t)
	got, err := labels.Create(ctx(t), grace, 1, "  Needs   Review ", "")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if got.Name != "needs review" || got.Color != domain.DefaultLabelColor {
		t.Errorf("Create = %+v", got)
	}
	if _, err := labels.Create(ctx(t), grace, 1, "NEEDS REVIEW", "#f59e0b"); !errors.Is(err, domain.ErrConflict) {
		t.Errorf("the same name in other letters: err = %v, want a conflict", err)
	}
	if _, err := labels.Create(ctx(t), margaret, 1, "bug", ""); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("a stranger: err = %v, want not found", err)
	}
	if _, err := labels.Create(ctx(t), ada, 3, "bug", ""); !errors.Is(err, domain.ErrForbidden) {
		t.Errorf("an admin who is not a member: err = %v, want forbidden", err)
	}
}
