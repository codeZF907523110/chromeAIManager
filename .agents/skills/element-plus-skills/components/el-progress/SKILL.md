---
name: "el-progress"
description: "Progress component for showing operation progress and status. Invoke when user needs to display upload progress, task completion, or loading states."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Progress Component

Progress component shows the progress of current operations with linear, circle, or dashboard styles.

## When to Use

- Upload progress
- Task completion
- Loading states
- Status indicators

## Basic Usage

```vue
<template>
  <el-progress :percentage="50" />
</template>
```

## Internal Percentage

```vue
<template>
  <el-progress :percentage="70" :stroke-width="20" text-inside />
</template>
```

## Custom Color

```vue
<template>
  <el-progress :percentage="percentage" :color="customColor" />
</template>

<script setup>
import { ref } from 'vue'

const percentage = ref(70)
const customColor = '#409eff'
</script>
```

## Circular Progress

```vue
<template>
  <el-progress type="circle" :percentage="75" />
</template>
```

## Dashboard Progress

```vue
<template>
  <el-progress type="dashboard" :percentage="percentage">
    <template #default="{ percentage }">
      <span class="percentage-value">{{ percentage }}%</span>
    </template>
  </el-progress>
</template>
```

## Indeterminate Progress

```vue
<template>
  <el-progress :percentage="50" indeterminate :duration="3" />
</template>
```

## Striped Progress

```vue
<template>
  <el-progress :percentage="70" striped striped-flow />
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| percentage | Percentage (required) | `number (0-100)` | `0` |
| type | Type of progress bar | `'line' \| 'circle' \| 'dashboard'` | `'line'` |
| stroke-width | Width of progress bar | `number` | `6` |
| text-inside | Place percentage inside | `boolean` | `false` |
| status | Current status | `'success' \| 'exception' \| 'warning'` | — |
| indeterminate | Set indeterminate progress | `boolean` | `false` |
| duration | Animation duration | `number` | `3` |
| color | Background color | `string \| function \| array` | `''` |
| width | Canvas width (circle/dashboard) | `number` | `126` |
| show-text | Show percentage | `boolean` | `true` |
| stroke-linecap | Shape at end path | `'butt' \| 'round' \| 'square'` | `'round'` |
| format | Custom text format | `(percentage: number) => string` | — |
| striped | Stripe over progress | `boolean` | `false` |
| striped-flow | Animated stripes | `boolean` | `false` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| default | Customized content | `{ percentage: number }` |

## Best Practices

1. Use `type="circle"` for compact displays
2. Use `indeterminate` for unknown progress
3. Use `format` for custom text display
