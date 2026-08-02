---
name: "el-tree-select"
description: "TreeSelect component combining Tree and Select functionality. Invoke when user needs to select from hierarchical data in a dropdown, like organization structures or category trees."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# TreeSelect Component

TreeSelect combines Tree and Select components for hierarchical data selection.

## When to Use

- Organization structure selection
- Category tree selection
- Hierarchical data selection
- Tree-based dropdowns

## Basic Usage

```vue
<template>
  <el-tree-select
    v-model="value"
    :data="data"
    placeholder="Select"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref()
const data = [
  {
    value: '1',
    label: 'Level 1',
    children: [
      { value: '1-1', label: 'Level 1-1' },
      { value: '1-2', label: 'Level 1-2' }
    ]
  }
]
</script>
```

## Select Any Level

```vue
<template>
  <el-tree-select
    v-model="value"
    :data="data"
    check-strictly
  />
</template>
```

## Multiple Selection

```vue
<template>
  <el-tree-select
    v-model="value"
    :data="data"
    multiple
    show-checkbox
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref([])
</script>
```

## Filterable

```vue
<template>
  <el-tree-select
    v-model="value"
    :data="data"
    filterable
  />
</template>
```

## Lazy Loading

```vue
<template>
  <el-tree-select
    v-model="value"
    :props="props"
    lazy
    :load="load"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref()
const props = { label: 'name', children: 'zones' }

const load = (node, resolve) => {
  if (node.level === 0) {
    return resolve([{ name: 'Root' }])
  }
  setTimeout(() => {
    resolve([{ name: 'Child' }])
  }, 500)
}
</script>
```

## API Reference

### Attributes

Inherits from both Tree and Select components.

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| number \| array` | — |
| data | Tree data | `array` | — |
| multiple | Multiple selection | `boolean` | `false` |
| check-strictly | Parent-child independent | `boolean` | `false` |
| filterable | Enable filter | `boolean` | `false` |
| lazy | Enable lazy loading | `boolean` | `false` |
| load | Lazy load method | `(node, resolve) => void` | — |
| cache-data | Cached lazy node data | `CacheOption[]` | `[]` |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| treeRef | Tree component instance | `TreeInstance` |
| selectRef | Select component instance | `SelectInstance` |

## Best Practices

1. Use `check-strictly` for selecting any level
2. Use `lazy` for large tree data
3. Use `cache-data` for lazy loaded labels
