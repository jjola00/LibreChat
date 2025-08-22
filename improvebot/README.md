# Improvebot — System Prompt Self-Improvement

This folder contains a minimal workflow to propose and optionally apply improvements to a system prompt.

## Components
- `propose.sh`: Calls an LLM to generate a unified diff for the target prompt file based on your request and guardrails.
- `validate_diff.py`: Ensures diffs only target the allowed prompt file and protect the first line (identity) unless explicitly approved.
- `apply_diff.sh`: Validates, applies the diff, and appends an entry to `system_prompt/prompt_changelog.md`.
- `improve.sh`: Orchestrates the propose → review → apply flow.

## Quick start

1. Export your API key (or set via env injection):
```bash
export OPENAI_API_KEY="sk-..."
```

2. Propose and apply a change interactively:
```bash
improvebot/improve.sh -- "Add HR routing: if asked 'who do I ask for annual leave?' answer 'Use the Personio platform.'"
```

3. Auto-apply non-interactively (CI-friendly):
```bash
ALLOWED_PROMPT_FILE="system_prompt/system_prompt.md" \
improvebot/improve.sh -y -- "Add HR routing for annual leave via Personio"
```

4. Target a different prompt file:
```bash
ALLOWED_PROMPT_FILE="other_prompt/bot.md" \
improvebot/improve.sh -y --prompt-file other_prompt/bot.md -- "Tweak tone: more concise"
```

## Notes
- Set `MOCK=1` to return a static sample diff without calling the API.
- The validator protects the first line of the prompt unless your diff includes the token `Allow-Edit-Core: YES`.
- Changelog entries are appended to `system_prompt/prompt_changelog.md` using `improvebot/templates/changelog_entry.md.tmpl`. 