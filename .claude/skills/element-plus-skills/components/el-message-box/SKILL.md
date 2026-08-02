---
name: "el-message-box"
description: "MessageBox component for modal dialogs simulating system alerts, confirms, and prompts. Invoke when user needs to show alert messages, confirm actions, or prompt for user input."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# MessageBox Component

MessageBox provides modal dialogs for alerts, confirmations, and prompts.

## When to Use

- Alert messages
- Action confirmations
- User input prompts
- Critical notifications

## Alert

```vue
<template>
  <el-button @click="open">Show Alert</el-button>
</template>

<script setup>
import { ElMessageBox } from 'element-plus'

const open = () => {
  ElMessageBox.alert('This is a message', 'Title', {
    confirmButtonText: 'OK',
    callback: (action) => {
      console.log(action)
    }
  })
}
</script>
```

## Confirm

```vue
<template>
  <el-button @click="open">Show Confirm</el-button>
</template>

<script setup>
import { ElMessageBox } from 'element-plus'

const open = () => {
  ElMessageBox.confirm(
    'This will permanently delete the file. Continue?',
    'Warning',
    {
      confirmButtonText: 'OK',
      cancelButtonText: 'Cancel',
      type: 'warning'
    }
  ).then(() => {
    console.log('Confirmed')
  }).catch(() => {
    console.log('Cancelled')
  })
}
</script>
```

## Prompt

```vue
<template>
  <el-button @click="open">Show Prompt</el-button>
</template>

<script setup>
import { ElMessageBox } from 'element-plus'

const open = () => {
  ElMessageBox.prompt('Please input your email', 'Tip', {
    confirmButtonText: 'OK',
    cancelButtonText: 'Cancel',
    inputPattern: /[\w!#$%&'*+/=?^_`{|}~-]+(?:\.[\w!#$%&'*+/=?^_`{|}~-]+)*@(?:[\w](?:[\w-]*[\w])?\.)+[\w](?:[\w-]*[\w])?/,
    inputErrorMessage: 'Invalid Email'
  }).then(({ value }) => {
    console.log('Email:', value)
  }).catch(() => {
    console.log('Cancelled')
  })
}
</script>
```

## Customization

```vue
<template>
  <el-button @click="open">Custom MessageBox</el-button>
</template>

<script setup>
import { ElMessageBox } from 'element-plus'

const open = () => {
  ElMessageBox({
    title: 'Message',
    message: 'This is a custom message',
    showCancelButton: true,
    confirmButtonText: 'OK',
    cancelButtonText: 'Cancel',
    beforeClose: (action, instance, done) => {
      if (action === 'confirm') {
        instance.confirmButtonLoading = true
        setTimeout(() => {
          done()
          instance.confirmButtonLoading = false
        }, 1000)
      } else {
        done()
      }
    }
  })
}
</script>
```

## Centered

```vue
<template>
  <el-button @click="open">Centered</el-button>
</template>

<script setup>
import { ElMessageBox } from 'element-plus'

const open = () => {
  ElMessageBox.confirm(
    'This is a centered message',
    'Center',
    {
      center: true
    }
  )
}
</script>
```

## Draggable

```vue
<template>
  <el-button @click="open">Draggable</el-button>
</template>

<script setup>
import { ElMessageBox } from 'element-plus'

const open = () => {
  ElMessageBox.confirm(
    'This is a draggable message',
    'Draggable',
    {
      draggable: true
    }
  )
}
</script>
```

## API Reference

### Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| ElMessageBox.alert | Show alert dialog | `(message, title, options)` |
| ElMessageBox.confirm | Show confirm dialog | `(message, title, options)` |
| ElMessageBox.prompt | Show prompt dialog | `(message, title, options)` |
| ElMessageBox.close | Close message box | — |

### Options

| Name | Description | Type | Default |
|------|-------------|------|---------|
| title | Title | `string` | `''` |
| message | Content | `string \| VNode` | — |
| type | Message type | `'primary' \| 'success' \| 'warning' \| 'info' \| 'error'` | — |
| icon | Custom icon | `string \| Component` | — |
| dangerouslyUseHTMLString | Render message as HTML | `boolean` | `false` |
| customClass | Custom class | `string` | `''` |
| customStyle | Custom style | `CSSProperties` | `{}` |
| showClose | Show close button | `boolean` | `true` |
| showCancelButton | Show cancel button | `boolean` | `false` |
| showConfirmButton | Show confirm button | `boolean` | `true` |
| cancelButtonText | Cancel button text | `string` | `'Cancel'` |
| confirmButtonText | Confirm button text | `string` | `'OK'` |
| cancelButtonType | Cancel button type | Button type enum | — |
| confirmButtonType | Confirm button type | Button type enum | `'primary'` |
| closeOnClickModal | Close on backdrop click | `boolean` | `true` |
| closeOnPressEscape | Close on ESC | `boolean` | `true` |
| center | Center content | `boolean` | `false` |
| draggable | Enable dragging | `boolean` | `false` |
| beforeClose | Callback before close | `(action, instance, done) => void` | — |
| distinguishCancelAndClose | Distinguish cancel vs close | `boolean` | `false` |
| inputPlaceholder | Input placeholder | `string` | `''` |
| inputPattern | Input validation pattern | `RegExp` | — |
| inputValidator | Input validator | `(value) => boolean \| string` | — |
| inputErrorMessage | Validation error message | `string` | `'Illegal input'` |

## Best Practices

1. Use `alert` for simple notifications
2. Use `confirm` for action confirmations
3. Use `prompt` for user input
4. Use `beforeClose` for async operations
