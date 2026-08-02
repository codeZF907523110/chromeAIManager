---
name: "el-affix"
description: "Affix component for fixing elements to a specific visible area. Invoke when user needs to create sticky navigation, fixed headers, or elements that remain visible while scrolling."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Affix Component

Affix component fixes an element to a specific visible area, useful for sticky navigation, headers, or toolbars.

## When to Use

- Sticky navigation headers
- Fixed toolbars while scrolling
- Persistent action buttons
- Floating sidebars

## Basic Usage

```vue
<template>
  <el-affix :offset="120">
    <el-button type="primary">Offset top 120px</el-button>
  </el-affix>
</template>
```

## Target Container

```vue
<template>
  <div class="scroll-container" style="height: 400px; overflow: auto;">
    <el-affix target=".scroll-container" :offset="80">
      <el-button type="primary">Fixed in container</el-button>
    </el-affix>
  </div>
</template>
```

## Fixed Position

```vue
<template>
  <el-affix position="top" :offset="20">
    <el-button type="primary">Fixed at top</el-button>
  </el-affix>
  
  <el-affix position="bottom" :offset="20">
    <el-button type="primary">Fixed at bottom</el-button>
  </el-affix>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| offset | Offset distance | `number` | `0` |
| position | Position of affix | `'top' \| 'bottom'` | `'top'` |
| target | Target container (CSS selector) | `string` | — |
| z-index | z-index of affix | `number` | `100` |
| teleported | Whether affix element is teleported | `boolean` | `false` |
| append-to | Which element the affix appends to | `CSSSelector \| HTMLElement` | `'body'` |

### Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when fixed state changed | `(fixed: boolean) => void` |
| scroll | Triggers when scrolling | `({ scrollTop: number, fixed: boolean }) => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Customize default content |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| update | Update affix state manually | `() => void` |
| updateRoot | Update rootRect info | `() => void` |

## Common Patterns

### Sticky Header with State Tracking

```vue
<template>
  <el-affix :offset="0" @change="handleAffixChange">
    <header :class="{ 'is-fixed': isFixed }">
      <nav>Sticky Navigation</nav>
    </header>
  </el-affix>
</template>

<script setup>
import { ref } from 'vue'

const isFixed = ref(false)

const handleAffixChange = (fixed) => {
  isFixed.value = fixed
}
</script>
```

## Best Practices

1. Use `target` to limit affix to a specific container
2. Set appropriate `z-index` to avoid layering issues
3. Handle `change` event for UI state updates
