<div>
  <img src="../assets/logos/logo-frontend-skills-refactor-300.png" alt="Claude Code Front-end Skills refactor logo" width="200" height="200"/>
</div>

# Claude Code Skill Front Refactor

**Modernize your frontend code without touching its behavior, directly from [Claude Code](https://claude.ai/code).**

**Front-refactor** is a **Claude Code skill** that rewrites frontend files with improved naming, simplified logic, dead code removal, and modern syntax. Using a single slash command, preview mode analyses the file and outputs a structured diff of all proposed changes, apply mode rewrites it. Compatible with JavaScript, TypeScript, React, CSS, Sass, Vue, Svelte, and Astro, it covers a wide range of the frontend stack.

> Part of the [claude-code-frontend-skills](https://github.com/Effeilo/claude-code-frontend-skills) collection.

Supports **Preview mode** (analyse and report all proposed changes) and **Apply mode** (rewrite the file with all changes applied).

---

## 🎬 Quick Demo

https://github.com/user-attachments/assets/d568e5e5-f03b-43a2-8292-6ada27c8aae7

---

## 🌐 Supported languages

| Extension | Language |
|---|---|
| `.js` `.ts` `.mjs` `.jsx` `.tsx` | JavaScript / TypeScript / React |
| `.css` `.sass` `.scss` | CSS / Sass |
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
./install.sh front-refactor          # macOS / Linux / WSL
.\install.ps1 front-refactor         # Windows PowerShell
```

Add `--force` / `-Force` to overwrite an existing install.

### Option B: manual install

```bash
mkdir -p ~/.claude/skills/front-refactor
cp front-refactor/SKILL.md front-refactor/front-refactor-*.md ~/.claude/skills/front-refactor/
```

---

## 🚀 Usage

Open a file in your editor, then run the skill from Claude Code:

```
/front-refactor
```

### Arguments

| Argument | Effect |
|---|---|
| *(none)* | Preview mode: analyse the file and output a structured diff of all proposed changes. The file is not modified. |
| `apply` | Apply mode: apply all refactoring changes and rewrite the file. |

```
/front-refactor
/front-refactor apply
```

---

## 🔧 Refactoring categories

### DEAD: Dead Code Removal

Detects and removes code that serves no purpose:

- Unused imports, variables, and functions never referenced
- Commented-out code blocks (history belongs in version control)
- Unreachable statements after a `return`, `throw`, or `break`
- Empty catch blocks and no-op event handlers

Ideal for **cleaning up accumulated debt** before adding new features.

### NAMING: Naming Improvements

Renames identifiers to make intent explicit:

- Cryptic single-letter variables and abbreviations (`d`, `tmp`, `x`)
- Boolean variables not following the `is/has/can/should` convention
- Magic numbers extracted to named constants (`10` → `MAX_ITEMS`)
- Inconsistent casing across similar identifiers

Ideal for **improving readability** without touching logic.

### SIMPLIFY: Logic Simplification

Reduces cyclomatic complexity and removes redundant control flow:

- `if/else` returning booleans → direct expression (`return x > 0`)
- Deep nested conditions → early returns and guard clauses
- Multi-step variable assignments → ternary expressions
- Optional chaining and nullish coalescing to flatten guard chains

Ideal for **making logic easier to follow** at a glance.

### MODERN: Syntax Modernisation

Replaces legacy patterns with idiomatic modern equivalents:

- `var` → `const` / `let` with appropriate scoping
- `.then()` chains → `async/await`
- Manual `for` loops over arrays → `map`, `filter`, `reduce`
- String concatenation → template literals
- Traditional `function` callbacks → arrow functions
- Spread operators instead of `Object.assign` or `Array.concat`

Ideal for **aligning the codebase with current standards**.

---

## ✨ Context7 integration (optional)

If you have the [context7](https://github.com/upstash/context7) MCP installed, `front-refactor` will automatically use it to fetch the latest official documentation for the detected framework before applying the rules.

This allows the skill to detect **deprecated patterns and suggest their modern idiomatic replacement** based on the actual latest version of the library, for example, a Vue option deprecated in Vue 3.5, or a Sass syntax replaced in recent versions.

If context7 is not installed, the skill runs normally using its built-in rules and Claude's training knowledge. No configuration required.

---

## 🔒 Behavior preservation

A refactoring must never change observable behavior. The skill enforces this constraint at every step:

- Changes that affect exported symbols or public component APIs are flagged in the Notes section instead of being applied automatically.
- Cross-file renames (a variable referenced in other modules) are reported but not applied.
- Any change that could alter runtime behavior, even subtly, is excluded from the automatic pass.

If a change cannot be applied safely in isolation, it is skipped and listed under Notes so you can handle it manually.

---

## 🧪 Examples

### Preview mode

Source file `order-utils.js`:

```js
import { formatDate } from './date-helpers';
import { logEvent } from './analytics';
import { TAX_RATE } from './constants';

var maxItems = 10;

function computeTotal(items, applyTax) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].quantity;
  }
  if (applyTax == true) {
    total = total * (1 + TAX_RATE);
  }
  return total;
}

