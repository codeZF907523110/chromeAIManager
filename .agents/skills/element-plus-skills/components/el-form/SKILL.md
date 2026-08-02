---
name: "el-form"
description: "Form component for data collection, validation, and submission. Invoke when user needs to create forms, implement validation, or handle form data."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Form Component

Form consists of input, radio, select, checkbox and so on. With form, you can collect, verify and submit data.

## When to Invoke

Invoke this skill when:
- User needs to create a form with multiple input fields
- User wants to implement form validation
- User needs to handle form submission
- User wants to create inline forms
- User asks about form item layout and alignment
- User needs dynamic form items (add/delete)

## Features

- **Flexible Layout**: Inline, vertical, or horizontal label alignment
- **Comprehensive Validation**: Built-in validation with async-validator
- **Custom Rules**: Support for custom validation functions
- **Dynamic Items**: Add or remove form items dynamically
- **Size Control**: Consistent sizing for all form components
- **Accessibility**: ARIA support for screen readers
- **Error Display**: Inline or tooltip error messages

## API Reference

### Form Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model | Data of form component | `Record<string, any>` | — |
| rules | Validation rules of form | `FormRules` | — |
| inline | Whether the form is inline | `boolean` | false |
| label-position | Position of label | `'left' \| 'right' \| 'top'` | right |
| label-width | Width of label | `string \| number` | '' |
| label-suffix | Suffix of the label | `string` | '' |
| hide-required-asterisk | Whether to hide required asterisk | `boolean` | false |
| require-asterisk-position | Position of asterisk | `'left' \| 'right'` | left |
| show-message | Whether to show the error message | `boolean` | true |
| inline-message | Whether to display the error message inline | `boolean` | false |
| status-icon | Whether to display an icon indicating validation result | `boolean` | false |
| validate-on-rule-change | Whether to trigger validation when rules change | `boolean` | true |
| size | Control the size of components | `'' \| 'large' \| 'default' \| 'small'` | — |
| disabled | Whether to disable all components | `boolean` | false |
| scroll-to-error | When validation fails, scroll to the first error | `boolean` | false |
| scroll-into-view-options | scrollIntoView options | `ScrollIntoViewOptions \| boolean` | true |

### Form Events

| Name | Description | Type |
|------|-------------|------|
| validate | triggers after a form item is validated | `(prop: FormItemProp, isValid: boolean, message: string) => void` |

### Form Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | customize default content | FormItem |

### Form Exposes

| Name | Description | Type |
|------|-------------|------|
| validate | Validate the whole form | `(callback?) => Promise<void>` |
| validateField | Validate specified fields | `(props?, callback?) => FormValidationResult` |
| resetFields | Reset specified fields | `(props?) => void` |
| scrollToField | Scroll to the specified fields | `(prop: FormItemProp) => void` |
| clearValidate | Clear validation messages | `(props?) => void` |
| fields | Get all fields context | `FormItemContext[]` |
| getField | Get a field context | `(prop: FormItemProp) => FormItemContext \| undefined` |
| setInitialValues | Set initial values for form fields | `(initModel: Record<string, any>) => void` |

### FormItem Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| prop | A key of `model` | `string \| string[]` | — |
| label | Label text | `string` | — |
| label-position | Position of item label | `'left' \| 'right' \| 'top'` | '' |
| label-width | Width of label | `string \| number` | — |
| required | Whether the field is required | `boolean` | — |
| rules | Validation rules | `Arrayable<FormItemRule>` | — |
| error | Field error message | `string` | — |
| show-message | Whether to show the error message | `boolean` | true |
| inline-message | Inline style validate message | `boolean` | false |
| size | Control the size of components | `'' \| 'large' \| 'default' \| 'small'` | — |
| for | Same as for in native label | `string` | — |
| validate-status | Validation state | `'' \| 'error' \| 'validating' \| 'success'` | — |

### FormItemRule

| Name | Description | Type | Default |
|------|-------------|------|---------|
| required | Whether field is required | `boolean` | — |
| message | Error message | `string` | — |
| trigger | How the validator is triggered | `'blur' \| 'change'` | — |
| min | Minimum length/value | `number` | — |
| max | Maximum length/value | `number` | — |
| len | Exact length | `number` | — |
| type | Field type | `'string' \| 'number' \| 'boolean' \| 'email' \| ...` | 'string' |
| pattern | Regex pattern | `RegExp` | — |
| validator | Custom validation function | `(rule, value, callback) => void` | — |
| enum | Enum values | `any[]` | — |
| whitespace | Treat whitespace as empty | `boolean` | — |
| transform | Transform value before validation | `(value) => any` | — |
| fields | Nested object validation | `Record<string, Rule>` | — |

