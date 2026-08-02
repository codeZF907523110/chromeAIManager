---
name: "el-tree"
description: "Tree component for displaying hierarchical data with selection, filtering, and drag-drop support. Invoke when user needs to display folder structures, organization charts, category trees, or any hierarchical data with expandable nodes."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Tree Component

Tree component displays a set of data with hierarchies, supporting selection, filtering, lazy loading, and drag-and-drop functionality.

## When to Use

- Display folder or directory structures
- Show organization charts
- Category or classification selection
- Menu navigation with nested items
- Any hierarchical data representation

## Basic Usage

```vue
<template>
  <el-tree :data="data" :props="defaultProps" />
</template>

<script setup>
const data = [
  {
    label: 'Level one 1',
    children: [
      {
        label: 'Level two 1-1',
        children: [
          { label: 'Level three 1-1-1' }
        ]
      }
    ]
  },
  {
    label: 'Level one 2',
    children: [
      { label: 'Level two 2-1' },
      { label: 'Level two 2-2' }
    ]
  }
]

const defaultProps = {
  children: 'children',
  label: 'label'
}
</script>
```

## Selectable Tree with Checkboxes

```vue
<template>
  <el-tree
    ref="treeRef"
    :data="data"
    :props="defaultProps"
    show-checkbox
    node-key="id"
    :default-expanded-keys="[2, 3]"
    :default-checked-keys="[5]"
  />
</template>

<script setup>
import { ref } from 'vue'

const treeRef = ref()

const data = [
  {
    id: 1,
    label: 'Level one 1',
    children: [
      { id: 4, label: 'Level two 1-1' },
      { id: 5, label: 'Level two 1-2' }
    ]
  },
  {
    id: 2,
    label: 'Level one 2',
    children: [
      { id: 6, label: 'Level two 2-1' }
    ]
  },
  {
    id: 3,
    label: 'Level one 3',
    children: [
      { id: 7, label: 'Level two 3-1' }
    ]
  }
]

const defaultProps = {
  children: 'children',
  label: 'label'
}
</script>
```

## Lazy Loading

```vue
<template>
  <el-tree
    :props="props"
    :load="loadNode"
    lazy
    show-checkbox
  />
</template>

<script setup>
const props = {
  label: 'name',
  children: 'zones',
  isLeaf: 'leaf'
}

const loadNode = (node, resolve) => {
  if (node.level === 0) {
    return resolve([{ name: 'Root' }])
  }
  
  if (node.level > 1) {
    return resolve([])
  }
  
  setTimeout(() => {
    const data = [
      { name: 'leaf', leaf: true },
      { name: 'zone' }
    ]
    resolve(data)
  }, 500)
}
</script>
```

## Custom Node Content

```vue
<template>
  <el-tree :data="data" :props="defaultProps">
    <template #default="{ node, data }">
      <span class="custom-tree-node">
        <span>{{ node.label }}</span>
        <span>
          <el-button type="primary" size="small" @click="append(data)">
            Append
          </el-button>
          <el-button type="danger" size="small" @click="remove(node, data)">
            Delete
          </el-button>
        </span>
      </span>
    </template>
  </el-tree>
</template>

<script setup>
let id = 1000

const append = (data) => {
  const newChild = { label: 'test', children: [] }
  if (!data.children) {
    data.children = []
  }
  data.children.push(newChild)
}

const remove = (node, data) => {
  const parent = node.parent
  const children = parent.data.children || parent.data
  const index = children.findIndex(d => d.id === data.id)
  children.splice(index, 1)
}
</script>
```

## Filtering

```vue
<template>
  <el-input
    v-model="filterText"
    placeholder="Filter keyword"
  />
  <el-tree
    ref="treeRef"
    :data="data"
    :props="defaultProps"
    :filter-node-method="filterNode"
  />
</template>

<script setup>
import { ref, watch } from 'vue'

const filterText = ref('')
const treeRef = ref()

const filterNode = (value, data) => {
  if (!value) return true
  return data.label.includes(value)
}

watch(filterText, (val) => {
  treeRef.value.filter(val)
})
</script>
```

