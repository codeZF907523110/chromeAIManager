---
name: "el-date-picker-panel"
description: "DatePickerPanel is the core panel component of DatePicker for custom date selection UI. Invoke when user needs to build custom date picker interfaces without the dropdown wrapper."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# DatePickerPanel Component

DatePickerPanel is the core component of DatePicker for building custom date selection interfaces.

## When to Use

- Custom date picker UI
- Embedded date selection
- Calendar widgets
- Custom dropdown implementations

## Basic Usage

```vue
<template>
  <el-date-picker-panel v-model="date" />
</template>

<script setup>
import { ref } from 'vue'

const date = ref('')
</script>
```

## Types

```vue
<template>
  <el-date-picker-panel v-model="date" type="date" />
  <el-date-picker-panel v-model="month" type="month" />
  <el-date-picker-panel v-model="year" type="year" />
  <el-date-picker-panel v-model="datetime" type="datetime" />
  <el-date-picker-panel v-model="daterange" type="daterange" />
</template>
```

## Without Border

```vue
<template>
  <el-date-picker-panel v-model="date" :border="false" />
</template>
```

## Disabled

```vue
<template>
  <el-date-picker-panel v-model="date" disabled />
</template>
```

## With Shortcuts

```vue
<template>
  <el-date-picker-panel
    v-model="date"
    :shortcuts="shortcuts"
  />
</template>

<script setup>
import { ref } from 'vue'

const date = ref('')
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
  }
]
</script>
```

## Disabled Dates

```vue
<template>
  <el-date-picker-panel
    v-model="date"
    :disabled-date="disabledDate"
  />
</template>

<script setup>
import { ref } from 'vue'

const date = ref('')

const disabledDate = (time) => {
  return time.getTime() > Date.now()
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `number \| string \| Date \| array` | `''` |
| border | Show border | `boolean` | `true` |
| disabled | Disabled | `boolean` | `false` |
| clearable | Show clear button | `boolean` | `true` |
| editable | Input editable | `boolean` | `true` |
| type | Picker type | `'year' \| 'years' \| 'month' \| 'months' \| 'date' \| 'dates' \| 'datetime' \| 'week' \| 'datetimerange' \| 'daterange' \| 'monthrange' \| 'yearrange'` | `'date'` |
| default-value | Default calendar date | `Date \| [Date, Date]` | — |
| default-time | Default time for range | `Date \| [Date, Date]` | — |
| value-format | Value format | `string` | — |
| date-format | Date display format | `string` | `'YYYY-MM-DD'` |
| time-format | Time display format | `string` | `'HH:mm:ss'` |
| unlink-panels | Unlink range panels | `boolean` | `false` |
| disabled-date | Disabled date function | `(date) => boolean` | — |
| shortcuts | Shortcut options | `Array<{ text, value }>` | `[]` |
| cell-class-name | Custom cell class | `(date) => string` | — |
| show-footer | Show footer | `boolean` | `false` |
| show-confirm | Show confirm button | `boolean` | `false` |
| show-week-number | Show week number | `boolean` | `false` |

### Events

| Name | Description | Type |
|------|-------------|------|
| calendar-change | Calendar selection changes | `(val) => void` |
| panel-change | Navigation button click | `(date, mode, view) => void` |
| clear | Clear button clicked | `() => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Custom cell content |
| prev-month | Previous month icon |
| next-month | Next month icon |
| prev-year | Previous year icon |
| next-year | Next year icon |

## Best Practices

1. Use for custom date picker implementations
2. Combine with Popover for dropdown behavior
3. Use `shortcuts` for quick selections
