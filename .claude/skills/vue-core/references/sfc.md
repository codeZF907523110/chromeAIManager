---
title: Single-File Component Structure & Template Patterns
source: vuejs-ai/skills vue-best-practices
tags: [vue3, sfc, scoped-css, template, v-html, v-for, v-if, v-show]
---

# SFC Structure & Template Patterns

## Section Order

Always: `<script setup>` → `<template>` → `<style scoped>`

## Naming

- PascalCase for component names in templates AND filenames.
- `UserProfile.vue` → `<UserProfile :user="currentUser" />`

## Styles

```vue
<style scoped>
.user-card { padding: 1rem; }
.user-card__name { margin: 0; }
</style>
```

- Use `<style scoped>` for component-specific styles.
- Use class selectors (`.foo`), not element selectors (`h1`), for performance.
- Global styles → `src/assets/main.css`.
- Use `:deep()` sparingly.

## Template Safety

### Never `v-html` with untrusted content

```vue
<script setup lang="ts">
import DOMPurify from 'dompurify'
const safeHtml = computed(() => DOMPurify.sanitize(props.trustedHtml ?? ''))
</script>
<template>
  <article v-html="safeHtml" />
</template>
```

### `v-for` + `:key`

Always provide a stable primitive key:

```vue
<li v-for="item in items" :key="item.id">{{ item.name }}</li>
```

Never combine `v-if` and `v-for` on the same element. Use `computed` for filtering:

```ts
const activeUsers = computed(() => users.value.filter(u => u.active))
```

### `v-if` vs `v-show`

| Scenario | Use |
|----------|-----|
| Rare condition, expensive initial render | `v-if` |
| Frequent toggle | `v-show` |

### `:style` bindings — camelCase

```vue
<div :style="{ fontSize: size + 'px', backgroundColor: bg }" />
```

## Template Refs (Vue 3.5+)

```vue
<script setup lang="ts">
const inputRef = useTemplateRef<HTMLInputElement>('input')
onMounted(() => inputRef.value?.focus())
</script>
<template>
  <input ref="input" />
</template>
```
