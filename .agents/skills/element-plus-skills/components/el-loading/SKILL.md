---
name: "el-loading"
description: "Loading component for showing animation while loading data. Invoke when user needs to display loading states, async operation feedback, or data fetching indicators."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Loading Component

Loading component shows animation while loading data via directive or service.

## When to Use

- Data loading states
- Async operation feedback
- Form submission
- Page transitions

## Directive Usage

```vue
<template>
  <el-table v-loading="loading" :data="tableData">
    <el-table-column prop="name" label="Name" />
  </el-table>
</template>

<script setup>
import { ref } from 'vue'

const loading = ref(true)
const tableData = ref([])
</script>
```

## Customization

```vue
<template>
  <div
    v-loading="loading"
    element-loading-text="Loading..."
    element-loading-spinner="el-icon-loading"
    element-loading-background="rgba(0, 0, 0, 0.8)"
  >
    Content
  </div>
</template>
```

## Full Screen

```vue
<template>
  <el-button @click="openLoading">Show Full Screen Loading</el-button>
</template>

<script setup>
import { ElLoading } from 'element-plus'

const openLoading = () => {
  const loading = ElLoading.service({
    lock: true,
    text: 'Loading...',
    background: 'rgba(0, 0, 0, 0.7)'
  })
  setTimeout(() => loading.close(), 2000)
}
</script>
```

## Service Usage

```vue
<script setup>
import { ElLoading } from 'element-plus'

const showLoading = () => {
  const instance = ElLoading.service({
    target: '.container',
    text: 'Loading...',
    spinner: 'el-icon-loading',
    background: 'rgba(255, 255, 255, 0.7)'
  })
  
  return instance
}
</script>
```

## API Reference

### Options

| Name | Description | Type | Default |
|------|-------------|------|---------|
| target | DOM node to cover | `string \| HTMLElement` | `document.body` |
| body | Append to body | `boolean` | `false` |
| fullscreen | Full screen mode | `boolean` | `true` |
| lock | Lock scrolling | `boolean` | `false` |
| text | Loading text | `string \| VNode` | — |
| spinner | Custom spinner class | `string` | — |
| background | Background color | `string` | — |
| customClass | Custom class | `string` | — |
| svg | Custom SVG | `string` | — |
| svgViewBox | SVG viewBox | `string` | — |

### Directives

| Name | Description | Type |
|------|-------------|------|
| v-loading | Show loading | `boolean \| LoadingOptions` |
| element-loading-text | Loading text | `string` |
| element-loading-spinner | Spinner icon | `string` |
| element-loading-background | Background color | `string` |

## Best Practices

1. Use `v-loading` directive for component-level loading
2. Use `ElLoading.service` for programmatic control
3. Set `lock` to prevent scrolling during loading
