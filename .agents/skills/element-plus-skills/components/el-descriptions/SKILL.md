---
name: "el-descriptions"
description: "Descriptions component for displaying multiple fields in list form. Invoke when user needs to display detailed information, product specifications, or profile data."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Descriptions Component

Descriptions component displays multiple fields in list form, suitable for detail pages and information displays.

## When to Use

- Product detail pages
- User profile displays
- Information summaries
- Specification lists

## Basic Usage

```vue
<template>
  <el-descriptions title="User Info">
    <el-descriptions-item label="Username">kooriookami</el-descriptions-item>
    <el-descriptions-item label="Telephone">18100000000</el-descriptions-item>
    <el-descriptions-item label="Place">Suzhou</el-descriptions-item>
    <el-descriptions-item label="Remarks">
      <el-tag size="small">School</el-tag>
    </el-descriptions-item>
  </el-descriptions>
</template>
```

## Sizes

```vue
<template>
  <el-descriptions title="Large" size="large">
    <el-descriptions-item label="Username">kooriookami</el-descriptions-item>
  </el-descriptions>
  
  <el-descriptions title="Default">
    <el-descriptions-item label="Username">kooriookami</el-descriptions-item>
  </el-descriptions>
  
  <el-descriptions title="Small" size="small">
    <el-descriptions-item label="Username">kooriookami</el-descriptions-item>
  </el-descriptions>
</template>
```

## Vertical List

```vue
<template>
  <el-descriptions direction="vertical" border>
    <el-descriptions-item label="Username">kooriookami</el-descriptions-item>
    <el-descriptions-item label="Telephone">18100000000</el-descriptions-item>
    <el-descriptions-item label="Place">Suzhou</el-descriptions-item>
  </el-descriptions>
</template>
```

## With Border

```vue
<template>
  <el-descriptions border>
    <el-descriptions-item label="Username">kooriookami</el-descriptions-item>
    <el-descriptions-item label="Telephone">18100000000</el-descriptions-item>
  </el-descriptions>
</template>
```

## Rowspan

```vue
<template>
  <el-descriptions border direction="vertical">
    <el-descriptions-item label="Username">kooriookami</el-descriptions-item>
    <el-descriptions-item label="Telephone" :rowspan="2">18100000000</el-descriptions-item>
    <el-descriptions-item label="Place">Suzhou</el-descriptions-item>
    <el-descriptions-item label="Address">No.1188, Wuzhong Avenue</el-descriptions-item>
  </el-descriptions>
</template>
```

## API Reference

### Descriptions Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| border | With or without border | `boolean` | `false` |
| column | Number of items in one line | `number` | `3` |
| direction | Direction of list | `'vertical' \| 'horizontal'` | `'horizontal'` |
| size | Size of list | `'' \| 'large' \| 'default' \| 'small'` | — |
| title | Title text | `string` | `''` |
| extra | Extra text on top right | `string` | `''` |
| label-width | Label width of every column | `string \| number` | — |

### Descriptions Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | Customize default content | Descriptions Item |
| title | Custom title | — |
| extra | Custom extra area | — |

### DescriptionsItem Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| label | Label text | `string` | `''` |
| span | Colspan of column | `number` | `1` |
| rowspan | Number of rows to span | `number` | `1` |
| width | Column width | `string \| number` | `''` |
| min-width | Column minimum width | `string \| number` | `''` |
| label-width | Column label width | `string \| number` | — |
| align | Column content alignment | `'left' \| 'center' \| 'right'` | `'left'` |
| label-align | Column label alignment | `'left' \| 'center' \| 'right'` | — |
| class-name | Column content class | `string` | `''` |
| label-class-name | Column label class | `string` | `''` |

## Best Practices

1. Use `border` for better visual separation
2. Use `direction="vertical"` for compact displays
3. Use `span` and `rowspan` for complex layouts
