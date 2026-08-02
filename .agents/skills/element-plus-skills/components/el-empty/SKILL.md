---
name: "el-empty"
description: "Empty component for placeholder hints in empty states. Invoke when user needs to display empty data states, no results found, or placeholder content."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Empty Component

Empty component provides placeholder hints for empty states with customizable images and content.

## When to Use

- Empty data states
- No search results
- Placeholder content
- Error states

## Basic Usage

```vue
<template>
  <el-empty />
</template>
```

## Custom Image

```vue
<template>
  <el-empty image="https://example.com/empty.png" />
</template>
```

## Image Size

```vue
<template>
  <el-empty :image-size="200" />
</template>
```

## Bottom Content

```vue
<template>
  <el-empty>
    <el-button type="primary">Button</el-button>
  </el-empty>
</template>
```

## Custom Description

```vue
<template>
  <el-empty description="No data found">
    <el-button type="primary">Add Data</el-button>
  </el-empty>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| image | Image URL | `string` | `''` |
| image-size | Image size (width) | `number` | — |
| description | Description text | `string` | `''` |

### Slots

| Name | Description |
|------|-------------|
| default | Content as bottom content |
| image | Content as image |
| description | Content as description |

## Common Patterns

### Empty Table State

```vue
<template>
  <el-table :data="tableData">
    <el-table-column prop="name" label="Name" />
    <template #empty>
      <el-empty description="No data available">
        <el-button type="primary" @click="fetchData">Refresh</el-button>
      </el-empty>
    </template>
  </el-table>
</template>
```

### Custom SVG Image

```vue
<template>
  <el-empty>
    <template #image>
      <svg viewBox="0 0 100 100">
        <!-- Custom SVG -->
      </svg>
    </template>
  </el-empty>
</template>
```

## Best Practices

1. Provide actionable buttons in empty states
2. Use descriptive messages
3. Customize image size based on context
