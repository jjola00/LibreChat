#!/usr/bin/env python3
import sys, re, os

# Read entire diff from stdin
diff = sys.stdin.read().strip()
if not diff:
    print("ERROR: Empty diff.", file=sys.stderr); sys.exit(2)

# Determine allowed prompt file path (relative)
allowed_path = os.environ.get('ALLOWED_PROMPT_FILE', 'system_prompt/system_prompt.md')

# Enforce patch target path
escaped = re.escape(allowed_path)
from_header = rf'^--- a/{escaped}$'
if not re.search(from_header, diff, flags=re.M):
    print("ERROR: Diff must target {}".format(allowed_path), file=sys.stderr); sys.exit(2)

# Block deletions of entire file
if re.search(r'^--- /dev/null', diff, flags=re.M):
    print("ERROR: Deletion diffs are not allowed.", file=sys.stderr); sys.exit(2)

# Protect first identity line of the current prompt unless explicit token present
approval_token = 'Allow-Edit-Core: YES'
if approval_token not in diff:
    try:
        with open(allowed_path, 'r', encoding='utf-8') as f:
            # Grab the first non-empty line
            for line in f:
                first_line = line.rstrip('\n')
                break
        if first_line:
            # If the diff attempts to remove this exact first line, block it
            removal_pattern = r'^-' + re.escape(first_line) + r'$'
            if re.search(removal_pattern, diff, flags=re.M):
                print("ERROR: Core identity line cannot be altered without explicit approval token.", file=sys.stderr); sys.exit(2)
    except FileNotFoundError:
        # If file missing, be conservative
        print("ERROR: Target prompt file not found for validation.", file=sys.stderr); sys.exit(2)

print("OK")
