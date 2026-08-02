---
name: "el-anchor"
description: "Anchor component for anchor navigation. Invoke when user needs to create page anchor navigation, table of contents, or quick navigation to specific sections."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Anchor Component

Anchor provides quick navigation to specific sections on the current page.

## When to Use

- Page table of contents
- Document navigation
- Section anchors
- Quick page navigation

## Basic Usage

```vue
<template>
  <el-anchor>
    <el-anchor-link href="#section1" title="Section 1" />
    <el-anchor-link href="#section2" title="Section 2" />
    <el-anchor-link href="#section3" title="Section 3" />
  </el-anchor>
</template>
```

## Horizontal Mode

```vue
<template>
  <el-anchor direction="horizontal">
    <el-anchor-link href="#section1" title="Section 1" />
    <el-anchor-link href="#section2" title="Section 2" />
  </el-anchor>
</template>
```

## Scroll Container

```vue
<template>
  <el-anchor :container="containerRef" :offset="100">
    <el-anchor-link href="#section1" title="Section 1" />
  </el-anchor>
</template>

<script setup>
import { ref } from 'vue'

const containerRef = ref(null)
</script>
```

## Underline Type

```vue
<template>
  <el-anchor type="underline">
    <el-anchor-link href="#section1" title="Section 1" />
  </el-anchor>
</template>
```

## API Reference

### Anchor Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| container | Scroll container | `string \| HTMLElement \| Window` | — |
| offset | Scroll offset | `number` | `0` |
| bound | Offset for triggering anchor | `number` | `15` |
| duration | Scroll duration (ms) | `number` | `300` |
| marker | Show marker | `boolean` | `true` |
| type | Anchor type | `'default' \| 'underline'` | `'default'` |
| direction | Anchor direction | `'vertical' \| 'horizontal'` | `'vertical'` |

### Anchor Events

| Name | Description | Type |
|------|-------------|------|
| change | Active link changes | `(href: string) => void` |
| click | Link clicked | `(e: MouseEvent, href?: string) => void` |

### Anchor Exposes

| Name | Description | Type |
|------|-------------|------|
| scrollTo | Scroll to specific position | `(href: string) => void` |

### AnchorLink Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| title | Link text | `string` | — |
| href | Link address | `string` | — |

### AnchorLink Slots

| Name | Description |
|------|-------------|
| default | Child links |
| sub-link | Child links |

## Best Practices

1. Use `container` for custom scroll areas
2. Use `offset` for fixed headers
3. Use `direction="horizontal"` for top navigation
