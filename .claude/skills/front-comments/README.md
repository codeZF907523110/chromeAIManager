<div>
  <img src="../assets/logos/logo-frontend-skills-comments-300.png" alt="Claude Code Front-end Skills comments logo"  width="200" height="200"/>
</div>

# Claude Code Skill Front Comments

**Document your frontend code with structured, consistent comments, directly from [Claude Code](https://claude.ai/code).**

**Claude Code Front Comments** is a **Claude Code skill** that adds structured comments to frontend files at two levels: Level 1 for file headers, section dividers, and JSDoc headings on every significant block, Full for everything in Level 1 plus inline comments on every function body, directive, and template expression. Using a single slash command with optional arguments, you control the depth and language of the output. Compatible with JavaScript, TypeScript, React, CSS, Sass, HTML, Vue, Svelte, and Astro, it covers a wide range of the frontend stack.

> Part of the [claude-code-frontend-skills](https://github.com/Effeilo/claude-code-frontend-skills) collection.

Supports **Level 1** (structure & JSDoc only) and **Full** (Level 1 + inline comments on every block), with optional language selection.

## 🎬 Quick Demo

https://github.com/user-attachments/assets/63e9c58a-a5f4-4d8b-8ca1-0138d25f6f0e

---

## 🌐 Supported languages

| Extension | Language |
|---|---|
| `.js` `.ts` `.mjs` `.jsx` `.tsx` | JavaScript / TypeScript / React |
| `.css` `.sass` `.scss` | CSS / Sass |
| `.html` | HTML |
| `.vue` | Vue SFC |
| `.svelte` | Svelte |
| `.astro` | Astro |

---

## 📦 Installation

Clone the repository:

```bash
git clone https://github.com/Effeilo/claude-code-frontend-skills.git
cd claude-code-frontend-skills
```

### Option A: install script (recommended)

```bash
./install.sh front-comments          # macOS / Linux / WSL
.\install.ps1 front-comments         # Windows PowerShell
```

Add `--force` / `-Force` to overwrite an existing install.

### Option B: manual install

```bash
mkdir -p ~/.claude/skills/front-comments
cp front-comments/SKILL.md front-comments/front-comments-*.md ~/.claude/skills/front-comments/
```

---

## 🚀 Usage

Open a file in your editor, then run the skill from Claude Code:

```
/front-comments
```

### Arguments

Arguments can be combined in any order:

| Argument | Effect |
|---|---|
| *(none)* | Level 1 comments, English |
| `full` | Full comments (Level 1 + inline on every block) |
| `lang:fr` | Comments in French |
| `lang:es` | Comments in Spanish |
| `lang:de` | Comments in German |

```
/front-comments
/front-comments full
/front-comments lang:fr
/front-comments full lang:fr
```

---

## 💬 Comment levels

### Level 1: Structure & JSDoc

Adds the structural skeleton of comments without going into detail:

- File-level header describing the component's purpose
- Section dividers between logical blocks
- JSDoc headings (`## emoji Title`) on every reactive state, method, prop, hook…
- Short inline comments on non-obvious template elements

Ideal for **quickly documenting a file** or maintaining a **light comment footprint**.

### Full: Level 1 + inline comments on every block

Everything from Level 1, plus:

- Expanded JSDoc descriptions on every heading
- Directive/expression explanations in templates (`v-if`, `{#if}`, `class:list`…)
- JSDoc before every import
- Inline `/** */` comments inside every function and hook body
- Numbered reference blocks for CSS rules with multiple non-obvious properties

Ideal for **onboarding**, **code reviews**, or **heavily documented codebases**.

---

## 🔤 Comment style per language

| Language | File header | Script / Logic | Template | Style |
|---|---|---|---|---|
| JS / TS | `/** */` JSDoc | `/** */` JSDoc | - | - |
| CSS / Sass | `/** */` JSDoc | - | - | `/* */` dividers + `/** */` labels |
| HTML | `<!-- -->` | - | `<!-- -->` | - |
| Vue | `<!-- -->` | `/** */` JSDoc | `<!-- -->` | `/* */` dividers |
| Svelte | `<!-- -->` | `/** */` JSDoc | `<!-- -->` | `/* */` dividers |
| Astro | `<!-- -->` | `/** */` JSDoc | `<!-- -->` | `/* */` dividers |

---

## ♻️ Existing comments

If the file already has comments, the skill will:

1. Scan all existing comments and identify those with non-obvious semantic value (business rules, browser workarounds, architectural decisions…)
2. Remove all existing comments
3. Rewrite using the structured format
4. Fold the content of valuable existing comments into the appropriate new blocks

No useful information is lost, it gets reformatted into the right place.

---

## 🧪 Examples

JS files without comments: 

```js
function navigateWithTransition(e) {
    if (!document.startViewTransition) return;
    e.preventDefault();
    const url = e.currentTarget.href;

    document.startViewTransition(() => {
        return new Promise(resolve => {
            window.location.href = url;
            resolve();
        });
    });
}
```

After `/front-comments`:

```js
/**
 * ## 🔀 navigateWithTransition
 *
 * Click handler that wraps same-page link navigation inside a View Transition.
 *
 * Responsibilities:
 * - Skips silently when `document.startViewTransition` is unsupported (progressive enhancement)
 * - Prevents the default browser navigation to take control of the timing
 * - Triggers `startViewTransition` so the browser captures the before/after snapshots
 * - Sets `window.location.href` inside the transition callback to start the actual navigation
 *
 * @param {MouseEvent} e - The click event fired on a navigation link.
 */
function navigateWithTransition(e) {
    if (!document.startViewTransition) return;
    e.preventDefault();
    const url = e.currentTarget.href;

    document.startViewTransition(() => {
        return new Promise(resolve => {
            window.location.href = url;
            resolve();
        });
    });
}
```

After `/front-comments full`:

```js
/**
 * ## 🔀 navigateWithTransition
 *
 * Click handler that wraps same-page link navigation inside a View Transition.
 *
 * Responsibilities:
 * - Skips silently when `document.startViewTransition` is unsupported (progressive enhancement)
 * - Prevents the default browser navigation to take control of the timing
 * - Triggers `startViewTransition` so the browser captures before/after snapshots
 * - Sets `window.location.href` inside the transition callback to start the actual navigation
 *
 * @param {MouseEvent} e - The click event fired on a navigation link.
 */
function navigateWithTransition(e) {
    /** Bail out early if the browser does not support the View Transition API, native navigation proceeds normally */
    if (!document.startViewTransition) return;

    /** Prevent the browser from navigating immediately so the transition can run first */
    e.preventDefault();

    /** Capture the destination URL from the clicked link before the transition starts */
    const url = e.currentTarget.href;

    /**
     * Start the view transition, the browser freezes the current page as a snapshot,
     * runs the callback, then animates between the two states using CSS.
     */
    document.startViewTransition(() => {
        /**
         * Wrap the navigation in a Promise so `startViewTransition` can track completion.
         * `resolve()` is called immediately after setting the href, the actual page
         * load happens asynchronously, which is expected behavior for cross-page transitions.
         */
        return new Promise(resolve => {
            /** Trigger the browser navigation to the captured URL */
            window.location.href = url;

            /** Resolve right away; the transition animation will play out as the new page loads */
            resolve();
        });
    });
}
```

Current examples included in this repository:

| Source | Level 1 | Full |
|---|---|---|
| `navigate-loader.js` | `navigate-loader-comments-lvl1.js` | `navigate-loader-comments-full.js` |
| `browserux.css` | `browserux-lvl1.css` | `browserux-full.css` |

---

## 📁 File structure

```text
front-comments/
|- SKILL.md                    # Skill entry point (orchestration)
|- front-comments-html.md      # HTML rules
|- front-comments-js.md        # JS / TS / JSX / TSX rules
|- front-comments-css.md       # CSS / Sass / SCSS rules
|- front-comments-vue.md       # Vue rules
|- front-comments-svelte.md    # Svelte rules
|- front-comments-astro.md     # Astro rules
|- examples/                   # Example source files and commented outputs
`- README.md
```

Version history for the whole collection is tracked in the repository root `CHANGELOG.md`.

---

## ⚖️ License

[MIT](../LICENSE.md) © 2026 [Effeilo](https://github.com/Effeilo)