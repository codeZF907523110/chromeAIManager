---
name: "el-breadcrumb"
description: "Breadcrumb component for displaying the location of the current page. Invoke when user needs to show navigation paths, page hierarchy, or enable easier browsing back."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Breadcrumb Component

Breadcrumb component displays the location of the current page, making it easier to browse back through navigation hierarchy.

## When to Use

- Page navigation paths
- Category hierarchies
- Document structures
- Multi-level navigation

## Basic Usage

```vue
<template>
  <el-breadcrumb separator="/">
    <el-breadcrumb-item :to="{ path: '/' }">homepage</el-breadcrumb-item>
    <el-breadcrumb-item><a href="/">promotion management</a></el-breadcrumb-item>
    <el-breadcrumb-item>promotion list</el-breadcrumb-item>
    <el-breadcrumb-item>promotion detail</el-breadcrumb-item>
  </el-breadcrumb>
</template>
```

## Icon Separator

```vue
<template>
  <el-breadcrumb :separator-icon="ArrowRight">
    <el-breadcrumb-item :to="{ path: '/' }">homepage</el-breadcrumb-item>
    <el-breadcrumb-item>promotion management</el-breadcrumb-item>
    <el-breadcrumb-item>promotion list</el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup>
import { ArrowRight } from '@element-plus/icons-vue'
</script>
```

## API Reference

### Breadcrumb Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| separator | Separator character | `string` | `'/'` |
| separator-icon | Icon component for separator | `string \| Component` | — |

### Breadcrumb Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | Customize default content | Breadcrumb Item |

### BreadcrumbItem Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| to | Target route, same as vue-router `to` | `string \| RouteLocationRaw` | `''` |
| replace | If true, navigation won't leave history record | `boolean` | `false` |

### BreadcrumbItem Slots

| Name | Description |
|------|-------------|
| default | Customize default content |

## Common Patterns

### Dynamic Breadcrumb

```vue
<template>
  <el-breadcrumb separator="/">
    <el-breadcrumb-item v-for="item in breadcrumbs" :key="item.path" :to="item.path">
      {{ item.title }}
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const breadcrumbs = computed(() => {
  return route.matched.filter(r => r.meta?.title).map(r => ({
    path: r.path,
    title: r.meta.title
  }))
})
</script>
```

## Best Practices

1. Use `to` prop for vue-router integration
2. Use `separator-icon` for custom separators
3. Keep breadcrumb paths concise and meaningful
