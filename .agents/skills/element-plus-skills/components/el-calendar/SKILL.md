---
name: "el-calendar"
description: "Calendar component for displaying dates. Invoke when user needs to display a calendar view, select dates, or show scheduled events."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Calendar Component

Calendar component displays dates with customizable content and range.

## When to Use

- Date selection
- Event calendars
- Schedule displays
- Date range views

## Basic Usage

```vue
<template>
  <el-calendar v-model="date" />
</template>

<script setup>
import { ref } from 'vue'

const date = ref(new Date())
</script>
```

## Custom Content

```vue
<template>
  <el-calendar v-model="date">
    <template #dateCell="{ data }">
      <p>{{ data.day.split('-')[2] }}</p>
    </template>
  </el-calendar>
</template>
```

## Range

```vue
<template>
  <el-calendar :range="[startDate, endDate]" />
</template>

<script setup>
const startDate = new Date(2024, 0, 1)
const endDate = new Date(2024, 1, 28)
</script>
```

## Custom Header

```vue
<template>
  <el-calendar v-model="date">
    <template #header="{ date }">
      <span>{{ date }}</span>
    </template>
  </el-calendar>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `Date` | — |
| range | Time range | `[Date, Date]` | — |
| controller-type | Controller type | `'button' \| 'select'` | `'button'` |
| formatter | Format label | `(value, type) => string \| number` | — |

### Slots

| Name | Description | Type |
|------|-------------|------|
| date-cell | Custom date cell | `{ data: { type, isSelected, day, date } }` |
| header | Custom header | `{ date: string }` |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| selectedDay | Currently selected date | `ComputedRef<Dayjs>` |
| pickDay | Select a specific date | `(day) => void` |
| selectDate | Select date | `(type) => void` |

## Best Practices

1. Use `date-cell` slot for custom content
2. Use `range` for limited date views
3. Customize header for branding
