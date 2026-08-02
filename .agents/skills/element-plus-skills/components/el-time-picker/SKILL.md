---
name: "el-time-picker"
description: "TimePicker component for time input. Invoke when user needs to select time values, time ranges, or limit time selections."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# TimePicker Component

TimePicker allows users to select time values with optional range support.

## When to Use

- Time selection
- Time range selection
- Limited time options
- Scheduling

## Basic Usage

```vue
<template>
  <el-time-picker v-model="value" placeholder="Arbitrary time" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
</script>
```

## Time Range

```vue
<template>
  <el-time-picker
    v-model="value"
    is-range
    range-separator="To"
    start-placeholder="Start time"
    end-placeholder="End time"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref([])
</script>
```

## Arrow Control

```vue
<template>
  <el-time-picker
    v-model="value"
    arrow-control
    placeholder="Arbitrary time"
  />
</template>
```

## Limit Time Range

```vue
<template>
  <el-time-picker
    v-model="value"
    :disabled-hours="disabledHours"
    :disabled-minutes="disabledMinutes"
    :disabled-seconds="disabledSeconds"
    placeholder="Arbitrary time"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')

const disabledHours = () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].filter(x => x < 9 || x > 18)

const disabledMinutes = (hour) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59].filter(x => x > 30)

const disabledSeconds = () => []
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| Date \| number \| array` | — |
| readonly | Read only | `boolean` | `false` |
| disabled | Disabled | `boolean` | `false` |
| editable | Input editable | `boolean` | `true` |
| clearable | Show clear button | `boolean` | `true` |
| size | Size | `'large' \| 'default' \| 'small'` | — |
| placeholder | Placeholder | `string` | — |
| start-placeholder | Start placeholder | `string` | — |
| end-placeholder | End placeholder | `string` | — |
| is-range | Enable range mode | `boolean` | `false` |
| arrow-control | Use arrow buttons | `boolean` | `false` |
| format | Display format | `string` | `'HH:mm:ss'` |
| value-format | Value format | `string` | — |
| disabled-hours | Disabled hours | `(role, comparingDate?) => number[]` | — |
| disabled-minutes | Disabled minutes | `(hour, role, comparingDate?) => number[]` | — |
| disabled-seconds | Disabled seconds | `(hour, minute, role, comparingDate?) => number[]` | — |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Value changes | `(value) => void` |
| blur | Input blurs | `(e: FocusEvent) => void` |
| focus | Input focuses | `(e: FocusEvent) => void` |
| visible-change | Dropdown visibility changes | `(visibility: boolean) => void` |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| focus | Focus input | `() => void` |
| blur | Blur input | `() => void` |
| handleOpen | Open picker | `() => void` |
| handleClose | Close picker | `() => void` |

## Best Practices

1. Use `arrow-control` for precise selection
2. Use `disabled-hours/minutes/seconds` to limit options
3. Use `is-range` for time range selection
