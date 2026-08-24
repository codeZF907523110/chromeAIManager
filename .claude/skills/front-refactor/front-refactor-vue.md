# front-refactor: Vue Rules

Apply all shared rules from `front-refactor-rules.md`, then apply the rules below.
Applies to `.vue` files (Single File Components).

Apply JS/TS rules to the `<script>` / `<script setup>` block.
Apply CSS rules to the `<style>` block.
Apply the Vue-specific rules below to the component as a whole.

---

## Category DEAD

### VUE-DEAD-1: Unused component registration

**Detect (Options API):** A component listed in `components: { ... }` that is never used in the `<template>`.

**Fix:** Remove the entry from the `components` object and its corresponding import.

### VUE-DEAD-2: Unused computed property or watcher

**Detect:** A `computed` property or `watch` entry (Options API), or a `computed()` / `watch()` call (Composition API) whose result is never used in the template or script.

**Fix:** Remove the declaration.

### VUE-DEAD-3: Unused prop

**Detect:** A prop declared in `props` / `defineProps` that is never referenced in the template or script.

**Fix:** Remove the prop declaration. Flag in Notes if the prop is part of a public API (the component may be called from other files).

---

## Category NAMING

### VUE-NAMING-1: Event name not in kebab-case

**Detect:** An emitted event name that uses camelCase or PascalCase (e.g. `$emit('updateValue', ...)` instead of `$emit('update:value', ...)`).

**Fix:** Rename to kebab-case. Update the corresponding `emits` declaration. Flag in Notes, parent components must update their `@event-name` listeners.

### VUE-NAMING-2: Component name not in PascalCase

**Detect:** A component imported and registered under a non-PascalCase name.

**Fix:** Rename the registration key to PascalCase. Flag in Notes if the component is used in templates as a kebab-case tag, Vue handles this automatically, but consistency matters.

---

## Category SIMPLIFY

### VUE-SIMPLIFY-1: Options API → Composition API (`<script setup>`)

**Detect:** A component using Options API (`export default { data(), methods: {}, computed: {}, ... }`) that has no advanced Options-API-only patterns (mixins that cannot be trivially converted, `$options` access, etc.).

**Fix (Notes only):** Flag as a candidate for migration to `<script setup>`. This is a significant rewrite, do not apply automatically.

### VUE-SIMPLIFY-2: Computed property that is just a method call

**Detect:** A `computed` property whose body is a single expression that does not depend on reactive state, it is effectively a pure function of its arguments.

**Fix:** Replace with a plain method if it takes arguments, or inline the expression if it is simple enough.

### VUE-SIMPLIFY-3: `v-bind` with a single prop instead of object spread

**Detect:** Multiple separate `:prop="value"` bindings on the same element that all come from the same object.

**Fix:** Replace with `v-bind="objectName"`.

```html
<!-- Before -->
<MyComp :id="item.id" :name="item.name" :role="item.role" />

<!-- After -->
<MyComp v-bind="item" />
```

> Note: Apply only when all bound props come from the same source object and no transformation is applied to the values.

### VUE-SIMPLIFY-4: Inline template logic → computed property

**Detect:** A complex expression (ternary, method call with arguments, filter chain) used directly inside `{{ }}` or a directive binding.

**Fix:** Extract to a computed property with a descriptive name.

```html
<!-- Before -->
<p>{{ items.filter(i => i.active).map(i => i.name).join(', ') }}</p>

<!-- After — in <script> -->
const activeItemNames = computed(() =>
  items.value.filter(i => i.active).map(i => i.name).join(', ')
);
<!-- In template -->
<p>{{ activeItemNames }}</p>
```

---

## Category MODERN

### VUE-MODERN-1: `this.$emit` → `defineEmits` (Composition API)

**Detect:** `this.$emit(...)` used inside `<script setup>` or a `setup()` function.

**Fix:** Declare with `const emit = defineEmits([...])` and call `emit(...)`.

### VUE-MODERN-2: `this.$refs` → `ref()` (Composition API)

**Detect:** `this.$refs.name` inside a `<script setup>` or `setup()` context.

**Fix:** Declare a `const name = ref(null)` and bind with `:ref="name"` in the template.
