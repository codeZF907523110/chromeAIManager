---
name: vue-core
description: MUST be used for Vue 3 tasks. Covers Composition API with <script setup lang="ts">, reactivity system, SFC structure, component data flow, composables, and performance. Load for any .vue file, Vue component, or Vue + Vite work. Always use Composition API. Never Options API unless project explicitly requires it.
license: MIT
metadata:
  sources:
    - https://github.com/vuejs-ai/skills (vue-best-practices v18.0.0)
    - https://github.com/antfu/skills (vue skill, generated from vuejs/docs)
  version: "1.0.0"
---

# Vue Core — Best Practices

> Based on Vue 3.5+. Always use `<script setup lang="ts">`.

## Preferences

- TypeScript over JavaScript
- `<script setup lang="ts">` — always
- `shallowRef` over `ref` for primitives (better performance)
- Composition API only — never Options API
- Never destructure `reactive()` directly

## Core Principles

- **Keep state predictable:** one source of truth, derive everything else with `computed`.
- **Make data flow explicit:** props down, events up.
- **Favor small, focused components:** single responsibility per component.
- **Avoid unnecessary re-renders:** prefer `computed` over watchers for derived state.
- **Readability counts:** self-documenting code without redundant comments.

---

## 1) Architecture: Confirm Before Coding

Default stack: Vue 3 + Composition API + `<script setup lang="ts">`.

### 1.1 Must-read references

Before any Vue task, read and apply:
- [`references/reactivity.md`](references/reactivity.md)
- [`references/sfc.md`](references/sfc.md)
- [`references/component-data-flow.md`](references/component-data-flow.md)
- [`references/composables.md`](references/composables.md)
- [`references/script-setup-macros.md`](references/script-setup-macros.md)
- [`references/core-new-apis.md`](references/core-new-apis.md)

### 1.2 Plan component boundaries

For any non-trivial feature, map components first:
- Each component has ONE clear responsibility.
- Entry/root/route-view components are composition surfaces only — no feature logic inside.
- For CRUD/list features: split into container + form + list/item + footer components.
- Use feature folder layout: `components/<feature>/`, `composables/use<Feature>.ts`.

---

## 2) Essential Vue Foundations

### Component Template

```vue
<script setup lang="ts">
import { shallowRef, computed, watch, onMounted } from 'vue'

const props = defineProps<{
  title: string
  count?: number
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const model = defineModel<string>()

const doubled = computed(() => (props.count ?? 0) * 2)

watch(() => props.title, (newVal) => {
  console.log('Title changed:', newVal)
})

onMounted(() => {
  console.log('Component mounted')
})
</script>

<template>
  <div>{{ title }} - {{ doubled }}</div>
</template>
```

### Key Imports

```ts
import { ref, shallowRef, computed, reactive, readonly, toRef, toRefs, toValue } from 'vue'
import { watch, watchEffect, watchPostEffect, onWatcherCleanup } from 'vue'
import { onMounted, onUpdated, onUnmounted, onBeforeMount, onBeforeUpdate, onBeforeUnmount } from 'vue'
import { nextTick, defineComponent, defineAsyncComponent, useTemplateRef } from 'vue'
import type { MaybeRef, MaybeRefOrGetter, InjectionKey } from 'vue'
```

### Reactivity Primitives

See [`references/reactivity.md`](references/reactivity.md) for full reference.

| Primitive | When to use |
|-----------|-------------|
| `shallowRef(primitive)` | strings, numbers, booleans — always prefer over `ref` |
| `ref(obj)` | objects/arrays you replace frequently (deep reactive) |
| `reactive(obj)` | objects you mutate in-place (no replacement) |
| `shallowRef(obj)` | large opaque objects, class instances, external SDK clients |
| `computed(() => ...)` | derived values — ALWAYS prefer over watcher-assigned refs |

### Reactivity Rules

```ts
import { shallowRef, computed, watch } from 'vue'

const count = shallowRef(0)
const doubled = computed(() => count.value * 2)

watch(
  () => count.value,
  (val) => { /* side effects here, NOT in computed */ },
  { immediate: true }
)
```

### SFC Structure Order

Always keep SFC sections in this order:
```
<script setup lang="ts">
<template>
<style scoped>
```

### Component Data Flow

- Props down, events up — primary model.
- `defineModel()` for `v-model` (Vue 3.4+).
- `provide/inject` only for deep-tree dependencies.
- Typed contracts: `defineProps<{...}>()`, `defineEmits<{...}>()`, `InjectionKey`.

See [`references/component-data-flow.md`](references/component-data-flow.md).

### Composables

Extract logic into composables when it is reused, stateful, or side-effect heavy.

```ts
export function useCounter(initial: MaybeRefOrGetter<number> = 0) {
  const count = shallowRef(toValue(initial))
  const increment = () => count.value++
  return { count: readonly(count), increment }
}
```

See [`references/composables.md`](references/composables.md).

---

## 3) Optional Features (load only when needed)

| Feature | When to use | Reference |
|---------|-------------|-----------|
| Slots | Parent controls child content/layout | [`references/component-slots.md`](references/component-slots.md) |
| `<KeepAlive>` | Stateful view caching | Vue docs |
| `<Teleport>` | Modals, overlays, portals | Vue docs |
| `<Suspense>` | Async subtree fallback | Vue docs |
| `<Transition>` | Enter/leave effects | Vue docs |
| `<TransitionGroup>` | Animated list mutations | Vue docs |
| Directives | DOM-specific behavior | Vue docs |
| Async components | Lazy-loaded heavy UI | `defineAsyncComponent` |
| Render functions | Templates cannot express requirement | Vue docs |

---

## 4) Performance (post-functionality pass only)

- Large lists → virtualize with `useVirtualList` (VueUse) or `vue-virtual-scroller`.
- Static subtrees → `v-once`, `v-memo`.
- Hot list paths → avoid component abstraction in `v-for`.
- Expensive updates → check `updated` hook, use `shallowRef`.

---

## 5) Final Self-Check

- `<script setup lang="ts">` used everywhere.
- State is minimal, derived values use `computed`.
- SFC section order: script → template → style.
- Components are focused (max one responsibility).
- Entry/route-view components are thin composition surfaces.
- Data flow is explicit and typed.
- Composables used for reuse/complexity.
- Optional features added only when requirements demand them.
- Performance changes applied only after functionality is complete.
