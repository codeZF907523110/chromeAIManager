---
name: "el-watermark"
description: "Watermark component for adding text or pattern watermarks. Invoke when user needs to protect content, brand documents, or add copyright notices."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Watermark Component

Watermark adds specific text or patterns to the page.

## When to Use

- Content protection
- Branding
- Copyright notices
- Document security

## Basic Usage

```vue
<template>
  <el-watermark content="Element Plus">
    <div style="height: 500px">
      Content goes here
    </div>
  </el-watermark>
</template>
```

## Multi-line Watermark

```vue
<template>
  <el-watermark :content="['Element Plus', 'Vue 3']">
    <div style="height: 500px">
      Content goes here
    </div>
  </el-watermark>
</template>
```

## Image Watermark

```vue
<template>
  <el-watermark
    image="https://element-plus.org/images/element-plus-logo-small.svg"
    :width="130"
    :height="50"
  >
    <div style="height: 500px">
      Content goes here
    </div>
  </el-watermark>
</template>
```

## Custom Configuration

```vue
<template>
  <el-watermark
    content="Confidential"
    :font="font"
    :gap="[100, 100]"
    :rotate="-22"
  >
    <div style="height: 500px">
      Content goes here
    </div>
  </el-watermark>
</template>

<script setup>
const font = {
  color: 'rgba(0, 0, 0, 0.15)',
  fontSize: 16,
  fontWeight: 'normal',
  fontFamily: 'sans-serif'
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| width | Watermark width | `number` | `120` |
| height | Watermark height | `number` | `64` |
| rotate | Rotation angle (degrees) | `number` | `-22` |
| z-index | Z-index of watermark | `number` | `9` |
| image | Image source | `string` | — |
| content | Watermark text | `string \| string[]` | `'Element Plus'` |
| font | Text style | `Font` | — |
| gap | Spacing between watermarks | `[number, number]` | `[100, 100]` |
| offset | Offset from top-left | `[number, number]` | `[gap[0]/2, gap[1]/2]` |

### Font Configuration

| Name | Description | Type | Default |
|------|-------------|------|---------|
| color | Font color | `string` | `'rgba(0,0,0,.15)'` |
| fontSize | Font size | `number \| string` | `16` |
| fontWeight | Font weight | `'normal' \| 'bold' \| number` | `'normal'` |
| fontFamily | Font family | `string` | `'sans-serif'` |
| fontStyle | Font style | `'none' \| 'normal' \| 'italic' \| 'oblique'` | `'normal'` |
| textAlign | Text align | `'left' \| 'right' \| 'center' \| 'start' \| 'end'` | `'center'` |

### Slots

| Name | Description |
|------|-------------|
| default | Container for watermark |

## Best Practices

1. Use `image` for brand logos
2. Set appropriate `gap` for coverage
3. Use `font.color` with low opacity for subtlety