## Accordion Mode

```vue
<template>
  <el-tree
    :data="data"
    :props="defaultProps"
    accordion
  />
</template>
```

## Draggable Tree

```vue
<template>
  <el-tree
    :data="data"
    :props="defaultProps"
    draggable
    :allow-drop="allowDrop"
    :allow-drag="allowDrag"
    @node-drag-start="handleDragStart"
    @node-drag-enter="handleDragEnter"
    @node-drag-leave="handleDragLeave"
    @node-drag-over="handleDragOver"
    @node-drag-end="handleDragEnd"
    @node-drop="handleDrop"
  />
</template>

<script setup>
const allowDrop = (draggingNode, dropNode, type) => {
  if (dropNode.data.label.includes('Level three')) {
    return type !== 'inner'
  }
  return true
}

const allowDrag = (draggingNode) => {
  return !draggingNode.data.label.includes('Level three')
}

const handleDragStart = (node, ev) => {
  console.log('drag start', node)
}

const handleDrop = (draggingNode, dropNode, dropType, ev) => {
  console.log('drop', draggingNode, dropNode, dropType)
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| data | Tree data | `Array<{[key: string]: any}>` | — |
| empty-text | Text when data is empty | `string` | — |
| node-key | Unique identity key for nodes | `string` | — |
| props | Configuration options | `object` | — |
| render-after-expand | Render children only after parent expanded | `boolean` | `true` |
| load | Method for loading subtree data (lazy mode) | `(node, resolve, reject) => void` | — |
| render-content | Render function for tree node | `(h, { node, data, store }) => void` | — |
| highlight-current | Highlight current node | `boolean` | `false` |
| default-expand-all | Expand all nodes by default | `boolean` | `false` |
| expand-on-click-node | Expand on node click | `boolean` | `true` |
| check-on-click-node | Check on node click | `boolean` | `false` |
| check-on-click-leaf | Check on leaf node click | `boolean` | `true` |
| auto-expand-parent | Expand parent when child expands | `boolean` | `true` |
| default-expanded-keys | Keys of initially expanded nodes | `Array<string \| number>` | — |
| show-checkbox | Show checkboxes | `boolean` | `false` |
| check-strictly | Parent-child selection independent | `boolean` | `false` |
| default-checked-keys | Keys of initially checked nodes | `Array<string \| number>` | — |
| current-node-key | Key of initially selected node | `string \| number` | — |
| filter-node-method | Filter method | `(value, data, node) => boolean` | — |
| accordion | Only one sibling expanded at a time | `boolean` | `false` |
| indent | Indentation in pixels | `number` | `18` |
| icon | Custom tree node icon | `string \| Component` | — |
| lazy | Enable lazy loading | `boolean` | `false` |
| draggable | Enable drag and drop | `boolean` | `false` |
| allow-drag | Function to determine if draggable | `(node) => boolean` | — |
| allow-drop | Function to determine if droppable | `(draggingNode, dropNode, type) => boolean` | — |

### Props Configuration

| Attribute | Description | Type | Default |
|-----------|-------------|------|---------|
| label | Key for node label | `string \| (data, node) => string` | — |
| children | Key for node subtree | `string` | — |
| disabled | Key for disabled state | `string \| (data, node) => boolean` | — |
| isLeaf | Key for leaf node detection | `string \| (data, node) => boolean` | — |
| class | Custom node class | `string \| (data, node) => string` | — |

### Exposes (Methods)

| Method | Description | Parameters |
|--------|-------------|------------|
| filter | Filter all tree nodes | `(value)` |
| updateKeyChildren | Set new data to node | `(key, data)` |
| getCheckedNodes | Get checked nodes | `(leafOnly, includeHalfChecked)` |
| setCheckedNodes | Set checked nodes | `(nodes, leafOnly)` |
| getCheckedKeys | Get checked keys | `(leafOnly)` |
| setCheckedKeys | Set checked keys | `(keys, leafOnly)` |
| setChecked | Set node checked state | `(key/data, checked, deep)` |
| getHalfCheckedNodes | Get half-checked nodes | — |
| getHalfCheckedKeys | Get half-checked keys | — |
| getCurrentKey | Get current node key | — |
| getCurrentNode | Get current node data | — |
| setCurrentKey | Set current node by key | `(key, shouldAutoExpandParent)` |
| setCurrentNode | Set current node | `(node, shouldAutoExpandParent)` |
| getNode | Get node by data or key | `(data)` |
| remove | Remove a node | `(data)` |
| append | Append child node | `(data, parentNode)` |
| insertBefore | Insert node before another | `(data, refNode)` |
| insertAfter | Insert node after another | `(data, refNode)` |

### Events

| Name | Description | Parameters |
|------|-------------|------------|
| node-click | Node clicked | `(data, node, TreeNode, event)` |
| node-contextmenu | Right-click on node | `(event, data, node, TreeNode)` |
| check-change | Selection state changed | `(data, checked, indeterminate)` |
| check | Checkbox clicked | `(data, { checkedNodes, checkedKeys, halfCheckedNodes, halfCheckedKeys })` |
| current-change | Current node changed | `(data, node)` |
| node-expand | Node expanded | `(data, node, TreeNode)` |
| node-collapse | Node collapsed | `(data, node, TreeNode)` |
| node-drag-start | Drag started | `(node, event)` |
| node-drag-enter | Drag enters node | `(draggingNode, enterNode, event)` |
| node-drag-leave | Drag leaves node | `(draggingNode, leaveNode, event)` |
| node-drag-over | Drag over node | `(draggingNode, overNode, event)` |
| node-drag-end | Drag ended | `(draggingNode, endNode, type, event)` |
| node-drop | Node dropped | `(draggingNode, dropNode, type, event)` |

### Slots

| Name | Description |
|------|-------------|
| default | Custom content for tree nodes |
| empty | Custom content when data is empty |

## Common Patterns

### Get Selected Nodes

```vue
<template>
  <el-tree
    ref="treeRef"
    :data="data"
    show-checkbox
    node-key="id"
  />
  <el-button @click="getChecked">Get Checked</el-button>
