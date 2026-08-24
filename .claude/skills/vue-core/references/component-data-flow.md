---
title: Component Data Flow
source: vuejs-ai/skills vue-best-practices
tags: [vue3, props, emits, v-model, provide-inject, defineModel, InjectionKey]
---

# Component Data Flow

**Rule:** Props down → Events up → `v-model` for two-way → `provide/inject` for deep-tree.

## Props: Read-Only Inputs

Never mutate props in the child. Emit an event or use `defineModel`.

## Prefer Props/Emit Over Refs

**BAD:**
```vue
<script setup>
const formRef = ref(null)
function submitForm() { formRef.value.submit() }
</script>
<template>
  <UserForm ref="formRef" />
  <button @click="submitForm">Submit</button>
</template>
```

**GOOD:**
```vue
<template>
  <UserForm @submit="handleSubmit" />
</template>
```

## Template Refs When Imperative Access Is Required

```vue
<!-- Child.vue -->
<script setup lang="ts">
function open() {}
defineExpose({ open })
</script>
```

```vue
<!-- Parent.vue -->
<script setup lang="ts">
const panelRef = useTemplateRef<{ open: () => void }>('panelRef')
onMounted(() => panelRef.value?.open())
</script>
<template>
  <DialogPanel ref="panelRef" />
</template>
```

## `v-model` with `defineModel` (Vue 3.4+)

```vue
<script setup lang="ts">
const model = defineModel<string>()
</script>
<template>
  <input v-model="model" />
</template>
```

## Events Up

Events do NOT bubble in Vue. Re-emit explicitly:

```vue
<!-- Child.vue -->
<script setup>
const emit = defineEmits(['saved'])
function onGrandchildSaved(payload) { emit('saved', payload) }
</script>
<template>
  <Grandchild @saved="onGrandchildSaved" />
</template>
```

Use kebab-case in templates, camelCase in script:
```vue
<ProfileForm @update-user="emit('updateUser', $event)" />
```

## Provide/Inject with Symbol Keys

```ts
export const themeKey = Symbol('theme') as InjectionKey<Theme>
export const themeActionsKey = Symbol('theme-actions') as InjectionKey<{ toggleTheme: () => void }>
```

```vue
<!-- Provider.vue -->
<script setup lang="ts">
const theme = reactive<Theme>({ dark: false })
const toggleTheme = () => { theme.dark = !theme.dark }

provide(themeKey, readonly(theme))
provide(themeActionsKey, { toggleTheme })
</script>
```

```vue
<!-- Consumer.vue -->
<script setup lang="ts">
const theme = inject(themeKey)
const themeActions = inject(themeActionsKey)
if (!themeActions) throw new Error('themeActionsKey not provided')
const { toggleTheme } = themeActions
</script>
```

## TypeScript Typed Contracts

```vue
<script setup lang="ts">
interface Props { userId: string }
interface Emits { save: [payload: { id: string; draft: boolean }] }

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

emit('save', { id: props.userId, draft: false })
</script>
```