### FormItem Slots

| Name | Description | Type |
|------|-------------|------|
| default | Content of Form Item | — |
| label | Custom content to display on label | `{ label: string }` |
| error | Custom content to display validation message | `{ error: string }` |

### FormItem Exposes

| Name | Description | Type |
|------|-------------|------|
| size | Form item size | `ComputedRef<'' \| 'large' \| 'default' \| 'small'>` |
| validateMessage | Validation message | `Ref<string>` |
| validateState | Validation state | `Ref<'' \| 'error' \| 'validating' \| 'success'>` |
| validate | Validate form item | `(trigger, callback?) => FormValidationResult` |
| resetField | Reset current field | `() => void` |
| clearValidate | Remove validation status | `() => void` |
| setInitialValue | Set initial value | `(value: any) => void` |

## Usage Examples

### Basic Form

```vue
<template>
  <el-form :model="form" label-width="120px">
    <el-form-item label="Activity name">
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item label="Activity zone">
      <el-select v-model="form.region" placeholder="Select">
        <el-option label="Zone one" value="shanghai" />
        <el-option label="Zone two" value="beijing" />
      </el-select>
    </el-form-item>
    <el-form-item label="Activity time">
      <el-col :span="11">
        <el-date-picker v-model="form.date1" type="date" placeholder="Pick a date" style="width: 100%" />
      </el-col>
      <el-col :span="2" class="text-center">
        <span class="text-gray-500">-</span>
      </el-col>
      <el-col :span="11">
        <el-time-picker v-model="form.date2" placeholder="Pick a time" style="width: 100%" />
      </el-col>
    </el-form-item>
    <el-form-item label="Instant delivery">
      <el-switch v-model="form.delivery" />
    </el-form-item>
    <el-form-item label="Activity type">
      <el-checkbox-group v-model="form.type">
        <el-checkbox label="Online activities" name="type" />
        <el-checkbox label="Promotion activities" name="type" />
      </el-checkbox-group>
    </el-form-item>
    <el-form-item label="Resources">
      <el-radio-group v-model="form.resource">
        <el-radio label="Sponsor" />
        <el-radio label="Venue" />
      </el-radio-group>
    </el-form-item>
    <el-form-item label="Activity form">
      <el-input v-model="form.desc" type="textarea" />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="onSubmit">Create</el-button>
      <el-button>Cancel</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { reactive } from 'vue'

const form = reactive({
  name: '',
  region: '',
  date1: '',
  date2: '',
  delivery: false,
  type: [],
  resource: '',
  desc: '',
})

const onSubmit = () => {
  console.log('submit!', form)
}
</script>
```

### Form Validation

```vue
<template>
  <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
    <el-form-item label="Name" prop="name">
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item label="Email" prop="email">
      <el-input v-model="form.email" />
    </el-form-item>
    <el-form-item label="Age" prop="age">
      <el-input v-model.number="form.age" />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="submitForm">Submit</el-button>
      <el-button @click="resetForm">Reset</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref, reactive } from 'vue'

const formRef = ref()

const form = reactive({
  name: '',
  email: '',
  age: ''
})

const rules = reactive({
  name: [
    { required: true, message: 'Please input name', trigger: 'blur' },
    { min: 3, max: 10, message: 'Length 3-10 characters', trigger: 'blur' }
  ],
  email: [
    { required: true, message: 'Please input email', trigger: 'blur' },
    { type: 'email', message: 'Please input valid email', trigger: 'blur' }
  ],
  age: [
    { required: true, message: 'Please input age', trigger: 'blur' },
    { type: 'number', message: 'Age must be a number', trigger: 'blur' }
  ]
})

const submitForm = async () => {
  try {
    await formRef.value.validate()
    console.log('Form submitted:', form)
  } catch (error) {
    console.log('Validation failed')
  }
}

const resetForm = () => {
  formRef.value.resetFields()
}
</script>
```

### Custom Validation

```vue
<template>
  <el-form :model="form" :rules="rules" ref="formRef">
    <el-form-item label="Password" prop="pass">
      <el-input v-model="form.pass" type="password" />
    </el-form-item>
    <el-form-item label="Confirm" prop="checkPass">
      <el-input v-model="form.checkPass" type="password" />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="submitForm">Submit</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref, reactive } from 'vue'

const formRef = ref()

const validatePass = (rule, value, callback) => {
  if (value === '') {
    callback(new Error('Please input the password'))
  } else {
    if (form.checkPass !== '') {
      formRef.value?.validateField('checkPass')
    }
    callback()
  }
}

const validatePass2 = (rule, value, callback) => {
  if (value === '') {
    callback(new Error('Please input the password again'))
  } else if (value !== form.pass) {
    callback(new Error("Two inputs don't match!"))
  } else {
    callback()
  }
}

const form = reactive({
  pass: '',
  checkPass: ''
})

const rules = reactive({
  pass: [{ validator: validatePass, trigger: 'blur' }],
  checkPass: [{ validator: validatePass2, trigger: 'blur' }]
})

const submitForm = () => {
  formRef.value.validate((valid) => {
    if (valid) {
      console.log('submit!')
    } else {
      console.log('error submit!')
    }
  })
}
</script>
```

