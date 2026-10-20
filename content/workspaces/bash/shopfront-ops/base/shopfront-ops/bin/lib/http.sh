# shellcheck shell=bash
# A small client for taskapi. Every call adds the base URL, the bearer token
# and a time limit. On a 4xx or 5xx the call fails (curl's exit status 22) and
# still prints the response body, so callers can show the API's own error.
#
#   api_get /users/3 | jq -r .name
#   if ! out=$(api_get /users/999); then echo "failed: $(jq -r .error <<< "$out")"; fi
#   api_post /tasks "$(jq -n --arg t "$title" '{title: $t}')"
#
# Settings: API_URL (default http://127.0.0.1:8080), API_TOKEN, and
# API_TIMEOUT in seconds (default 10).

api_request() {
  local method=$1 path=$2
  shift 2
  local -a args=(
    --silent --show-error --fail-with-body
    --max-time "${API_TIMEOUT:-10}"
    --request "$method"
    --header 'Accept: application/json'
  )
  if [[ -n ${API_TOKEN:-} ]]; then
    args+=(--header "Authorization: Bearer $API_TOKEN")
  fi
  curl "${args[@]}" "$@" "${API_URL:-http://127.0.0.1:8080}$path"
}

api_get() { api_request GET "$1"; }
api_delete() { api_request DELETE "$1"; }

api_post() {
  api_request POST "$1" --header 'Content-Type: application/json' --data-binary "$2"
}

api_patch() {
  api_request PATCH "$1" --header 'Content-Type: application/json' --data-binary "$2"
}
