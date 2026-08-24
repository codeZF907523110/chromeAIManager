---
name: front-comments
description: "Add structured comments to a JS, TS, React (JSX/TSX), CSS, Sass, HTML, Vue, Svelte, or Astro file at level 1 (structure only) or full (level 1 + inline comments on every rule/method). Usage: /front-comments [full] [lang:fr]"
argument-hint: "[full] [lang:fr]"
allowed-tools: Read, Edit, Write, Glob
---

Comment the file that is currently open or explicitly mentioned by the user.
Apply **Level 1** comments by default, or **Full** (Level 1 + inline comments) if `$ARGUMENTS` contains `full`.

Detect the comment language from `$ARGUMENTS`:
- If `$ARGUMENTS` contains `lang:fr` → write all comments in **French**
- If `$ARGUMENTS` contains `lang:es` → write all comments in **Spanish**
- If `$ARGUMENTS` contains `lang:de` → write all comments in **German**
- Otherwise → write all comments in **English** (default)

---

## Step 1: Handle existing comments

Before applying any rules, scan the file for existing comments:

1. **Read all existing comments** and identify which ones contain non-obvious information, business rules, browser workarounds, ticket references, architectural decisions, "why" explanations. Ignore trivial comments that only restate the code (e.g. `// increment counter`).
2. **Remove all existing comments** from the file, including trivial ones, misplaced ones, and well-written ones alike.
3. **Apply the structured commenting rules** (Steps 2–3 below) to the now comment-free file.
4. **Reintegrate the semantic content** of the valuable comments identified in step 1, fold their information into the appropriate new structured blocks (file header, JSDoc description, inline comment…) rather than reinserting them verbatim.

The goal: a clean, consistent structure where no useful information is lost.

---

## Step 2: Detect the file language

Look at the extension of the target file:

- If `.js`, `.ts`, `.mjs`, `.jsx`, `.tsx` → Read `front-comments-js.md` (located in the same directory as this skill file) and apply its instructions.
- If `.css`, `.sass`, `.scss` → Read `front-comments-css.md` (located in the same directory as this skill file) and apply its instructions.
- If `.html` → Read `front-comments-html.md` (located in the same directory as this skill file) and apply its instructions.
- If `.vue` → Read `front-comments-vue.md` (located in the same directory as this skill file) and apply its instructions.
- If `.svelte` → Read `front-comments-svelte.md` (located in the same directory as this skill file) and apply its instructions.
- If `.astro` → Read `front-comments-astro.md` (located in the same directory as this skill file) and apply its instructions.

The path of this skill file is always available from context. Resolve the sub-file path relative to it.

---

## Step 3: Apply the instructions from the sub-file

Follow every rule defined in the loaded sub-file for the requested level (Level 1 or Full).

---

## Output rules (apply regardless of language)

- Output the **entire file** with comments added, do not truncate.
- Do not modify any existing code, only add comments.
- Preserve all original formatting, indentation, and blank lines.
- Write comments in the language detected from `$ARGUMENTS` (see above). Default: **English**.
- For JS/TS files: use only `/** */` style for JSDoc blocks and inline comments. Use `//` only for section dividers.
- For CSS/SASS/SCSS files: use `/* */` for section dividers and tertiary labels. Use `/** */` for file headers, major section descriptions, and inline property group labels.
