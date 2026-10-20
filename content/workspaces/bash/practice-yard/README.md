# practice-yard

A developer's home folder on a Linux box, a little messy on purpose: projects,
photos with five spellings of `.jpg`, downloads of every age, notes, a folder
only root owns, and a cleanup folder full of junk. Lessons 1 to 5, 13 and 14
of the Bash course run here, as do the photo-renamer, disk-hog-hunt and
dotfiles-installer challenges, the `/bash` compiler's Terminal view, and the
playgrounds at `/bash/playground` and `/bash/playground/1` to `/3`.

This README is for course authors. It sits next to `base/`, not inside it,
because the home folder's listing is part of what lessons teach.

## What is in the template

| Path | What it is |
| --- | --- |
| `template.json` | Volume storage, the `sysadmin` profile, terminal-first (`"start": "open"`), the `/srv` and cron spool volumes, the seed |
| `base/` | Everything that lands in `/home/learner` (94 files and a symlink, 3 of them hidden at the top) |
| `seed.sh` | Runs as root after `base/` is extracted: owners, modes, times, the per-workspace values |
| `seed/times.tsv` | When every path last changed, in days before the seed's clock. `seed.sh` reads it, and checks can too |
| `generate.py` | Authoring only: writes the photos, raw files, PDFs, archives and `data-export.csv` into `base/` |
| `checks/template/` | The template's regression suite (`yard.bats`, 22 tests), for `templates:verify -- bash` |

## The home folder after seeding

```text
/home/learner/                      755 learner:learner
├── .bashrc                         Debian's defaults, cleaned up: history settings, the prompt, ll, la, l, color, completion
├── .profile                        sources .bashrc, puts ~/bin (and ~/.local/bin) on PATH when they exist
├── .config/devtool/settings.ini
├── answers.txt                     35 empty keys, one group per practice part
├── latest-notes -> notes/meeting-2026-10-12.md
├── bin/hello                       755, prints "Hello from /home/learner/bin/hello"
├── notes/                          todo.txt (7 tasks), contacts.csv (header + 4), three meeting notes, one hidden .md
├── projects/
│   ├── website/                    index.html, about.html, css/, js/, assets/images/ (+ icons/ with README.md and 6 .svg)
│   ├── blog/                       drafts/ (2) and posts/ (6, 2026-08-14-hello.md to 2026-10-16-terminal-week.md)
│   └── scripts/                    backup.sh 644, greet.sh 644 (no shebang), goto-logs.sh 755, vars.sh 755
├── photos/
│   ├── 2025/                       14 photos: 6 .jpg, 2 .JPG, 2 .jpeg, 2 .JPEG, 2 .png, two of them "Beach Day N.jpg"
│   └── 2026/                       raw/DSC_1001.NEF to DSC_1006.NEF (DSC_1004 is 1.2 MB), edited/ (empty)
├── downloads/                      report-q3.pdf (the biggest), 2 invoices, data-export.csv (12.6 KB), "setup (1).sh",
│   │                               "setup (2).sh", mystery (gzip, no extension)
│   └── old/                        12 files aged 35 to 200 days, 8 of them older than 60
├── shared/                         750 root:devs
│   ├── team-readme.md              640 root:devs: learner reads it through the devs group
│   └── payroll.csv                 600 root:root: "Permission denied"
└── tmp-cleanup/                    .tmp, .bak and .log files from 1 to 120 days old, -old.tmp, download.tmp (empty),
                                    cache/ with index.tmp, thumbs/a1.tmp, thumbs/b2.tmp, sessions/s1.tmp
```

Modes that lessons rely on, all set by `seed.sh`:

- Everything is learner's, folders 755 and files 644, except the rows below.
- `projects/scripts/backup.sh` and `greet.sh` are not executable (lessons 4.2 and 14.1). `goto-logs.sh` and `vars.sh` are, so `./goto-logs.sh` works in lesson 14.3.
- The website looks copied out of a zip (lesson 4.2's "Lock it down"): `about.html` and `assets/images/hero.jpg` are 640, `css/print.css` is 600, `js/vendor.min.js` is 755, and `assets/images/icons/` is 750. So `find projects/website ! -perm -o+r` lists four paths and `find projects/website -type f -perm -o+x` lists one.
- `shared/` is 750 root:devs, `team-readme.md` 640 root:devs, `payroll.csv` 600 root:root. learner (uid 1000) is in `devs` (gid 1001) in the `hu/bash` image.

## Times

`seed/times.tsv` lists every file with its age in days and a time of day,
and `seed.sh` stamps them relative to the seed's clock (one `date +%s` at the
start, so there are no stray seconds). Folders get the time of their newest
entry, so `ls -lt` of any folder is consistent.

