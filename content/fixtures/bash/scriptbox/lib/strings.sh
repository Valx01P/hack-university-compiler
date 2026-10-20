# shellcheck shell=bash
# String helpers. Load them with: source ./lib/strings.sh

# The character to pad text with. Scripts that source this file read it.
# shellcheck disable=SC2034
FILL="."

# trim TEXT: prints TEXT without its leading and trailing whitespace.
trim() {
  local text="$1"
  text="${text#"${text%%[![:space:]]*}"}"
  text="${text%"${text##*[![:space:]]}"}"
  printf '%s\n' "$text"
}

# repeat CHAR COUNT: prints CHAR COUNT times, then a newline.
repeat() {
  local char="$1" count="$2" line=""
  local i
  for ((i = 0; i < count; i++)); do
    line+="$char"
  done
  printf '%s\n' "$line"
}
