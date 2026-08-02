---
name: "el-checkbox"
description: "Checkbox component for multiple choice selection. Invoke when user needs to allow users to select multiple options from a list, create check-all functionality, or toggle between states."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Checkbox Component

Checkbox component provides a group of options for multiple choices with various styles and configurations.

## When to Use

- Multiple selection from options
- Toggle between states
- Check-all functionality
- Form multi-select fields

## Basic Usage

```vue
<template>
  <el-checkbox v-model="checked">Option</el-checkbox>
</template>

<script setup>
import { ref } from 'vue'

const checked = ref(false)
</script>
```

## Disabled State

```vue
<template>
  <el-checkbox v-model="checked" disabled>Disabled</el-checkbox>
</template>
```

## Checkbox Group

```vue
<template>
  <el-checkbox-group v-model="checkList">
    <el-checkbox value="Option A">Option A</el-checkbox>
    <el-checkbox value="Option B">Option B</el-checkbox>
    <el-checkbox value="Option C">Option C</el-checkbox>
  </el-checkbox-group>
</template>

<script setup>
import { ref } from 'vue'

const checkList = ref(['Option A', 'Option B'])
</script>
```

## Options Attribute

```vue
<template>
  <el-checkbox-group v-model="checkList" :options="options" />
</template>

<script setup>
import { ref } from 'vue'

const checkList = ref(['Option A'])
const options = [
  { value: 'Option A', label: 'Option A' },
  { value: 'Option B', label: 'Option B' },
  { value: 'Option C', label: 'Option C', disabled: true }
]
</script>
```

## Indeterminate (Check All)

```vue
<template>
  <el-checkbox
    v-model="checkAll"
    :indeterminate="isIndeterminate"
    @change="handleCheckAllChange"
  >
    Check all
  </el-checkbox>
  <el-checkbox-group v-model="checkedCities" @change="handleCheckedCitiesChange">
    <el-checkbox v-for="city in cities" :key="city" :value="city">
      {{ city }}
    </el-checkbox>
  </el-checkbox-group>
</template>

<script setup>
import { ref } from 'vue'

const checkAll = ref(false)
const isIndeterminate = ref(true)
const cities = ['Shanghai', 'Beijing', 'Guangzhou', 'Shenzhen']
const checkedCities = ref(['Shanghai', 'Beijing'])

const handleCheckAllChange = (val) => {
  checkedCities.value = val ? cities : []
  isIndeterminate.value = false
}

const handleCheckedCitiesChange = (value) => {
  const checkedCount = value.length
  checkAll.value = checkedCount === cities.length
  isIndeterminate.value = checkedCount > 0 && checkedCount < cities.length
}
</script>
```

## Min/Max Items

```vue
<template>
  <el-checkbox-group v-model="checkedCities" :min="1" :max="2">
    <el-checkbox v-for="city in cities" :key="city" :value="city">
      {{ city }}
    </el-checkbox>
  </el-checkbox-group>
</template>
```

## Button Style

```vue
<template>
  <el-checkbox-group v-model="checkList">
    <el-checkbox-button value="Option A">Option A</el-checkbox-button>
    <el-checkbox-button value="Option B">Option B</el-checkbox-button>
    <el-checkbox-button value="Option C">Option C</el-checkbox-button>
  </el-checkbox-group>
</template>
```

## With Borders

```vue
<template>
  <el-checkbox v-model="checked" border>Option</el-checkbox>
</template>
```

## API Reference

### Checkbox Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string \| number \| boolean` | — |
| value | Value when used in checkbox-group | `string \| number \| boolean \| object` | — |
| label | Label text | `string \| number \| boolean \| object` | — |
| true-value | Value when checked | `string \| number` | — |
| false-value | Value when unchecked | `string \| number` | — |
| disabled | Whether disabled | `boolean` | `false` |
| border | Whether to add border | `boolean` | `false` |
| size | Size | `'large' \| 'default' \| 'small'` | — |
| name | Native name attribute | `string` | — |
| checked | Whether checked | `boolean` | `false` |
| indeterminate | Indeterminate state | `boolean` | `false` |
| validate-event | Whether to trigger form validation | `boolean` | `true` |

### Checkbox Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when value changes | `(value: string \| number \| boolean) => void` |

### CheckboxGroup Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string[] \| number[]` | `[]` |
| size | Size of checkboxes | `'large' \| 'default' \| 'small'` | — |
| disabled | Whether disabled | `boolean` | `false` |
| min | Minimum checked items | `number` | — |
| max | Maximum checked items | `number` | — |
| options | Data of options | `Array<{[key: string]: any}>` | — |
| props | Configuration options | `object` | — |
| type | Component type | `'checkbox' \| 'button'` | `'checkbox'` |

## Best Practices

1. Use `value` prop (not `label`) for checkbox values since 2.6.0
2. Use `indeterminate` for check-all patterns
3. Use `min`/`max` to limit selection count
