# front-refactor: JS / TS / JSX / TSX Rules

Apply all shared rules from `front-refactor-rules.md`, then apply the rules below.
Applies to `.js`, `.ts`, `.mjs`, `.jsx`, `.tsx` files.

For `.jsx` and `.tsx` files, also apply the React-specific rules at the bottom of this file.

---

## Category DEAD

### JS-DEAD-1: Unused destructured import binding

**Detect:** A named import where only some bindings are used.

**Fix:** Remove only the unused bindings from the destructure. Keep the import if at least one binding is used.

```js
// Before
import { useState, useEffect, useRef } from 'react'; // useRef never used

// After
import { useState, useEffect } from 'react';
```

### JS-DEAD-2: Re-exported value that is also imported locally

**Detect:** A binding that is imported and immediately re-exported without any transformation or usage in the file body.

**Fix:** Note in Notes, this is a barrel re-export pattern and may be intentional. Do not remove automatically.

---

## Category NAMING

### JS-NAMING-1: Callback parameter named `e` or `evt`

**Detect:** Event handler parameters named `e`, `evt`, or `event` where the event type is known from context (e.g. a click handler, a form submit handler).

**Fix:** Rename to the specific event type: `clickEvent`, `submitEvent`, `changeEvent`. Apply only if the name is used inside the function body (not just passed through).

> Note: `e` is widely accepted in many codebases. Apply this rule only in strict contexts or when the event type is genuinely ambiguous.

### JS-NAMING-2: Promise variable named ambiguously

**Detect:** A variable holding a Promise named without a verb or without indicating it is async (`data`, `result`, `user` when assigned from an `await` expression, these are fine; `dataPromise`, `fetchResult` as variable names for un-awaited promises are better).

**Fix:** If a Promise is stored without being awaited, suffix with `Promise`: `const userPromise = fetchUser(id)`.

---

## Category SIMPLIFY

### JS-SIMPLIFY-1: Manual array existence check replaceable with optional chaining

**Detect:** `arr && arr.length > 0 && arr[0].property` style guards.

**Fix:** Replace with optional chaining: `arr?.[0]?.property`.

### JS-SIMPLIFY-2: Nullish fallback using `||` on a value that could be `0` or `false`

**Detect:** `value || defaultValue` where `value` could legitimately be `0`, `false`, or `""` and the intent is only to guard against `null`/`undefined`.

**Fix:** Replace with nullish coalescing: `value ?? defaultValue`.

### JS-SIMPLIFY-3: `.filter().map()` replaceable with `.reduce()`

**Detect:** A `.filter()` followed immediately by `.map()` on the same array, where a single `.reduce()` or `.flatMap()` would eliminate the intermediate array.

**Fix:** Propose the `.reduce()` version. Apply only if the result is clearly more readable.

### JS-SIMPLIFY-4: Explicit `return` of a ternary in a one-line arrow function

**Detect:** An arrow function with a block body `{ return condition ? a : b; }` that can be expressed as a concise body.

**Fix:** `(x) => condition ? a : b`

---

## Category MODERN

### JS-MODERN-1: `arguments` object → rest parameters

**Detect:** Use of the `arguments` object inside a traditional function.

**Fix:** Add a rest parameter `...args` and replace `arguments` with `args`.

### JS-MODERN-2: Manual string concatenation → template literal

**Detect:** String concatenation with `+` that embeds variables or expressions.

**Fix:** Replace with a template literal: `` `Hello, ${name}!` ``

### JS-MODERN-3: `for...in` over an array

**Detect:** `for (const key in array)` iterating over an array (not an object).

**Fix:** Replace with `for...of` or `.forEach()`.

---

## React-specific rules (JSX / TSX only)

### REACT-NAMING-1: Component state setter not prefixed with `set`

**Detect:** A `useState` destructure where the setter is not named `set<StateName>`.

**Fix:** Rename: `const [open, toggle]` → `const [isOpen, setIsOpen]` (also applies NAMING-2 for the boolean state name).

### REACT-SIMPLIFY-1: Inline object/array in JSX prop replaceable with `useMemo`

**Detect:** An object literal or array literal passed directly as a JSX prop that is not a static constant (i.e. it is defined inline inside the render function body and its values could change).

**Fix (Preview only):** Flag as a candidate for `useMemo`. Do not apply automatically, memoization changes execution semantics.

### REACT-MODERN-1: Class component → function component

**Detect:** A React class component with no usage of lifecycle methods that are unavailable as hooks (`getSnapshotBeforeUpdate`, `getDerivedStateFromError` as a class-only pattern).

**Fix (Preview only):** Flag as a candidate for conversion to a function component with hooks. This is a significant rewrite: list in Notes rather than applying automatically.

### REACT-MODERN-2: `React.createElement` → JSX

**Detect:** `React.createElement(...)` calls in a file where JSX is enabled.

**Fix:** Convert to JSX syntax.
