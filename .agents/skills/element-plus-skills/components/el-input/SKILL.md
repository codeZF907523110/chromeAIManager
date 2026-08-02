---
name: "el-input"
description: "Input component for text entry with multiple types, validation, and formatting. Invoke when user needs to implement text input, textarea, or password input."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Input Component

Input component for entering text data with mouse or keyboard.

## When to Invoke

Invoke this skill when:
- User needs to implement text input fields
- User wants to create textarea with auto-resize
- User needs password input with toggle visibility
- User wants to add prefix/suffix icons or content
- User needs input validation or formatting
- User asks about input length limits

## Features

- **Multiple Types**: text, textarea, password, number, email, search, tel, url
- **Size Variants**: large, default, small
- **Clearable**: one-click clear functionality
- **Password Toggle**: show/hide password
- **Word Limit**: character count display
- **Auto-resize Textarea**: adaptive height
- **Formatter**: value formatting and parsing
- **Prefix/Suffix**: icons or custom content
- **Prepend/Append**: compound input fields

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| type | type of input | `'text' \| 'textarea' \| 'number' \| 'password' \| 'email' \| 'search' \| 'tel' \| 'url'` | text |
| model-value / v-model | binding value | `string \| number` | — |
| model-modifiers | v-model modifiers | `{ lazy?: true, number?: true, trim?: true }` | — |
| maxlength | same as `maxlength` in native input | `string \| number` | — |
| minlength | same as `minlength` in native input | `string \| number` | — |
| show-word-limit | whether show word count | `boolean` | false |
| word-limit-position | word count position | `'inside' \| 'outside'` | inside |
| placeholder | placeholder of Input | `string` | — |
| clearable | whether to show clear button | `boolean` | false |
| clear-icon | custom clear icon component | `string \| Component` | CircleClose |
| formatter | specifies the format of the value | `(value: string \| number) => string` | — |
| parser | specifies the value extracted from formatter input | `(value: string) => string` | — |
| show-password | whether to show toggleable password input | `boolean` | false |
| disabled | whether Input is disabled | `boolean` | false |
| size | size of Input | `'large' \| 'default' \| 'small'` | — |
| prefix-icon | prefix icon component | `string \| Component` | — |
| suffix-icon | suffix icon component | `string \| Component` | — |
| rows | number of rows of textarea | `number` | 2 |
| autosize | whether textarea has an adaptive height | `boolean \| { minRows?: number, maxRows?: number }` | false |
| autocomplete | same as `autocomplete` in native input | `string` | off |
| name | same as `name` in native input | `string` | — |
| readonly | same as `readonly` in native input | `boolean` | false |
| max | same as `max` in native input | — | — |
| min | same as `min` in native input | — | — |
| step | same as `step` in native input | — | — |
| resize | control the resizability | `'none' \| 'both' \| 'horizontal' \| 'vertical'` | — |
| autofocus | same as `autofocus` in native input | `boolean` | false |
| form | same as `form` in native input | `string` | — |
| aria-label | same as `aria-label` in native input | `string` | — |
| tabindex | input tabindex | `string \| number` | — |
| validate-event | whether to trigger form validation | `boolean` | true |
| input-style | the style of the input element | `string \| CSSProperties \| CSSProperties[] \| string[]` | {} |
| inputmode | same as `inputmode` in native input | `string` | — |

### Events

| Name | Description | Type |
|------|-------------|------|
| blur | triggers when Input blurs | `(event: FocusEvent) => void` |
| focus | triggers when Input focuses | `(event: FocusEvent) => void` |
| change | triggers when the input box loses focus or user presses Enter | `(value: string \| number, evt?: Event) => void` |
| input | triggers when the Input value change | `(value: string \| number) => void` |
| clear | triggers when the Input is cleared | `(evt?: MouseEvent) => void` |
| keydown | triggers when a key is pressed down | `(event: KeyboardEvent \| Event) => void` |
| mouseleave | triggers when the mouse leaves the Input element | `(event: MouseEvent) => void` |
| mouseenter | triggers when the mouse enters the Input element | `(event: MouseEvent) => void` |

### Slots

| Name | Description |
|------|-------------|
| prefix | content as Input prefix, only works when `type` is not 'textarea' |
| suffix | content as Input suffix, only works when `type` is not 'textarea' |
| prepend | content to prepend before Input, only works when `type` is not 'textarea' |
| append | content to append after Input, only works when `type` is not 'textarea' |
| password-icon | content as Input password icon, only works when `show-password` is true |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| blur | blur the input element | `() => void` |
| clear | clear input value | `() => void` |
| focus | focus the input element | `() => void` |
| input | HTML input element | `Ref<HTMLInputElement>` |
| ref | HTML element, input or textarea | `Ref<HTMLInputElement \| HTMLTextAreaElement>` |
| resizeTextarea | resize textarea | `() => void` |
| select | select the text in input element | `() => void` |
| textarea | HTML textarea element | `Ref<HTMLTextAreaElement>` |
| textareaStyle | style of textarea | `Ref<StyleValue>` |
| isComposing | is input composing | `Ref<boolean>` |

## Usage Examples

### Basic Input

```vue
<template>
  <el-input v-model="input" placeholder="Please input" />
</template>

<script setup>
import { ref } from 'vue'

const input = ref('')
</script>
```

### Disabled Input

```vue
<template>
  <el-input v-model="input" disabled placeholder="Disabled input" />
</template>
```

