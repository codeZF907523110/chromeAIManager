---
name: "el-color-picker"
description: "ColorPicker component for color selection. Invoke when user needs to select colors, set theme colors, or customize color values."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# ColorPicker Component

ColorPicker is a color selector supporting multiple color formats.

## When to Use

- Theme customization
- Color selection
- Design tools
- Style configuration

## Basic Usage

```vue
<template>
  <el-color-picker v-model="color" />
</template>

<script setup>
import { ref } from 'vue'

const color = ref('#409EFF')
</script>
```

## Alpha Channel

```vue
<template>
  <el-color-picker v-model="color" show-alpha />
</template>

<script setup>
import { ref } from 'vue'

const color = ref('rgba(19, 206, 102, 0.8)')
</script>
```

## Predefined Colors

```vue
<template>
  <el-color-picker
    v-model="color"
    :predefine="predefineColors"
  />
</template>

<script setup>
import { ref } from 'vue'

const color = ref('#409EFF')
const predefineColors = [
  '#ff4500',
  '#ff8c00',
  '#ffd700',
  '#90ee90',
  '#00ced1',
  '#1e90ff',
  '#c71585'
]
</script>
```

## Sizes

```vue
<template>
  <el-color-picker v-model="color" size="large" />
  <el-color-picker v-model="color" />
  <el-color-picker v-model="color" size="small" />
</template>
```

## Color Formats

```vue
<template>
  <el-color-picker v-model="color" color-format="rgb" />
</template>

<script setup>
import { ref } from 'vue'

const color = ref('rgb(64, 158, 255)')
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string` | — |
| disabled | Disabled | `boolean` | `false` |
| clearable | Show clear button | `boolean` | `true` |
| size | Size | `'large' \| 'default' \| 'small'` | — |
| show-alpha | Show alpha slider | `boolean` | `false` |
| color-format | Color format | `'rgb' \| 'prgb' \| 'hex' \| 'hex3' \| 'hex4' \| 'hex6' \| 'hex8' \| 'name' \| 'hsl' \| 'hsv'` | `'hex'` or `'rgb'` |
| predefine | Predefined colors | `string[]` | — |
| validate-event | Trigger form validation | `boolean` | `true` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Value changes | `(value: string) => void` |
| active-change | Active color changes | `(value: string) => void` |
| focus | Component focuses | `(event: FocusEvent) => void` |
| blur | Component blurs | `(event: FocusEvent) => void` |
| clear | Clear button clicked | `() => void` |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| color | Current color object | `Color` |
| show | Show picker | `() => void` |
| hide | Hide picker | `() => void` |
| focus | Focus picker | `() => void` |
| blur | Blur picker | `() => void` |

## Best Practices

1. Use `show-alpha` for transparent colors
2. Use `predefine` for brand colors
3. Use `color-format` for specific format needs