function getLabel(count) {
  var label;
  if (count > 0) {
    label = 'items in cart';
  } else {
    label = 'cart is empty';
  }
  return label;
}

function isValid(order) {
  if (order.items.length > maxItems) {
    return false;
  } else {
    return true;
  }
}

// function debugOrder(order) {
//   console.log('order:', order);
//   console.log('total:', computeTotal(order.items, true));
// }

export { computeTotal, getLabel, isValid };
```

After `/front-refactor`:

```
## Refactoring Preview: order-utils.js

### DEAD: Dead Code Removal

**[line 1] Unused import : `formatDate`**
Before: `import { formatDate } from './date-helpers';`
After:  *(line removed)*
Reason: `formatDate` is never referenced anywhere in the file.

**[line 2] Unused import : `logEvent`**
Before: `import { logEvent } from './analytics';`
After:  *(line removed)*
Reason: `logEvent` is never referenced anywhere in the file.

**[line 48] Commented-out code block**
Before: `// function debugOrder(order) { ... }`
After:  *(block removed)*
Reason: Commented-out code adds noise, version control preserves the history.

### NAMING: Naming Improvements

**[line 5] Magic number → named constant**
Before: `var maxItems = 10;`
After:  `const MAX_ITEMS = 10;`
Reason: `10` is a meaningful business limit; naming it `MAX_ITEMS` makes the constraint self-documenting.

### SIMPLIFY: Logic Simplification

**[line 12] Redundant comparison to `true`**
Before: `if (applyTax == true)`
After:  `if (applyTax)`
Reason: Comparing a boolean to `true` with loose equality is redundant and potentially coercive.

**[line 18] `if/else` assignment → ternary : `getLabel`**
Before: `var label; if (count > 0) { label = '...' } else { label = '...' } return label;`
After:  `return count > 0 ? 'items in cart' : 'cart is empty';`
Reason: The sole purpose of the `if/else` is to assign one of two string values.

**[line 42] `if/else` returning boolean → direct expression : `isValid`**
Before: `if (order.items.length > maxItems) { return false; } else { return true; }`
After:  `return order.items.length <= MAX_ITEMS;`
Reason: Returning `true`/`false` from an `if/else` is equivalent to returning the boolean expression directly.

### MODERN: Syntax Modernisation

**[line 5, 7, 9, 20] `var` → `const` / `let`**
Before: `var maxItems`, `var total`, `var i`, `var label`
After:  `const MAX_ITEMS`, `let total`, `let i`
Reason: `var` is function-scoped and hoisted; `const`/`let` provide block scoping and clearer intent.

**[line 8] Manual `for` loop → `Array.reduce`**
Before: `for (var i = 0; i < items.length; i++) { total = total + ... }`
After:  `const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);`
Reason: The loop accumulates a sum, the idiomatic modern equivalent is `reduce`.

### Summary
| Category | Changes |
|---|---|
| DEAD     | 3 |
| NAMING   | 1 |
| SIMPLIFY | 3 |
| MODERN   | 2 |
| Total    | 9 |

> Run `/front-refactor apply` to apply all changes.
```

### Apply mode

After `/front-refactor apply`, the file is rewritten:

```js
import { TAX_RATE } from './constants';

const MAX_ITEMS = 10;

function computeTotal(items, applyTax) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return applyTax ? total * (1 + TAX_RATE) : total;
}

function getLabel(count) {
  return count > 0 ? 'items in cart' : 'cart is empty';
}

function isValid(order) {
  return order.items.length <= MAX_ITEMS;
}

export { computeTotal, getLabel, isValid };
```

Current examples included in this repository:

| Source | Preview | Applied |
|---|---|---|
| `order-utils.js` | `order-utils.preview.md` | `order-utils.applied.js` |
| `card.css` | `card.preview.md` | `card.applied.css` |

---

## 📁 File structure

```text
front-refactor/
|- SKILL.md                    # Skill entry point (orchestration)
|- front-refactor-rules.md     # Shared rules (all languages)
|- front-refactor-js.md        # JS / TS / JSX / TSX rules
|- front-refactor-css.md       # CSS / Sass / SCSS rules
|- front-refactor-vue.md       # Vue rules
|- front-refactor-svelte.md    # Svelte rules
|- front-refactor-astro.md     # Astro rules
|- examples/                   # Example source files and refactoring outputs
`- README.md
```

Version history for the whole collection is tracked in the repository root `CHANGELOG.md`.

---

## ⚖️ License

[MIT](../LICENSE.md) © 2026 [Effeilo](https://github.com/Effeilo)