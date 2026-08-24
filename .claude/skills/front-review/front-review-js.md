# front-review: JS / TS / JSX / TSX Rules

Apply all shared rules from `front-review-rules.md`, then apply the rules below.
Applies to `.js`, `.ts`, `.mjs`, `.jsx`, `.tsx` files.

For `.jsx` and `.tsx` files, also apply the React-specific rules at the bottom of this file.

---

## Category A: Type Safety (TS / TSX only)

### TS-1: Untyped `any` (🟠 Important / 🔴 Critical in strict)

**Detect:** Explicit use of `any` type without a justifying comment.

**Fix:** Replace with a specific type, `unknown` (with narrowing), or a generic. If `any` is truly necessary, add a comment explaining why.

### TS-2: Unsafe type assertion (🟠 Important)

**Detect:** `as SomeType` or `<SomeType>expr` cast without a preceding runtime check validating the shape.

**Fix:** Narrow the type with a type guard or runtime check before asserting.

### TS-3: Missing return type on exported function (🟡 Minor / 🟠 Important in strict)

**Detect:** An exported function or method with no explicit return type annotation.

**Fix:** Add the return type. It documents intent and catches mismatches early.

---

## Category B: Async & Error Handling

### ASYNC-1: Async function without error handling (🔴 Critical)

**Detect:** An `async` function or a `.then()` chain with no `try/catch` and no `.catch()`.

**Fix:** Wrap the async operation in `try/catch` or add `.catch()` to the chain.

```js
// ❌
async function loadUser(id) {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

// ✅
async function loadUser(id) {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    console.error('Failed to load user:', err);
    throw err;
  }
}
```

### ASYNC-2: Floating promise (🔴 Critical)

**Detect:** An async function call whose return value (a Promise) is not awaited, chained, or stored.

**Fix:** Add `await`, chain `.then()/.catch()`, or explicitly discard with `void` if intentional.

### ASYNC-3: Missing cleanup in effect (🔴 Critical)

**Detect (React):** A `useEffect` that sets up a subscription, timer, or event listener without returning a cleanup function.

**Detect (general):** An async operation started in a component lifecycle hook that may run after the component has been destroyed.

**Fix:** Return a cleanup function that cancels or removes the side effect.

---

## Category C: Correctness

### CORR-1: Loose equality comparison (🟠 Important)

**Detect:** Use of `==` or `!=` instead of `===` or `!==` (except for `== null` which checks both null and undefined, that pattern is acceptable).

**Fix:** Replace with strict equality `===` / `!==`.

### CORR-2: Direct mutation of a prop or external state (🔴 Critical)

**Detect:** A parameter or prop being assigned to directly (`props.value = ...`, `obj.key = ...` where `obj` was received as a parameter), or an array being mutated in place (`.push()`, `.splice()`, `.sort()`) when immutability is expected.

**Fix:** Create a copy before mutating, or use immutable update patterns (`[...arr, newItem]`, `{ ...obj, key: newValue }`).

### CORR-3: Missing boundary check on array access (🟠 Important)

**Detect:** Direct array access by index (`arr[index]`) without a preceding length or existence check.

**Fix:** Add a guard (`if (index < arr.length)`) or use optional chaining (`arr[index]?.property`).

---

## Category D: Performance

### PERF-1: Expensive operation recreated on every render (🟠 Important / 🔴 Critical in strict)

**Detect (React JSX/TSX):** A function, object, or array defined inline inside a component body (not inside a hook) that will be recreated on every render and is passed as a prop or used as a dependency.

**Fix:** Wrap with `useMemo` (for values) or `useCallback` (for functions).

### PERF-2: Large synchronous loop on the main thread (🟠 Important)

**Detect:** A `for`, `while`, or `.forEach()` loop over a data structure that could be large (unbounded array, all DOM nodes, etc.) without any chunking, pagination, or background processing.

**Fix:** Add pagination, use a virtual list, or offload to a Web Worker for genuinely heavy operations.

### PERF-3: Unnecessary deep clone or full re-render trigger (🟡 Minor)

**Detect:** `JSON.parse(JSON.stringify(obj))` used as a deep clone when a shallow copy or `structuredClone` would suffice. Or spreading an entire large object when only one property changes.

**Fix:** Use `structuredClone()` for deep clones, or targeted immutable updates for partial changes.

---

## Category E: Security

### SEC-1: Dangerous HTML injection (🔴 Critical)

**Detect:** Use of `innerHTML`, `outerHTML`, or React's `dangerouslySetInnerHTML` with a value that is not a static string literal.

**Fix:** Use safe DOM APIs (`textContent`, `createElement`) or sanitize the input with a library like DOMPurify before injecting.

### SEC-2: Use of `eval` or `Function` constructor (🔴 Critical)

**Detect:** `eval(...)`, `new Function(...)`, or `setTimeout(string, ...)` / `setInterval(string, ...)` with a string argument.

**Fix:** Replace with direct function calls or dynamic imports.

---

## React-specific rules (JSX / TSX only)

### REACT-1: Hook called conditionally (🔴 Critical)

**Detect:** A React hook (`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`, or any `use*`) called inside a conditional, loop, or nested function.

**Fix:** Move the hook to the top level of the component. Use conditions inside the hook if needed.

### REACT-2: Missing or incorrect `useEffect` dependencies (🔴 Critical)

**Detect:** A `useEffect` whose dependency array is missing a value that is referenced inside the effect body, or contains a value that is never used inside the body.

**Fix:** Include all referenced values in the dependency array. Use `useCallback`/`useMemo` to stabilize function/object references if needed.

### REACT-3: Key missing or set to array index (🟠 Important)

**Detect:** A `.map()` rendering JSX elements with no `key` prop, or with `key={index}` on a list that can be reordered or filtered.

**Fix:** Use a stable, unique identifier from the data as the key.

### REACT-4: Component doing too many things (🟠 Important)

**Detect:** A component file that contains more than one logical concern, e.g. data fetching + UI rendering + business logic all in one component body exceeding 80 lines.

**Fix:** Split into a container component (data/logic) and a presentational component (UI), or extract custom hooks.

---

## Strict mode: JS/TS additional overrides

| Rule | Standard | Strict |
|---|---|---|
| TS-1 `any` | 🟠 Important | 🔴 Critical |
| TS-3 Missing return type | 🟡 Minor | 🟠 Important |
| PERF-1 Recreated on render | 🟠 Important | 🔴 Critical |
