---
name: "el-transfer"
description: "Transfer component for dual-column list selection. Invoke when user needs to move items between two lists, select multiple items from a large dataset, or manage permissions."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Transfer Component

Transfer provides dual-column list selection for moving items between lists.

## When to Use

- Permission management
- Multi-select from large datasets
- Item categorization
- Team member selection

## Basic Usage

```vue
<template>
  <el-transfer
    v-model="value"
    :data="data"
    :titles="['Source', 'Target']"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref([1, 4])
const data = ref(
  Array.from({ length: 15 }).map((_, index) => ({
    key: index + 1,
    label: `Option ${index + 1}`,
    disabled: index % 4 === 0
  }))
)
</script>
```

## Searchable

```vue
<template>
  <el-transfer
    v-model="value"
    :data="data"
    filterable
    filter-placeholder="Search..."
  />
</template>
```

## Customizable

```vue
<template>
  <el-transfer
    v-model="value"
    :data="data"
    :titles="['Available', 'Selected']"
    :button-texts="['Remove', 'Add']"
    :render-content="renderFunc"
  />
</template>

<script setup>
const renderFunc = (h, option) => {
  return h('span', null, `${option.key} - ${option.label}`)
}
</script>
```

## Prop Aliases

```vue
<template>
  <el-transfer
    v-model="value"
    :data="data"
    :props="{
      key: 'id',
      label: 'name'
    }"
  />
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `array` | `[]` |
| data | Data source | `array` | `[]` |
| filterable | Enable search | `boolean` | `false` |
| filter-placeholder | Search placeholder | `string` | `'Search'` |
| filter-method | Custom search method | `(query, item) => boolean` | — |
| target-order | Order of target list | `'original' \| 'push' \| 'unshift'` | `'original'` |
| titles | Custom titles | `string[]` | `['List 1', 'List 2']` |
| button-texts | Custom button texts | `string[]` | `[]` |
| render-content | Custom render function | `(h, option) => VNode` | — |
| format | Display format | `object` | — |
| props | Prop aliases | `object` | — |
| left-default-checked | Default checked on left | `array` | `[]` |
| right-default-checked | Default checked on right | `array` | `[]` |
| left-checked | Checked on left | `array` | — |
| right-checked | Checked on right | `array` | — |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when value changes | `(value, direction, movedKeys) => void` |
| left-check-change | Left list selection changes | `(value, movedKeys) => void` |
| right-check-change | Right list selection changes | `(value, movedKeys) => void` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| left-footer | Left list footer | — |
| right-footer | Right list footer | — |
| — | Custom item content | `{ option }` |

## Best Practices

1. Use `filterable` for large datasets
2. Customize with `render-content` for rich displays
3. Use `props` to map custom data keys
