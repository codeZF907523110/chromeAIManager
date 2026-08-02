---
name: "el-card"
description: "Card component for integrating information in a card container. Invoke when user needs to display grouped content, dashboard cards, or content sections with headers."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Card Component

Card component integrates information in a card container with optional header and footer.

## When to Use

- Dashboard cards
- Content sections
- Product displays
- Information grouping

## Basic Usage

```vue
<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>Card name</span>
        <el-button class="button" text>Operation button</el-button>
      </div>
    </template>
    Card content
  </el-card>
</template>
```

## Simple Card

```vue
<template>
  <el-card>
    Card content without header
  </el-card>
</template>
```

## With Images

```vue
<template>
  <el-card :body-style="{ padding: '0px' }">
    <img src="https://example.com/image.jpg" class="image" />
    <div style="padding: 14px">
      <span>Yummy hamburger</span>
      <div class="bottom">
        <time class="time">{{ currentDate }}</time>
        <el-button text class="button">Operating</el-button>
      </div>
    </div>
  </el-card>
</template>
```

## Shadow

```vue
<template>
  <el-card shadow="always">Always show shadow</el-card>
  <el-card shadow="hover">Show shadow on hover</el-card>
  <el-card shadow="never">Never show shadow</el-card>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| header | Title of the card | `string` | — |
| footer | Footer of the card | `string` | — |
| body-style | CSS style of card body | `CSSProperties` | — |
| header-class | Custom class of card header | `string` | — |
| body-class | Custom class of card body | `string` | — |
| footer-class | Custom class of card footer | `string` | — |
| shadow | When to show card shadows | `'always' \| 'never' \| 'hover'` | `'always'` |

### Slots

| Name | Description |
|------|-------------|
| default | Customize default content |
| header | Content of the Card header |
| footer | Content of the Card footer |

## Common Patterns

### Dashboard Card

```vue
<template>
  <el-card class="dashboard-card">
    <template #header>
      <div class="card-header">
        <span>{{ title }}</span>
        <el-button link type="primary">View All</el-button>
      </div>
    </template>
    <div class="card-content">
      <el-statistic :value="value" />
    </div>
  </el-card>
</template>

<script setup>
defineProps({
  title: String,
  value: Number
})
</script>
```

## Best Practices

1. Use `shadow="hover"` for interactive cards
2. Set `body-style` for custom padding
3. Use header and footer slots for structured content
