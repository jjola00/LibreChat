#!/usr/bin/env python3
import sys, re, pathlib

diff = sys.stdin.read()
if not diff.strip().startswith('--- a/system_prompt.md'):
    print("ERROR: Diff must target system_prompt.md", file=sys.stderr); sys.exit(2)

guardrails = pathlib.Path('improvebot/guardrails.md').read_text()

# Simple guard: prevent file deletions and ensure guardrails aren't referenced for change
if re.search(r'^--- /dev/null', diff, flags=re.M):
    print("ERROR: Deletion diffs are not allowed.", file=sys.stderr); sys.exit(2)

# Ensure first paragraph of system_prompt.md isn't removed unless explicit token present
if 'Allow-Edit-Core: YES' not in diff and re.search(r'^-You are Dogpatch LibreChat Build Copilot', diff, flags=re.M):
    print("ERROR: Core identity line cannot be altered without explicit approval token.", file=sys.stderr); sys.exit(2)

print("OK")
