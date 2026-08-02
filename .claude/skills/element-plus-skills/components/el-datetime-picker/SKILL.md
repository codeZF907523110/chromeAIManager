---
name: "el-datetime-picker"
description: "DateTimePicker component for selecting date and time together. Invoke when user needs to select both date and time in a single picker."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# DateTimePicker Component

DateTimePicker allows selecting date and time in one picker.

## When to Use

- Datetime selection
- Datetime range selection
- Scheduling
- Event creation

## Basic Usage

```vue
<template>
  <el-date-picker
    v-model="value"
    type="datetime"
    placeholder="Select date and time"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
</script>
```

## DateTime Range

```vue
<template>
  <el-date-picker
    v-model="value"
    type="datetimerange"
    range-separator="To"
    start-placeholder="Start date"
    end-placeholder="End date"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref([])
</script>
```

## With Default Time

```vue
<template>
  <el-date-picker
    v-model="value"
    type="datetimerange"
    :default-time="defaultTime"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref([])
const defaultTime = [
  new Date(2000, 1, 1, 0, 0, 0),
  new Date(2000, 1, 1, 23, 59, 59)
]
</script>
```

## Date Formats

```vue
<template>
  <el-date-picker
    v-model="value"
    type="datetime"
    format="YYYY/MM/DD HH:mm:ss"
    value-format="YYYY-MM-DD HH:mm:ss"
  />
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| Date \| number \| array` | — |
| type | Picker type | `'datetime' \| 'datetimerange'` | `'datetime'` |
| format | Display format | `string` | `'YYYY-MM-DD HH:mm:ss'` |
| value-format | Value format | `string` | — |
| default-time | Default time values | `Date \| [Date, Date]` | — |
| date-format | Panel date format | `string` | `'YYYY-MM-DD'` |
| time-format | Panel time format | `string` | `'HH:mm:ss'` |
| arrow-control | Use arrow buttons | `boolean` | `false` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Value changes | `(value) => void` |
| blur | Input blurs | `(e: FocusEvent) => void` |
| focus | Input focuses | `(e: FocusEvent) => void` |
| calendar-change | Calendar selection changes | `(val) => void` |
| visible-change | Dropdown visibility changes | `(visibility: boolean) => void` |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| focus | Focus input | `() => void` |
| blur | Blur input | `() => void` |

## Best Practices

1. Use `default-time` for consistent time values
2. Use `value-format` for string values
3. Use `arrow-control` for precise time selection
