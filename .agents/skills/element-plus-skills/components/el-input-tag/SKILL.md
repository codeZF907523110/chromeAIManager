---
name: "el-input-tag"
description: "InputTag component for adding content as tags. Invoke when user needs to create tag inputs, multi-value inputs, or keyword/tag entry fields."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# InputTag Component

InputTag allows users to add content as tags with various customization options.

## When to Use

- Tag inputs
- Keyword entry
- Multi-value inputs
- Email/tag lists

## Basic Usage

```vue
<template>
  <el-input-tag v-model="tags" placeholder="Press Enter to add tag" />
</template>

<script setup>
import { ref } from 'vue'

const tags = ref(['Tag 1', 'Tag 2'])
</script>
```

## Custom Trigger

```vue
<template>
  <el-input-tag
    v-model="tags"
    trigger="Space"
    placeholder="Press Space to add tag"
  />
</template>
```

## Maximum Tags

```vue
<template>
  <el-input-tag v-model="tags" :max="5" />
</template>
```

## Collapse Tags

```vue
<template>
  <el-input-tag
    v-model="tags"
    collapse-tags
    collapse-tags-tooltip
  />
</template>
```

## Draggable

```vue
<template>
  <el-input-tag v-model="tags" draggable />
</template>
```

## Delimiter

```vue
<template>
  <el-input-tag v-model="tags" delimiter="," />
</template>
```

## Custom Tag

```vue
<template>
  <el-input-tag v-model="tags">
    <template #tag="{ value, index }">
      <el-tag type="success">{{ value }}</el-tag>
    </template>
  </el-input-tag>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string[]` | — |
| max | Max number of tags | `number` | — |
| tag-type | Tag type | `'' \| 'success' \| 'info' \| 'warning' \| 'danger'` | `'info'` |
| tag-effect | Tag effect | `'' \| 'light' \| 'dark' \| 'plain'` | `'light'` |
| trigger | Trigger key | `'Enter' \| 'Space'` | `'Enter'` |
| draggable | Enable drag | `boolean` | `false` |
| delimiter | Add tag on delimiter match | `string \| RegExp` | — |
| size | Size | `'large' \| 'default' \| 'small'` | — |
| collapse-tags | Collapse tags | `boolean` | `false` |
| collapse-tags-tooltip | Show tooltip on collapse | `boolean` | `false` |
| save-on-blur | Save on blur | `boolean` | `true` |
| clearable | Show clear button | `boolean` | `false` |
| disabled | Disabled | `boolean` | `false` |
| placeholder | Placeholder | `string` | — |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Value changes | `(value: string[]) => void` |
| add-tag | Tag added | `(value: string \| string[]) => void` |
| remove-tag | Tag removed | `(value: string, index: number) => void` |
| focus | Input focuses | `(event: FocusEvent) => void` |
| blur | Input blurs | `(event: FocusEvent) => void` |
| clear | Clear clicked | `() => void` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| tag | Custom tag | `{ value, index }` |
| prefix | Prefix content | — |
| suffix | Suffix content | — |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| focus | Focus input | `() => void` |
| blur | Blur input | `() => void` |

## Best Practices

1. Use `max` to limit tag count
2. Use `delimiter` for comma-separated input
3. Use `draggable` for reordering
