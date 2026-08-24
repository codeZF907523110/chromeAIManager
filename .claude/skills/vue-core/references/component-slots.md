---
title: Component Slots
source: vuejs/docs
tags: [vue3, slots, scoped-slots, v-slot]
---

# Component Slots

## Default Slot

```vue
<!-- Child.vue -->
<template>
  <div class="card">
    <slot />
  </div>
</template>
```

```vue
<!-- Parent.vue -->
<template>
  <Card>Content goes here</Card>
</template>
```

## Named Slots

```vue
<!-- Child.vue -->
<template>
  <header><slot name="header" /></header>
  <main><slot /></main>
  <footer><slot name="footer" /></footer>
</template>
```

```vue
<!-- Parent.vue -->
<template>
  <Layout>
    <template #header>Page Title</template>
    <p>Main content</p>
    <template #footer>Footer text</template>
  </Layout>
</template>
```

## Scoped Slots

Parent controls layout; child provides data:

```vue
<!-- Child.vue -->
<script setup lang="ts">
defineProps<{ items: string[] }>()
</script>
<template>
  <ul>
    <li v-for="(item, index) in items" :key="item">
      <slot name="item" :item="item" :index="index" />
    </li>
  </ul>
</template>
```

```vue
<!-- Parent.vue -->
<template>
  <ItemList :items="items">
    <template #item="{ item, index }">
      {{ index + 1 }}. {{ item }}
    </template>
  </ItemList>
</template>
```

## Rules

- Use `#default` or `v-slot:default` for the default slot when mixing with named slots.
- Scoped slot props are read-only in the parent — emit events for mutations.
- Prefer slots over props for flexible layout; prefer props for structured data.
