#!/usr/bin/env bash
set -euo pipefail

# Inputs:
#   $1 = freeform "what to improve" (e.g., "add HR routing table")

PROMPT_FILE="${PROMPT_FILE:-system_prompt/system_prompt.md}"
GUARDRAILS_FILE="${GUARDRAILS_FILE:-improvebot/guardrails.md}"
MODEL="${MODEL:-gpt-4o-mini}"
OPENAI_API_KEY="${OPENAI_API_KEY:-<OPENAI_API_KEY>}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"<improvement_request>\"" >&2
  exit 1
fi

REQUEST="$1"

read -r -d '' SYS <<'EOF'
You are "Improvebot". Task: analyze the current system prompt and the user's requested improvement.
Output ONLY a unified diff that patches system_prompt.md. No commentary before/after the diff.

Rules:
- Keep guardrails (tone, security, privacy) intact.
- Prefer minimal edits to achieve the outcome.
- Use valid unified diff format with ---/+++ headers and @@ hunks.
EOF

CURRENT_PROMPT="$(cat "$PROMPT_FILE")"
GUARDRAILS="$(cat "$GUARDRAILS_FILE")"

read -r -d '' USER <<EOF
Inputs:
- Guardrails:
$GUARDRAILS

- Current system_prompt.md:
$CURRENT_PROMPT

- Requested improvement:
$REQUEST

Produce ONLY a valid unified diff patch from "a/system_prompt/system_prompt.md" to "b/system_prompt/system_prompt.md".
EOF

curl -sS https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<JSON | jq -r '.choices[0].message.content'
{
  "model": "$MODEL",
  "messages": [
    {"role": "system", "content": $SYS},
    {"role": "user", "content": $USER}
  ],
  "temperature": 0.2
}
JSON
