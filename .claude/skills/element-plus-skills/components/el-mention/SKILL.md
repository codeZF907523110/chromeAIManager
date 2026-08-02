---
name: "el-mention"
description: "Mention component for mentioning users or items in input. Invoke when user needs to implement @mentions, user tagging, or item references in text inputs."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Mention Component

Mention allows users to mention someone or something in an input field.

## When to Use

- User mentions (@username)
- Item references
- Tagging functionality
- Rich text inputs

## Basic Usage

```vue
<template>
  <el-mention
    v-model="value"
    :options="options"
    placeholder="Type @ to mention"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const options = [
  { value: 'user1', label: 'User 1' },
  { value: 'user2', label: 'User 2' },
  { value: 'user3', label: 'User 3' }
]
</script>
```

## Textarea Mode

```vue
<template>
  <el-mention
    v-model="value"
    :options="options"
    type="textarea"
    placeholder="Type @ to mention"
  />
</template>
```

## Custom Props

```vue
<template>
  <el-mention
    v-model="value"
    :options="options"
    :props="{ value: 'id', label: 'name' }"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const options = [
  { id: '1', name: 'User 1' },
  { id: '2', name: 'User 2' }
]
</script>
```

## Custom Label

```vue
<template>
  <el-mention v-model="value" :options="options">
    <template #label="{ item }">
      <div style="display: flex; align-items: center;">
        <el-avatar :size="24" />
        <span>{{ item.label }}</span>
      </div>
    </template>
  </el-mention>
</template>
```

## Remote Loading

```vue
<template>
  <el-mention
    v-model="value"
    :options="options"
    :loading="loading"
    @search="handleSearch"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const options = ref([])
const loading = ref(false)

const handleSearch = async (pattern, prefix) => {
  loading.value = true
  const res = await fetch(`/api/users?q=${pattern}`)
  options.value = await res.json()
  loading.value = false
}
</script>
```

## Custom Trigger

```vue
<template>
  <el-mention
    v-model="value"
    :options="options"
    prefix="#"
    placeholder="Type # to tag"
  />
</template>
```

## Delete as Whole

```vue
<template>
  <el-mention
    v-model="value"
    :options="options"
    whole
  />
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Input value | `string` | — |
| options | Mention options | `MentionOption[]` | `[]` |
| props | Configuration options | `MentionOptionProps` | `{value: 'value', label: 'label', disabled: 'disabled'}` |
| prefix | Trigger character | `string \| string[]` | `'@'` |
| split | Split character | `string` | `' '` |
| filter-option | Custom filter logic | `(pattern, option) => boolean` | — |
| placement | Popup placement | `'bottom' \| 'top'` | `'bottom'` |
| show-arrow | Show dropdown arrow | `boolean` | `false` |
| offset | Dropdown offset | `number` | `0` |
| whole | Delete mention as whole | `boolean` | `false` |
| check-is-whole | Custom whole check | `(pattern, prefix) => boolean` | — |
| loading | Loading state | `boolean` | `false` |
| popper-class | Custom dropdown class | `string \| object` | `''` |
| popper-style | Custom dropdown style | `string \| object` | — |

### Events

| Name | Description | Type |
|------|-------------|------|
| search | Triggered on prefix hit | `(pattern, prefix) => void` |
| select | Option selected | `(option, prefix) => void` |
| whole-remove | Whole mention removed | `(pattern, prefix) => void` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| label | Custom option label | `{ item, index }` |
| loading | Loading content | — |
| header | Dropdown header | — |
| footer | Dropdown footer | — |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| input | Input component instance | `Ref<InputInstance>` |
| tooltip | Tooltip component instance | `Ref<TooltipInstance>` |
| dropdownVisible | Dropdown visibility | `ComputedRef<boolean>` |

## Best Practices

1. Use `loading` for async option loading
2. Use `prefix` for different trigger characters
3. Use `whole` for better UX when deleting mentions
