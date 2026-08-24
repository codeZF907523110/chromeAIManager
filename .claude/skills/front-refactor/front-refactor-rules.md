# front-refactor: Shared Refactoring Rules

These rules apply to all supported file types.
Read the entire target file before reporting, collect all refactoring opportunities first.

Language-specific rules and detection patterns are in the language sub-files.

---

## Core principle: Behavior preservation

A refactoring must never change observable behavior. Before proposing any change, verify:

- The output, return values, and side effects remain identical.
- No error handling is removed or weakened.
- No logic branch is silently dropped.
- No public API (exported names, component props, emitted events) is renamed without noting the breaking change.

When a rename or restructuring would affect exported symbols or cross-file references, flag it in the Notes section rather than applying it silently.

---

## Category DEAD: Dead Code Removal

### DEAD-1: Unused import

**Detect:** An import statement whose binding is never referenced in the file body.

**Fix:** Remove the entire import line.

### DEAD-2: Unused variable or constant

**Detect:** A variable, constant, or destructured binding that is declared but never read.

**Fix:** Remove the declaration. If it is a destructured binding inside a used destructure, replace it with `_` (JS/TS) or remove only the unused binding.

### DEAD-3: Unused function or class

**Detect:** A function or class declared in the file but never called or referenced (including no export).

**Fix:** Remove the entire declaration.

### DEAD-4: Commented-out code block

**Detect:** A block of code (2+ lines) that has been commented out.

**Fix:** Remove it. Version control preserves the history.

### DEAD-5: Unreachable code

**Detect:** Code that appears after a `return`, `throw`, `break`, or `continue` statement within the same block.

**Fix:** Remove the unreachable statements.

---

## Category NAMING: Naming Improvements

### NAMING-1: Cryptic or single-letter name

**Detect:** A variable, function, or parameter whose name is a single letter (except `i`, `j`, `k`, `n` in loops), or is heavily abbreviated with no obvious meaning (`tmp`, `val`, `fn`, `cb`, `obj`, `res` when the resource type is known).

**Fix:** Rename to a descriptive identifier that expresses intent. Apply the rename consistently within the file.

### NAMING-2: Boolean without predicate prefix

**Detect:** A boolean variable or prop whose name does not start with `is`, `has`, `should`, `can`, `was`, or similar (`loading`, `active`, `open`, `error` used as booleans).

**Fix:** Rename with the appropriate prefix: `loading` → `isLoading`, `open` → `isOpen`.

### NAMING-3: Magic number → named constant

**Detect:** A hardcoded numeric literal (other than `0`, `1`, `-1`) or a hardcoded string used in logic whose meaning is not self-evident from context.

**Fix:** Extract to a `const` named in UPPER_SNAKE_CASE placed at the top of the file (or top of the function scope if local).

```js
// Before
if (retries > 3) { ... }
setTimeout(fn, 5000);

// After
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
if (retries > MAX_RETRIES) { ... }
setTimeout(fn, RETRY_DELAY_MS);
```

---

## Category SIMPLIFY: Logic Simplification

### SIMPLIFY-1: Invert condition for early return

**Detect:** An `if` block that wraps the entire function body, where the else branch is a return or throw.

**Fix:** Invert the condition and return early, then remove the wrapping `if`.

```js
// Before
function process(user) {
  if (user.isActive) {
    doWork(user);
    return result;
  } else {
    return null;
  }
}

// After
function process(user) {
  if (!user.isActive) return null;
  doWork(user);
  return result;
}
```

### SIMPLIFY-2: Reduce nesting with guard clauses

**Detect:** Nested `if` blocks (2+ levels) at the start of a function that check preconditions.

**Fix:** Replace with sequential guard clauses (early returns) at the top of the function.

### SIMPLIFY-3: Redundant condition

**Detect:** A condition that compares a boolean to `true` or `false` explicitly (`if (flag === true)`, `if (flag == false)`).

**Fix:** Simplify to `if (flag)` or `if (!flag)`.

### SIMPLIFY-4: Ternary that can replace if/else assignment

**Detect:** An `if/else` block whose sole purpose is to assign one of two values to the same variable.

**Fix:** Replace with a ternary or a logical default (`??`, `||`).

```js
// Before
let label;
if (count > 0) {
  label = 'items';
} else {
  label = 'empty';
}

// After
const label = count > 0 ? 'items' : 'empty';
```

---

## Category MODERN: Syntax Modernisation

### MODERN-1: `var` → `const` / `let`

**Detect:** `var` declarations.

**Fix:** Replace with `const` if the binding is never reassigned, `let` otherwise.

### MODERN-2: `.then()` chain → `async/await`

**Detect:** A `.then().catch()` promise chain that can be cleanly converted to `async/await` without restructuring the surrounding logic.

**Fix:** Convert to `async/await` with `try/catch`. Do not apply if the chain uses `.then()` for parallelism (`Promise.all`) or if it is inside a non-async context that cannot be converted.

```js
// Before
function loadUser(id) {
  return fetch(`/api/users/${id}`)
    .then(res => res.json())
    .catch(err => console.error(err));
}

// After
async function loadUser(id) {
  try {
    const res = await fetch(`/api/users/${id}`);
    return res.json();
  } catch (err) {
    console.error(err);
  }
}
```

### MODERN-3: `Object.assign({}, obj)` → spread

**Detect:** `Object.assign({}, ...)` used to shallow-clone or merge objects.

**Fix:** Replace with `{ ...obj }` or `{ ...obj, key: value }`.

### MODERN-4: Traditional function expression in callback → arrow function

**Detect:** `function` expressions used as callbacks (in `.map()`, `.filter()`, `.forEach()`, event handlers, etc.) that do not use `this` or `arguments`.

**Fix:** Replace with an arrow function.

---

## What NOT to refactor

Do not apply the following, they risk changing behavior or are outside this skill's scope:

- Renaming exported symbols (propose in Notes instead)
- Changing function signatures or parameter order
- Merging or splitting files
- Changing async patterns where the execution model differs (e.g. `.then()` fire-and-forget vs `await`)
- Rewriting algorithmic logic (even if a shorter form exists)
- Modifying test files
