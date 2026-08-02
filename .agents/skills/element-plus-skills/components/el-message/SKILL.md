---
name: "el-message"
description: "Message notification component for displaying feedback messages. Invoke when user needs to show success, warning, error, or info messages."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Message Component

Displays a global message as feedback in response to user operations.

## When to Invoke

Invoke this skill when:
- User needs to show feedback messages
- User wants to display success/error notifications
- User needs closable messages
- User wants to customize message content
- User asks about message positioning

## Features

- **Multiple Types**: success, warning, info, error
- **Closable**: Manual or auto-close
- **Customizable Duration**: Configurable display time
- **HTML Content**: Support for HTML strings
- **Custom Icons**: Custom icon support
- **Multiple Placement**: Top, bottom, left, right positions
- **Grouping**: Merge similar messages
- **VNode Support**: Render Vue components as content

## API Reference

### Message Options

| Name | Description | Type | Default |
|------|-------------|------|---------|
| message | message text | `string \| VNode \| Function` | '' |
| type | message type | `'primary' \| 'success' \| 'warning' \| 'info' \| 'error'` | info |
| icon | custom icon component | `string \| Component` | — |
| dangerouslyUseHTMLString | whether message is HTML | `boolean` | false |
| customClass | custom class name | `string` | '' |
| duration | display duration (ms), 0 = no auto close | `number` | 3000 |
| showClose | whether to show close button | `boolean` | false |
| center | whether to center the text | `boolean` | false |
| onClose | callback when closed | `() => void` | — |
| offset | distance to viewport edge | `number` | 16 |
| appendTo | which element the message appends to | `string \| HTMLElement` | — |
| grouping | merge messages with same content | `boolean` | false |
| placement | message placement | `'top' \| 'top-left' \| 'top-right' \| 'bottom' \| 'bottom-left' \| 'bottom-right'` | top |

### Message Methods

| Method | Description | Parameters | Return |
|--------|-------------|------------|--------|
| ElMessage | Show a message | `options` | Message instance |
| ElMessage.success | Show success message | `message \| options` | Message instance |
| ElMessage.warning | Show warning message | `message \| options` | Message instance |
| ElMessage.info | Show info message | `message \| options` | Message instance |
| ElMessage.error | Show error message | `message \| options` | Message instance |
| ElMessage.closeAll | Close all messages | — | — |

### Message Instance

| Method | Description | Type |
|--------|-------------|------|
| close | Close the message | `() => void` |

## Usage Examples

### Basic Usage

```vue
<template>
  <el-button @click="open">Show Message</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const open = () => {
  ElMessage('This is a message.')
}
</script>
```

### Different Types

```vue
<template>
  <el-button @click="openSuccess">Success</el-button>
  <el-button @click="openWarning">Warning</el-button>
  <el-button @click="openInfo">Info</el-button>
  <el-button @click="openError">Error</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const openSuccess = () => {
  ElMessage.success('Success message')
}

const openWarning = () => {
  ElMessage.warning('Warning message')
}

const openInfo = () => {
  ElMessage.info('Info message')
}

const openError = () => {
  ElMessage.error('Error message')
}
</script>
```

### Closable Message

```vue
<template>
  <el-button @click="open">Show Closable Message</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const open = () => {
  ElMessage({
    showClose: true,
    message: 'This is a closable message.',
    type: 'success'
  })
}
</script>
```

### Custom Duration

```vue
<template>
  <el-button @click="open">Show Message (5s)</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const open = () => {
  ElMessage({
    message: 'This message will close after 5 seconds.',
    duration: 5000
  })
}
</script>
```

### Centered Text

```vue
<template>
  <el-button @click="open">Centered Message</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const open = () => {
  ElMessage({
    message: 'Centered text',
    center: true
  })
}
</script>
```

### HTML Content

```vue
<template>
  <el-button @click="open">HTML Message</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const open = () => {
  ElMessage({
    dangerouslyUseHTMLString: true,
    message: '<strong>This is <i>HTML</i> content</strong>'
  })
}
</script>
```

### Custom Icon

```vue
<template>
  <el-button @click="open">Custom Icon</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'
import { SuccessFilled } from '@element-plus/icons-vue'

const open = () => {
  ElMessage({
    message: 'Custom icon message',
    icon: SuccessFilled
  })
}
</script>
```

