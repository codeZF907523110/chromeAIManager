---
name: "el-table-v2"
description: "Virtualized Table component for rendering massive data efficiently. Invoke when user needs to display large datasets with virtual scrolling for performance."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Virtualized Table (TableV2) Component

TableV2 provides a virtualized table for rendering massive data efficiently.

## When to Use

- Large datasets (1000+ rows)
- Performance-critical tables
- Virtual scrolling needed
- Real-time data updates

## Basic Usage

```vue
<template>
  <el-table-v2
    :columns="columns"
    :data="data"
    :width="700"
    :height="400"
  />
</template>

<script setup>
const columns = [
  { key: 'id', title: 'ID', width: 100 },
  { key: 'name', title: 'Name', width: 200 },
  { key: 'email', title: 'Email', width: 300 }
]

const data = Array.from({ length: 1000 }).map((_, idx) => ({
  id: idx,
  name: `User ${idx}`,
  email: `user${idx}@example.com`
}))
</script>
```

## Auto Resizer

```vue
<template>
  <el-auto-resizer>
    <template #default="{ height, width }">
      <el-table-v2
        :columns="columns"
        :data="data"
        :width="width"
        :height="height"
      />
    </template>
  </el-auto-resizer>
</template>
```

## Custom Cell Renderer

```vue
<template>
  <el-table-v2
    :columns="columns"
    :data="data"
    :width="700"
    :height="400"
  />
</template>

<script setup>
import { h } from 'vue'
import { ElButton } from 'element-plus'

const columns = [
  { key: 'id', title: 'ID', width: 100 },
  { 
    key: 'action', 
    title: 'Action', 
    width: 150,
    cellRenderer: ({ rowData }) => h(ElButton, { size: 'small' }, () => 'Edit')
  }
]

const data = Array.from({ length: 100 }).map((_, idx) => ({
  id: idx
}))
</script>
```

## Fixed Columns

```vue
<template>
  <el-table-v2
    :columns="columns"
    :data="data"
    :width="700"
    :height="400"
  />
</template>

<script setup>
const columns = [
  { key: 'id', title: 'ID', width: 100, fixed: 'left' },
  { key: 'name', title: 'Name', width: 200 },
  { key: 'email', title: 'Email', width: 300 },
  { key: 'action', title: 'Action', width: 100, fixed: 'right' }
]

const data = Array.from({ length: 100 }).map((_, idx) => ({
  id: idx,
  name: `User ${idx}`,
  email: `user${idx}@example.com`
}))
</script>
```

## Selection

```vue
<template>
  <el-table-v2
    :columns="columns"
    :data="data"
    :width="700"
    :height="400"
  />
</template>

<script setup>
import { h, ref } from 'vue'
import { ElCheckbox } from 'element-plus'

const selectedIds = ref(new Set())

const columns = [
  {
    key: 'selection',
    width: 50,
    cellRenderer: ({ rowData }) => h(ElCheckbox, {
      modelValue: selectedIds.value.has(rowData.id),
      onChange: (val) => {
        if (val) selectedIds.value.add(rowData.id)
        else selectedIds.value.delete(rowData.id)
      }
    })
  },
  { key: 'name', title: 'Name', width: 200 }
]

const data = Array.from({ length: 100 }).map((_, idx) => ({
  id: idx,
  name: `User ${idx}`
}))
</script>
```

## API Reference

### TableV2 Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| columns | Column definitions | `Column[]` | — |
| data | Table data | `Data[]` | `[]` |
| width | Table width | `number` | — |
| height | Table height | `number` | — |
| row-height | Row height | `number` | `50` |
| header-height | Header height | `number \| number[]` | `50` |
| row-key | Row key | `string \| Symbol \| number` | `'id'` |
| fixed | Fixed column width | `boolean` | `false` |
| cache | Pre-rendered rows | `number` | `2` |
| estimated-row-height | Estimated row height for dynamic | `number` | — |

### Column Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| key | Unique key | `KeyType` | — |
| title | Header title | `string` | — |
| width | Column width | `number` | — |
| align | Content alignment | `'left' \| 'center' \| 'right'` | `'left'` |
| fixed | Fixed direction | `boolean \| 'left' \| 'right'` | `false` |
| sortable | Sortable | `boolean` | `false` |
| cellRenderer | Custom cell renderer | `Component \| (props) => VNode` | — |
| headerCellRenderer | Custom header renderer | `Component \| (props) => VNode` | — |

### Events

| Name | Description | Type |
|------|-------------|------|
| column-sort | Column sorted | `(params) => void` |
| scroll | Scroll event | `(params) => void` |
| end-reached | End reached | `(remainDistance) => void` |
| rows-rendered | Rows rendered | `(params) => void` |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| scrollTo | Scroll to position | `(params) => void` |
| scrollToRow | Scroll to row | `(row, strategy?) => void` |

## Best Practices

1. Use for datasets with 1000+ rows
2. Use `estimated-row-height` for dynamic heights
3. Use `cache` for smoother scrolling
