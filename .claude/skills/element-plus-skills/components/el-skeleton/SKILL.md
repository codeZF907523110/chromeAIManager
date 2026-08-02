---
name: "el-skeleton"
description: "Skeleton component for loading placeholders. Invoke when user needs to display loading states, content placeholders, or improve perceived loading performance."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Skeleton Component

Skeleton component provides loading placeholders for better user experience during data loading.

## When to Use

- Loading states
- Content placeholders
- Improving perceived performance
- Async data loading

## Basic Usage

```vue
<template>
  <el-skeleton />
</template>
```

## Configurable Rows

```vue
<template>
  <el-skeleton :rows="5" animated />
</template>
```

## Animation

```vue
<template>
  <el-skeleton animated />
</template>
```

## Customized Template

```vue
<template>
  <el-skeleton animated>
    <template #template>
      <el-skeleton-item variant="image" style="width: 240px; height: 240px" />
      <div style="padding: 14px">
        <el-skeleton-item variant="h3" style="width: 50%" />
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px;">
          <el-skeleton-item variant="text" style="width: 30%" />
          <el-skeleton-item variant="text" style="width: 30%" />
        </div>
      </div>
    </template>
  </el-skeleton>
</template>
```

## Loading State

```vue
<template>
  <el-skeleton :loading="loading" animated>
    <template #default>
      <div class="content">Real content here</div>
    </template>
  </el-skeleton>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const loading = ref(true)

onMounted(() => {
  setTimeout(() => {
    loading.value = false
  }, 2000)
})
</script>
```

## Avoiding Rendering Bouncing

```vue
<template>
  <el-skeleton :loading="loading" :throttle="500" animated>
    <template #default>
      <div>Content</div>
    </template>
  </el-skeleton>
</template>
```

## API Reference

### Skeleton Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| animated | Show animation | `boolean` | `false` |
| count | Number of fake items | `number` | `1` |
| loading | Show real DOM | `boolean` | `false` |
| rows | Number of rows | `number` | `3` |
| throttle | Rendering delay (ms) | `number \| object` | `0` |

### Skeleton Slots

| Name | Description | Type |
|------|-------------|------|
| default | Real rendering DOM | `$attrs` |
| template | Skeleton template | `{ key: number }` |

### SkeletonItem Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| variant | Skeleton type | `'p' \| 'text' \| 'h1' \| 'h3' \| 'caption' \| 'button' \| 'image' \| 'circle' \| 'rect'` | `'text'` |

## Best Practices

1. Use `throttle` to prevent flashing on fast loads
2. Match skeleton structure to real content
3. Use `animated` for better UX
