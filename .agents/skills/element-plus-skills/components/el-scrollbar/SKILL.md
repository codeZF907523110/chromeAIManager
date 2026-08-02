---
name: "el-scrollbar"
description: "Scrollbar component for custom scrollbars. Invoke when user needs to replace native scrollbars, create custom scroll areas, or implement infinite scrolling."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Scrollbar Component

Scrollbar replaces native browser scrollbars with customizable alternatives.

## When to Use

- Custom scrollbar styling
- Scrollable containers
- Infinite scrolling
- Custom scroll areas

## Basic Usage

```vue
<template>
  <el-scrollbar height="400px">
    <p v-for="item in 20" :key="item">{{ item }}</p>
  </el-scrollbar>
</template>
```

## Horizontal Scroll

```vue
<template>
  <el-scrollbar>
    <div style="display: flex; width: 1000px;">
      <div v-for="item in 20" :key="item" style="width: 100px;">{{ item }}</div>
    </div>
  </el-scrollbar>
</template>
```

## Max Height

```vue
<template>
  <el-scrollbar max-height="400px">
    <p v-for="item in 50" :key="item">{{ item }}</p>
  </el-scrollbar>
</template>
```

## Manual Scroll

```vue
<template>
  <el-scrollbar ref="scrollbarRef" height="400px">
    <p v-for="item in 100" :key="item">{{ item }}</p>
  </el-scrollbar>
  <el-button @click="scrollToTop">Scroll to Top</el-button>
</template>

<script setup>
import { ref } from 'vue'

const scrollbarRef = ref()

const scrollToTop = () => {
  scrollbarRef.value.setScrollTop(0)
}
</script>
```

## Infinite Scroll

```vue
<template>
  <el-scrollbar height="400px" @end-reached="loadMore">
    <p v-for="item in items" :key="item">{{ item }}</p>
  </el-scrollbar>
</template>

<script setup>
import { ref } from 'vue'

const items = ref(Array.from({ length: 20 }, (_, i) => i + 1))

const loadMore = (direction) => {
  if (direction === 'bottom') {
    const newItems = Array.from({ length: 10 }, (_, i) => items.value.length + i + 1)
    items.value.push(...newItems)
  }
}
</script>
```

## Always Visible

```vue
<template>
  <el-scrollbar height="400px" always>
    <p v-for="item in 50" :key="item">{{ item }}</p>
  </el-scrollbar>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| height | Scrollbar height | `string \| number` | — |
| max-height | Max height | `string \| number` | — |
| native | Use native scrollbar | `boolean` | `false` |
| wrap-style | Wrap container style | `string \| CSSProperties` | — |
| wrap-class | Wrap container class | `string` | — |
| view-style | View style | `string \| CSSProperties` | — |
| view-class | View class | `string` | — |
| noresize | Ignore container size changes | `boolean` | `false` |
| tag | View element tag | `string` | `'div'` |
| always | Always show scrollbar | `boolean` | `false` |
| min-size | Minimum scrollbar size | `number` | `20` |
| distance | Distance to trigger end-reached | `number` | `0` |

### Events

| Name | Description | Type |
|------|-------------|------|
| scroll | Triggers on scroll | `({ scrollLeft, scrollTop }) => void` |
| end-reached | Triggers at scroll end | `(direction: 'top' \| 'bottom' \| 'left' \| 'right') => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Scrollable content |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| scrollTo | Scroll to position | `(options: ScrollToOptions \| number, yCoord?: number) => void` |
| setScrollTop | Set scroll top | `(scrollTop: number) => void` |
| setScrollLeft | Set scroll left | `(scrollLeft: number) => void` |
| update | Update scrollbar state | `() => void` |
| wrapRef | Wrap element ref | `Ref<HTMLDivElement>` |

## Best Practices

1. Use `height` for fixed-height containers
2. Use `max-height` for flexible containers
3. Use `always` for better visibility on touch devices
4. Use `end-reached` for infinite scrolling
