---
name: "el-result"
description: "Result component for feedback on operation results. Invoke when user needs to display success, error, warning, or info result pages with custom content."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Result Component

Result component provides feedback on operation results or access exceptions.

## When to Use

- Success pages
- Error pages
- Warning displays
- Info results

## Basic Usage

```vue
<template>
  <el-result icon="success" title="Success" sub-title="Operation completed" />
  <el-result icon="warning" title="Warning" sub-title="Please check your input" />
  <el-result icon="error" title="Error" sub-title="Something went wrong" />
  <el-result icon="info" title="Info" sub-title="Additional information" />
</template>
```

## Customized Content

```vue
<template>
  <el-result
    icon="error"
    title="404"
    sub-title="Sorry, the page you visited does not exist."
  >
    <template #extra>
      <el-button type="primary" @click="goHome">Back Home</el-button>
    </template>
  </el-result>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
const goHome = () => router.push('/')
</script>
```

## Custom Icon

```vue
<template>
  <el-result title="Custom Icon">
    <template #icon>
      <el-icon :size="100"><Warning /></el-icon>
    </template>
  </el-result>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| title | Title | `string` | `''` |
| sub-title | Sub title | `string` | `''` |
| icon | Icon type | `'primary' \| 'success' \| 'warning' \| 'info' \| 'error'` | `'info'` |

### Slots

| Name | Description |
|------|-------------|
| icon | Custom icon |
| title | Custom title |
| sub-title | Custom sub title |
| extra | Extra area content |

## Best Practices

1. Use appropriate icon types for context
2. Provide actionable buttons in extra slot
3. Keep messages clear and concise
