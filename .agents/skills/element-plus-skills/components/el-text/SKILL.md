---
name: "el-text"
description: "Text component for text display with styling options. Invoke when user needs to display styled text, truncated text, or text with semantic types."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Text Component

Text component provides styled text display with various options.

## When to Use

- Styled text display
- Truncated text
- Semantic text types
- Text with sizes

## Basic Usage

```vue
<template>
  <el-text>Default text</el-text>
  <el-text type="primary">Primary text</el-text>
  <el-text type="success">Success text</el-text>
  <el-text type="warning">Warning text</el-text>
  <el-text type="danger">Danger text</el-text>
  <el-text type="info">Info text</el-text>
</template>
```

## Sizes

```vue
<template>
  <el-text size="large">Large text</el-text>
  <el-text>Default text</el-text>
  <el-text size="small">Small text</el-text>
</template>
```

## Truncated

```vue
<template>
  <el-text truncated>
    This is a very long text that will be truncated with ellipsis when it exceeds the container width
  </el-text>
</template>
```

## Line Clamp

```vue
<template>
  <el-text :line-clamp="2">
    This is a very long text that will be clamped to 2 lines with ellipsis when it exceeds the container width. This is a very long text that will be clamped to 2 lines with ellipsis when it exceeds the container width.
  </el-text>
</template>
```

## Override Tag

```vue
<template>
  <el-text tag="p">Paragraph text</el-text>
  <el-text tag="div">Div text</el-text>
</template>
```

## Mixed

```vue
<template>
  <el-text>
    Normal text with
    <el-text type="primary">primary</el-text>
    and
    <el-text type="danger">danger</el-text>
    inline
  </el-text>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| type | Text type | `'primary' \| 'success' \| 'warning' \| 'danger' \| 'info'` | — |
| size | Text size | `'large' \| 'default' \| 'small'` | `'default'` |
| truncated | Render ellipsis | `boolean` | `false` |
| line-clamp | Maximum lines | `string \| number` | — |
| tag | Custom element tag | `string` | `'span'` |

### Slots

| Name | Description |
|------|-------------|
| default | Default content |

## Best Practices

1. Use `truncated` for single-line ellipsis
2. Use `line-clamp` for multi-line ellipsis
3. Use `tag` for semantic HTML
