#!/usr/bin/env bash
set -euo pipefail

# Defaults
PROMPT_FILE="${PROMPT_FILE:-system_prompt/system_prompt.md}"
GUARDRAILS_FILE="${GUARDRAILS_FILE:-improvebot/guardrails.md}"
AUTO_APPLY="0"
APPROVER_DEFAULT="Dogpatch Admin"
WHY_DEFAULT="User-approved improvement to system prompt"
IMPACT_DEFAULT="Clearer routing / better answers"
B1_DEFAULT="Minimal change to add capability"
B2_DEFAULT="Preserve guardrails and tone"
B3_DEFAULT="Rollback via git if needed"

usage() {
  echo "Usage: $0 [--apply|-y] [--prompt-file <path>] [--approver <name>] [--why <text>] [--impact <text>] -- <improvement_request>" >&2
}

APPROVER="${APPROVER:-$APPROVER_DEFAULT}"
WHY="${WHY:-$WHY_DEFAULT}"
IMPACT="${IMPACT:-$IMPACT_DEFAULT}"
B1="${B1:-$B1_DEFAULT}"
B2="${B2:-$B2_DEFAULT}"
B3="${B3:-$B3_DEFAULT}"

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply|-y)
      AUTO_APPLY="1"; shift ;;
    --prompt-file)
      PROMPT_FILE="$2"; shift 2 ;;
    --approver)
      APPROVER="$2"; shift 2 ;;
    --why)
      WHY="$2"; shift 2 ;;
    --impact)
      IMPACT="$2"; shift 2 ;;
    --)
      shift; break ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      ARGS+=("$1"); shift ;;
  esac
done

REQUEST="${*:-${ARGS[*]:-}}"
if [[ -z "$REQUEST" ]]; then
  usage; exit 1
fi

# Ensure required files exist
[[ -f "$PROMPT_FILE" ]] || { echo "ERROR: Missing $PROMPT_FILE" >&2; exit 2; }
[[ -f "$GUARDRAILS_FILE" ]] || { echo "ERROR: Missing $GUARDRAILS_FILE" >&2; exit 2; }

# Propose diff
TMP_DIFF="$(mktemp)"
# Pass through env vars for proposer
PROMPT_FILE="$PROMPT_FILE" GUARDRAILS_FILE="$GUARDRAILS_FILE" "$(dirname "$0")/propose.sh" "$REQUEST" | tee "$TMP_DIFF"

if [[ "$AUTO_APPLY" != "1" ]]; then
  echo
  read -r -p "Apply this change? [y/N] " ans
  case "${ans:-}" in
    y|Y|yes|YES) AUTO_APPLY="1" ;;
    *) AUTO_APPLY="0" ;;
  esac
fi

if [[ "$AUTO_APPLY" == "1" ]]; then
  ALLOWED_PROMPT_FILE="$PROMPT_FILE" APPROVER="$APPROVER" WHY="$WHY" IMPACT="$IMPACT" B1="$B1" B2="$B2" B3="$B3" "$(dirname "$0")/apply_diff.sh" "$TMP_DIFF"
  echo "Applied and logged."
else
  echo "Not applied. You can apply later with: ALLOWED_PROMPT_FILE=\"$PROMPT_FILE\" improvebot/apply_diff.sh $TMP_DIFF" >&2
fi 