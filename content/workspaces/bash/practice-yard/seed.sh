#!/usr/bin/env bash
# Seeds a practice-yard workspace: owners, groups, modes, file times, and the
# two per-workspace values. The runner extracts base/ into /home/learner and
# then runs this script as root, with the template folder next to it (it reads
# seed/times.tsv). It takes well under a second.
#
# Every time is relative to the seed's clock. Disposable runs (examples,
# checks, verifiers) run this under faketime at HU_FIXED_TIME, so their output
# never changes, and a learner's own workspace gets ages relative to today.
#
# Environment:
#   HU_HOME      the home folder to seed (default /home/learner)
#   HU_INSTANCE  the workspace id. When set, the hidden file in notes/ and the
#                secret word in the icons README come from it, so every
#                workspace has its own and answers must be looked up. When
#                empty, both keep the template's values (.secret-plan.md and
#                marmalade), which is what examples and checks expect.
set -euo pipefail

home=${HU_HOME:-/home/learner}
template_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
times_file="$template_dir/seed/times.tsv"

die() {
  printf 'seed.sh: %s\n' "$*" >&2
  exit 1
}

(( EUID == 0 )) || die "run me as root"
[[ -d $home/notes && -d $home/projects ]] || die "$home does not hold the practice-yard files"
[[ -f $times_file ]] || die "missing $times_file"
id learner > /dev/null 2>&1 || die "the image has no learner user"
getent group devs > /dev/null || die "the image has no devs group"
[[ " $(id -nG learner) " == *" devs "* ]] || die "learner is not in the devs group"

now=$(date +%s)
today=$(date -u -d "@$now" +%F)

# pick SALT CHOICE...: the first choice when HU_INSTANCE is empty, otherwise
# one of the others, the same one every time for the same workspace.
pick() {
  local salt=$1
  shift
  if [[ -z ${HU_INSTANCE:-} ]]; then
    printf '%s\n' "$1"
    return
  fi
  local -a others=("${@:2}")
  local sum
  sum=$(printf '%s:%s' "$HU_INSTANCE" "$salt" | cksum | cut -d ' ' -f 1)
  printf '%s\n' "${others[sum % ${#others[@]}]}"
}

hidden_name=$(pick hidden .secret-plan.md \
  .surprise-party.md .escape-room.md .road-trip.md .side-project.md \
  .gift-ideas.md .band-names.md .startup-idea.md .garden-plan.md \
  .novel-outline.md .recipe-swap.md .camping-list.md .chess-openings.md)
secret_word=$(pick word marmalade \
  quokka zephyr tangerine nebula origami lantern saffron glacier \
  pumpkin wombat kaleidoscope meridian)

# The secret word, before owners and times are set, because sed -i writes a
# new file.
icons_readme="$home/projects/website/assets/images/icons/README.md"
if [[ -f $icons_readme ]]; then
  sed -i "s/^The secret word is: .*/The secret word is: $secret_word/" "$icons_readme"
fi

# Folders that git cannot keep because they are empty.
mkdir -p "$home/photos/2026/edited"

# Everything belongs to learner, with the usual modes: folders 755, files 644.
chown -R -h learner:learner "$home"
find "$home" -type d -exec chmod 755 {} +
find "$home" -type f -exec chmod 644 {} +

set_mode() {
  local mode=$1 path
  shift
  for path in "$@"; do
    if [[ -e $home/$path ]]; then
      chmod "$mode" "$home/$path"
    fi
  done
}

# Programs that already run. backup.sh and greet.sh are not executable yet:
# lessons 4 and 14 make them so.
set_mode 755 bin/hello projects/scripts/goto-logs.sh projects/scripts/vars.sh

# A website copied from a zip with modes all over the place, for lesson 4.2.
set_mode 640 projects/website/about.html projects/website/assets/images/hero.jpg
set_mode 600 projects/website/css/print.css
set_mode 755 projects/website/js/vendor.min.js
set_mode 750 projects/website/assets/images/icons

# shared/ is root's. The devs group (learner is a member) may read the readme,
# and only root may read the payroll.
if [[ -d $home/shared ]]; then
  chown root:devs "$home/shared"
  chmod 750 "$home/shared"
  if [[ -f $home/shared/team-readme.md ]]; then
    chown root:devs "$home/shared/team-readme.md"
    chmod 640 "$home/shared/team-readme.md"
  fi
  if [[ -f $home/shared/payroll.csv ]]; then
    chown root:root "$home/shared/payroll.csv"
    chmod 600 "$home/shared/payroll.csv"
  fi
fi

# Times. First a default for everything, then the table.
epoch_of() {
  date -u -d "$today $2 $1 days ago" +%s
}

default_days=30
default_time=12:00
while IFS=$'\t' read -r days hhmm path; do
  if [[ $days == default ]]; then
    default_days=$hhmm
    default_time=$path
  fi
done < "$times_file"

find "$home" -mindepth 1 -exec touch -h -d "@$(epoch_of "$default_days" "$default_time")" {} +

while IFS=$'\t' read -r days hhmm path; do
  [[ -z $days || $days == \#* || $days == default ]] && continue
  target="$home/$path"
  [[ -e $target || -L $target ]] || continue
  touch -h -d "@$(epoch_of "$days" "$hhmm")" -- "$target"
done < "$times_file"

# The hidden file keeps its time when it is renamed.
if [[ $hidden_name != .secret-plan.md && -f $home/notes/.secret-plan.md ]]; then
  mv -- "$home/notes/.secret-plan.md" "$home/notes/$hidden_name"
fi

# Folders, deepest first: the time of their newest entry, unless they are
# empty (an empty folder keeps the time the table or the default gave it).
while IFS= read -r -d '' dir; do
  newest=$(find "$dir" -mindepth 1 -maxdepth 1 -printf '%T@\n' | sort -n | tail -n 1)
  if [[ -n $newest ]]; then
    touch -h -d "@$newest" -- "$dir"
  fi
done < <(find "$home" -depth -type d -print0)

chmod 755 "$home"
echo "practice-yard seeded in $home"
