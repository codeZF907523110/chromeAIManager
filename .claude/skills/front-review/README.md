<div>
  <img src="../assets/logos/logo-frontend-skills-review-300.png" alt="Claude Code Front-end Skills review logo" width="200" height="200"/>
</div>

# Claude Code Skill Front Review

**Catch real issues before they reach production, directly from [Claude Code](https://claude.ai/code).**

**Claude Code Front Review** is a **Claude Code skill** that analyses frontend files for code quality, potential bugs, performance, and maintainability. Using a single slash command with an optional strict mode, you get a structured report where every issue comes with a line reference, a clear problem statement, and a concrete fix. Compatible with JavaScript, TypeScript, React, CSS, Sass, HTML, Vue, Svelte, and Astro, it covers a wide range of the frontend stack.

> Part of the [claude-code-frontend-skills](https://github.com/Effeilo/claude-code-frontend-skills) collection.

Supports **Standard mode** (balanced review flagging clear issues and actionable suggestions) and **Strict mode** (tightened thresholds on quality, complexity, and performance rules).

---

## 🎬 Quick Demo

https://github.com/user-attachments/assets/2b7e962f-411a-4ddb-ac1a-93bed5f70f3f

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
./install.sh front-review            # macOS / Linux / WSL
.\install.ps1 front-review           # Windows PowerShell
```

Add `--force` / `-Force` to overwrite an existing install.

### Option B: manual install

```bash
mkdir -p ~/.claude/skills/front-review
cp front-review/SKILL.md front-review/front-review-*.md ~/.claude/skills/front-review/
```

---

## 🚀 Usage

Open a file in your editor, then run the skill from Claude Code:

```
/front-review
```

### Arguments

| Argument | Effect |
|---|---|
| *(none)* | Standard mode: balanced review flagging clear issues and actionable suggestions. |
| `strict` | Strict mode: tightened thresholds on quality, complexity, and performance rules. |

```
/front-review
/front-review strict
```

---

## ✨ Context7 integration (optional)

If you have the [context7](https://github.com/upstash/context7) MCP installed, `front-review` will automatically use it to fetch the latest official documentation for the detected framework before applying the rules.

This allows the skill to flag patterns that are **deprecated or have a better equivalent in the latest version** of the library, for example, a React API removed in React 19, or a Sass feature deprecated in recent versions.

If context7 is not installed, the skill runs normally using its built-in rules and Claude's training knowledge. No configuration required.

---

## 🚦 Severity levels

### 🔴 Critical

Must be fixed before shipping: correctness, security, or reliability is at risk:

- Unhandled async errors, missing `try/catch` on `fetch` calls
- XSS vectors (`innerHTML` with unsanitized input, `eval`)
- Floating promises (unhandled rejections silently swallowed)
- Broken logic that produces wrong output at runtime

These issues represent real risks in production and should never be shipped as-is.

### 🟠 Important

Should be fixed soon:  the code works but creates fragile or hard-to-maintain situations:

- Direct mutation of function parameters or shared state
- Loose equality comparisons (`==`) where strict equality is expected
- Missing `Content-Type` headers on POST requests
- Prop drilling, oversized components, unscoped side effects

These issues do not immediately break the app but tend to cause bugs as the codebase grows.

### 🟡 Minor

Low-risk issues worth addressing in a follow-up:

- `var` declarations instead of `const` / `let`
- Unused variables, imports, or commented-out code
- Magic numbers without named constants
- Slightly inconsistent naming or unnecessary re-declarations

These are safe to defer but contribute to long-term readability debt.

### 💡 Suggestion

Optional improvements: a better pattern exists but the current code works:

- Manual `for` loops replaceable with `Array.reduce`, `map`, or `filter`
- String concatenation replaceable with template literals
- Nested callbacks replaceable with `async/await`
- Opportunities to simplify logic with optional chaining or ternaries

These are offered as improvement ideas, not blockers.

---

## 📋 Rule categories

### Shared rules (all file types)

| Code | Category | What it checks |
|---|---|---|
| **RDY** | Naming & Readability | Cryptic names, misleading names, magic numbers |
| **CPLX** | Complexity | Function length, parameter count, nesting depth |
| **DUP** | Duplication | Repeated code blocks |
| **DEAD** | Dead Code | Unused declarations, commented-out blocks |
| **SUG** | Suggestions | Outdated syntax, reimplemented built-ins |

### JS / TS / JSX / TSX

| Code | Category | What it checks |
|---|---|---|
| **TS** | Type Safety | `any`, unsafe casts, missing return types |
| **ASYNC** | Async & Error Handling | Missing `try/catch`, floating promises, missing cleanup |
| **CORR** | Correctness | Loose equality, prop mutation, missing array bounds check |
| **PERF** | Performance | Values recreated on render, large sync loops, unnecessary deep clones |
| **SEC** | Security | `innerHTML` injection, `eval` |
| **REACT** | React-specific | Conditional hooks, missing `useEffect` deps, index keys, oversized components |

### CSS / Sass / SCSS

| Code | Category | What it checks |
|---|---|---|
| **CSS** | Stylesheet | Specificity, cascade, values, units, performance, maintainability |
| **SASS** | Sass-specific | Nesting depth, `@extend` misuse, deprecated `@import`, hardcoded values |

### HTML

| Code | Category | What it checks |
|---|---|---|
| **HTML** | Document | Structure, semantics, performance, security |

### Vue / Svelte / Astro

| Code | Category | What it checks |
|---|---|---|
| **VUE** | Vue | Template directives, component design, reactivity |
| **SVE** | Svelte | Reactivity, template, component design |
| **ASTRO** | Astro | Frontmatter, data fetching, islands, performance |

---

## 🧪 Examples

Source file `cart-service.js`:

```js
var discount = 0.15;

async function loadCart(userId) {
  const res = await fetch(`/api/cart/${userId}`);
  const data = await res.json();
  return data;
}

async function applyPromo(cart, code) {
  const res = await fetch('/api/promo', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
  const promo = await res.json();
  if (promo.valid == true) {
    cart.discount = promo.value;
    cart.items = cart.items.map((item, index) => ({
      ...item,
      discountedPrice: item.price * (1 - promo.value)
    }));
  }
  return cart;
}

function renderCartSummary(cart, container) {
  var html = '<ul>';
  for (var i = 0; i < cart.items.length; i++) {
    html += '<li>' + cart.items[i].name + ' - ' + cart.items[i].discountedPrice + '</li>';
  }
  html += '</ul>';
  container.innerHTML = html;
}

// function debugCart(cart) {
//   console.log('cart state:', cart);
// }

loadCart(42);
```

After `/front-review`:

```
## Code Review: cart-service.js

### 🔴 Critical

**[line 5] Async function without error handling : `loadCart`**
Code: `async function loadCart(userId) { const res = await fetch(...) }`
Problem: The function awaits a fetch and parses JSON with no try/catch. A network
failure or non-2xx response will throw an unhandled rejection and crash the caller.
Fix: Wrap the body in try/catch, check res.ok, and either return a fallback or rethrow.

**[line 30] Dangerous HTML injection : `renderCartSummary`**
Code: `container.innerHTML = html;`
Problem: The HTML string is built by concatenating cart.items[i].name from the server.
If any item name contains <script> or event attribute payloads, this is an XSS vector.
Fix: Use safe DOM APIs (createElement, textContent) or sanitize with DOMPurify first.

**[line 35] Floating promise : `loadCart(42)`**
Code: `loadCart(42);`
Problem: loadCart returns a Promise that is not awaited or chained. Any error it throws
will be silently swallowed as an unhandled rejection.
Fix: Await the call inside an async context, chain .catch(), or remove if dead code.

### 🟠 Important

**[line 16] Loose equality comparison**
Code: `if (promo.valid == true)`
Problem: == performs type coercion, any truthy value passes, almost certainly unintentionally.
Fix: Use strict equality: if (promo.valid === true), or simply if (promo.valid).

**[line 17] Direct mutation of a parameter : `cart`**
Code: `cart.discount = promo.value;`
Problem: Mutating a parameter directly produces unexpected side effects for the caller.
Fix: Return a new object: return { ...cart, discount: promo.value, items: updatedItems }.

### 🟡 Minor

**[line 1] Unused declaration : `discount`**
Code: `var discount = 0.15;`
Problem: discount is declared at module level but never referenced anywhere in the file.
Fix: Remove it.

**[line 33] Commented-out code block**
Code: `// function debugCart(cart) { ... }`
Problem: A commented-out function block left in the file.
Fix: Delete it, version control preserves the history.

### 💡 Suggestion

**[line 27] Manual for loop → Array.reduce**
Code: `for (var i = 0; i < cart.items.length; i++) { total += ... }`
Problem: The loop computes a sum, a direct use case for reduce.
Fix: const total = cart.items.reduce((sum, item) => sum + item.discountedPrice, 0);

---

### Summary
| Severity | Count |
|---|---|
| 🔴 Critical | 3 |
| 🟠 Important | 2 |
| 🟡 Minor | 2 |
| 💡 Suggestion | 1 |
| **Total** | **8** |
```

Current examples included in this repository:

| Source | Review |
|---|---|
| `cart-service.js` | `cart-service.review.md` |
| `dashboard.css` | `dashboard.review.md` |

---

## 📁 File structure

```text
front-review/
|- SKILL.md                  # Skill entry point (orchestration)
|- front-review-rules.md     # Shared rules (all languages)
|- front-review-js.md        # JS / TS / JSX / TSX rules
|- front-review-css.md       # CSS / Sass / SCSS rules
|- front-review-html.md      # HTML rules
|- front-review-vue.md       # Vue rules
|- front-review-svelte.md    # Svelte rules
|- front-review-astro.md     # Astro rules
|- examples/                 # Example source files and review reports
`- README.md
```

Version history for the whole collection is tracked in the repository root `CHANGELOG.md`.

---

## ⚖️ License

[MIT](../LICENSE.md) © 2026 [Effeilo](https://github.com/Effeilo)