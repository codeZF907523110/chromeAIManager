---
name: "el-statistic"
description: "Statistic component for displaying numerical statistics. Invoke when user needs to display counts, amounts, rankings, or countdown timers."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Statistic Component

Statistic displays numerical values with optional formatting and countdown support.

## When to Use

- Dashboard statistics
- Count displays
- Amount displays
- Countdown timers

## Basic Usage

```vue
<template>
  <el-statistic title="Total Users" :value="268500" />
</template>
```

## With Prefix/Suffix

```vue
<template>
  <el-statistic title="Revenue" :value="100000" prefix="$" suffix="USD" />
</template>
```

## Formatting

```vue
<template>
  <el-statistic
    title="Formatted Number"
    :value="1234567.89"
    :precision="2"
    group-separator=","
    decimal-separator="."
  />
</template>
```

## Custom Formatter

```vue
<template>
  <el-statistic
    title="Custom Format"
    :value="1234567"
    :formatter="formatter"
  />
</template>

<script setup>
const formatter = (value) => {
  return value.toLocaleString('en-US')
}
</script>
```

## Countdown

```vue
<template>
  <el-countdown
    title="Countdown"
    :value="deadline"
    @finish="handleFinish"
  />
</template>

<script setup>
import { ref } from 'vue'

const deadline = ref(Date.now() + 1000 * 60 * 60 * 24)

const handleFinish = () => {
  console.log('Countdown finished')
}
</script>
```

## Countdown Format

```vue
<template>
  <el-countdown
    title="Custom Format"
    :value="deadline"
    format="DD days HH:mm:ss"
  />
</template>
```

## API Reference

### Statistic Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| value | Numeric value | `number` | `0` |
| title | Title | `string` | — |
| prefix | Prefix | `string` | — |
| suffix | Suffix | `string` | — |
| precision | Decimal precision | `number` | `0` |
| decimal-separator | Decimal separator | `string` | `'.'` |
| group-separator | Thousand separator | `string` | `','` |
| formatter | Custom formatter | `(value: number) => string \| number` | — |
| value-style | Value style | `CSSProperties` | — |

### Statistic Slots

| Name | Description |
|------|-------------|
| title | Custom title |
| prefix | Custom prefix |
| suffix | Custom suffix |

### Countdown Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| value | Target time | `number \| Dayjs` | — |
| title | Title | `string` | — |
| prefix | Prefix | `string` | — |
| suffix | Suffix | `string` | — |
| format | Display format | `string` | `'HH:mm:ss'` |
| value-style | Value style | `CSSProperties` | — |

### Countdown Events

| Name | Description | Type |
|------|-------------|------|
| change | Time difference changes | `(value: number) => void` |
| finish | Countdown ends | `() => void` |

### Countdown Slots

| Name | Description |
|------|-------------|
| title | Custom title |
| prefix | Custom prefix |
| suffix | Custom suffix |

## Best Practices

1. Use `precision` for decimal values
2. Use `group-separator` for large numbers
3. Use Countdown for time-sensitive displays
