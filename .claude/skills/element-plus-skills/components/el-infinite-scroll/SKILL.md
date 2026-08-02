---
name: "el-infinite-scroll"
description: "InfiniteScroll directive for loading more data when scrolling to bottom. Invoke when user needs to implement infinite scrolling, lazy loading, or pagination on scroll."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# InfiniteScroll Directive

InfiniteScroll loads more data when reaching the bottom of the page.

## When to Use

- Infinite scrolling lists
- Lazy loading content
- Pagination on scroll
- Feed-style layouts

## Basic Usage

```vue
<template>
  <ul v-infinite-scroll="load" class="infinite-list">
    <li v-for="i in count" :key="i" class="infinite-list-item">
      {{ i }}
    </li>
  </ul>
</template>

<script setup>
import { ref } from 'vue'

const count = ref(0)

const load = () => {
  count.value += 2
}
</script>
```

## Disabled Loading

```vue
<template>
  <ul
    v-infinite-scroll="load"
    :infinite-scroll-disabled="disabled"
    class="infinite-list"
  >
    <li v-for="i in count" :key="i">{{ i }}</li>
  </ul>
</template>

<script setup>
import { ref } from 'vue'

const count = ref(0)
const disabled = ref(false)

const load = () => {
  if (count.value >= 20) {
    disabled.value = true
    return
  }
  count.value += 2
}
</script>
```

## API Reference

### Directive Options

| Name | Description | Type | Default |
|------|-------------|------|---------|
| v-infinite-scroll | Load method | `Function` | — |
| infinite-scroll-disabled | Disable loading | `boolean` | `false` |
| infinite-scroll-delay | Throttle delay (ms) | `number` | `200` |
| infinite-scroll-distance | Trigger distance (px) | `number` | `0` |
| infinite-scroll-immediate | Execute immediately | `boolean` | `true` |

## Best Practices

1. Use `infinite-scroll-disabled` to stop loading when no more data
2. Set appropriate `infinite-scroll-distance` for better UX
3. Use with Scrollbar component for better performance
