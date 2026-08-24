---
title: Script Setup & Compiler Macros
source: antfu/skills vue skill, generated from vuejs/docs
tags: [vue3, script-setup, defineProps, defineEmits, defineModel, defineExpose, defineOptions]
---

# Script Setup & Macros

`<script setup lang="ts">` is the recommended syntax. Better runtime performance and IDE type inference.

## `defineProps`

```ts
const props = defineProps<{
  title: string
  count?: number
  items: string[]
}>()

const { title, count = 0 } = defineProps<{
  title: string
  count?: number
}>()

const props = withDefaults(defineProps<{
  title: string
  items?: string[]
}>(), {
  items: () => []
})
```

## `defineEmits`

```ts
const emit = defineEmits<{
  update: [value: string]
  change: [id: number, name: string]
  close: []
}>()

emit('update', 'new value')
```

## `defineModel` (Vue 3.4+)

```ts
const model = defineModel<string>()
model.value = 'hello'

const count = defineModel<number>('count', { default: 0 })

const [value, modifiers] = defineModel<string>({
  get: (val) => val?.toLowerCase(),
  set: (val) => modifiers.trim ? val?.trim() : val
})
```

Parent usage:
```vue
<Child v-model="name" />
<Child v-model:count="total" />
<Child v-model.trim="text" />
```

## `defineExpose`

Components are **closed by default** in `<script setup>`. Explicitly expose with `defineExpose`.

```ts
const count = shallowRef(0)
const reset = () => { count.value = 0 }
defineExpose({ count, reset })
```

Parent:
```ts
const childRef = useTemplateRef<{ count: number; reset: () => void }>('child')
childRef.value?.reset()
```

## `defineOptions` (Vue 3.3+)

```ts
defineOptions({
  inheritAttrs: false,
  name: 'CustomName'
})
```

## `defineSlots` (Vue 3.3+)

```ts
const slots = defineSlots<{
  default(props: { item: string; index: number }): any
  header(props: { title: string }): any
}>()
```

## Generic Components

```vue
<script setup lang="ts" generic="T extends string | number">
defineProps<{
  items: T[]
  selected: T
}>()
</script>
```

## `useTemplateRef` (Vue 3.5+)

```vue
<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'

const inputRef = useTemplateRef<HTMLInputElement>('input')

onMounted(() => inputRef.value?.focus())
</script>

<template>
  <input ref="input" />
</template>
```

## Top-level `await`

```vue
<script setup lang="ts">
const data = await fetch('/api/data').then(r => r.json())
</script>
```

Component becomes async — must be wrapped in `<Suspense>`.

## Local Custom Directives

```ts
const vFocus = { mounted: (el: HTMLElement) => el.focus() }
```

```vue
<template>
  <input v-focus />
</template>
```
