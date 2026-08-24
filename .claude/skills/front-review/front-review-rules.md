# front-review: Shared Review Rules

These rules apply to all supported file types.
Read the entire target file before reporting, collect all issues first, then output the report.

Language-specific rules and detection nuances are in the language sub-files.

---

## Severity levels

| Level | Meaning |
|---|---|
| 🔴 Critical | Must be fixed before shipping: correctness, security, or reliability at risk |
| 🟠 Important | Should be fixed soon: impacts maintainability, performance, or readability significantly |
| 🟡 Minor | Low-risk issue worth addressing in a follow-up: minor quality or style concern |
| 💡 Suggestion | Optional improvement: a better pattern exists but the current code works |

---

## Category 1: Naming & Readability

### RDY-1: Cryptic or single-letter name (🟡 Minor)

**Detect:** Variables, functions, or parameters with a single letter (except conventional loop counters `i`, `j`, `k`, `n`), or names that are heavily abbreviated with no obvious meaning (e.g. `tmp`, `val`, `fn`, `cb`, `obj`).

**Fix:** Use descriptive names that express intent. A reader should understand what the variable holds without reading its usages.

### RDY-2: Misleading name (🟠 Important)

**Detect:**
- A boolean variable whose name does not start with `is`, `has`, `should`, `can`, `was`, or similar (e.g. `const loading = true` instead of `const isLoading = true`).
- A function whose name suggests one action but its body performs a different or broader one (e.g. `getUser()` that also saves to localStorage).

**Fix:** Rename to accurately reflect the value or behavior.

### RDY-3: Magic number or string (🟡 Minor / 🟠 Important in strict)

**Detect:** A hardcoded numeric literal (other than 0, 1, -1, 100) or a hardcoded string used in logic (not in UI text), whose meaning is not immediately self-evident from context.

**Fix:** Extract to a named constant or design token.

```js
// ❌
if (retries > 3) { ... }

// ✅
const MAX_RETRIES = 3;
if (retries > MAX_RETRIES) { ... }
```

---

## Category 2: Complexity

### CPLX-1: Function or block too long (🟠 Important / 🔴 Critical in strict)

**Detect:** A function, method, or component body exceeding **30 lines** (standard) or **20 lines** (strict), not counting blank lines and comments.

**Fix:** Extract cohesive sub-tasks into smaller, named functions.

### CPLX-2: Too many parameters (🟠 Important)

**Detect:** A function or component accepting more than **4 parameters** (standard) or **3 parameters** (strict).

**Fix:** Group related parameters into an options object or a typed interface.

```js
// ❌
function createUser(name, email, role, age, isActive) { ... }

// ✅
function createUser({ name, email, role, age, isActive }) { ... }
```

### CPLX-3: Deeply nested logic (🟠 Important)

**Detect:** Conditional or loop nesting exceeding **3 levels** (standard) or **2 levels** (strict).

**Fix:** Use early returns, guard clauses, or extract nested blocks into functions.

```js
// ❌ (3 levels deep)
if (user) {
  if (user.isActive) {
    if (user.role === 'admin') { ... }
  }
}

// ✅
if (!user || !user.isActive || user.role !== 'admin') return;
...
```

---

## Category 3: Duplication

### DUP-1: Repeated code block (🟠 Important)

**Detect:** Identical or near-identical logic blocks repeated **3 or more times** within the same file.

**Fix:** Extract into a shared function, mixin, or component.

---

## Category 4: Dead Code

### DEAD-1: Unused declaration (🟡 Minor)

**Detect:** A variable, import, function, or class that is declared but never referenced within the file.

**Fix:** Remove it. If intentionally kept for future use, add a comment explaining why.

### DEAD-2: Commented-out code block (🟡 Minor)

**Detect:** A block of code (3+ lines) that has been commented out rather than deleted.

**Fix:** Remove it, version control preserves the history. If it documents a conscious decision, replace with a prose comment.

---

## Category 5: Suggestions

### SUG-1: Outdated syntax available to modernize (💡 Suggestion)

**Detect:** Use of patterns that have cleaner modern equivalents:
- `var` → `const` / `let`
- `.then()` chains → `async/await`
- Traditional `function` expressions in callbacks → arrow functions
- Manual `Object.assign({}, obj)` → spread `{ ...obj }`

**Fix:** Replace with the modern equivalent where it improves clarity.

### SUG-2: Reimplementing a built-in (💡 Suggestion)

**Detect:** Logic that duplicates a native language or browser feature (e.g. reimplementing `Array.includes`, manual deep-copy instead of `structuredClone`, manual event delegation where `closest()` would work).

**Fix:** Use the built-in, it is faster, more readable, and already tested.

---

## Strict mode: Threshold overrides

When `$ARGUMENTS` contains `strict`, apply these overrides on top of the standard rules:

| Rule | Standard threshold | Strict threshold |
|---|---|---|
| RDY-3 Magic number | 🟡 Minor | 🟠 Important |
| CPLX-1 Function length | 30 lines / 🟠 Important | 20 lines / 🔴 Critical |
| CPLX-2 Parameters | > 4 / 🟠 Important | > 3 / 🟠 Important |
| CPLX-3 Nesting depth | > 3 levels | > 2 levels |

Language sub-files may define additional strict overrides for language-specific rules.
