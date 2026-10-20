# Deploy hooks (proposal)

`bin/deploy.sh` does not run hooks yet. This folder is where they will live,
so checks and notifications can change without editing `deploy.sh`.

```text
hooks/
├── pre-deploy.d/     run before current is switched; any failure stops the deploy
└── post-deploy.d/    run after the health check passes; a failure only warns
```

The rules we agreed on:

- Every executable file in a folder runs, in name order, so prefix them with
  numbers: `10-config-valid.sh`, `20-disk-space.sh`.
- Files that are not executable, and files ending in `.disabled`, are skipped.
  `chmod -x` or a rename turns a hook off.
- Each hook gets `VERSION` (the tag being deployed), `RELEASE_DIR` (the new
  release's folder) and `PREVIOUS_RELEASE` (what `current` pointed at) in its
  environment.
- A pre-deploy hook that exits non-zero aborts the deploy with
  `pre-deploy hook failed: NAME` and exit status 1, and `current` stays where
  it was.
- Every hook's start and result goes to `logs/deploy.log`.

First hooks to write:

| Hook | Fails when |
| --- | --- |
| `pre-deploy.d/10-config-valid.sh` | `$RELEASE_DIR/config.json` is not valid JSON or has no numeric `port` |
| `pre-deploy.d/20-disk-space.sh` | less than 50 MB is free where releases live (`df -P`) |
| `post-deploy.d/10-announce.sh` | never: it appends a line to `logs/deploys-announced.log` |
