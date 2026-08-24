# front-review: Svelte Rules

Apply all shared rules from `front-review-rules.md`, then apply the rules below.
Applies to `.svelte` files.

A Svelte component has three optional blocks: `<script>`, markup, and `<style>`.
Apply JS/TS rules to the `<script>` block, CSS rules to the `<style>` block, and the Svelte-specific rules below to the component as a whole.

---

## Category A: Reactivity

### SVE-1: Reassignment required for reactivity (🔴 Critical)

**Detect:** An array or object mutation in place (`.push()`, `.splice()`, direct property assignment on an object) inside a `<script>` block, without a subsequent reassignment of the top-level variable.

**Fix:** Reassign the variable after mutation, or use an immutable update pattern:
```js
// ❌ — Svelte won't detect this as a change
items.push(newItem);

// ✅
items = [...items, newItem];
// or
items.push(newItem); items = items; // last resort
```

### SVE-2: Reactive declaration (`$:`) with a missing dependency (🔴 Critical)

**Detect:** A `$:` reactive statement that references a variable but that variable is not part of the reactive graph (e.g. it is assigned inside the same `$:` block, creating a cycle, or it is a function whose result is not tracked).

**Fix:** Extract the computation to a plain variable or ensure all inputs are top-level reactive variables referenced directly in the `$:` expression.

### SVE-3: Store subscription not unsubscribed (🔴 Critical)

**Detect:** A manual store subscription (`.subscribe(fn)`) that does not return an unsubscribe call from `onDestroy`, or is not handled with the auto-subscription `$store` syntax.

**Fix:** Use the `$store` auto-subscription syntax (Svelte automatically subscribes/unsubscribes), or call `onDestroy(unsubscribe)` on the value returned by `.subscribe()`.

```js
// ❌
import { myStore } from './store';
myStore.subscribe(val => { value = val; }); // leaks

// ✅ — auto-subscription
$: value = $myStore;

// ✅ — manual with cleanup
import { onDestroy } from 'svelte';
const unsubscribe = myStore.subscribe(val => { value = val; });
onDestroy(unsubscribe);
```

---

## Category B: Template

### SVE-4: `{#each}` without a key expression (🟠 Important)

**Detect:** An `{#each items as item}` block without a key: `{#each items as item (item.id)}`.

**Fix:** Add a key expression using a stable unique identifier. Without a key, Svelte reuses DOM nodes by position, which causes visual glitches when the list is reordered or filtered.

### SVE-5: `{@html}` with a non-static value (🔴 Critical)

**Detect:** `{@html variable}` where `variable` is not a static string literal.

**Fix:** Sanitize the value with DOMPurify before rendering, or use `{variable}` (text interpolation) if HTML rendering is not required.

### SVE-6: Event handler that mutates a prop (🔴 Critical)

**Detect:** An event handler (e.g. `on:click`) that directly modifies a value received as a `export let prop` (i.e. a prop binding).

**Fix:** Use `createEventDispatcher` to emit an event to the parent, or use a two-way binding (`bind:prop`) if the parent explicitly opts in.

---

## Category C: Component Design

### SVE-7: Component doing too many things (🟠 Important)

**Detect:** A `.svelte` file whose markup section exceeds 80 lines or whose `<script>` block exceeds 80 lines and mixes data fetching, business logic, and UI rendering.

**Fix:** Extract data fetching into a separate module or store, split large templates into sub-components.

### SVE-8: Async operation without error handling in `onMount` (🔴 Critical)

**Detect:** An `await` call or `.then()` chain inside `onMount()` without a `try/catch` or `.catch()`.

**Fix:** Wrap async calls in `try/catch`. Expose an error state variable to the template.
