#!/usr/bin/env bash
set -euo pipefail

DIFF_FILE="${1:-/dev/stdin}"
APPROVER="${APPROVER:-Dogpatch Admin}"
WHY="${WHY:-User-approved improvement to system prompt}"
IMPACT="${IMPACT:-Clearer routing / better answers}"
B1="${B1:-Minimal change to add capability}"
B2="${B2:-Preserve guardrails and tone}"
B3="${B3:-Rollback via git if needed}"

# 1) Validate diff respects guardrails
python3 improvebot/validate_diff.py < "$DIFF_FILE" >/dev/null

# 2) Apply (with better error handling)
if ! git apply --check "$DIFF_FILE" 2>/dev/null; then
  echo "ERROR: Invalid diff format. Attempting to clean and retry..." >&2
  # Try to clean the diff by removing any long wrapped lines
  CLEAN_DIFF="$(mktemp)"
  grep -v "^[[:space:]]*$" "$DIFF_FILE" | \
  awk 'length($0) > 200 { print "ERROR: Line too long: " substr($0,1,50) "..."; next } { print }' > "$CLEAN_DIFF"
  
  if ! git apply --check "$CLEAN_DIFF" 2>/dev/null; then
    echo "ERROR: Could not apply diff even after cleaning" >&2
    rm "$CLEAN_DIFF"
    exit 1
  fi
  git apply "$CLEAN_DIFF"
  rm "$CLEAN_DIFF"
else
  git apply "$DIFF_FILE"
fi

# 3) Build changelog entry
DATE=$(date +%F)
DIFF_CONTENT="$(cat "$DIFF_FILE")"
TEMPLATE="improvebot/templates/changelog_entry.md.tmpl"

ENTRY="$(cat "$TEMPLATE")"
ENTRY="${ENTRY//\{\{DATE\}\}/$DATE}"
ENTRY="${ENTRY//\{\{APPROVER\}\}/$APPROVER}"
ENTRY="${ENTRY//\{\{WHY\}\}/$WHY}"
ENTRY="${ENTRY//\{\{IMPACT\}\}/$IMPACT}"
ENTRY="${ENTRY//\{\{B1\}\}/$B1}"
ENTRY="${ENTRY//\{\{B2\}\}/$B2}"
ENTRY="${ENTRY//\{\{B3\}\}/$B3}"
# Escape backticks in DIFF_CONTENT for safety
ESCAPED_DIFF="${DIFF_CONTENT//\`/\\\`}"
ENTRY="${ENTRY//\{\{DIFF\}\}/$ESCAPED_DIFF}"

# 4) Append to changelog
echo "$ENTRY" >> system_prompt/prompt_changelog.md

echo "Applied and logged."
