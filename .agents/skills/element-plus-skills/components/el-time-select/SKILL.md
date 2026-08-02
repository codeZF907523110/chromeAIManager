---
name: "el-time-select"
description: "TimeSelect component for selecting from fixed time options. Invoke when user needs to select from predefined time slots or schedule times."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# TimeSelect Component

TimeSelect provides selection from fixed time options.

## When to Use

- Fixed time selection
- Schedule slots
- Appointment times
- Business hours

## Basic Usage

```vue
<template>
  <el-time-select
    v-model="value"
    start="08:30"
    step="00:15"
    end="18:30"
    placeholder="Select time"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
</script>
```

## Time Range

```vue
<template>
  <el-time-select
    v-model="startTime"
    placeholder="Start time"
    start="08:30"
    step="00:30"
    end="18:30"
    :max-time="endTime"
  />
  <el-time-select
    v-model="endTime"
    placeholder="End time"
    start="08:30"
    step="00:30"
    end="18:30"
    :min-time="startTime"
  />
</template>

<script setup>
import { ref } from 'vue'

const startTime = ref('')
const endTime = ref('')
</script>
```

## Time Format

```vue
<template>
  <el-time-select
    v-model="value"
    format="HH:mm A"
    start="08:00"
    step="01:00"
    end="18:00"
  />
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string` | — |
| disabled | Disabled | `boolean` | `false` |
| editable | Input editable | `boolean` | `true` |
| clearable | Show clear button | `boolean` | `true` |
| size | Size | `'large' \| 'default' \| 'small'` | `'default'` |
| placeholder | Placeholder | `string` | — |
| start | Start time | `string` | `'09:00'` |
| end | End time | `string` | `'18:00'` |
| step | Time step | `string` | `'00:30'` |
| min-time | Minimum time | `string` | — |
| max-time | Maximum time | `string` | — |
| format | Time format | `string` | `'HH:mm'` |
| include-end-time | Include end time | `boolean` | `false` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Value changes | `(value: string) => void` |
| blur | Input blurs | `(e: FocusEvent) => void` |
| focus | Input focuses | `(e: FocusEvent) => void` |
| clear | Clear button clicked | `() => void` |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| focus | Focus input | `() => void` |
| blur | Blur input | `() => void` |

## Best Practices

1. Use `min-time`/`max-time` for range validation
2. Set appropriate `step` for use case
3. Use `format` for custom display