### Clearable Input

```vue
<template>
  <el-input v-model="input" clearable placeholder="Clearable input" />
</template>
```

### Password Input

```vue
<template>
  <el-input 
    v-model="password" 
    type="password" 
    show-password 
    placeholder="Please input password" 
  />
</template>

<script setup>
import { ref } from 'vue'

const password = ref('')
</script>
```

### Input with Icons

```vue
<template>
  <el-input 
    v-model="input" 
    placeholder="Pick a date"
    :prefix-icon="Calendar"
  />
  
  <el-input 
    v-model="search" 
    placeholder="Search"
    :suffix-icon="Search"
  />
</template>

<script setup>
import { ref } from 'vue'
import { Calendar, Search } from '@element-plus/icons-vue'

const input = ref('')
const search = ref('')
</script>
```

### Input with Slots

```vue
<template>
  <el-input v-model="input" placeholder="Please input">
    <template #prepend>Http://</template>
  </el-input>
  
  <el-input v-model="input2" placeholder="Please input">
    <template #append>.com</template>
  </el-input>
  
  <el-input v-model="input3" placeholder="Please input">
    <template #prepend>
      <el-select v-model="select" style="width: 100px">
        <el-option label="Restaurant" value="1" />
        <el-option label="Order No." value="2" />
      </el-select>
    </template>
    <template #append>
      <el-button :icon="Search" />
    </template>
  </el-input>
</template>

<script setup>
import { ref } from 'vue'
import { Search } from '@element-plus/icons-vue'

const input = ref('')
const input2 = ref('')
const input3 = ref('')
const select = ref('1')
</script>
```

### Textarea

```vue
<template>
  <el-input
    v-model="textarea"
    type="textarea"
    :rows="4"
    placeholder="Please input"
  />
</template>

<script setup>
import { ref } from 'vue'

const textarea = ref('')
</script>
```

### Auto-resize Textarea

```vue
<template>
  <el-input
    v-model="textarea"
    type="textarea"
    :autosize="{ minRows: 2, maxRows: 6 }"
    placeholder="Auto-resize textarea"
  />
</template>
```

### Word Limit

```vue
<template>
  <el-input
    v-model="input"
    maxlength="20"
    show-word-limit
    placeholder="Please input"
  />
  
  <el-input
    v-model="textarea"
    type="textarea"
    maxlength="100"
    show-word-limit
    placeholder="Please input"
  />
</template>
```

### Formatter

```vue
<template>
  <el-input
    v-model="input"
    :formatter="value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')"
    :parser="value => value.replace(/\$\s?|(,*)/g, '')"
    placeholder="Please input amount"
  />
</template>
```

### Sizes

```vue
<template>
  <el-input v-model="input1" size="large" placeholder="Large" />
  <el-input v-model="input2" placeholder="Default" />
  <el-input v-model="input3" size="small" placeholder="Small" />
</template>
```

### v-model Modifiers

```vue
<template>
  <!-- Lazy: updates on change event -->
  <el-input v-model.lazy="lazyValue" placeholder="Lazy update" />
  
  <!-- Number: converts to number -->
  <el-input v-model.number="numberValue" type="number" placeholder="Number" />
  
  <!-- Trim: trims whitespace -->
  <el-input v-model.trim="trimValue" placeholder="Trimmed" />
</template>
```

## Common Issues

### 1. Input Width Expands with Clearable

When the clearable icon appears, the input width may expand. Set a fixed width:

```vue
<el-input v-model="input" clearable style="width: 200px" />
```

### 2. Textarea Height Issues

Use `autosize` for dynamic height:

```vue
<el-input type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" />
```

### 3. Chinese Input Method Issues

Use `isComposing` expose to check composition state:

```vue
<template>
  <el-input ref="inputRef" v-model="input" @keydown="handleKeydown" />
</template>

<script setup>
import { ref } from 'vue'

const inputRef = ref()

const handleKeydown = () => {
  if (inputRef.value?.isComposing) return
  // Handle keydown
}
</script>
```

## Component Interactions

### With Form Validation

```vue
<template>
  <el-form :model="form" :rules="rules" ref="formRef">
    <el-form-item label="Username" prop="username">
      <el-input v-model="form.username" />
    </el-form-item>
    <el-form-item label="Password" prop="password">
      <el-input v-model="form.password" type="password" show-password />
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref, reactive } from 'vue'

const formRef = ref()
const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: 'Please input username', trigger: 'blur' }
  ],
  password: [
    { required: true, message: 'Please input password', trigger: 'blur' },
    { min: 6, message: 'Password must be at least 6 characters', trigger: 'blur' }
  ]
}
</script>
```

### With Search

```vue
<template>
  <el-input
    v-model="searchQuery"
    placeholder="Search..."
    :prefix-icon="Search"
    clearable
    @input="handleSearch"
  />
</template>

<script setup>
import { ref } from 'vue'
import { Search } from '@element-plus/icons-vue'

const searchQuery = ref('')

const handleSearch = (value) => {
  // Debounce search
  console.log('Searching:', value)
}
</script>
```

## Best Practices

1. **Use appropriate type**: Use correct input type for better mobile keyboards
2. **Provide placeholder**: Always provide meaningful placeholder text
3. **Validate input**: Use form validation for required fields
4. **Limit length**: Use maxlength for bounded input
5. **Clearable for search**: Make search inputs clearable
6. **Password visibility**: Use show-password for password fields
