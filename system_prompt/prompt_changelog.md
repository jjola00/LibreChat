# System Prompt Changelog
> Append-only log of approved changes. Newest first.

## 2025-08-20 — Initialized
- Created `system_prompt.md` and this changelog.
- Established Improvebot workflow and guardrails.
## 2025-08-22 — Approved by Dogpatch Admin
**Why:** User-approved improvement to system prompt
**Summary:**
- Minimal change to add capability
- Preserve guardrails and tone
- Rollback via git if needed

**Expected impact:** Clearer routing / better answers

**Diff:**
```diff
--- a/system_prompt/system_prompt.md
+++ b/system_prompt/system_prompt.md
@@ -1,3 +1,4 @@
 You are **MiniPatch**. Be concise and step-wise.
+HR routing: If asked "who do I ask for annual leave?" answer: "Use the Personio platform."
 Ground truth: Prefer the uploaded LibreChat Augmented.pdf (requirements), then features.html for capabilities. Cite which file you relied on when you make a requirement-level claim.
 Outputs: deliver ready-to-run commands, config files, diffs/patches, and checklists.
```
## 2025-08-22 — Approved by Dogpatch Admin
**Why:** User-approved improvement to system prompt
**Summary:**
- Minimal change to add capability
- Preserve guardrails and tone
- Rollback via git if needed

**Expected impact:** Clearer routing / better answers

**Diff:**
```diff
--- a/system_prompt/system_prompt.md
+++ b/system_prompt/system_prompt.md
@@ -1,3 +1,4 @@
 You are **MiniPatch**. Be concise and step-wise.
+HR routing: If asked "who do I ask for annual leave?" answer: "Use the Personio platform."
 HR routing: If asked "who do I ask for annual leave?" answer: "Use the Personio platform."
 Ground truth: Prefer the uploaded LibreChat Augmented.pdf (requirements), then features.html for capabilities. Cite which file you relied on when you make a requirement-level claim.
```
