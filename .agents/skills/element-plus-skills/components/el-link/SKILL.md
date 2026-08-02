---
name: "el-link"
description: "Link component for text hyperlinks. Invoke when user needs to create text links, navigation links, or styled anchor elements."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Link Component

Link component provides text hyperlinks with various styles and icon support.

## When to Use

- Text navigation
- External links
- Inline links
- Icon links

## Basic Usage

```vue
<template>
  <el-link href="https://element-plus.org" target="_blank">default</el-link>
  <el-link type="primary">primary</el-link>
  <el-link type="success">success</el-link>
  <el-link type="warning">warning</el-link>
  <el-link type="danger">danger</el-link>
  <el-link type="info">info</el-link>
</template>
```

## Disabled

```vue
<template>
  <el-link disabled>disabled</el-link>
</template>
```

## Underline

```vue
<template>
  <el-link underline="always">Always Underlined</el-link>
  <el-link underline="hover">Underline on Hover</el-link>
  <el-link underline="never">Never Underlined</el-link>
</template>
```

## With Icon

```vue
<template>
  <el-link :icon="Link">Icon Link</el-link>
  <el-link>
    <el-icon class="el-icon--left"><Link /></el-icon>
    Icon on Left
  </el-link>
</template>

<script setup>
import { Link } from '@element-plus/icons-vue'
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| type | Type | `'primary' \| 'success' \| 'warning' \| 'danger' \| 'info' \| 'default'` | `'default'` |
| underline | When underlines appear | `'always' \| 'hover' \| 'never'` | `'hover'` |
| disabled | Whether disabled | `boolean` | `false` |
| href | Native href attribute | `string` | — |
| target | Native target attribute | `'_blank' \| '_parent' \| '_self' \| '_top'` | `'_self'` |
| icon | Icon component | `string \| Component` | — |

### Slots

| Name | Description |
|------|-------------|
| default | Customize default content |
| icon | Customize icon component |

## Best Practices

1. Validate URLs to prevent XSS vulnerabilities
2. Use `underline="hover"` for better UX
3. Use `target="_blank"` for external links
