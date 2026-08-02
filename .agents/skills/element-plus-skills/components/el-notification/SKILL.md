---
name: "el-notification"
description: "Notification component for displaying notification messages at the corner of the page. Invoke when user needs to show persistent notifications with custom content."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Notification Component

Displays a global notification message at the corner of the page.

## When to Invoke

Invoke this skill when:
- User needs to show persistent notifications
- User wants to display notifications with title and message
- User needs to position notifications at different corners
- User wants to customize notification content
- User asks about notification with HTML or VNode

## Features

- **Multiple Types**: success, warning, info, error
- **Custom Position**: top-right, top-left, bottom-right, bottom-left
- **Closable**: Manual or auto-close
- **Custom Duration**: Configurable display time
- **HTML Content**: Support for HTML strings
- **VNode Support**: Render Vue components as content
- **Custom Icons**: Custom icon support
- **Offset**: Distance from screen edge

## API Reference

### Notification Options

| Name | Description | Type | Default |
|------|-------------|------|---------|
| title | title | `string` | '' |
| message | description text | `string \| VNode \| Function` | '' |
| dangerouslyUseHTMLString | whether message is HTML | `boolean` | false |
| type | notification type | `'primary' \| 'success' \| 'warning' \| 'info' \| 'error'` | '' |
| icon | custom icon component | `string \| Component` | — |
| customClass | custom class name | `string` | '' |
| duration | duration before close (ms), 0 = no auto close | `number` | 4500 |
| position | custom position | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` | top-right |
| showClose | whether to show close button | `boolean` | true |
| onClose | callback when closed | `() => void` | — |
| onClick | callback when clicked | `() => void` | — |
| offset | offset from screen edge | `number` | 0 |
| appendTo | which element the notification appends to | `string \| HTMLElement` | — |
| zIndex | initial zIndex | `number` | — |

### Notification Methods

| Method | Description | Parameters | Return |
|--------|-------------|------------|--------|
| ElNotification | Show a notification | `options` | Notification instance |
| ElNotification.success | Show success notification | `message \| options` | Notification instance |
| ElNotification.warning | Show warning notification | `message \| options` | Notification instance |
| ElNotification.info | Show info notification | `message \| options` | Notification instance |
| ElNotification.error | Show error notification | `message \| options` | Notification instance |
| ElNotification.closeAll | Close all notifications | — | — |

### Notification Instance

| Method | Description | Type |
|--------|-------------|------|
| close | Close the notification | `() => void` |

## Usage Examples

### Basic Usage

```vue
<template>
  <el-button @click="open">Show Notification</el-button>
</template>

<script setup>
import { ElNotification } from 'element-plus'

