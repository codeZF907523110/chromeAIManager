---
name: "el-select"
description: "Select dropdown component for single or multiple selection with filtering, remote search, and grouping. Invoke when user needs dropdown selection functionality."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Select Component

When there are plenty of options, use a drop-down menu to display and select desired ones.

## When to Invoke

Invoke this skill when:
- User needs to implement a dropdown selection
- User wants multiple selection with tags
- User needs remote search functionality
- User wants to group options
- User needs to create new options dynamically
- User asks about select filtering

## Features

- **Single/Multiple Selection**: Support for single and multiple select modes
- **Filtering**: Local or remote filtering
- **Grouping**: Group options by category
- **Custom Templates**: Custom option rendering
- **Tag Management**: Collapse tags, custom tags
- **Remote Search**: Load options from server
- **Create Options**: Allow creating new options
- **Virtual Scroll**: High performance for large datasets

## API Reference

### Select Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | binding value | `string \| number \| boolean \| object \| array` | — |
| multiple | whether multiple-select is activated | `boolean` | false |
| options | data of the options | `Array<{[key: string]: any}>` | — |
| props | configuration options | `object` | — |
| disabled | whether Select is disabled | `boolean` | false |
| value-key | unique identity key name for value | `string` | value |
| size | size of Input | `'' \| 'large' \| 'default' \| 'small'` | — |
| clearable | whether select can be cleared | `boolean` | false |
| collapse-tags | whether to collapse tags | `boolean` | false |
| collapse-tags-tooltip | whether show all tags on hover | `boolean` | false |
| multiple-limit | max options in multiple mode | `number` | 0 |
| placeholder | placeholder | `string` | — |
| filterable | whether Select is filterable | `boolean` | false |
| allow-create | whether creating new items is allowed | `boolean` | false |
| filter-method | custom filter method | `(query: string) => void` | — |
| remote | whether options are loaded from server | `boolean` | false |
| debounce | debounce delay during remote search | `number` | 300 |
| remote-method | remote search method | `(query: string) => void` | — |
| loading | whether Select is loading | `boolean` | false |
| loading-text | displayed text while loading | `string` | — |
| no-match-text | text when no data matches | `string` | — |
| no-data-text | text when there is no options | `string` | — |
| popper-class | custom class for dropdown | `string` | '' |
| reserve-keyword | whether to reserve keyword | `boolean` | true |
| default-first-option | select first option on enter | `boolean` | false |
| teleported | whether dropdown is teleported | `boolean` | true |
| persistent | whether dropdown is persistent | `boolean` | true |
| automatic-dropdown | auto show dropdown on focus | `boolean` | false |
| fit-input-width | dropdown width same as input | `boolean` | false |
| suffix-icon | custom suffix icon | `string \| Component` | ArrowDown |
| tag-type | tag type | `'' \| 'success' \| 'info' \| 'warning' \| 'danger'` | info |
| max-collapse-tags | max tags to show | `number` | 1 |
| empty-values | empty values of component | `array` | — |
| value-on-clear | clear return value | `string \| number \| boolean \| Function` | — |

### Select Events

| Name | Description | Type |
|------|-------------|------|
| change | triggers when selected value changes | `(value: any) => void` |
| visible-change | triggers when dropdown appears/disappears | `(visible: boolean) => void` |
| remove-tag | triggers when a tag is removed | `(tagValue: any) => void` |
| clear | triggers when clear icon is clicked | `() => void` |
| blur | triggers when Input blurs | `(event: FocusEvent) => void` |
| focus | triggers when Input focuses | `(event: FocusEvent) => void` |
| popup-scroll | triggers when dropdown scrolls | `({scrollTop, scrollLeft}) => void` |

### Select Slots

| Name | Description |
|------|-------------|
| default | option component list |
| header | content at the top of dropdown |
| footer | content at the bottom of dropdown |
| prefix | content as Select prefix |
| empty | content when no options |
| tag | custom tag content |
| loading | custom loading content |
| label | custom label content |

### Select Exposes

| Name | Description | Type |
|------|-------------|------|
| focus | focus the Input | `() => void` |
| blur | blur and hide dropdown | `() => void` |
| selectedLabel | get selected label | `ComputedRef<string \| string[]>` |

### Option Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| value | value of option | `string \| number \| boolean \| object` | — |
| label | label of option | `string \| number` | — |
| disabled | whether option is disabled | `boolean` | false |

### OptionGroup Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| label | name of the group | `string` | — |
| disabled | whether to disable all options | `boolean` | false |

## Usage Examples

### Basic Select

```vue
<template>
  <el-select v-model="value" placeholder="Select">
    <el-option
      v-for="item in options"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const options = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' }
]
</script>
```

### Using Options Prop

```vue
<template>
  <el-select v-model="value" :options="options" />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const options = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' }
]
</script>
```

### Disabled Select

```vue
<template>
  <el-select v-model="value" disabled placeholder="Disabled">
    <el-option label="Option 1" value="1" />
  </el-select>
</template>
```

### Clearable Select

```vue
<template>
  <el-select v-model="value" clearable placeholder="Clearable">
    <el-option label="Option 1" value="1" />
    <el-option label="Option 2" value="2" />
  </el-select>
</template>
```

### Multiple Select

```vue
<template>
  <el-select v-model="value" multiple placeholder="Select multiple">
    <el-option
      v-for="item in options"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>
</template>

<script setup>
import { ref } from 'vue'

const value = ref([])
const options = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
  { value: '3', label: 'Option 3' }
]
</script>
```

