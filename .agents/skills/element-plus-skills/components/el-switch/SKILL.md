---
name: "el-switch"
description: "Switch component for toggling between two opposing states. Invoke when user needs to enable/disable features, toggle settings, or switch between on/off states."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Switch Component

Switch component is used for switching between two opposing states.

## When to Use

- Enable/disable features
- Toggle settings
- On/off switches
- Boolean state toggles

## Basic Usage

```vue
<template>
  <el-switch v-model="value" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref(true)
</script>
```

## Sizes

```vue
<template>
  <el-switch v-model="value1" size="large" />
  <el-switch v-model="value2" />
  <el-switch v-model="value3" size="small" />
</template>
```

## Text Description

```vue
<template>
  <el-switch
    v-model="value"
    active-text="Open"
    inactive-text="Close"
  />
  
  <el-switch
    v-model="value"
    active-text="O"
    inactive-text="X"
    inline-prompt
  />
</template>
```

## Custom Icons

```vue
<template>
  <el-switch
    v-model="value"
    :active-icon="Check"
    :inactive-icon="Close"
  />
</template>

<script setup>
import { Check, Close } from '@element-plus/icons-vue'
</script>
```

## Extended Value Types

```vue
<template>
  <el-switch
    v-model="value"
    active-value="on"
    inactive-value="off"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('on')
</script>
```

## Disabled

```vue
<template>
  <el-switch v-model="value" disabled />
</template>
```

## Loading

```vue
<template>
  <el-switch v-model="value" loading />
</template>
```

## Prevent Switching

```vue
<template>
  <el-switch v-model="value" :before-change="beforeChange" />
</template>

<script setup>
const beforeChange = () => {
  return confirm('Are you sure?')
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `boolean \| string \| number` | `false` |
| disabled | Whether disabled | `boolean` | `false` |
| loading | Loading state | `boolean` | `false` |
| size | Size | `'' \| 'large' \| 'default' \| 'small'` | `''` |
| width | Width | `number \| string` | `''` |
| inline-prompt | Display text inside dot | `boolean` | `false` |
| active-icon | Icon when on | `string \| Component` | — |
| inactive-icon | Icon when off | `string \| Component` | — |
| active-text | Text when on | `string` | `''` |
| inactive-text | Text when off | `string` | `''` |
| active-value | Value when on | `boolean \| string \| number` | `true` |
| inactive-value | Value when off | `boolean \| string \| number` | `false` |
| name | Input name | `string` | `''` |
| validate-event | Trigger form validation | `boolean` | `true` |
| before-change | Hook before change | `() => Promise<boolean> \| boolean` | — |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when value changes | `(val: boolean \| string \| number) => void` |

### Slots

| Name | Description |
|------|-------------|
| active-action | Customize active action |
| inactive-action | Customize inactive action |
| active | Customize active content |
| inactive | Customize inactive content |

## Best Practices

1. Use `before-change` for confirmation dialogs
2. Use `loading` for async operations
3. Use `active-value`/`inactive-value` for non-boolean values
