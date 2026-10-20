#!/usr/bin/env bats
# The template's own regression suite: every fact about the seeded yard that a
# lesson, example or check relies on. It runs as learner against a freshly
# seeded workspace (HU_WS, default /home/learner), with or without the frozen
# clock and with or without HU_INSTANCE.

bats_require_minimum_version 1.5.0

setup() {
  bats_load_library bats-support
  bats_load_library bats-assert
  home=${HU_WS:-/home/learner}
  times_file=${HU_TEMPLATE:-$BATS_TEST_DIRNAME/../..}/seed/times.tsv
  cd "$home" || return 1
}

mtime() { stat -c %Y -- "$1"; }

# The day the seed ran, worked out from .profile (100 days before it, at 08:12).
seed_day() {
  date -u -d "$(date -u -d "@$(mtime .profile)" +%F) + 100 days" +%F
}

@test "the home folder holds exactly the nine visible entries" {
  run ls -1
  assert_success
  assert_output "$(printf '%s\n' answers.txt bin downloads latest-notes notes photos projects shared tmp-cleanup)"
}

@test "the hidden entries are the dotfiles and .config" {
  run bash -c 'ls -1d .[!.]* | grep -vx .bash_history | sort'
  assert_output "$(printf '%s\n' .bashrc .config .profile)"
  assert [ -f .config/devtool/settings.ini ]
}

@test "notes: seven numbered tasks, four contacts and three meeting notes" {
  run wc -l < notes/todo.txt
  assert_output 7
  run grep -c '^[1-7]\. ' notes/todo.txt
  assert_output 7
  run head -n 1 notes/contacts.csv
  assert_output 'name,email,phone,city'
  run bash -c 'tail -n +2 notes/contacts.csv | wc -l'
  assert_output 4
  run bash -c 'echo notes/*.md'
  assert_output 'notes/meeting-2026-09-28.md notes/meeting-2026-10-05.md notes/meeting-2026-10-12.md'
}

@test "notes holds one hidden Markdown file, .secret-plan.md unless HU_INSTANCE picked another" {
  run bash -c 'find notes -maxdepth 1 -name ".*.md" -printf "%f\n"'
  assert_success
  assert_equal "${#lines[@]}" 1
  if [[ -z ${HU_INSTANCE:-} ]]; then
    assert_output .secret-plan.md
  else
    refute_output .secret-plan.md
  fi
}

@test "the meeting notes sort newest first with ls -t" {
  run bash -c 'ls -t notes/meeting-*.md'
  assert_output "$(printf '%s\n' notes/meeting-2026-10-12.md notes/meeting-2026-10-05.md notes/meeting-2026-09-28.md)"
}

@test "latest-notes is a relative symlink to the newest meeting note" {
  assert [ -L latest-notes ]
  run readlink latest-notes
  assert_output notes/meeting-2026-10-12.md
  run readlink -f latest-notes
  assert_output "$home/notes/meeting-2026-10-12.md"
}

@test "the icons README holds this workspace's secret word" {
  run grep -c '^The secret word is: [a-z]\+$' projects/website/assets/images/icons/README.md
  assert_output 1
  if [[ -z ${HU_INSTANCE:-} ]]; then
    run tail -n 1 projects/website/assets/images/icons/README.md
    assert_output 'The secret word is: marmalade'
  fi
  run bash -c 'ls projects/website/assets/images/icons/*.svg | wc -l'
  assert_output 6
}

@test "bin/hello runs, and a login shell finds it on PATH" {
  assert [ -x bin/hello ]
  run bash -lc 'command -v hello && hello'
  assert_success
  assert_line --index 0 "$home/bin/hello"
  assert_line --index 1 "Hello from $home/bin/hello"
}

@test "an interactive shell has the ll alias, the prompt and the history settings" {
  # shellcheck disable=SC2016
  run --separate-stderr env HISTFILE=/dev/null bash -ic 'type -t ll; alias ll; echo "$HISTCONTROL"; echo "$PS1"'
  assert_line --index 0 alias
  assert_line --index 1 "alias ll='ls -alF'"
  assert_line --index 2 ignoreboth
  assert_output --partial '\u@\h'
}

