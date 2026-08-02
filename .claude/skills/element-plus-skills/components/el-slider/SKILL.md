---
name: "el-slider"
description: "Slider component for dragging within a fixed range. Invoke when user needs to select numeric values within a range, set volume/brightness, or filter by price range."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Slider Component

Slider component allows users to drag a slider within a fixed range to select values.

## When to Use

- Numeric range selection
- Volume/brightness controls
- Price range filters
- Progress indicators

## Basic Usage

```vue
<template>
  <el-slider v-model="value" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref(50)
</script>
```

## Discrete Values

```vue
<template>
  <el-slider v-model="value" :step="10" show-stops />
</template>
```

## With Input Box

```vue
<template>
  <el-slider v-model="value" show-input />
</template>
```

## Range Selection

```vue
<template>
  <el-slider v-model="range" range :max="1000" />
</template>

<script setup>
import { ref } from 'vue'

const range = ref([100, 500])
</script>
```

## Vertical Mode

```vue
<template>
  <el-slider v-model="value" vertical height="200px" />
</template>
```

## Show Marks

```vue
<template>
  <el-slider v-model="value" :marks="marks" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref(30)
const marks = {
  0: '0°C',
  8: '8°C',
  37: '37°C',
  100: '100°C'
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `number \| number[]` | `0` |
| min | Minimum value | `number` | `0` |
| max | Maximum value | `number` | `100` |
| disabled | Whether disabled | `boolean` | `false` |
| step | Step size | `number \| 'mark'` | `1` |
| show-input | Show input box | `boolean` | `false` |
| show-input-controls | Show input controls | `boolean` | `true` |
| size | Size | `'' \| 'large' \| 'default' \| 'small'` | `'default'` |
| show-stops | Show breakpoints | `boolean` | `false` |
| show-tooltip | Show tooltip | `boolean` | `true` |
| range | Enable range mode | `boolean` | `false` |
| vertical | Vertical mode | `boolean` | `false` |
| height | Height (vertical mode) | `string` | — |
| marks | Marks | `SliderMarks` | — |
| placement | Tooltip position | Placement enum | `'top'` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers on value change | `(value: number \| number[]) => void` |
| input | Triggers during sliding | `(value: number \| number[]) => void` |

## Best Practices

1. Use `marks` for labeled intervals
2. Use `range` for min/max selection
3. Use `step="mark"` to restrict to mark values