const open = () => {
  ElNotification({
    title: 'Title',
    message: 'This is a notification message'
  })
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
import { ElNotification } from 'element-plus'

const openSuccess = () => {
  ElNotification.success({
    title: 'Success',
    message: 'This is a success message'
  })
}

const openWarning = () => {
  ElNotification.warning({
    title: 'Warning',
    message: 'This is a warning message'
  })
}

const openInfo = () => {
  ElNotification.info({
    title: 'Info',
    message: 'This is an info message'
  })
}

const openError = () => {
  ElNotification.error({
    title: 'Error',
    message: 'This is an error message'
  })
}
</script>
```

### Custom Position

```vue
<template>
  <el-button @click="openTopRight">Top Right</el-button>
  <el-button @click="openTopLeft">Top Left</el-button>
  <el-button @click="openBottomRight">Bottom Right</el-button>
  <el-button @click="openBottomLeft">Bottom Left</el-button>
</template>

<script setup>
import { ElNotification } from 'element-plus'

const openTopRight = () => {
  ElNotification({
    title: 'Top Right',
    message: 'Notification at top right',
    position: 'top-right'
  })
}

const openTopLeft = () => {
  ElNotification({
    title: 'Top Left',
    message: 'Notification at top left',
    position: 'top-left'
  })
}

const openBottomRight = () => {
  ElNotification({
    title: 'Bottom Right',
    message: 'Notification at bottom right',
    position: 'bottom-right'
  })
}

const openBottomLeft = () => {
  ElNotification({
    title: 'Bottom Left',
    message: 'Notification at bottom left',
    position: 'bottom-left'
  })
}
</script>
```

### With Offset

```vue
<template>
  <el-button @click="open">Notification with Offset</el-button>
</template>

<script setup>
import { ElNotification } from 'element-plus'

const open = () => {
  ElNotification({
    title: 'Offset',
    message: 'This notification has 100px offset',
    offset: 100
  })
}
</script>
```

### HTML Content

```vue
<template>
  <el-button @click="open">HTML Notification</el-button>
</template>

<script setup>
import { ElNotification } from 'element-plus'

const open = () => {
  ElNotification({
    title: 'HTML Content',
    dangerouslyUseHTMLString: true,
    message: '<strong>This is <i>HTML</i> content</strong>'
  })
}
</script>
```

### VNode Content

```vue
<template>
  <el-button @click="open">VNode Notification</el-button>
</template>

<script setup>
import { ElNotification, h } from 'element-plus'

const open = () => {
  ElNotification({
    title: 'VNode Content',
    message: h('i', { style: 'color: teal' }, 'This is VNode content')
  })
}
</script>
```

### Hide Close Button

```vue
<template>
  <el-button @click="open">No Close Button</el-button>
</template>

<script setup>
import { ElNotification } from 'element-plus'

const open = () => {
  ElNotification({
    title: 'No Close',
    message: 'This notification has no close button',
    showClose: false
  })
}
</script>
```

### Custom Duration

```vue
<template>
  <el-button @click="open">Long Duration</el-button>
</template>

<script setup>
import { ElNotification } from 'element-plus'

const open = () => {
  ElNotification({
    title: 'Long Duration',
    message: 'This notification will stay for 10 seconds',
    duration: 10000
  })
}
</script>
```

### Manual Close

```vue
<template>
  <el-button @click="open">Show</el-button>
  <el-button @click="close">Close</el-button>
</template>

<script setup>
import { ElNotification } from 'element-plus'

let notification = null

const open = () => {
  notification = ElNotification({
    title: 'Manual Close',
    message: 'Click the button to close',
    duration: 0  // No auto close
  })
}

const close = () => {
  if (notification) {
    notification.close()
    notification = null
  }
}
</script>
```

### Click Callback

```vue
<template>
  <el-button @click="open">Clickable Notification</el-button>
</template>

<script setup>
import { ElNotification } from 'element-plus'

const open = () => {
  ElNotification({
    title: 'Click Me',
    message: 'Click this notification to trigger callback',
    onClick: () => {
      console.log('Notification clicked!')
    }
  })
}
</script>
```

### Close All

```vue
<template>
  <el-button @click="openMultiple">Show Multiple</el-button>
  <el-button @click="closeAll">Close All</el-button>
</template>

<script setup>
import { ElNotification } from 'element-plus'

const openMultiple = () => {
  ElNotification.success({ title: 'Success', message: 'Message 1' })
  ElNotification.warning({ title: 'Warning', message: 'Message 2' })
  ElNotification.info({ title: 'Info', message: 'Message 3' })
}

const closeAll = () => {
  ElNotification.closeAll()
}
</script>
```

## Common Issues

### 1. Notification Not Showing

Ensure Element Plus styles are imported:

```js
import 'element-plus/dist/index.css'
```

### 2. Notifications Overlapping

Use `offset` to adjust position:

```js
ElNotification({ message: 'Message 1', offset: 0 })
ElNotification({ message: 'Message 2', offset: 100 })
```

### 3. Notification Not Closing

Check `duration` setting. Use `duration: 0` for manual close:

```js
const notification = ElNotification({ message: 'Manual close', duration: 0 })
// Later
notification.close()
```

## Best Practices

1. **Use appropriate types**: Use success, warning, error, info appropriately
2. **Keep messages short**: Notifications should be concise
3. **Use title**: Always include a meaningful title
4. **Position consistently**: Use consistent position across the app
5. **Handle async operations**: Show notifications for async operation results
6. **Avoid HTML**: Prefer VNode over HTML strings for security
