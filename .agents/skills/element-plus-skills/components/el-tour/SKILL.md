---
name: "el-tour"
description: "Tour component for guiding users through products. Invoke when user needs to create product tours, onboarding guides, or feature walkthroughs."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Tour Component

Tour is a popup component for guiding users through a product with step-by-step instructions.

## When to Use

- Product onboarding
- Feature tours
- User guidance
- Tutorial walkthroughs

## Basic Usage

```vue
<template>
  <el-button ref="buttonRef">Start Tour</el-button>
  
  <el-tour v-model="open">
    <el-tour-step
      :target="buttonRef?.$el"
      title="Start Tour"
      description="Click this button to start the tour"
    />
    <el-tour-step
      :target="inputRef?.$el"
      title="Input Field"
      description="This is an input field"
    />
  </el-tour>
</template>

<script setup>
import { ref } from 'vue'

const open = ref(false)
const buttonRef = ref()
const inputRef = ref()
</script>
```

## Non-modal

```vue
<template>
  <el-tour v-model="open" :mask="false" type="primary">
    <el-tour-step
      :target="targetRef"
      title="Non-modal Tour"
      description="This tour doesn't block interactions"
    />
  </el-tour>
</template>
```

## Custom Placement

```vue
<template>
  <el-tour v-model="open">
    <el-tour-step
      :target="targetRef"
      placement="right"
      title="Right Placement"
      description="The guide appears on the right"
    />
  </el-tour>
</template>
```

## Custom Mask Style

```vue
<template>
  <el-tour
    v-model="open"
    :mask="{
      style: { boxShadow: '0 0 10px rgba(0,0,0,0.3)' },
      color: 'rgba(0, 0, 0, 0.5)'
    }"
  >
    <el-tour-step :target="targetRef" title="Custom Mask" />
  </el-tour>
</template>
```

## API Reference

### Tour Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Open tour | `boolean` | `false` |
| current / v-model:current | Current step | `number` | `0` |
| placement | Default placement | Placement enum | `'bottom'` |
| mask | Mask configuration | `boolean \| { style?, color? }` | `true` |
| type | Tour type | `'default' \| 'primary'` | `'default'` |
| show-arrow | Show arrow | `boolean` | `true` |
| show-close | Show close button | `boolean` | `true` |
| close-on-press-escape | Close on ESC | `boolean` | `true` |
| scroll-into-view-options | Scroll options | `boolean \| ScrollIntoViewOptions` | `{ block: 'center' }` |
| z-index | Z-index | `number` | `2001` |

### Tour Events

| Name | Description | Type |
|------|-------------|------|
| close | Tour closes | `(current: number) => void` |
| finish | Tour finishes | `() => void` |
| change | Step changes | `(current: number) => void` |

### Tour Slots

| Name | Description | Type |
|------|-------------|------|
| default | TourStep components | — |
| indicators | Custom indicators | `{ current, total }` |

### TourStep Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| target | Target element | `HTMLElement \| string \| () => HTMLElement` | — |
| title | Step title | `string` | — |
| description | Step description | `string` | — |
| placement | Step placement | Placement enum | `'bottom'` |
| show-arrow | Show arrow | `boolean` | — |
| show-close | Show close button | `boolean` | — |
| next-button-props | Next button props | `{ children, onClick }` | — |
| prev-button-props | Previous button props | `{ children, onClick }` | — |

### TourStep Slots

| Name | Description |
|------|-------------|
| default | Custom description |
| header | Custom header |

## Best Practices

1. Use `mask="false"` for non-blocking tours
2. Use `type="primary"` for emphasis
3. Provide clear step descriptions
