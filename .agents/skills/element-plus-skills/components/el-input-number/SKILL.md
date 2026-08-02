---
name: "el-input-number"
description: "InputNumber component for numeric input with controls. Invoke when user needs to input numbers with increment/decrement buttons, set numeric ranges, or enforce numeric input."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# InputNumber Component

InputNumber allows users to input numeric values with controls and validation.

## When to Use

- Quantity inputs
- Numeric settings
- Range-limited numbers
- Precise numeric input

## Basic Usage

```vue
<template>
  <el-input-number v-model="num" :min="1" :max="10" />
</template>

<script setup>
import { ref } from 'vue'

const num = ref(1)
</script>
```

## Disabled

```vue
<template>
  <el-input-number v-model="num" disabled />
</template>
```

## Steps

```vue
<template>
  <el-input-number v-model="num" :step="2" />
</template>
```

## Step Strictly

```vue
<template>
  <el-input-number v-model="num" :step="2" step-strictly />
</template>
```

## Precision

```vue
<template>
  <el-input-number v-model="num" :precision="2" :step="0.1" :max="10" />
</template>
```

## Sizes

```vue
<template>
  <el-input-number v-model="num" size="large" />
  <el-input-number v-model="num" />
  <el-input-number v-model="num" size="small" />
</template>
```

## Controls Position

```vue
<template>
  <el-input-number v-model="num" controls-position="right" />
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `number` | `0` |
| min | Minimum value | `number` | `-Infinity` |
| max | Maximum value | `number` | `Infinity` |
| step | Increment step | `number` | `1` |
| step-strictly | Require step multiples | `boolean` | `false` |
| precision | Decimal precision | `number` | — |
| size | Size | `'large' \| 'default' \| 'small'` | `'default'` |
| disabled | Whether disabled | `boolean` | `false` |
| controls | Show control buttons | `boolean` | `true` |
| controls-position | Button position | `'' \| 'right'` | — |
| name | Native name attribute | `string` | — |
| label | Aria label | `string` | — |
| placeholder | Placeholder | `string` | — |
| value-on-clear | Value when cleared | `'min' \| 'max' \| number \| null` | `null` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when value changes | `(value: number, oldValue: number) => void` |
| input | Triggers on input | `(value: number \| null \| undefined) => void` |
| blur | Triggers on blur | `(event: FocusEvent) => void` |
| focus | Triggers on focus | `(event: FocusEvent) => void` |

### Slots

| Name | Description |
|------|-------------|
| decrease | Custom decrease button |
| increase | Custom increase button |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| focus | Focus the input | `() => void` |
| blur | Blur the input | `() => void` |

## Best Practices

1. Set `min` and `max` for valid ranges
2. Use `precision` for decimal numbers
3. Use `controls-position="right"` for compact layouts