@test "projects has three folders: website, blog and scripts" {
  run find projects -mindepth 1 -maxdepth 1 -type d -printf '%f\n'
  assert_equal "$(sort <<< "$output")" "$(printf '%s\n' blog scripts website)"
  run bash -c 'ls projects/blog/posts | wc -l'
  assert_output 6
  run ls projects/blog/drafts
  assert_output "$(printf '%s\n' post-ideas.md unfinished.md)"
}

@test "the practice scripts: two run already, backup.sh and greet.sh do not yet" {
  run stat -c '%a %n' projects/scripts/backup.sh projects/scripts/greet.sh projects/scripts/goto-logs.sh projects/scripts/vars.sh
  assert_output "$(printf '%s\n' '644 projects/scripts/backup.sh' '644 projects/scripts/greet.sh' '755 projects/scripts/goto-logs.sh' '755 projects/scripts/vars.sh')"
  run head -c 2 projects/scripts/greet.sh
  refute_output '#!'
  run bash projects/scripts/greet.sh
  assert_output "$(printf '%s\n' '3 2 1' 'Liftoff!')"
  run sh projects/scripts/greet.sh
  assert_line --index 0 '{3..1}'
}

@test "goto-logs.sh and vars.sh only change the shell that sources them" {
  run bash -c 'cd projects/scripts && ./goto-logs.sh && pwd && source goto-logs.sh && pwd'
  assert_output "$(printf '%s\n' "$home/projects/scripts" /var/log)"
  run bash -c 'cd projects/scripts && ./vars.sh && echo "[${GREETING-}]" && . ./vars.sh && echo "[$GREETING]"'
  assert_output "$(printf '%s\n' '[]' '[hi]')"
}

@test "the website has the outline's files and its mixed-up modes" {
  run bash -c 'cd projects/website && find . -type f | sort'
  assert_output "$(printf '%s\n' ./about.html ./assets/images/hero.jpg ./assets/images/icons/README.md \
    ./assets/images/icons/cart.svg ./assets/images/icons/home.svg ./assets/images/icons/mail.svg \
    ./assets/images/icons/menu.svg ./assets/images/icons/search.svg ./assets/images/icons/user.svg \
    ./assets/images/logo.png ./assets/images/team-1.jpeg ./assets/images/team-2.JPG ./css/main.css \
    ./css/print.css ./index.html ./js/app.js ./js/vendor.min.js)"
  run bash -c 'find projects/website ! -perm -o+r | sort'
  assert_output "$(printf '%s\n' projects/website/about.html projects/website/assets/images/hero.jpg projects/website/assets/images/icons projects/website/css/print.css)"
  run find projects/website -type f -perm -o+x
  assert_output projects/website/js/vendor.min.js
}

@test "photos/2025 has 14 photos in five spellings of jpg and png, two with spaces" {
  run bash -c 'ls photos/2025 | sed "s/.*\.//" | sort | uniq -c | sed "s/^ *//"'
  assert_output "$(printf '%s\n' '2 JPEG' '2 JPG' '2 jpeg' '6 jpg' '2 png')"
  run find photos/2025 -name '* *' -printf '%f\n'
  assert_equal "$(sort <<< "$output")" "$(printf '%s\n' 'Beach Day 1.jpg' 'Beach Day 2.jpg')"
  run bash -c 'ls photos/2025/IMG_000[1-4].*'
  assert_output "$(printf '%s\n' photos/2025/IMG_0001.jpg photos/2025/IMG_0002.JPG photos/2025/IMG_0003.jpeg photos/2025/IMG_0004.png)"
  run file -b photos/2025/IMG_0002.JPG photos/2025/IMG_0004.png
  assert_line --index 0 --partial 'JPEG image data'
  assert_line --index 1 --partial 'PNG image data'
}

@test "photos/2026: six raw files, one over 1 MB and the largest file in the home folder, and an empty edited folder" {
  run bash -c 'ls photos/2026/raw'
  assert_output "$(printf 'DSC_%s.NEF\n' 1001 1002 1003 1004 1005 1006)"
  run find photos/2026/raw -size +1M
  assert_output photos/2026/raw/DSC_1004.NEF
  run bash -c 'find ~ -type f -printf "%s %P\n" 2> /dev/null | sort -n | tail -n 1'
  assert_output --partial ' photos/2026/raw/DSC_1004.NEF'
  assert [ -d photos/2026/edited ]
  run find photos/2026/edited -mindepth 1
  assert_output ''
  run find . -type d -empty
  assert_output ./photos/2026/edited
}

