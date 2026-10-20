# shellcheck shell=bash
# String helpers in plain Bash, with no external commands.

# trim TEXT: TEXT without its leading and trailing whitespace.
trim() {
  local text=$1
  text=${text#"${text%%[![:space:]]*}"}
  text=${text%"${text##*[![:space:]]}"}
  printf '%s\n' "$text"
}

# repeat TEXT COUNT: TEXT, COUNT times in a row.
repeat() {
  local text=$1 count=$2 out="" i
  for ((i = 0; i < count; i++)); do
    out+=$text
  done
  printf '%s\n' "$out"
}

# slugify TEXT: lowercase, whitespace becomes hyphens, and anything but
# letters, digits and hyphens is dropped. "Hello, World!" becomes hello-world.
slugify() {
  local text=${1,,}
  text=${text//[[:space:]]/-}
  text=${text//[^a-z0-9-]/}
  while [[ $text == *--* ]]; do
    text=${text//--/-}
  done
  text=${text#-}
  text=${text%-}
  printf '%s\n' "$text"
}

# join_by SEPARATOR ITEM...: the items with SEPARATOR between them.
join_by() {
  local separator=$1 out item
  shift
  if (( $# == 0 )); then
    printf '\n'
    return
  fi
  out=$1
  shift
  for item in "$@"; do
    out+=$separator$item
  done
  printf '%s\n' "$out"
}
