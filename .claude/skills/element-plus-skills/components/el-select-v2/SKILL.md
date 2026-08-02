---
name: "el-select-v2"
description: "Virtualized Select component for large datasets. Invoke when user needs to select from thousands of options with virtual scrolling for performance."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Virtualized Select (SelectV2) Component

SelectV2 provides a virtualized select for handling large datasets efficiently.

## When to Use

- Large datasets (1000+ options)
- Performance-critical selects
- Virtual scrolling needed
- Multi-select with many options

## Basic Usage

```vue
<template>
  <el-select-v2 v-model="value" :options="options" placeholder="Select" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const options = Array.from({ length: 1000 }).map((_, idx) => ({
  value: `value${idx}`,
  label: `Option ${idx}`
}))
</script>
```

## Multiple Selection

```vue
<template>
  <el-select-v2
    v-model="value"
    :options="options"
    multiple
    collapse-tags
    collapse-tags-tooltip
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref([])
const options = Array.from({ length: 1000 }).map((_, idx) => ({
  value: `value${idx}`,
  label: `Option ${idx}`
}))
</script>
```

## Filterable

```vue
<template>
  <el-select-v2
    v-model="value"
    :options="options"
    filterable
  />
</template>
```

## Remote Search

```vue
<template>
  <el-select-v2
    v-model="value"
    :options="options"
    filterable
    remote
    :remote-method="remoteMethod"
    :loading="loading"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const options = ref([])
const loading = ref(false)

const remoteMethod = async (query) => {
  if (query) {
    loading.value = true
    const res = await fetch(`/api/search?q=${query}`)
    options.value = await res.json()
    loading.value = false
  }
}
</script>
```

## Grouped Options

```vue
<template>
  <el-select-v2 v-model="value" :options="groupedOptions" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const groupedOptions = [
  {
    label: 'Group 1',
    options: [
      { value: '1', label: 'Option 1' },
      { value: '2', label: 'Option 2' }
    ]
  }
]
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| number \| boolean \| object \| array` | — |
| options | Options data | `array` | — |
| props | Configuration options | `object` | — |
| multiple | Enable multiple | `boolean` | `false` |
| disabled | Disabled | `boolean` | `false` |
| clearable | Clearable | `boolean` | `false` |
| filterable | Filterable | `boolean` | `false` |
| remote | Remote search | `boolean` | `false` |
| remote-method | Remote search method | `(query: string) => void` | — |
| loading | Loading state | `boolean` | `false` |
| height | Dropdown height | `number` | `274` |
| item-height | Item height | `number` | `34` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Value changes | `(val) => void` |
| visible-change | Dropdown visibility changes | `(visible: boolean) => void` |
| remove-tag | Tag removed | `(tagValue) => void` |
| clear | Clear clicked | `() => void` |
| blur | Input blurs | `(e: FocusEvent) => void` |
| focus | Input focuses | `(e: FocusEvent) => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Custom option renderer |
| header | Dropdown header |
| footer | Dropdown footer |
| empty | Empty content |
| prefix | Input prefix |
| tag | Custom tag |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| focus | Focus input | `() => void` |
| blur | Blur input | `() => void` |
| selectedLabel | Selected label | `ComputedRef<string \| string[]>` |

## Best Practices

1. Use for datasets with 1000+ options
2. Use `height` and `item-height` for performance tuning
3. Use `remote` for server-side filtering