### Collapse Tags

```vue
<template>
  <el-select 
    v-model="value" 
    multiple 
    collapse-tags 
    collapse-tags-tooltip
    placeholder="Select"
  >
    <el-option
      v-for="item in options"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>
</template>
```

### Custom Template

```vue
<template>
  <el-select v-model="value" placeholder="Select">
    <el-option
      v-for="item in options"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    >
      <span style="float: left">{{ item.label }}</span>
      <span style="float: right; color: var(--el-text-color-secondary)">
        {{ item.value }}
      </span>
    </el-option>
  </el-select>
</template>
```

### Option Grouping

```vue
<template>
  <el-select v-model="value" placeholder="Select">
    <el-option-group
      v-for="group in options"
      :key="group.label"
      :label="group.label"
    >
      <el-option
        v-for="item in group.options"
        :key="item.value"
        :label="item.label"
        :value="item.value"
      />
    </el-option-group>
  </el-select>
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const options = [
  {
    label: 'Popular Cities',
    options: [
      { value: 'Shanghai', label: 'Shanghai' },
      { value: 'Beijing', label: 'Beijing' }
    ]
  },
  {
    label: 'City Name',
    options: [
      { value: 'Chengdu', label: 'Chengdu' },
      { value: 'Shenzhen', label: 'Shenzhen' }
    ]
  }
]
</script>
```

### Filterable Select

```vue
<template>
  <el-select v-model="value" filterable placeholder="Select">
    <el-option
      v-for="item in options"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>
</template>
```

### Remote Search

```vue
<template>
  <el-select
    v-model="value"
    filterable
    remote
    reserve-keyword
    placeholder="Search"
    :remote-method="remoteMethod"
    :loading="loading"
  >
    <el-option
      v-for="item in options"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const loading = ref(false)
const options = ref([])

const remoteMethod = async (query) => {
  if (query) {
    loading.value = true
    try {
      // Simulate API call
      const results = await searchAPI(query)
      options.value = results
    } finally {
      loading.value = false
    }
  } else {
    options.value = []
  }
}
</script>
```

### Create New Options

```vue
<template>
  <el-select
    v-model="value"
    filterable
    allow-create
    default-first-option
    placeholder="Select or create"
  >
    <el-option
      v-for="item in options"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>
</template>
```

### Object Value

```vue
<template>
  <el-select v-model="value" value-key="id" placeholder="Select">
    <el-option
      v-for="item in options"
      :key="item.id"
      :label="item.name"
      :value="item"
    />
  </el-select>
</template>

<script setup>
import { ref } from 'vue'

const value = ref(null)
const options = [
  { id: 1, name: 'Option 1' },
  { id: 2, name: 'Option 2' }
]
</script>
```

### Custom Header/Footer

```vue
<template>
  <el-select v-model="value" placeholder="Select">
    <template #header>
      <el-input v-model="search" placeholder="Search..." />
    </template>
    <el-option label="Option 1" value="1" />
    <el-option label="Option 2" value="2" />
    <template #footer>
      <el-button type="primary" size="small">Add New</el-button>
    </template>
  </el-select>
</template>
```

## Common Issues

### 1. Width Collapse in Inline Form

Set a specific width:

```vue
<el-form inline>
  <el-form-item>
    <el-select v-model="value" style="width: 200px" />
  </el-form-item>
</el-form>
```

### 2. Object Value Not Updating

Use `value-key` attribute:

```vue
<el-select v-model="value" value-key="id">
  <el-option :value="{ id: 1, name: 'Test' }" />
</el-select>
```

### 3. Clear Value Issues

Configure `empty-values` and `value-on-clear`:

```vue
<el-select 
  v-model="value" 
  :empty-values="[null, undefined]" 
  :value-on-clear="null"
>
```

## Component Interactions

### With Form Validation

```vue
<template>
  <el-form :model="form" :rules="rules">
    <el-form-item label="Category" prop="category">
      <el-select v-model="form.category" placeholder="Select category">
        <el-option label="Category 1" value="1" />
        <el-option label="Category 2" value="2" />
      </el-select>
    </el-form-item>
  </el-form>
</template>
```

### Cascading Selects

```vue
<template>
  <el-select v-model="country" @change="handleCountryChange">
    <el-option label="USA" value="usa" />
    <el-option label="China" value="china" />
  </el-select>
  
  <el-select v-model="city" :disabled="!country">
    <el-option
      v-for="city in cities"
      :key="city.value"
      :label="city.label"
      :value="city.value"
    />
  </el-select>
</template>

<script setup>
import { ref, watch } from 'vue'

const country = ref('')
const city = ref('')
const cities = ref([])

const cityOptions = {
  usa: [{ label: 'New York', value: 'ny' }, { label: 'LA', value: 'la' }],
  china: [{ label: 'Beijing', value: 'bj' }, { label: 'Shanghai', value: 'sh' }]
}

watch(country, (val) => {
  city.value = ''
  cities.value = cityOptions[val] || []
})
</script>
```

## Best Practices

1. **Use options prop**: For simple cases, use `options` prop instead of `el-option`
2. **Add key for v-for**: Always add unique key for options
3. **Use value-key for objects**: When value is an object, set `value-key`
4. **Debounce remote search**: Use `debounce` for remote search
5. **Clear on change**: Clear dependent selects when parent changes
6. **Loading state**: Show loading state during remote search
