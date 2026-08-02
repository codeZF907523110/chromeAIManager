---
name: "el-segmented"
description: "Segmented component for single option selection from multiple options. Invoke when user needs to create radio-style button groups, tab-like controls, or option switches."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Segmented Component

Segmented displays multiple options and allows users to select a single option.

## When to Use

- Radio-style selections
- Tab-like controls
- Option switches
- View mode toggles

## Basic Usage

```vue
<template>
  <el-segmented v-model="value" :options="options" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('Mon')
const options = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
</script>
```

## Direction

```vue
<template>
  <el-segmented v-model="value" :options="options" direction="vertical" />
</template>
```

## Disabled

```vue
<template>
  <el-segmented v-model="value" :options="options" disabled />
</template>
```

## Block

```vue
<template>
  <el-segmented v-model="value" :options="options" block />
</template>
```

## Custom Content

```vue
<template>
  <el-segmented v-model="value" :options="options">
    <template #default="{ item }">
      <div class="flex items-center gap-2">
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </div>
    </template>
  </el-segmented>
</template>

<script setup>
import { ref } from 'vue'

const value = ref('list')
const options = [
  { label: 'List', value: 'list', icon: 'List' },
  { label: 'Grid', value: 'grid', icon: 'Grid' }
]
</script>
```

## Custom Props

```vue
<template>
  <el-segmented
    v-model="value"
    :options="options"
    :props="{ label: 'name', value: 'id' }"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref(1)
const options = [
  { id: 1, name: 'Option 1' },
  { id: 2, name: 'Option 2' }
]
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| number \| boolean` | — |
| options | Options data | `Option[]` | `[]` |
| props | Configuration options | `object` | — |
| size | Size | `'' \| 'large' \| 'default' \| 'small'` | `''` |
| block | Fit parent width | `boolean` | `false` |
| disabled | Disabled | `boolean` | `false` |
| direction | Display direction | `'horizontal' \| 'vertical'` | `'horizontal'` |

### Props Configuration

| Name | Description | Type | Default |
|------|-------------|------|---------|
| value | Value key | `string` | `'value'` |
| label | Label key | `string` | `'label'` |
| disabled | Disabled key | `string` | `'disabled'` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Value changes | `(val: any) => void` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| default | Option renderer | `{ item: Option }` |

## Best Practices

1. Use `block` for full-width layouts
2. Use `direction="vertical"` for limited horizontal space
3. Use custom content for rich option displays
