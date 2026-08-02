---
name: "el-color-picker-panel"
description: "ColorPickerPanel is the core panel component of ColorPicker for custom color selection UI. Invoke when user needs to build custom color picker interfaces without the dropdown wrapper."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# ColorPickerPanel Component

ColorPickerPanel is the core component of ColorPicker for building custom color selection interfaces.

## When to Use

- Custom color picker UI
- Embedded color selection
- Advanced color tools
- Custom dropdown implementations

## Basic Usage

```vue
<template>
  <el-color-picker-panel v-model="color" />
</template>

<script setup>
import { ref } from 'vue'

const color = ref('#409EFF')
</script>
```

## Alpha Channel

```vue
<template>
  <el-color-picker-panel v-model="color" show-alpha />
</template>

<script setup>
import { ref } from 'vue'

const color = ref('rgba(64, 158, 255, 0.8)')
</script>
```

## Predefined Colors

```vue
<template>
  <el-color-picker-panel
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

## Without Border

```vue
<template>
  <el-color-picker-panel v-model="color" :border="false" />
</template>
```

## Disabled

```vue
<template>
  <el-color-picker-panel v-model="color" disabled />
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string` | — |
| border | Show border | `boolean` | `true` |
| disabled | Disabled | `boolean` | `false` |
| show-alpha | Show alpha slider | `boolean` | `false` |
| color-format | Color format | `'rgb' \| 'prgb' \| 'hex' \| 'hex3' \| 'hex4' \| 'hex6' \| 'hex8' \| 'name' \| 'hsl' \| 'hsv'` | `'hex'` or `'rgb'` |
| predefine | Predefined colors | `string[]` | — |
| validate-event | Trigger form validation | `boolean` | `true` |

### Slots

| Name | Description |
|------|-------------|
| footer | Content after the panel |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| color | Current color object | `Color` |
| inputRef | Input ref | `InputInstance` |
| update | Update sub components | `() => void` |

## Best Practices

1. Use for custom color picker implementations
2. Combine with Popover for dropdown behavior
3. Use `predefine` for brand colors
