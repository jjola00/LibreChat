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
  # Get the last line number for appending
  LAST_LINE=$(wc -l < "$PROMPT_FILE")
  IMPROVEMENT_TEXT="${1:-HR routing improvement}"
  
  {
    printf '%s\n' "--- a/$PROMPT_FILE"
    printf '%s\n' "+++ b/$PROMPT_FILE"
    printf '@@ -%d,0 +%d,1 @@\n' "$LAST_LINE" "$((LAST_LINE + 1))"
    printf '+%s\n' "$IMPROVEMENT_TEXT"
  }
  exit 0
fi

: "${OPENAI_API_KEY:?ERROR: Set OPENAI_API_KEY to a real key (export OPENAI_API_KEY='sk-...')}"

# Define system prompt as a simple variable
SYS='You are "Improvebot". Task: analyze the current system prompt and the user'\''s requested improvement.
Output ONLY a valid unified diff in the exact format below. NO explanatory text before or after.

CRITICAL REQUIREMENTS:
1. Keep all lines under 80 characters to prevent line wrapping
2. If a line is too long, break it naturally at word boundaries
3. Use proper unified diff format that git can apply
4. Make minimal, targeted changes only

REQUIRED FORMAT:
--- a/system_prompt/system_prompt.md
+++ b/system_prompt/system_prompt.md
@@ -line,count +line,count @@
 existing line
+new line to add
 existing line

Rules:
- Keep guardrails (tone, security, privacy) intact.
- Prefer minimal edits to achieve the outcome.
- NEVER break lines mid-word or mid-sentence in existing content.
- Output must be a valid git diff that can be applied with `git apply`.'

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

# Clean up the diff output - extract only the valid unified diff part
# Look for lines starting with --- and extract until we have a complete diff
clean_diff=""
in_diff=false
while IFS= read -r line; do
  if [[ "$line" =~ ^---[[:space:]]+a/ ]]; then
    in_diff=true
    clean_diff="$line"$'\n'
  elif [[ "$in_diff" == true ]]; then
    clean_diff+="$line"$'\n'
    # Stop after we have a complete diff (when we see the next --- or end)
    if [[ "$line" =~ ^---[[:space:]]+a/ ]] && [[ ${#clean_diff} -gt 50 ]]; then
      break
    fi
  fi
done <<< "$diff_out"

# If we didn't find a proper diff, try to extract everything between --- and +++
if [[ -z "$clean_diff" ]]; then
  clean_diff="$diff_out"
fi

printf '%s' "$clean_diff"
