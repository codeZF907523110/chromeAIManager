---
name: "el-tag"
description: "Tag component for marking and selection. Invoke when user needs to display labels, categories, or removable tags for filtering and categorization."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Tag Component

Tag component is used for marking and selection with various styles and themes.

## When to Use

- Category labels
- Status tags
- Removable filters
- Selection markers

## Basic Usage

```vue
<template>
  <el-tag>Tag 1</el-tag>
  <el-tag type="success">Tag 2</el-tag>
  <el-tag type="info">Tag 3</el-tag>
  <el-tag type="warning">Tag 4</el-tag>
  <el-tag type="danger">Tag 5</el-tag>
</template>
```

## Removable Tag

```vue
<template>
  <el-tag
    v-for="tag in tags"
    :key="tag.name"
    closable
    @close="handleClose(tag)"
  >
    {{ tag.name }}
  </el-tag>
</template>

<script setup>
import { ref } from 'vue'

const tags = ref([
  { name: 'Tag 1' },
  { name: 'Tag 2' },
  { name: 'Tag 3' }
])

const handleClose = (tag) => {
  tags.value.splice(tags.value.indexOf(tag), 1)
}
</script>
```

## Sizes

```vue
<template>
  <el-tag size="large">Large</el-tag>
  <el-tag>Default</el-tag>
  <el-tag size="small">Small</el-tag>
</template>
```

## Theme

```vue
<template>
  <el-tag effect="dark">Dark</el-tag>
  <el-tag effect="light">Light</el-tag>
  <el-tag effect="plain">Plain</el-tag>
</template>
```

## Rounded

```vue
<template>
  <el-tag round>Round Tag</el-tag>
</template>
```

## Checkable Tag

```vue
<template>
  <el-check-tag :checked="checked" @change="onChange">Toggle Tag</el-check-tag>
</template>

<script setup>
import { ref } from 'vue'

const checked = ref(false)

const onChange = (value) => {
  checked.value = value
}
</script>
```

## API Reference

### Tag Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| type | Type of tag | `'primary' \| 'success' \| 'info' \| 'warning' \| 'danger'` | `'primary'` |
| closable | Whether removable | `boolean` | `false` |
| disable-transitions | Disable animations | `boolean` | `false` |
| hit | Highlighted border | `boolean` | `false` |
| color | Background color | `string` | — |
| size | Size | `'large' \| 'default' \| 'small'` | — |
| effect | Theme | `'dark' \| 'light' \| 'plain'` | `'light'` |
| round | Whether rounded | `boolean` | `false` |

### Tag Events

| Name | Description | Type |
|------|-------------|------|
| click | Triggers when clicked | `(evt: MouseEvent) => void` |
| close | Triggers when removed | `(evt: MouseEvent) => void` |

### CheckTag Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| checked / v-model:checked | Is checked | `boolean` | `false` |
| disabled | Whether disabled | `boolean` | `false` |
| type | Type of check tag | `'primary' \| 'success' \| 'info' \| 'warning' \| 'danger'` | `'primary'` |

### CheckTag Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when clicked | `(value: boolean) => void` |

## Best Practices

1. Use `closable` for removable tags
2. Use `effect` for different visual styles
3. Use `el-check-tag` for selectable tags
