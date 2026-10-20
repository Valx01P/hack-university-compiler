# shellcheck shell=bash
# load_env FILE [NAME...] exports every variable FILE sets, then stops the
# script with "missing: NAME" (exit 1) when a required one is empty. With no
# names it requires API_PORT, API_TOKEN and LOG_DIR, which most scripts need.
#
#   load_env "$ROOT/.env"
#   load_env "$ROOT/.env" BACKUP_DIR

load_env() {
  local file=$1 name
  shift
  local -a required=("$@")
  if (( ${#required[@]} == 0 )); then
    required=(API_PORT API_TOKEN LOG_DIR)
  fi
  if [[ ! -f $file ]]; then
    printf 'error: %s not found (copy .env.example to .env)\n' "$file" >&2
    exit 1
  fi
  set -a
  # shellcheck source=/dev/null
  source "$file"
  set +a
  for name in "${required[@]}"; do
    if [[ -z ${!name:-} ]]; then
      printf 'missing: %s\n' "$name" >&2
      exit 1
    fi
  done
}
