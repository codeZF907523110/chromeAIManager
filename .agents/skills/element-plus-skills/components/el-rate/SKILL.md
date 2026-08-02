---
name: "el-rate"
description: "Rate component for rating functionality. Invoke when user needs to collect user ratings, display star ratings, or allow feedback scoring."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Rate Component

Rate component is used for rating with customizable icons and levels.

## When to Use

- User ratings
- Product reviews
- Feedback scoring
- Star ratings

## Basic Usage

```vue
<template>
  <el-rate v-model="value" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref(0)
</script>
```

## With Half Stars

```vue
<template>
  <el-rate v-model="value" allow-half />
</template>
```

## With Text

```vue
<template>
  <el-rate
    v-model="value"
    show-text
    :texts="['Bad', 'Poor', 'Fair', 'Good', 'Excellent']"
  />
</template>
```

## Clearable

```vue
<template>
  <el-rate v-model="value" clearable />
</template>
```

## Custom Icons

```vue
<template>
  <el-rate
    v-model="value"
    :icons="[StarFilled, StarFilled, StarFilled]"
    :void-icon="Star"
  />
</template>

<script setup>
import { StarFilled, Star } from '@element-plus/icons-vue'
</script>
```

## Read-only

```vue
<template>
  <el-rate
    v-model="value"
    disabled
    show-score
    score-template="{value} points"
  />
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `number` | `0` |
| max | Max rating score | `number` | `5` |
| size | Size | `'large' \| 'default' \| 'small'` | — |
| disabled | Read-only | `boolean` | `false` |
| allow-half | Allow half stars | `boolean` | `false` |
| low-threshold | Low/medium threshold | `number` | `2` |
| high-threshold | Medium/high threshold | `number` | `4` |
| colors | Colors for levels | `string[] \| Record<number, string>` | — |
| void-color | Color of unselected | `string` | `'#c6d1de'` |
| icons | Icon components | `string[] \| Component[]` | — |
| void-icon | Unselected icon | `string \| Component` | — |
| show-text | Display texts | `boolean` | `false` |
| show-score | Display score | `boolean` | `false` |
| text-color | Text color | `string` | `''` |
| texts | Text array | `string[]` | — |
| score-template | Score template | `string` | `'{value}'` |
| clearable | Can reset to 0 | `boolean` | `false` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when value changes | `(value: number) => void` |

## Best Practices

1. Use `allow-half` for precise ratings
2. Use `show-score` for read-only displays
3. Use `clearable` to allow resetting
