# front-review: Vue Rules

Apply all shared rules from `front-review-rules.md`, then apply the rules below.
Applies to `.vue` files (Single File Components).

A Vue SFC has three blocks: `<template>`, `<script>` / `<script setup>`, and `<style>`.
Apply JS/TS rules to the `<script>` block, CSS rules to the `<style>` block, and the Vue-specific rules below to the component as a whole.

---

## Category A: Template

### VUE-1: `v-if` and `v-for` on the same element (🔴 Critical)

**Detect:** `v-if` and `v-for` on the same element.

**Fix:** Wrap the `v-for` in a `<template>` tag and place `v-if` on the inner element, or pre-filter the array in a computed property. In Vue 3, `v-if` has higher priority than `v-for`, mixing them on the same node is a logic error.

```html
<!-- ❌ -->
<li v-for="item in items" v-if="item.isActive" :key="item.id">

<!-- ✅ -->
<template v-for="item in items" :key="item.id">
  <li v-if="item.isActive">{{ item.name }}</li>
</template>
```

### VUE-2: Missing or index-based `:key` in `v-for` (🟠 Important)

**Detect:** A `v-for` loop with no `:key`, or with `:key="index"` on a list that may be reordered or filtered.

**Fix:** Use a stable, unique identifier from the data as the key.

### VUE-3: Direct `$parent` or `$children` access (🟠 Important)

**Detect:** Use of `$parent`, `$children`, or `$refs` to imperatively access or mutate a sibling/parent component's state.

**Fix:** Use props + emits for parent/child communication, `provide`/`inject` for deep trees, or a state management store (Pinia / Vuex) for cross-component state.

### VUE-4: Mutating a prop directly (🔴 Critical)

**Detect:** A prop being assigned to directly inside the component (`this.propName = ...` in Options API, or `props.propName = ...` in Composition API).

**Fix:** Emit an event to the parent to update the value (`$emit('update:propName', value)`), or use a `v-model` binding with `defineModel`.

---

## Category B: Component Design

### VUE-5: Component doing too many things (🟠 Important)

**Detect:** A `.vue` file whose `<template>` exceeds 80 lines or whose `<script>` block exceeds 100 lines and mixes data fetching, business logic, and UI rendering.

**Fix:** Extract data fetching into a composable (`use*.ts`), split large templates into sub-components, or separate business logic into a service.

### VUE-6: Missing `emits` declaration (🟠 Important)

**Detect:** A component that calls `$emit(...)` or `defineEmits` without declaring emitted events with a type or array declaration.

**Fix:** Declare emits explicitly:
```ts
// Options API
emits: ['update:modelValue', 'close']

// Composition API
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()
```

### VUE-7: Missing `props` type or validation (🟠 Important)

**Detect:** A prop defined with only a type shorthand (`props: ['name']`) or without a `type` field in Options API, or without TypeScript typing in Composition API.

**Fix:** Add a `type` (and `required`/`default` where appropriate):
```js
props: {
  title: { type: String, required: true },
  count: { type: Number, default: 0 }
}
```
Or in Composition API: `const props = defineProps<{ title: string; count?: number }>()`.

---

## Category C: Reactivity

### VUE-8: Non-reactive data used as reactive (🟠 Important)

**Detect (Options API):** A plain object returned from `data()` that contains a nested object or array that is later replaced entirely (not mutated in place), causing Vue's reactivity to miss the update.

**Detect (Composition API):** A `ref()` wrapping a plain object where individual property changes are expected to be reactive, should use `reactive()` or `ref()` with deep access.

**Fix:** Use `reactive()` for objects where nested properties need to be individually reactive. Replace entire object references on `ref` correctly (`.value = newObj`).

### VUE-9: Async operation in `setup()` or `created()` without error handling (🔴 Critical)

**Detect:** An `await` call or `.then()` chain inside `setup()`, `created()`, or `onMounted()` without a `try/catch` or `.catch()`.

**Fix:** Wrap async calls in `try/catch`. Expose an error state to the template so the user receives feedback.

---

## Strict mode: Vue additional overrides

| Rule | Standard | Strict |
|---|---|---|
| VUE-5 Component size | 80/100 lines | 60/80 lines → 🔴 Critical |
