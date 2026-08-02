---
name: "el-autocomplete"
description: "Autocomplete component for input suggestions. Invoke when user needs to provide input suggestions, autocomplete functionality, or search-as-you-type features."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Autocomplete Component

Autocomplete provides input suggestions based on user input.

## When to Use

- Search suggestions
- Form autocomplete
- Address inputs
- Quick selection from options

## Basic Usage

```vue
<template>
  <el-autocomplete
    v-model="state"
    :fetch-suggestions="querySearch"
    clearable
    placeholder="Please input"
    @select="handleSelect"
  />
</template>

<script setup>
import { ref, onMounted } from 'vue'

const state = ref('')
const links = ref([])

const querySearch = (queryString, cb) => {
  const results = queryString
    ? links.value.filter(createFilter(queryString))
    : links.value
  cb(results)
}

const createFilter = (queryString) => {
  return (restaurant) => {
    return (
      restaurant.value.toLowerCase().indexOf(queryString.toLowerCase()) === 0
    )
  }
}

const handleSelect = (item) => {
  console.log(item)
}

onMounted(() => {
  links.value = [
    { value: 'vue', link: 'https://github.com/vuejs/vue' },
    { value: 'element', link: 'https://github.com/ElemeFE/element' },
    { value: 'cooking', link: 'https://github.com/ElemeFE/cooking' }
  ]
})
</script>
```

## Custom Template

```vue
<template>
  <el-autocomplete
    v-model="state"
    :fetch-suggestions="querySearch"
    placeholder="Please input"
  >
    <template #default="{ item }">
      <div class="value">{{ item.value }}</div>
      <span class="link">{{ item.link }}</span>
    </template>
  </el-autocomplete>
</template>
```

## Remote Search

```vue
<template>
  <el-autocomplete
    v-model="state"
    :fetch-suggestions="querySearchAsync"
    placeholder="Please input"
  />
</template>

<script setup>
import { ref } from 'vue'

const state = ref('')

const querySearchAsync = (queryString, cb) => {
  fetch(`/api/search?q=${queryString}`)
    .then(res => res.json())
    .then(data => cb(data))
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Binding value | `string` | — |
| placeholder | Placeholder | `string` | — |
| disabled | Whether disabled | `boolean` | `false` |
| value-key | Key for display value | `string` | `'value'` |
| debounce | Debounce delay (ms) | `number` | `300` |
| placement | Popup placement | Placement enum | `'bottom-start'` |
| fetch-suggestions | Method to fetch suggestions | `(queryString, cb) => void` | — |
| popper-class | Custom popup class | `string` | — |
| trigger-on-focus | Trigger on focus | `boolean` | `true` |
| name | Native name attribute | `string` | — |
| select-when-unmatched | Select on enter even if no match | `boolean` | `false` |
| label | Label text | `string` | — |
| hide-loading | Hide loading icon | `boolean` | `false` |
| popper-append-to-body | Append popup to body | `boolean` | `true` |
| highlight-first-item | Highlight first item | `boolean` | `false` |

### Events

| Name | Description | Type |
|------|-------------|------|
| select | Triggers when a suggestion is selected | `(item) => void` |
| change | Triggers when input value changes | `(value: string) => void` |
| input | Triggers on input | `(value: string) => void` |
| focus | Triggers on focus | `(event: Event) => void` |
| blur | Triggers on blur | `(event: Event) => void` |
| clear | Triggers on clear | `() => void` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| default | Custom suggestion item | `{ item }` |
| prefix | Prefix content | — |
| suffix | Suffix content | — |
| prepend | Prepend content | — |
| append | Append content | — |

## Best Practices

1. Use `debounce` to reduce API calls
2. Implement `fetch-suggestions` for async data
3. Use custom templates for rich suggestions
