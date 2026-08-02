---
name: "el-timeline"
description: "Timeline component for visually displaying timeline activities. Invoke when user needs to display chronological events, activity history, or process logs."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Timeline Component

Timeline component visually displays timeline activities with timestamps.

## When to Use

- Activity history
- Chronological events
- Process logs
- Version history

## Basic Usage

```vue
<template>
  <el-timeline>
    <el-timeline-item
      v-for="(activity, index) in activities"
      :key="index"
      :timestamp="activity.timestamp"
    >
      {{ activity.content }}
    </el-timeline-item>
  </el-timeline>
</template>

<script setup>
const activities = [
  { content: 'Event 1', timestamp: '2024-01-01' },
  { content: 'Event 2', timestamp: '2024-01-02' },
  { content: 'Event 3', timestamp: '2024-01-03' }
]
</script>
```

## Mode

```vue
<template>
  <el-timeline mode="alternate">
    <el-timeline-item timestamp="2024-01-01">Event 1</el-timeline-item>
    <el-timeline-item timestamp="2024-01-02">Event 2</el-timeline-item>
  </el-timeline>
</template>
```

## Custom Node

```vue
<template>
  <el-timeline>
    <el-timeline-item
      timestamp="2024-01-01"
      color="#0bbd87"
      size="large"
    >
      Custom node
    </el-timeline-item>
    <el-timeline-item
      timestamp="2024-01-02"
      :icon="Check"
    >
      With icon
    </el-timeline-item>
  </el-timeline>
</template>

<script setup>
import { Check } from '@element-plus/icons-vue'
</script>
```

## Custom Timestamp

```vue
<template>
  <el-timeline>
    <el-timeline-item timestamp="2024-01-01" placement="top">
      Timestamp on top
    </el-timeline-item>
  </el-timeline>
</template>
```

## Reverse

```vue
<template>
  <el-timeline reverse>
    <el-timeline-item timestamp="2024-01-01">First</el-timeline-item>
    <el-timeline-item timestamp="2024-01-02">Second</el-timeline-item>
  </el-timeline>
</template>
```

## API Reference

### Timeline Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| reverse | Reverse order | `boolean` | `false` |
| mode | Position of timeline | `'start' \| 'alternate' \| 'alternate-reverse' \| 'end'` | `'start'` |

### TimelineItem Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| timestamp | Timestamp content | `string` | `''` |
| hide-timestamp | Hide timestamp | `boolean` | `false` |
| center | Vertically centered | `boolean` | `false` |
| placement | Position of timestamp | `'top' \| 'bottom'` | `'bottom'` |
| type | Node type | `'primary' \| 'success' \| 'warning' \| 'danger' \| 'info'` | `''` |
| color | Background color of node | `string` | `''` |
| size | Node size | `'normal' \| 'large'` | `'normal'` |
| icon | Icon component | `string \| Component` | — |
| hollow | Icon is hollow | `boolean` | `false` |

### TimelineItem Slots

| Name | Description |
|------|-------------|
| default | Customize content |
| dot | Customize node |

## Best Practices

1. Use `mode="alternate"` for alternating layouts
2. Use `reverse` for newest-first ordering
3. Customize nodes with icons for visual distinction
