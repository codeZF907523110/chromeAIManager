---
name: "el-divider"
description: "Divider component for separating content. Invoke when user needs to create visual separation between content sections, add horizontal or vertical dividers."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Divider Component

Divider component creates a dividing line that separates content.

## When to Use

- Content separation
- Section dividers
- Visual grouping
- Layout organization

## Basic Usage

```vue
<template>
  <div>
    <p>Content above</p>
    <el-divider />
    <p>Content below</p>
  </div>
</template>
```

## Custom Content

```vue
<template>
  <el-divider content-position="left">Left</el-divider>
  <el-divider content-position="center">Center</el-divider>
  <el-divider content-position="right">Right</el-divider>
</template>
```

## Dashed Line

```vue
<template>
  <el-divider border-style="dashed" />
</template>
```

## Vertical Divider

```vue
<template>
  <div style="display: flex; align-items: center;">
    <span>Left</span>
    <el-divider direction="vertical" />
    <span>Right</span>
  </div>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| direction | Divider direction | `'horizontal' \| 'vertical'` | `'horizontal'` |
| border-style | Style of divider | CSS border-style | `'solid'` |
| content-position | Position of content | `'left' \| 'right' \| 'center'` | `'center'` |

### Slots

| Name | Description |
|------|-------------|
| default | Customized content on divider |

## Best Practices

1. Use `direction="vertical"` for inline separators
2. Use `border-style="dashed"` for subtle dividers
3. Position content with `content-position`
