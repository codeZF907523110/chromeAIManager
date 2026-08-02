---
name: "el-badge"
description: "Badge component for displaying numbers or status marks on buttons and icons. Invoke when user needs to show notification counts, status indicators, or attention markers."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Badge Component

Badge component displays a number or status mark on buttons and icons for notifications and status indicators.

## When to Use

- Notification counts
- Status indicators
- Unread message badges
- Attention markers

## Basic Usage

```vue
<template>
  <el-badge :value="12" class="item">
    <el-button>comments</el-button>
  </el-badge>
  <el-badge :value="3" class="item">
    <el-button>replies</el-button>
  </el-badge>
</template>
```

## Max Value

```vue
<template>
  <el-badge :value="200" :max="99" class="item">
    <el-button>comments</el-button>
  </el-badge>
</template>
```

## Customizations

```vue
<template>
  <el-badge value="new" class="item">
    <el-button>comments</el-button>
  </el-badge>
  <el-badge value="hot" class="item">
    <el-button>replies</el-button>
  </el-badge>
</template>
```

## Red Dot

```vue
<template>
  <el-badge is-dot class="item">
    <el-button>query</el-button>
  </el-badge>
  <el-badge is-dot class="item">
    <el-icon><Bell /></el-icon>
  </el-badge>
</template>
```

## Offset

```vue
<template>
  <el-badge :value="5" :offset="[10, 10]">
    <el-button>Offset badge</el-button>
  </el-badge>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| value | Display value | `string \| number` | `''` |
| max | Maximum value, shows `{max}+` when exceeded | `number` | `99` |
| is-dot | Display as a dot | `boolean` | `false` |
| hidden | Hidden badge | `boolean` | `false` |
| type | Badge type | `'primary' \| 'success' \| 'warning' \| 'danger' \| 'info'` | `'danger'` |
| show-zero | Show badge when value is zero | `boolean` | `true` |
| color | Background color of the dot | `string` | — |
| offset | Offset of badge | `[number, number]` | `[0, 0]` |
| badge-style | Custom style of badge | `CSSProperties` | — |
| badge-class | Custom class of badge | `string` | — |

### Slots

| Name | Description | Type |
|------|-------------|------|
| default | Customize default content | — |
| content | Customize badge content | `{ value: string }` |

## Common Patterns

### Notification Badge

```vue
<template>
  <el-badge :value="unreadCount" :hidden="unreadCount === 0">
    <el-icon><Bell /></el-icon>
  </el-badge>
</template>

<script setup>
import { ref } from 'vue'

const unreadCount = ref(5)
</script>
```

## Best Practices

1. Use `max` to prevent large numbers from overflowing
2. Use `is-dot` for simple status indicators
3. Set `hidden` when count is zero and `show-zero` is false