### Custom Offset

```vue
<template>
  <el-button @click="open">Offset Message</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const open = () => {
  ElMessage({
    message: 'This message has offset 100px',
    offset: 100
  })
}
</script>
```

### Different Placements

```vue
<template>
  <el-button @click="openTop">Top</el-button>
  <el-button @click="openTopLeft">Top Left</el-button>
  <el-button @click="openTopRight">Top Right</el-button>
  <el-button @click="openBottom">Bottom</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const openTop = () => {
  ElMessage({ message: 'Top message', placement: 'top' })
}

const openTopLeft = () => {
  ElMessage({ message: 'Top left message', placement: 'top-left' })
}

const openTopRight = () => {
  ElMessage({ message: 'Top right message', placement: 'top-right' })
}

const openBottom = () => {
  ElMessage({ message: 'Bottom message', placement: 'bottom' })
}
</script>
```

### Grouping Messages

```vue
<template>
  <el-button @click="open">Grouping</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const open = () => {
  ElMessage({
    message: 'This message will be grouped',
    grouping: true
  })
}
// Clicking multiple times will only show one message
}
</script>
```

### VNode Content

```vue
<template>
  <el-button @click="open">VNode Message</el-button>
</template>

<script setup>
import { ElMessage, h } from 'element-plus'

const open = () => {
  ElMessage({
    message: h('p', null, [
      h('span', null, 'Message can be '),
      h('i', { style: 'color: teal' }, 'VNode')
    ])
  })
}
</script>
```

### Close All Messages

```vue
<template>
  <el-button @click="open">Show Multiple</el-button>
  <el-button @click="closeAll">Close All</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const open = () => {
  ElMessage.success('Message 1')
  ElMessage.warning('Message 2')
  ElMessage.info('Message 3')
}

const closeAll = () => {
  ElMessage.closeAll()
}
</script>
```

### Using Instance

```vue
<template>
  <el-button @click="open">Show Message</el-button>
  <el-button @click="close">Close Message</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

let messageInstance = null

const open = () => {
  messageInstance = ElMessage({
    message: 'This message will be closed programmatically',
    duration: 0  // No auto close
  })
}

const close = () => {
  if (messageInstance) {
    messageInstance.close()
    messageInstance = null
  }
}
</script>
```

### With Async Operation

```vue
<template>
  <el-button @click="saveData">Save</el-button>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const saveData = async () => {
  const loading = ElMessage({
    message: 'Saving...',
    duration: 0
  })
  
  try {
    await api.save()
    loading.close()
    ElMessage.success('Saved successfully!')
  } catch (error) {
    loading.close()
    ElMessage.error('Save failed!')
  }
}
</script>
```

### Form Validation Feedback

```vue
<template>
  <el-form ref="formRef" :model="form" :rules="rules">
    <el-form-item prop="email">
      <el-input v-model="form.email" />
    </el-form-item>
    <el-button @click="submit">Submit</el-button>
  </el-form>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'

const formRef = ref()
const form = reactive({ email: '' })

const submit = async () => {
  try {
    await formRef.value.validate()
    await api.submit(form)
    ElMessage.success('Form submitted successfully!')
  } catch (error) {
    ElMessage.error('Please check the form for errors')
  }
}
</script>
```

## Common Issues

### 1. Message Not Showing

Ensure Element Plus styles are imported:

```js
import 'element-plus/dist/index.css'
```

### 2. Multiple Messages Stacking

Use `grouping: true` to merge similar messages:

```js
ElMessage({ message: 'Same message', grouping: true })
```

### 3. Message Not Closing

Check `duration` setting. Use `duration: 0` for manual close:

```js
const msg = ElMessage({ message: 'Manual close', duration: 0 })
// Later
msg.close()
```

## Best Practices

1. **Use appropriate types**: Use success, warning, error, info appropriately
2. **Keep messages short**: Messages should be concise and clear
3. **Use grouping**: Enable grouping for repeated operations
4. **Handle async operations**: Show loading message during async operations
5. **Close programmatically**: Use instance `close()` for manual control
6. **Avoid HTML**: Prefer VNode over HTML strings for security