@test "downloads: the outline's files, a gzip with no extension and twelve old files" {
  run bash -c 'find downloads -maxdepth 1 -type f -printf "%f\n" | sort'
  assert_output "$(printf '%s\n' data-export.csv invoice-0042.pdf invoice-0043.pdf mystery report-q3.pdf 'setup (1).sh' 'setup (2).sh')"
  run bash -c 'file -b downloads/mystery | cut -d " " -f 1'
  assert_output gzip
  run file -b downloads/report-q3.pdf
  assert_output --partial 'PDF document'
  run bash -c 'ls -S downloads | head -n 1'
  assert_output report-q3.pdf
  run stat -c %s downloads/data-export.csv
  (( output > 11000 && output < 14000 ))
  run bash -c 'ls downloads/old | wc -l'
  assert_output 12
  run bash -c 'find downloads -name "* *" | wc -l'
  assert_output 3
}

@test "the old downloads are 35 to 200 days old, and exactly eight are older than 60 days" {
  run bash -c 'find downloads -type f -mtime +60 | wc -l'
  assert_output 8
  run bash -c 'find downloads/old -type f -mtime -34 | wc -l'
  assert_output 0
  run bash -c 'find downloads/old -type f -mtime +200 | wc -l'
  assert_output 0
  run bash -c 'find downloads -maxdepth 1 -type f -mtime +30 | wc -l'
  assert_output 0
}

@test "shared/ is root's: the readme through the devs group, the payroll for root only" {
  run stat -c '%U:%G %a %n' shared shared/team-readme.md shared/payroll.csv
  assert_output "$(printf '%s\n' 'root:devs 750 shared' 'root:devs 640 shared/team-readme.md' 'root:root 600 shared/payroll.csv')"
  run id -nG
  assert_output --partial devs
  run head -n 1 shared/team-readme.md
  assert_output '# Shared folder'
  run cat shared/payroll.csv
  assert_failure
  assert_output --partial 'Permission denied'
}

@test "tmp-cleanup: temp, backup and log files of every age, a file named -old.tmp and a nested cache" {
  run bash -c 'cd tmp-cleanup && find . -type f | sort'
  assert_output "$(printf '%s\n' ./-old.tmp ./build-1.tmp ./build-2.tmp ./cache/index.tmp ./cache/sessions/s1.tmp \
    ./cache/thumbs/a1.tmp ./cache/thumbs/b2.tmp ./download.tmp ./error.log ./install.log ./npm-debug.log \
    ./report.bak ./settings.ini.bak)"
  assert [ ! -s tmp-cleanup/download.tmp ]
  run bash -c 'find tmp-cleanup -name "*.tmp" -mtime +30 | wc -l'
  assert_output 5
  run bash -c 'cd tmp-cleanup && rm -old.tmp'
  assert_failure
  assert [ -f tmp-cleanup/-old.tmp ]
}

@test "every path in seed/times.tsv has exactly the time the table gives, relative to the seed's day" {
  local today days hhmm path want got bad=0
  today=$(seed_day)
  while IFS=$'\t' read -r days hhmm path; do
    [[ -z $days || $days == \#* || $days == default ]] && continue
    [[ $path == notes/.secret-plan.md ]] && path=$(find notes -maxdepth 1 -name '.*.md' | head -n 1)
    want=$(date -u -d "$today $hhmm $days days ago" +%s)
    got=$(stat -c %Y -- "$path")
    if [[ $want != "$got" ]]; then
      echo "$path: want $(date -u -d "@$want" +%FT%T) got $(date -u -d "@$got" +%FT%T)"
      bad=$((bad + 1))
    fi
  done < "$times_file"
  (( bad == 0 ))
}

@test "folders take the time of their newest entry" {
  assert_equal "$(stat -c %Y notes)" "$(stat -c %Y notes/todo.txt)"
  assert_equal "$(stat -c %Y photos/2026/raw)" "$(stat -c %Y photos/2026/raw/DSC_1006.NEF)"
}

@test "the answer sheet starts with every key empty" {
  run grep -v -e '^#' -e '^$' answers.txt
  assert_success
  run grep -v -e '^#' -e '^$' -e '^[a-z0-9_]*=$' answers.txt
  assert_failure
  run grep -c '=$' answers.txt
  assert_output 35
}
