---
name: "el-page-header"
description: "PageHeader component for page navigation headers. Invoke when user needs to create page headers with back navigation, breadcrumbs, or title sections."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# PageHeader Component

PageHeader provides a header section with back navigation and content areas.

## When to Use

- Page headers
- Back navigation
- Breadcrumb integration
- Page title sections

## Basic Usage

```vue
<template>
  <el-page-header @back="goBack">
    <template #content>
      <span class="text-large font-600 mr-3"> Title </span>
    </template>
  </el-page-header>
</template>

<script setup>
const goBack = () => {
  console.log('Go back')
}
</script>
```

## Complete Example

```vue
<template>
  <el-page-header @back="goBack">
    <template #breadcrumb>
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/' }">Home</el-breadcrumb-item>
        <el-breadcrumb-item>Detail</el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <template #content>
      <span class="text-large font-600 mr-3"> Title </span>
    </template>
    <template #extra>
      <el-button type="primary">Action</el-button>
    </template>
    <template #default>
      <p>Description content</p>
    </template>
  </el-page-header>
</template>
```

## Custom Icon

```vue
<template>
  <el-page-header :icon="ArrowLeft" @back="goBack">
    <template #content>
      <span>Custom Icon</span>
    </template>
  </el-page-header>
</template>

<script setup>
import { ArrowLeft } from '@element-plus/icons-vue'
</script>
```

## No Icon

```vue
<template>
  <el-page-header icon="" @back="goBack">
    <template #content>
      <span>No Icon</span>
    </template>
  </el-page-header>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| icon | Icon component | `string \| Component` | `Back` |
| title | Main title | `string` | `''` |
| content | Content text | `string` | `''` |

### Events

| Name | Description | Type |
|------|-------------|------|
| back | Back button clicked | `() => void` |

### Slots

| Name | Description |
|------|-------------|
| icon | Custom icon |
| title | Custom title |
| content | Custom content |
| extra | Extra section |
| breadcrumb | Breadcrumb section |
| default | Main content |

## Best Practices

1. Use `breadcrumb` slot for navigation paths
2. Use `extra` slot for action buttons
3. Use `default` slot for page content
