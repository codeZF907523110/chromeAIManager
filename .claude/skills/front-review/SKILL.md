---
name: front-review
description: "Review a JS, TS, React (JSX/TSX), CSS, Sass, HTML, Vue, Svelte, or Astro file for code quality, potential bugs, performance, and maintainability. Usage: /front-review [strict]"
argument-hint: "[strict]"
allowed-tools: Read, Glob
---

Review the file that is currently open or explicitly mentioned by the user.

- Default (no arguments): **Standard mode** : balanced review flagging clear issues and actionable suggestions.
- If `$ARGUMENTS` contains `strict`: **Strict mode** : tightened thresholds on quality, complexity, and performance rules.

---

## Step 1 : Detect the file language

Look at the extension of the target file:

- If `.js`, `.ts`, `.mjs`, `.jsx`, `.tsx` → the language file is `front-review-js.md`
- If `.css`, `.sass`, `.scss` → the language file is `front-review-css.md`
- If `.html` → the language file is `front-review-html.md`
- If `.vue` → the language file is `front-review-vue.md`
- If `.svelte` → the language file is `front-review-svelte.md`
- If `.astro` → the language file is `front-review-astro.md`
- Otherwise → inform the user that this file type is not supported. Supported types: `.js`, `.ts`, `.mjs`, `.jsx`, `.tsx`, `.css`, `.sass`, `.scss`, `.html`, `.vue`, `.svelte`, `.astro`.

The path of this skill file is always available from context. Resolve all sub-file paths relative to it.

---

## Step 1.5 : Enrich with latest documentation (optional)

If the context7 MCP is available in this session, use it to fetch the latest official documentation for the detected language or framework (e.g., React, Vue, Svelte, Astro, Sass).
Use this documentation to complement the rules loaded in Steps 2 and 3, particularly to flag patterns that are deprecated or have a better equivalent in the latest version.
If context7 is not available, skip this step and continue with your training knowledge.

---

## Step 2 : Load the shared rules

Read `front-review-rules.md` (located in the same directory as this skill file).
It contains universal review rules, severity definitions, and strict mode threshold overrides.

---

## Step 3 : Load the language-specific rules

Read the language file identified in Step 1 (located in the same directory as this skill file).
It contains language-specific rules, detection patterns, and code examples.

---

## Step 4 : Review the file

Read the entire target file before reporting, collect all issues first.
Apply all rules from `front-review-rules.md` and the language file.
In strict mode, apply the tightened thresholds defined at the end of `front-review-rules.md`.

---

## Output format

Do not modify the file. Output a structured review report:

```
## Code Review : filename.ext
> **Strict mode** *(include this line only when strict is active)*

### 🔴 Critical
**[line N] Short issue title**
Code: `relevant snippet`
Problem: clear explanation of what is wrong and why it matters.
Fix: concrete suggestion to resolve it.

---

### 🟠 Important
...

### 🟡 Minor
...

### 💡 Suggestion
...

---

### Summary
| Severity | Count |
|---|---|
| 🔴 Critical | N |
| 🟠 Important | N |
| 🟡 Minor | N |
| 💡 Suggestion | N |
| **Total** | **N** |
```

- Group issues by severity: Critical → Important → Minor → Suggestion.
- Omit severity sections that have no issues.
- Focus on impactful issues, do not flag every minor stylistic preference.
- Each issue must include a line reference, a code snippet, a clear problem statement, and a concrete fix.
