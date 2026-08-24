---
name: front-refactor
description: "Refactor a JS, TS, React (JSX/TSX), CSS, Sass, Vue, Svelte, or Astro file with improved naming, simplified logic, dead code removal, and modern syntax, without changing behavior. Usage: /front-refactor [apply]"
argument-hint: "[apply]"
allowed-tools: Read, Glob, Edit, Write
---

Refactor the file that is currently open or explicitly mentioned by the user.

- Default (no arguments): **Preview mode**, analyse the file and output a structured diff showing all proposed changes. Do not modify the file.
- If `$ARGUMENTS` contains `apply`: **Apply mode**, apply all refactoring changes and rewrite the file.

---

## Step 1: Detect the file language

Look at the extension of the target file:

- If `.js`, `.ts`, `.mjs`, `.jsx`, `.tsx` → the language file is `front-refactor-js.md`
- If `.css`, `.sass`, `.scss` → the language file is `front-refactor-css.md`
- If `.vue` → the language file is `front-refactor-vue.md`
- If `.svelte` → the language file is `front-refactor-svelte.md`
- If `.astro` → the language file is `front-refactor-astro.md`
- Otherwise → inform the user that this file type is not supported. Supported types: `.js`, `.ts`, `.mjs`, `.jsx`, `.tsx`, `.css`, `.sass`, `.scss`, `.vue`, `.svelte`, `.astro`.

The path of this skill file is always available from context. Resolve all sub-file paths relative to it.

---

## Step 1.5: Enrich with latest documentation (optional)

If the context7 MCP is available in this session, use it to fetch the latest official documentation for the detected language or framework (e.g., React, Vue, Svelte, Astro, Sass).
Use this documentation to complement the rules loaded in Steps 2 and 3, particularly to identify patterns that are deprecated or have a modern idiomatic replacement in the latest version.
If context7 is not available, skip this step and continue with your training knowledge.

---

## Step 2: Load the shared rules

Read `front-refactor-rules.md` (located in the same directory as this skill file).
It contains universal refactoring rules and the principles that govern all changes.

---

## Step 3: Load the language-specific rules

Read the language file identified in Step 1 (located in the same directory as this skill file).
It contains language-specific refactoring patterns and detection guidance.

---

## Step 4: Read and analyse the target file

Read the entire target file. Collect all applicable refactoring opportunities before producing output.
Never apply a refactoring that could change observable behavior (see constraints in `front-refactor-rules.md`).

---

## Output: Preview mode (default)

Output a structured refactoring plan. Do not modify the file.

```
## Refactoring Preview: filename.ext

### DEAD: Dead Code Removal
**[line N] Short description**
Before: `code snippet`
After:  `code snippet`
Reason: one sentence explaining why this change is safe.

---

### NAMING: Naming Improvements
...

### SIMPLIFY: Logic Simplification
...

### MODERN: Syntax Modernisation
...

---

### Summary
| Category | Changes |
|---|---|
| DEAD | N |
| NAMING | N |
| SIMPLIFY | N |
| MODERN | N |
| **Total** | **N** |

> Run `/front-refactor apply` to apply all changes.
```

- Group changes by category: DEAD → NAMING → SIMPLIFY → MODERN.
- Omit category sections that have no changes.
- Each change must include a line reference, a before/after snippet, and a one-sentence reason.
- If no changes are found, say so explicitly.

---

## Output: Apply mode (`apply`)

Rewrite the entire file with all refactoring changes applied. Then output a short apply report:

```
## Refactoring Applied: filename.ext

### Changes made
| Category | Changes |
|---|---|
| DEAD | N |
| NAMING | N |
| SIMPLIFY | N |
| MODERN | N |
| **Total** | **N** |

### Notes
- [any manual follow-up that could not be automated, e.g. a rename that spans multiple files]
```

- Output the full rewritten file first, then the apply report.
- If a change cannot be applied safely in isolation (e.g. a rename that spans multiple files), skip it and list it under Notes.
