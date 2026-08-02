---
name: "el-radio"
description: "Radio component for single selection among multiple options. Invoke when user needs to allow users to select one option from a list, create radio groups, or implement mutually exclusive choices."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Radio Component

Radio component provides single selection among multiple options with various styles.

## When to Use

- Single selection from options
- Mutually exclusive choices
- Form radio fields
- Settings selection

## Basic Usage

```vue
<template>
  <el-radio v-model="radio" value="1">Option A</el-radio>
  <el-radio v-model="radio" value="2">Option B</el-radio>
</template>

<script setup>
import { ref } from 'vue'

const radio = ref('1')
</script>
```

## Disabled

```vue
<template>
  <el-radio v-model="radio" value="1" disabled>Disabled</el-radio>
</template>
```

## Radio Group

```vue
<template>
  <el-radio-group v-model="radio">
    <el-radio value="1">Option A</el-radio>
    <el-radio value="2">Option B</el-radio>
    <el-radio value="3">Option C</el-radio>
  </el-radio-group>
</template>
```

## With Borders

```vue
<template>
  <el-radio-group v-model="radio">
    <el-radio value="1" border>Option A</el-radio>
    <el-radio value="2" border>Option B</el-radio>
  </el-radio-group>
</template>
```

## Radio Button

```vue
<template>
  <el-radio-group v-model="radio">
    <el-radio-button value="1">Option A</el-radio-button>
    <el-radio-button value="2">Option B</el-radio-button>
    <el-radio-button value="3">Option C</el-radio-button>
  </el-radio-group>
</template>
```

## Options Attribute

```vue
<template>
  <el-radio-group v-model="radio" :options="options" />
</template>

<script setup>
import { ref } from 'vue'

const radio = ref('1')
const options = [
  { value: '1', label: 'Option A' },
  { value: '2', label: 'Option B' },
  { value: '3', label: 'Option C' }
]
</script>
```

## API Reference

### Radio Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| number \| boolean` | — |
| value | Value of radio | `string \| number \| boolean` | — |
| label | Label text | `string \| number \| boolean` | — |
| disabled | Whether disabled | `boolean` | `false` |
| border | Whether to add border | `boolean` | `false` |
| size | Size | `'large' \| 'default' \| 'small'` | — |
| name | Native name attribute | `string` | — |

### Radio Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when value changes | `(value: string \| number \| boolean) => void` |

### RadioGroup Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| number \| boolean` | — |
| size | Size of radios | `'large' \| 'default' \| 'small'` | `'default'` |
| disabled | Whether disabled | `boolean` | `false` |
| text-color | Font color when active | `string` | `'#ffffff'` |
| fill | Background color when active | `string` | `'#409eff'` |
| options | Data of options | `Array<{[key: string]: any}>` | — |
| props | Configuration options | `object` | — |
| type | Component type | `'radio' \| 'button'` | `'radio'` |

## Best Practices

1. Use `value` prop (not `label`) for radio values since 2.6.0
2. Use `el-radio-button` for button-style groups
3. Use `options` for dynamic radio lists
