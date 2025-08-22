#!/usr/bin/env python3
import sys, re

diff = sys.stdin.read().strip()
if not diff:
    print("ERROR: Empty diff.", file=sys.stderr); sys.exit(2)

# Accept only the nested path
if not re.search(r'^--- a/system_prompt/system_prompt\.md$', diff, flags=re.M):
    print("ERROR: Diff must target system_prompt/system_prompt.md", file=sys.stderr); sys.exit(2)

# Block deletions
if re.search(r'^--- /dev/null', diff, flags=re.M):
    print("ERROR: Deletion diffs are not allowed.", file=sys.stderr); sys.exit(2)

# Protect first identity line unless explicit token present
if 'Allow-Edit-Core: YES' not in diff and re.search(
    r'^-You are Dogpatch LibreChat Build Copilot\.', diff, flags=re.M
):
    print("ERROR: Core identity line cannot be altered without explicit approval token.", file=sys.stderr); sys.exit(2)

print("OK")