### Inline Form

```vue
<template>
  <el-form :inline="true" :model="form">
    <el-form-item label="Approved by">
      <el-input v-model="form.user" placeholder="Approved by" />
    </el-form-item>
    <el-form-item label="Activity zone">
      <el-select v-model="form.region" placeholder="Activity zone">
        <el-option label="Zone one" value="shanghai" />
        <el-option label="Zone two" value="beijing" />
      </el-select>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="onSubmit">Query</el-button>
    </el-form-item>
  </el-form>
</template>
```

### Dynamic Form Items

```vue
<template>
  <el-form :model="form" ref="formRef">
    <el-form-item
      v-for="(item, index) in form.items"
      :key="index"
      :label="'Item ' + (index + 1)"
      :prop="'items.' + index + '.value'"
      :rules="{
        required: true,
        message: 'Item cannot be null',
        trigger: 'blur'
      }"
    >
      <el-input v-model="item.value" />
      <el-button @click="removeItem(index)">Delete</el-button>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="addItem">Add Item</el-button>
      <el-button type="primary" @click="submitForm">Submit</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref, reactive } from 'vue'

const formRef = ref()

const form = reactive({
  items: [{ value: '' }]
})

const addItem = () => {
  form.items.push({ value: '' })
}

const removeItem = (index) => {
  if (form.items.length > 1) {
    form.items.splice(index, 1)
  }
}

const submitForm = async () => {
  try {
    await formRef.value.validate()
    console.log('Form submitted:', form)
  } catch (error) {
    console.log('Validation failed')
  }
}
</script>
```

### Label Alignment

```vue
<template>
  <el-radio-group v-model="labelPosition" class="mb-4">
    <el-radio-button value="left">Left</el-radio-button>
    <el-radio-button value="right">Right</el-radio-button>
    <el-radio-button value="top">Top</el-radio-button>
  </el-radio-group>

  <el-form :model="form" :label-position="labelPosition" label-width="auto">
    <el-form-item label="Name">
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item label="Activity zone">
      <el-input v-model="form.region" />
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref, reactive } from 'vue'

const labelPosition = ref('right')
const form = reactive({
  name: '',
  region: ''
})
</script>
```

## Common Issues

### 1. Form Submit on Enter

To prevent form submission on Enter key:

```vue
<el-form @submit.prevent>
  <!-- form items -->
</el-form>
```

### 2. Nested Form Items

When nesting form items, set `label-width` on the nested item:

```vue
<el-form-item label="Outer">
  <el-form-item label="Inner" label-width="100px">
    <el-input />
  </el-form-item>
</el-form-item>
```

### 3. Number Validation

Use `.number` modifier for number validation:

```vue
<el-input v-model.number="form.age" />
```

### 4. Validation Not Triggering

Ensure `prop` matches the model key exactly:

```vue
<el-form :model="form">
  <el-form-item prop="name">  <!-- Must match form.name -->
    <el-input v-model="form.name" />
  </el-form-item>
</el-form>
```

## Component Interactions

### With Dialog

```vue
<template>
  <el-button @click="dialogVisible = true">Open Form</el-button>
  
  <el-dialog v-model="dialogVisible" title="Form Dialog">
    <el-form :model="form" :rules="rules" ref="formRef">
      <!-- form items -->
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">Cancel</el-button>
      <el-button type="primary" @click="handleSubmit">Submit</el-button>
    </template>
  </el-dialog>
</template>
```

### With API Submission

```vue
<script setup>
const handleSubmit = async () => {
  try {
    await formRef.value.validate()
    loading.value = true
    await api.submitForm(form)
    ElMessage.success('Submitted successfully')
  } catch (error) {
    if (error !== 'validation') {
      ElMessage.error('Submission failed')
    }
  } finally {
    loading.value = false
  }
}
</script>
```

## Best Practices

1. **Use reactive for form data**: Use `reactive()` for form model
2. **Define rules separately**: Keep validation rules in a separate reactive object
3. **Use prop attribute**: Always set `prop` on form items for validation
4. **Handle async validation**: Use async/await for validation
5. **Reset after submit**: Reset form after successful submission
6. **Disable during submit**: Disable submit button during API calls