</template>

<script setup>
import { ref } from 'vue'

const treeRef = ref()

const getChecked = () => {
  const checkedNodes = treeRef.value.getCheckedNodes()
  const checkedKeys = treeRef.value.getCheckedKeys()
  console.log('Nodes:', checkedNodes)
  console.log('Keys:', checkedKeys)
}
</script>
```

### Dynamic Tree Operations

```vue
<template>
  <el-tree
    ref="treeRef"
    :data="data"
    node-key="id"
    default-expand-all
  />
  <el-button @click="addNode">Add Node</el-button>
  <el-button @click="removeNode">Remove Node</el-button>
</template>

<script setup>
import { ref } from 'vue'

const treeRef = ref()
const data = ref([
  { id: 1, label: 'Root', children: [] }
])

const addNode = () => {
  const newNode = { id: Date.now(), label: 'New Node', children: [] }
  treeRef.value.append(newNode, data.value[0])
}

const removeNode = () => {
  const node = treeRef.value.getNode(data.value[0].children[0])
  if (node) {
    treeRef.value.remove(node)
  }
}
</script>
```

## Component Interactions

- Use with **Form** for hierarchical data selection in forms
- Combine with **Input** for tree filtering
- Use with **Dialog** for tree selection in modals
- Integrate with **Menu** for nested navigation structures

## Best Practices

1. Always set `node-key` when using selection features
2. Use `lazy` loading for large datasets to improve performance
3. Implement `filter-node-method` for searchable trees
4. Use `check-strictly` when parent-child selection should be independent
5. Consider `accordion` mode for space-constrained layouts
