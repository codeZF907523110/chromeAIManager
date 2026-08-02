---
name: "el-date-picker"
description: "DatePicker component for date input. Invoke when user needs to select dates, date ranges, months, years, or datetime values."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# DatePicker Component

DatePicker allows users to select dates, date ranges, months, years, or datetime values.

## When to Use

- Date selection
- Date range selection
- Month/year selection
- Datetime input

## Basic Usage

```vue
<template>
  <el-date-picker
    v-model="value"
    type="date"
    placeholder="Pick a day"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
</script>
```

## Date Range

```vue
<template>
  <el-date-picker
    v-model="value"
    type="daterange"
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

## With Shortcuts

```vue
<template>
  <el-date-picker
    v-model="value"
    type="date"
    placeholder="Pick a day"
    :shortcuts="shortcuts"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const shortcuts = [
  {
    text: 'Today',
    value: new Date()
  },
  {
    text: 'Yesterday',
    value: () => {
      const date = new Date()
      date.setTime(date.getTime() - 3600 * 1000 * 24)
      return date
    }
  },
  {
    text: 'A week ago',
    value: () => {
      const date = new Date()
      date.setTime(date.getTime() - 3600 * 1000 * 24 * 7)
      return date
    }
  }
]
</script>
```

## Date Formats

```vue
<template>
  <el-date-picker
    v-model="value"
    type="date"
    placeholder="Pick a day"
    format="YYYY/MM/DD"
    value-format="YYYY-MM-DD"
  />
</template>
```

## Disabled Dates

```vue
<template>
  <el-date-picker
    v-model="value"
    type="date"
    placeholder="Pick a day"
    :disabled-date="disabledDate"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')

const disabledDate = (time) => {
  return time.getTime() > Date.now()
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| Date \| number \| array` | — |
| type | Picker type | `'year' \| 'month' \| 'date' \| 'dates' \| 'datetime' \| 'week' \| 'datetimerange' \| 'daterange' \| 'monthrange'` | `'date'` |
| format | Display format | `string` | `'YYYY-MM-DD'` |
| value-format | Value format | `string` | — |
| readonly | Read only | `boolean` | `false` |
| disabled | Disabled | `boolean` | `false` |
| editable | Input editable | `boolean` | `true` |
| clearable | Show clear button | `boolean` | `true` |
| placeholder | Placeholder | `string` | — |
| start-placeholder | Start placeholder | `string` | — |
| end-placeholder | End placeholder | `string` | — |
| range-separator | Range separator | `string` | `'-'` |
| default-value | Default calendar date | `Date \| [Date, Date]` | — |
| disabled-date | Disabled date function | `(date: Date) => boolean` | — |
| shortcuts | Shortcut options | `Array<{ text: string, value: Date \| Function }>` | — |
| unlink-panels | Unlink range panels | `boolean` | `false` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Value changes | `(value) => void` |
| blur | Input blurs | `(e: FocusEvent) => void` |
| focus | Input focuses | `(e: FocusEvent) => void` |
| calendar-change | Calendar selection changes | `(val) => void` |
| visible-change | Dropdown visibility changes | `(visibility: boolean) => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Custom cell content |
| range-separator | Custom range separator |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| focus | Focus input | `() => void` |
| blur | Blur input | `() => void` |
| handleOpen | Open picker | `() => void` |
| handleClose | Close picker | `() => void` |

## Best Practices

1. Use `value-format` for string values
2. Use `shortcuts` for quick selections
3. Use `disabled-date` to restrict selections