Under the course clock, `HU_FIXED_TIME=2026-10-19T09:00:00Z`, the meeting notes
are stamped on the dates in their names (21, 14 and 7 days back), and the
2025 photos fall in 2025. In a learner's own workspace the same ages count
back from the day the workspace was made, so `find -mtime +60` keeps finding
the same eight old downloads, but the dates shown by `ls -l` move.

Facts that follow from the table, which lessons and checks use:

| Fact | Value |
| --- | --- |
| Downloads older than 60 days (`find downloads -type f -mtime +60`) | 8, all in `old/`: the screenshot, the bank statement, the boarding pass, the wallpaper, the meetup zip, the budget, the vacation checklist, node-hello.tar.gz |
| Ages in `downloads/old` | 35 to 200 days. No age sits on 7, 30, 60 or 90 days, so `-mtime` tests never depend on the hour |
| `.tmp` files older than 30 days | 5: build-1, build-2, -old, cache/thumbs/a1, cache/sessions/s1 |
| `ls -t notes/meeting-*.md` | 10-12, 10-05, 09-28 |
| Newest file in `notes` | `todo.txt` (yesterday 18:22) |
| Largest file under `~` | `photos/2026/raw/DSC_1004.NEF` (1,228,982 bytes), then `downloads/old/wallpaper-mountains.jpg` and `projects/website/assets/images/hero.jpg` |
| `find downloads -size +100k` | `downloads/old/wallpaper-mountains.jpg`, `downloads/report-q3.pdf` |
| Empty things (`find . -empty`) | `photos/2026/edited`, `tmp-cleanup/download.tmp` |
| Names with spaces under `~` | 5: the two setup scripts, the two beach photos, the screenshot |
| `.md` files under `~/projects` / under `~` | 9 / 14 (the hidden plan and `shared/team-readme.md` included) |
| jpg-like files under `~` (`-iname '*.jp*g'`) | 16 |

## Per-workspace values

Two answers must be looked up in each workspace, not copied from an example:
the hidden file in `notes/` and the secret word on the last line of
`projects/website/assets/images/icons/README.md`. `seed.sh` picks them from
`HU_INSTANCE`:

- **Empty** (examples, check sandboxes, verifiers): `.secret-plan.md` and `marmalade`, so transcripts never change.
- **The workspace id** (practice parts, challenges, playgrounds, which `"seedEnv": { "HU_INSTANCE": "workspace" }` asks for): one of twelve other names and twelve other words, chosen by `cksum` of the id. "Reset everything" re-runs the seed with the same id, so the values stay the same for that workspace.

Checks compute these from the learner's copy (`find notes -maxdepth 1 -name '.*.md'`, `tail -n 1` of the README), as the outline's section 4 asks.

## Seeding

The runner's seed job extracts `base/` into the new home volume, then runs
`bash seed.sh` as root with this folder beside it (it reads `seed/times.tsv`).
Under the frozen clock that is:

```sh
faketime '2026-10-19 09:00:00' bash seed.sh            # examples, checks, verifiers
HU_INSTANCE=wk3j6q2m7xa bash seed.sh                   # a learner's workspace
```

It takes about 0.25 s in the `hu/bash` image and needs nothing beyond it.
`HU_HOME` seeds another folder (default `/home/learner`). The seed fails
loudly when it is not root or when the image lacks the `learner` user or the
`devs` group.

`base/` cannot hold an empty folder through git, so `seed.sh` creates
`photos/2026/edited`. The IDE's first-paint tree, built from `base/`, will not
show it until the container's listing arrives.

## Regenerating the binaries

```sh
python3 generate.py     # macOS: Python 3.10+ and sips
```

Every file it writes is the same byte for byte on each run, except the JPEGs,
which come from `sips`. Nothing checks their bytes, only their names, sizes
(roughly) and `file` types.

## Notes for lesson authors

- `ls` in `~` prints nine entries, not the eight lesson 1.1's text mentions: the outline's own tree has nine (answers.txt, bin, downloads, latest-notes, notes, photos, projects, shared, tmp-cleanup).
- `md_files=` is used by 5.3 (count under `~/projects`, 9) and 13.1 (count under `~`, 14). The base sheet has it once, under 5.3. Part 13.1's overlay should bring its own `answers.txt` or rename its key.
- `type -a ls` prints the alias, then `/usr/bin/ls` and `/bin/ls`. coreutils is Debian's package in `hu/bash`, so there is no `/usr/local/bin/ls`.
- `about.html` links to `team.html`, which does not exist: that is the "broken link on the about page" from `notes/todo.txt`.
