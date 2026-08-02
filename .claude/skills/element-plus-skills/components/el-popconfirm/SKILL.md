---
name: "el-popconfirm"
description: "Popconfirm component for simple confirmation dialogs. Invoke when user needs to confirm actions before execution, like delete operations or irreversible actions."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Popconfirm Component

Popconfirm provides a simple confirmation dialog for element click actions.

## When to Use

- Delete confirmations
- Action confirmations
- Irreversible operation warnings
- Quick confirm dialogs

## Basic Usage

```vue
<template>
  <el-popconfirm title="Are you sure to delete this?">
    <template #reference>
      <el-button>Delete</el-button>
    </template>
  </el-popconfirm>
</template>
```

## Customize

```vue
<template>
  <el-popconfirm
    title="Are you sure?"
    confirm-button-text="Yes"
    cancel-button-text="No"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  >
    <template #reference>
      <el-button type="danger">Delete</el-button>
    </template>
  </el-popconfirm>
</template>

<script setup>
const handleConfirm = () => {
  console.log('Confirmed')
}

const handleCancel = () => {
  console.log('Cancelled')
}
</script>
```

## Trigger Event

```vue
<template>
  <el-popconfirm
    title="Delete this item?"
    @confirm="deleteItem"
  >
    <template #reference>
      <el-button type="danger">Delete</el-button>
    </template>
  </el-popconfirm>
</template>

<script setup>
const deleteItem = () => {
  // Delete logic
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| title | Title | `string` | — |
| effect | Tooltip theme | `'dark' \| 'light'` | `'light'` |
| confirm-button-text | Confirm button text | `string` | — |
| cancel-button-text | Cancel button text | `string` | — |
| confirm-button-type | Confirm button type | Button type enum | `'primary'` |
| cancel-button-type | Cancel button type | Button type enum | `'text'` |
| icon | Icon component | `string \| Component` | `QuestionFilled` |
| icon-color | Icon color | `string` | `'#f90'` |
| hide-icon | Hide icon | `boolean` | `false` |
| hide-after | Disappear delay (ms) | `number` | `200` |
| teleported | Teleport to body | `boolean` | `true` |
| width | Popconfirm width | `string \| number` | `150` |

### Events

| Name | Description | Type |
|------|-------------|------|
| confirm | Click confirm button | `(e: MouseEvent) => void` |
| cancel | Click cancel button | `(e: MouseEvent) => void` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| reference | Trigger element | — |
| actions | Custom footer | `{ confirm, cancel }` |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| hide | Hide popconfirm | `() => void` |

## Best Practices

1. Use for destructive action confirmations
2. Provide clear confirmation messages
3. Use appropriate button types
