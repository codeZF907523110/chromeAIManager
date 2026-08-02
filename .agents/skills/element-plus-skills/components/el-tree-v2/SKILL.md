---
name: "el-tree-v2"
description: "Virtualized Tree component for large hierarchical datasets with blazing fast scrolling. Invoke when user needs to display large tree structures (1000+ nodes) with virtual scrolling for performance."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Virtualized Tree (TreeV2) Component

TreeV2 provides a virtualized tree for rendering large hierarchical datasets efficiently.

## When to Use

- Large tree structures (1000+ nodes)
- Performance-critical tree views
- Virtual scrolling needed
- File system browsers

## Basic Usage

```vue
<template>
  <el-tree-v2 :data="data" :props="defaultProps" :height="200" />
</template>

<script setup>
const defaultProps = {
  value: 'id',
  label: 'label',
  children: 'children'
}

const data = [
  {
    id: '1',
    label: 'Level 1',
    children: [
      { id: '1-1', label: 'Level 1-1' }
    ]
  }
]
</script>
```

## Selectable

```vue
<template>
  <el-tree-v2
    :data="data"
    :props="defaultProps"
    :height="200"
    show-checkbox
  />
</template>
```

## Default State

```vue
<template>
  <el-tree-v2
    :data="data"
    :props="defaultProps"
    :height="200"
    :default-expanded-keys="['1']"
    :default-checked-keys="['1-1']"
    show-checkbox
  />
</template>
```

## Custom Node Content

```vue
<template>
  <el-tree-v2 :data="data" :props="defaultProps" :height="200">
    <template #default="{ node, data }">
      <span>{{ node.label }} - Custom</span>
    </template>
  </el-tree-v2>
</template>
```

## Filtering

```vue
<template>
  <el-input v-model="filterText" placeholder="Filter" />
  <el-tree-v2
    ref="treeRef"
    :data="data"
    :props="defaultProps"
    :height="200"
    :filter-method="filterMethod"
  />
</template>

<script setup>
import { ref, watch } from 'vue'

const filterText = ref('')
const treeRef = ref()

const filterMethod = (query, data, node) => {
  if (!query) return true
  return data.label.includes(query)
}

watch(filterText, (val) => {
  treeRef.value.filter(val)
})
</script>
```

## API Reference

### TreeV2 Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| data | Tree data | `Array<{[key: string]: any}>` | — |
| empty-text | Text when data is empty | `string` | — |
| props | Configuration options | `object` | — |
| highlight-current | Highlight current node | `boolean` | `false` |
| expand-on-click-node | Expand on node click | `boolean` | `true` |
| check-on-click-node | Check on node click | `boolean` | `false` |
| check-on-click-leaf | Check on leaf node click | `boolean` | `true` |
| default-expanded-keys | Initially expanded keys | `string[] \| number[]` | — |
| show-checkbox | Show checkboxes | `boolean` | `false` |
| check-strictly | Parent-child independent | `boolean` | `false` |
| default-checked-keys | Initially checked keys | `string[] \| number[]` | — |
| current-node-key | Current node key | `string \| number` | — |
| filter-method | Filter method | `(query, data, node) => boolean` | — |
| indent | Indentation (px) | `number` | `16` |
| icon | Custom icon | `string \| Component` | — |
| item-size | Node height | `number` | `26` |
| scrollbar-always-on | Always show scrollbar | `boolean` | `false` |
| height | Tree height | `number` | `200` |

### Props Configuration

| Attribute | Description | Type | Default |
|-----------|-------------|------|---------|
| value | Unique key | `string` | `'id'` |
| label | Label key | `string` | `'label'` |
| children | Children key | `string` | `'children'` |
| disabled | Disabled key | `string` | `'disabled'` |
| class | Custom node class | `string \| (data, node) => string` | — |

### Exposes

| Method | Description | Parameters |
|--------|-------------|------------|
| filter | Filter nodes | `(query)` |
| getCheckedNodes | Get checked nodes | `(leafOnly)` |
| getCheckedKeys | Get checked keys | `(leafOnly)` |
| setCheckedKeys | Set checked keys | `(keys)` |
| setChecked | Set node checked | `(key, checked)` |
| setExpandedKeys | Set expanded keys | `(keys)` |
| getHalfCheckedNodes | Get half-checked nodes | — |
| getHalfCheckedKeys | Get half-checked keys | — |
| getCurrentKey | Get current key | — |
| getCurrentNode | Get current node | — |
| setCurrentKey | Set current key | `(key)` |
| getNode | Get node by key | `(data)` |
| expandNode | Expand node | `(node)` |
| collapseNode | Collapse node | `(node)` |
| setData | Set data | `(data)` |
| scrollTo | Scroll to position | `(offset)` |
| scrollToNode | Scroll to node | `(key, strategy)` |

### Events

| Name | Description | Parameters |
|------|-------------|------------|
| node-click | Node clicked | `(data, node, e)` |
| node-drop | Node dropped | `(data, node, e)` |
| node-contextmenu | Right-click | `(e, data, node)` |
| check-change | Check state changed | `(data, checked)` |
| check | Checkbox clicked | `(data, info)` |
| current-change | Current changed | `(data, node)` |
| node-expand | Node expanded | `(data, node)` |
| node-collapse | Node collapsed | `(data, node)` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| default | Custom node content | `{ node, data }` |
| empty | Empty content | — |

## Best Practices

1. Use for trees with 1000+ nodes
2. Set appropriate `item-size` for node height
3. Use `setData` for large reactive data updates
