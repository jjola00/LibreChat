#!/usr/bin/env bash
set -euo pipefail

PROMPT_FILE="${PROMPT_FILE:-system_prompt/system_prompt.md}"
GUARDRAILS_FILE="${GUARDRAILS_FILE:-improvebot/guardrails.md}"
MODEL="${MODEL:-gpt-4o-mini}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"

if [[ $# -lt 1 ]]; then
  echo 'Usage: $0 "<improvement_request>"' >&2
  exit 1
fi
REQUEST="$1"

[[ -f "$PROMPT_FILE" ]] || { echo "ERROR: Missing $PROMPT_FILE" >&2; exit 2; }
[[ -f "$GUARDRAILS_FILE" ]] || { echo "ERROR: Missing $GUARDRAILS_FILE" >&2; exit 2; }

# Offline/mock mode (no API call) for quick sanity check
if [[ "${MOCK:-0}" == "1" ]]; then
  l1="$(sed -n '1p' "$PROMPT_FILE")"
  l2="$(sed -n '2p' "$PROMPT_FILE")"
  l3="$(sed -n '3p' "$PROMPT_FILE")"
  add_line='HR routing: If asked "who do I ask for annual leave?" answer: "Use the Personio platform."'
  {
    printf '%s\n' "--- a/$PROMPT_FILE"
    printf '%s\n' "+++ b/$PROMPT_FILE"
    printf '@@ -1,3 +1,4 @@\n'
    printf ' %s\n' "$l1"
    printf '+%s\n' "$add_line"
    printf ' %s\n' "$l2"
    printf ' %s\n' "$l3"
  }
  exit 0
fi

: "${OPENAI_API_KEY:?ERROR: Set OPENAI_API_KEY to a real key (export OPENAI_API_KEY='sk-...')}"

# Define system prompt as a simple variable
SYS='You are "Improvebot". Task: analyze the current system prompt and the user'\''s requested improvement.
Output ONLY a unified diff that patches the target prompt file. No commentary before/after the diff.
Rules:
- Keep guardrails (tone, security, privacy) intact.
- Prefer minimal edits to achieve the outcome.
- Use valid unified diff format with ---/+++ headers and @@ hunks.'

CURRENT_PROMPT="$(cat "$PROMPT_FILE")"
GUARDRAILS="$(cat "$GUARDRAILS_FILE")"

# Build user prompt as a simple variable
USER="Inputs:
- Guardrails:
$GUARDRAILS

- Current system_prompt.md:
$CURRENT_PROMPT

- Requested improvement:
$REQUEST

- Target prompt file path (relative to repo root):
$PROMPT_FILE

Produce ONLY a valid unified diff patch from \"a/$PROMPT_FILE\" to \"b/$PROMPT_FILE\"."

# JSON-encode the message contents to ensure valid JSON
SYS_JSON="$(printf '%s' "$SYS" | jq -Rs .)"
USER_JSON="$(printf '%s' "$USER" | jq -Rs .)"

# Add timeout to avoid hanging
resp="$(curl -sS --max-time 60 https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role": "system", "content": $SYS_JSON},
    {"role": "user", "content": $USER_JSON}
  ],
  "temperature": 0.2
}
JSON
)"

# If the API returned an error object, surface it clearly
api_error="$(printf '%s' "$resp" | jq -r '.error.message // empty' 2>/dev/null || true)"
if [[ -n "${api_error:-}" ]]; then
  echo "ERROR: API returned an error: $api_error" >&2
  exit 3
fi

diff_out="$(printf '%s' "$resp" | jq -r '.choices[0].message.content // empty')"
if [[ -z "$diff_out" || "$diff_out" == "null" ]]; then
  echo "ERROR: No diff returned. Raw response:" >&2
  printf '%s\n' "$resp" >&2
  exit 3
fi

printf '%s\n' "$diff_out"
