#!/usr/bin/env bash
# Seeds a shopfront-ops workspace. The runner extracts base/ into /home/learner
# and then runs this script as root, with the template folder next to it (it
# reads seed/). It takes about a second:
#
#   1. owners and modes (.env and config/*.secret are 600)
#   2. data/shop.db, built from releases/current/seed.sql
#   3. the app repo /srv/git/shopfront.git: one commit per release, tagged
#      v2.13.0, v2.14.0, v2.14.1 and v2.15.0-rc1, and each release's REVISION
#   4. the ops repo's own history: 14 commits by three people
#   5. file times
#
# Commits use fixed authors and dates, so their hashes are the same in every
# workspace. File times are relative to the seed's clock: disposable runs
# (examples, checks, verifiers) run this under faketime at HU_FIXED_TIME, and
# a learner's workspace gets the same ages counted back from today.
#
# Environment: HU_HOME (default /home/learner) and HU_SRV (default /srv).
set -euo pipefail

home=${HU_HOME:-/home/learner}
srv=${HU_SRV:-/srv}
repo="$home/shopfront-ops"
app_repo="$srv/git/shopfront.git"
template_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
seed_dir="$template_dir/seed"
course_clock=2026-10-19T09:00:00Z

die() {
  printf 'seed.sh: %s\n' "$*" >&2
  exit 1
}

(( EUID == 0 )) || die "run me as root"
[[ -d $repo/bin && -f $repo/.env ]] || die "$repo does not hold the shopfront-ops files"
for file in app-history.tsv ops-history.tsv times.tsv; do
  [[ -f $seed_dir/$file ]] || die "missing $seed_dir/$file"
done
id learner > /dev/null 2>&1 || die "the image has no learner user"
for tool in git sqlite3 python3 curl jq; do
  command -v "$tool" > /dev/null || die "the image has no $tool"
done

# Git here must not depend on any config file, or the hashes would.
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null TZ=UTC
git_safe() { git -c safe.directory='*' "$@"; }

now=$(date +%s)
course_epoch=$(date -u -d "$course_clock" +%s)
shift_time() {
  printf '%s\n' "$((now - course_epoch + $(date -u -d "$1" +%s)))"
}

# 1. Owners and modes.
mkdir -p -- "$repo/run"
chown -R -h learner:learner "$home"
find "$home" -type d -exec chmod 755 {} +
find "$home" -type f -exec chmod 644 {} +
find "$repo/bin" "$repo/stubs" -type f ! -path '*/lib/*' -exec chmod 755 {} +
chmod 600 "$repo/.env"
find "$repo/config" -name '*.secret' -exec chmod 600 {} +

# 2. The API's database.
if [[ -f $repo/releases/current/seed.sql ]]; then
  rm -f -- "$repo/data/shop.db"
  sqlite3 -batch "$repo/data/shop.db" < "$repo/releases/current/seed.sql"
fi

# 3. The app repo, one commit per release, and the REVISION of each deployed release.
rm -rf -- "$app_repo"
mkdir -p -- "$(dirname -- "$app_repo")"
git init -q --bare -b main "$app_repo"
app_work=$(mktemp -d)
git init -q -b main "$app_work"
while IFS=$'\t' read -r tag when author email subject; do
  [[ -z $tag || $tag == \#* ]] && continue
  for name in server.py seed.sql config.json VERSION; do
    install -m 644 -- "$seed_dir/shopfront-app/$tag/$name" "$app_work/$name"
  done
  git -C "$app_work" add -A
  GIT_AUTHOR_NAME=$author GIT_AUTHOR_EMAIL=$email GIT_AUTHOR_DATE=$when \
    GIT_COMMITTER_NAME=$author GIT_COMMITTER_EMAIL=$email GIT_COMMITTER_DATE=$when \
    git -C "$app_work" commit -q -m "$subject"
  git -C "$app_work" tag "$tag"
done < "$seed_dir/app-history.tsv"
git -C "$app_work" push -q "$app_repo" main --tags
rm -rf -- "$app_work"

for release in "$repo"/releases/*/; do
  release=${release%/}
  [[ -L $release ]] && continue
  tag=v${release##*-v}
  if revision=$(git_safe -C "$app_repo" rev-parse --verify --quiet --short "refs/tags/$tag^{commit}"); then
    printf '%s\n' "$revision" > "$release/REVISION"
  fi
done

# 4. The ops repo's history, built in a scratch folder so the working tree is
# never touched, then moved into place.
ops_work=$(mktemp -d)
git init -q -b main "$ops_work"
while IFS=$'\t' read -r n when author email subject paths; do
  [[ -z $n || $n == \#* ]] && continue
  read -ra files <<< "$paths"
  for path in "${files[@]}"; do
    source_file="$repo/$path"
    if [[ -f $seed_dir/ops-history/$n/$path ]]; then
      source_file="$seed_dir/ops-history/$n/$path"
    fi
    [[ -f $repo/$path ]] || die "ops-history.tsv names $path, which base/ does not have"
    mkdir -p -- "$ops_work/$(dirname -- "$path")"
    cp -- "$source_file" "$ops_work/$path"
    chmod --reference="$repo/$path" -- "$ops_work/$path"
  done
  git -C "$ops_work" add -A
  GIT_AUTHOR_NAME=$author GIT_AUTHOR_EMAIL=$email GIT_AUTHOR_DATE=$when \
    GIT_COMMITTER_NAME=$author GIT_COMMITTER_EMAIL=$email GIT_COMMITTER_DATE=$when \
    git -C "$ops_work" commit -q -m "$subject"
done < "$seed_dir/ops-history.tsv"
rm -rf -- "$repo/.git"
mv -- "$ops_work/.git" "$repo/.git"
rm -rf -- "$ops_work"

# 5. Times. Tracked files: their last commit. The rest: seed/times.tsv.
# Folders: their newest entry. Everything moves with the seed's clock.
while IFS= read -r -d '' path; do
  when=$(git_safe -C "$repo" log -1 --format=%cI -- "$path")
  touch -h -d "@$(shift_time "$when")" -- "$repo/$path"
done < <(git_safe -C "$repo" ls-files -z)

while IFS=$'\t' read -r when path; do
  [[ -z $when || $when == \#* ]] && continue
  target="$home/${path%/}"
  [[ -e $target || -L $target ]] || continue
  stamp=$(shift_time "$when")
  if [[ $path == */ ]]; then
    find "$target" -exec touch -h -d "@$stamp" {} +
  else
    touch -h -d "@$stamp" -- "$target"
  fi
done < "$seed_dir/times.tsv"

while IFS= read -r -d '' dir; do
  newest=$(find "$dir" -mindepth 1 -maxdepth 1 ! -name .git -printf '%T@\n' | sort -n | tail -n 1)
  if [[ -n $newest ]]; then
    touch -h -d "@$newest" -- "$dir"
  fi
done < <(find "$home" -depth -type d ! -path "$repo/.git" ! -path "$repo/.git/*" -print0)

# The index has to see the final file times, or the first git status re-reads every file.
git_safe -C "$repo" reset -q
if [[ -n $(git_safe -C "$repo" status --porcelain) ]]; then
  git_safe -C "$repo" status --short >&2
  die "the last commit in seed/ops-history.tsv does not match base/"
fi
touch -d "@$(shift_time "$(git_safe -C "$repo" log -1 --format=%cI)")" -- "$repo/.git"

chown -R -h learner:learner "$home" "$srv/git"
echo "shopfront-ops seeded in $repo, app repo in $app_repo"
