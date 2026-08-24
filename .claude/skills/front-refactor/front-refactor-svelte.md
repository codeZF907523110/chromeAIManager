# front-refactor: Svelte Rules

Apply all shared rules from `front-refactor-rules.md`, then apply the rules below.
Applies to `.svelte` files.

Apply JS/TS rules to the `<script>` block.
Apply CSS rules to the `<style>` block.
Apply the Svelte-specific rules below to the component as a whole.

---

## Category DEAD

### SVE-DEAD-1: Unused prop (`export let`)

**Detect:** An `export let` binding that is never used in the template or script body.

**Fix:** Remove the declaration. Flag in Notes, the prop is part of the component's public API and may be passed from a parent.

### SVE-DEAD-2: Unused reactive declaration (`$:`)

**Detect:** A `$:` statement whose computed value is never referenced in the template or script.

**Fix:** Remove the reactive declaration.

### SVE-DEAD-3: Unused store subscription

**Detect:** A `$store` auto-subscription or a manual `.subscribe()` call whose value is never used in the template or script.

**Fix:** Remove the subscription.

---

## Category NAMING

### SVE-NAMING-1: Prop not reflecting its boolean nature

**Detect:** An `export let` boolean prop whose name does not start with `is`, `has`, `should`, `can`, or similar.

**Fix:** Rename with the appropriate prefix. Flag in Notes, parent components must update their prop bindings.

### SVE-NAMING-2: Event dispatcher not named `dispatch`

**Detect:** A `createEventDispatcher()` result stored under a name other than `dispatch`.

**Fix:** Rename to `dispatch` for consistency with Svelte conventions.

---

## Category SIMPLIFY

### SVE-SIMPLIFY-1: Inline template logic → derived variable

**Detect:** A complex expression inside `{...}` interpolation or a directive attribute, ternaries, method chains, or filter logic.

**Fix:** Extract to a `$:` reactive declaration with a descriptive name.

```svelte
<!-- Before -->
<p>{items.filter(i => i.active).map(i => i.name).join(', ')}</p>

<!-- After — in <script> -->
$: activeItemNames = items.filter(i => i.active).map(i => i.name).join(', ');
<!-- In template -->
<p>{activeItemNames}</p>
```

### SVE-SIMPLIFY-2: Repeated `{#if}` blocks with the same condition

**Detect:** Two or more separate `{#if condition}` blocks in the template that check the same condition and are adjacent or near-adjacent.

**Fix:** Merge into a single `{#if condition}` block containing all the guarded content.

### SVE-SIMPLIFY-3: Manual store update replaceable with `update()`

**Detect:** A pattern of `$store = { ...$store, key: newValue }` or `store.set({ ...get(store), key: newValue })`.

**Fix:** Use `store.update(s => ({ ...s, key: newValue }))` for clarity.

---

## Category MODERN

### SVE-MODERN-1: `on:click` without `on:keydown` on a non-interactive element

**Detect:** An `on:click` handler on a `<div>` or `<span>` without a paired `on:keydown` or `on:keypress`. This is also an accessibility issue.

**Fix (Notes only):** Recommend converting the element to a `<button>` or adding keyboard event parity. Flagged here for refactoring context, the accessibility fix should be applied via `/front-a11y`.

### SVE-MODERN-2: `createEventDispatcher` replaceable with a callback prop

**Detect:** A component that dispatches a single custom event and has no other reason to use the dispatcher pattern.

**Fix (Notes only):** Flag as a candidate for simplification to a callback prop (`export let onAction = () => {}`). This is a design decision, do not apply automatically.
