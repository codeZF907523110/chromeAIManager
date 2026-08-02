---
name: "el-splitter"
description: "Splitter component for dividing areas horizontally or vertically. Invoke when user needs to create resizable panels, split views, or collapsible layouts."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Splitter Component

Splitter divides areas horizontally or vertically with draggable resizing.

## When to Use

- Split views
- Resizable panels
- Collapsible layouts
- Multi-pane interfaces

## Basic Usage

```vue
<template>
  <el-splitter>
    <el-splitter-panel>Panel 1</el-splitter-panel>
    <el-splitter-panel>Panel 2</el-splitter-panel>
  </el-splitter>
</template>
```

## Vertical Layout

```vue
<template>
  <el-splitter layout="vertical">
    <el-splitter-panel>Panel 1</el-splitter-panel>
    <el-splitter-panel>Panel 2</el-splitter-panel>
  </el-splitter>
</template>
```

## Collapsible

```vue
<template>
  <el-splitter>
    <el-splitter-panel collapsible>Panel 1</el-splitter-panel>
    <el-splitter-panel>Panel 2</el-splitter-panel>
  </el-splitter>
</template>
```

## Size Constraints

```vue
<template>
  <el-splitter>
    <el-splitter-panel :min="100" :max="300">Panel 1</el-splitter-panel>
    <el-splitter-panel>Panel 2</el-splitter-panel>
  </el-splitter>
</template>
```

## Disable Drag

```vue
<template>
  <el-splitter>
    <el-splitter-panel :resizable="false">Panel 1</el-splitter-panel>
    <el-splitter-panel>Panel 2</el-splitter-panel>
  </el-splitter>
</template>
```

## Track Size

```vue
<template>
  <el-splitter>
    <el-splitter-panel v-model:size="size1">Panel 1</el-splitter-panel>
    <el-splitter-panel v-model:size="size2">Panel 2</el-splitter-panel>
  </el-splitter>
</template>

<script setup>
import { ref } from 'vue'

const size1 = ref('50%')
const size2 = ref('50%')
</script>
```

## Lazy Mode

```vue
<template>
  <el-splitter lazy>
    <el-splitter-panel>Panel 1</el-splitter-panel>
    <el-splitter-panel>Panel 2</el-splitter-panel>
  </el-splitter>
</template>
```

## API Reference

### Splitter Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| layout | Layout direction | `'horizontal' \| 'vertical'` | `'horizontal'` |
| lazy | Enable lazy mode | `boolean` | `false` |

### Splitter Events

| Name | Description | Type |
|------|-------------|------|
| resize-start | Resize starts | `(index, sizes) => void` |
| resize | During resize | `(index, sizes) => void` |
| resize-end | Resize ends | `(index, sizes) => void` |
| collapse | Panel collapsed | `(index, type, sizes) => void` |

### SplitterPanel Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| size / v-model:size | Panel size | `string \| number` | — |
| min | Minimum size | `string \| number` | — |
| max | Maximum size | `string \| number` | — |
| resizable | Can be resized | `boolean` | `true` |
| collapsible | Can be collapsed | `boolean` | `false` |

### SplitterPanel Events

| Name | Description | Type |
|------|-------------|------|
| update:size | Size changes | `(size: number) => void` |

### SplitterPanel Slots

| Name | Description |
|------|-------------|
| default | Panel content |
| start-collapsible | Start collapse button |
| end-collapsible | End collapse button |

## Best Practices

1. Use `min`/`max` to constrain panel sizes
2. Use `collapsible` for collapsible panels
3. Use `lazy` for performance with heavy content
