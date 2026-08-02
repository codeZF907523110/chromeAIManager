---
name: "el-cascader"
description: "Cascader component for hierarchical option selection. Invoke when user needs to select from multi-level data like regions, categories, or organizational structures."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Cascader Component

Cascader displays and selects options with clear hierarchical structure.

## When to Use

- Region/location selection
- Category hierarchies
- Organizational structures
- Multi-level navigation

## Basic Usage

```vue
<template>
  <el-cascader v-model="value" :options="options" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref([])
const options = [
  {
    value: 'guide',
    label: 'Guide',
    children: [
      { value: 'disciplines', label: 'Disciplines' },
      { value: 'consistency', label: 'Consistency' }
    ]
  }
]
</script>
```

## Multiple Selection

```vue
<template>
  <el-cascader v-model="value" :options="options" :props="props" clearable />
</template>

<script setup>
import { ref } from 'vue'

const value = ref([])
const props = { multiple: true }
</script>
```

## Select Any Level

```vue
<template>
  <el-cascader v-model="value" :options="options" :props="{ checkStrictly: true }" />
</template>
```

## Dynamic Loading

```vue
<template>
  <el-cascader :props="props" />
</template>

<script setup>
const props = {
  lazy: true,
  lazyLoad(node, resolve) {
    const { level } = node
    setTimeout(() => {
      const nodes = Array.from({ length: level + 1 }).map((item, i) => ({
        value: `${level}-${i}`,
        label: `Option ${level}-${i}`,
        leaf: level >= 2
      }))
      resolve(nodes)
    }, 1000)
  }
}
</script>
```

## Filterable

```vue
<template>
  <el-cascader v-model="value" :options="options" filterable />
</template>
```

## API Reference

### Cascader Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| number \| array` | — |
| options | Data of options | `CascaderOption[]` | — |
| props | Configuration options | `CascaderProps` | — |
| size | Size of input | `'large' \| 'default' \| 'small'` | — |
| placeholder | Placeholder | `string` | — |
| disabled | Whether disabled | `boolean` | — |
| clearable | Whether clearable | `boolean` | — |
| show-all-levels | Display all levels | `boolean` | `true` |
| collapse-tags | Collapse tags in multiple mode | `boolean` | — |
| separator | Option label separator | `string` | `' / '` |
| filterable | Whether searchable | `boolean` | — |

### CascaderProps

| Name | Description | Type | Default |
|------|-------------|------|---------|
| expandTrigger | Expand trigger mode | `'click' \| 'hover'` | `'click'` |
| multiple | Enable multiple selection | `boolean` | `false` |
| checkStrictly | Parent-child independent | `boolean` | `false` |
| emitPath | Emit path array | `boolean` | `true` |
| lazy | Enable lazy loading | `boolean` | `false` |
| lazyLoad | Lazy load method | `(node, resolve) => void` | — |
| value | Value key | `string` | `'value'` |
| label | Label key | `string` | `'label'` |
| children | Children key | `string` | `'children'` |

### Events

| Name | Description |
|------|-------------|
| change | Value changes |
| expand-change | Expand changes |
| blur | Blur event |
| focus | Focus event |

## Best Practices

1. Use `checkStrictly` for selecting any level
2. Use `lazy` loading for large datasets
3. Use `filterable` for searchable cascaders
