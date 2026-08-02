---
name: "el-alert"
description: "Alert component for displaying important alert messages. Invoke when user needs to show non-dismissible notifications, status messages, or important information that requires user attention."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Alert Component

Alert component displays important alert messages on the page. Unlike notifications, alerts are non-overlay elements that do not disappear automatically.

## When to Use

- Display important system messages or warnings
- Show operation results (success, error, warning, info)
- Present non-dismissible status information
- Guide users with important instructions

## Basic Usage

```vue
<template>
  <el-alert title="success alert" type="success" />
  <el-alert title="warning alert" type="warning" />
  <el-alert title="info alert" type="info" />
  <el-alert title="error alert" type="error" />
  <el-alert title="primary alert" type="primary" />
</template>
```

## Theme Variations

```vue
<template>
  <el-alert title="Light theme" type="success" effect="light" />
  <el-alert title="Dark theme" type="success" effect="dark" />
</template>
```

## Customizable Close Button

```vue
<template>
  <el-alert title="unclosable alert" type="success" :closable="false" />
  <el-alert title="custom close text" type="info" close-text="Got it!" />
  <el-alert title="with close callback" type="warning" @close="handleClose" />
</template>

<script setup>
const handleClose = (event) => {
  console.log('Alert closed', event)
}
</script>
```

## With Icon

```vue
<template>
  <el-alert title="with default icon" type="success" show-icon />
  <el-alert title="custom icon slot" type="warning" show-icon>
    <template #icon>
      <el-icon><Star /></el-icon>
    </template>
  </el-alert>
</template>
```

## Centered Text

```vue
<template>
  <el-alert title="centered alert" type="success" center />
</template>
```

## With Description

```vue
<template>
  <el-alert
    title="with description"
    type="success"
    description="This is a description message with more details."
  />
</template>
```

## Complete Example with All Features

```vue
<template>
  <el-alert
    title="Success Alert"
    type="success"
    description="Your operation was completed successfully."
    show-icon
    center
    closable
    close-text="Dismiss"
    @close="handleClose"
  />
</template>

<script setup>
const handleClose = (event) => {
  console.log('Alert dismissed')
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| title | Alert title (required) | `string` | — |
| type | Alert type | `'primary' \| 'success' \| 'warning' \| 'info' \| 'error'` | `'info'` |
| description | Descriptive text | `string` | — |
| closable | Whether alert can be dismissed | `boolean` | `true` |
| center | Whether content is centered | `boolean` | `false` |
| close-text | Custom close button text | `string` | — |
| show-icon | Whether to display type icon | `boolean` | `false` |
| effect | Theme style | `'light' \| 'dark'` | `'light'` |

### Events

| Name | Description | Type |
|------|-------------|------|
| close | Triggered when alert is closed | `(event: MouseEvent) => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Content of the alert description |
| title | Content of the alert title |
| icon | Content of the alert icon |

## Common Patterns

### Dynamic Alert Type

```vue
<template>
  <el-alert
    :title="alertConfig.title"
    :type="alertConfig.type"
    :description="alertConfig.description"
    show-icon
  />
</template>

<script setup>
import { ref, reactive } from 'vue'

const alertConfig = reactive({
  title: 'Operation Status',
  type: 'info',
  description: ''
})

const showSuccess = () => {
  alertConfig.type = 'success'
  alertConfig.title = 'Success!'
  alertConfig.description = 'Operation completed successfully.'
}

const showError = () => {
  alertConfig.type = 'error'
  alertConfig.title = 'Error!'
  alertConfig.description = 'An error occurred during the operation.'
}
</script>
```

### Auto-dismiss Alert

```vue
<template>
  <el-alert
    v-if="visible"
    title="Auto-dismiss Alert"
    type="success"
    @close="visible = false"
  />
</template>

<script setup>
import { ref, watch } from 'vue'

const visible = ref(true)

watch(visible, (newVal) => {
  if (newVal) {
    setTimeout(() => {
      visible.value = false
    }, 3000)
  }
})
</script>
```

## Component Interactions

- Use with **Form** components to show validation results
- Combine with **Message** for temporary notifications vs persistent alerts
- Use with **Notification** for corner-based alerts that auto-dismiss
- Integrate with **Dialog** for modal alert scenarios

## Best Practices

1. Use appropriate types: `success` for positive outcomes, `error` for failures, `warning` for cautions, `info` for neutral information
2. Keep titles concise and descriptions informative
3. Use `show-icon` for better visual recognition
4. Consider `effect="dark"` for dark-themed interfaces
5. Use `closable="false"` for critical alerts that must be acknowledged
