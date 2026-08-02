---
name: "el-tooltip"
description: "Tooltip component for displaying prompt information on mouse hover. Invoke when user needs to show hints, tips, or additional information on hover."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Tooltip Component

Display prompt information for mouse hover.

## When to Invoke

Invoke this skill when:
- User needs to show tooltip on hover
- User wants to display hints or tips
- User needs to position tooltip in different directions
- User wants to customize tooltip content
- User asks about tooltip with HTML content

## Features

- **9 Placements**: top, bottom, left, right with alignment options
- **Two Themes**: dark and light
- **HTML Content**: Support for HTML strings
- **VNode Content**: Render Vue components as content
- **Virtual Triggering**: Separate trigger and content elements
- **Controlled Mode**: Control visibility programmatically
- **Custom Animation**: Customizable transitions

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| append-to | Which element the tooltip CONTENT appends to | `CSSSelector \| HTMLElement` | — |
| effect | Tooltip theme | `'dark' \| 'light'` | dark |
| content | Display content | `string` | '' |
| raw-content | Whether content is HTML string | `boolean` | false |
| placement | Position of Tooltip | `'top' \| 'top-start' \| 'top-end' \| 'bottom' \| 'bottom-start' \| 'bottom-end' \| 'left' \| 'left-start' \| 'left-end' \| 'right' \| 'right-start' \| 'right-end'` | bottom |
| fallback-placements | List of possible positions | `Placement[]` | — |
| visible / v-model:visible | Visibility of Tooltip | `boolean` | — |
| disabled | Whether Tooltip is disabled | `boolean` | — |
| offset | Offset of the Tooltip | `number` | 12 |
| transition | Animation name | `string` | — |
| popper-options | popper.js parameters | `object` | {} |
| arrow-offset | Offset of tooltip arrow | `number` | 5 |
| show-after | Delay of appearance (ms) | `number` | 0 |
| show-arrow | Whether tooltip has arrow | `boolean` | true |
| hide-after | Delay of disappear (ms) | `number` | 200 |
| auto-close | Timeout to hide tooltip (ms) | `number` | 0 |
| popper-class | Custom class for Tooltip's popper | `string` | — |
| popper-style | Custom style for Tooltip's popper | `string \| object` | — |
| enterable | Whether mouse can enter tooltip | `boolean` | true |
| teleported | Whether tooltip content is teleported | `boolean` | true |
| trigger | How tooltip is triggered | `'hover' \| 'click' \| 'focus' \| 'contextmenu' \| Array` | hover |
| virtual-triggering | Whether virtual triggering is enabled | `boolean` | — |
| virtual-ref | Reference element for virtual triggering | `HTMLElement` | — |
| trigger-keys | Keyboard codes to control display | `Array` | ['Enter', 'Space'] |
| persistent | Whether tooltip persists when inactive | `boolean` | — |
| aria-label | Same as aria-label | `string` | — |
| focus-on-target | Whether to focus trigger element on hover | `boolean` | false |

### Events

| Name | Description | Type |
|------|-------------|------|
| before-show | Triggers before tooltip is shown | `(event?) => void` |
| show | Triggers when tooltip is shown | `(event?) => void` |
| before-hide | Triggers before tooltip is hidden | `(event?) => void` |
| hide | Triggers when tooltip is hidden | `(event?) => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Tooltip triggering element, only a single root element is accepted |
| content | Customize content |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| popperRef | el-popper component instance | `Ref<PopperInstance \| undefined>` |
| contentRef | el-tooltip-content component instance | `Ref<TooltipContentInstance \| undefined>` |
| isFocusInsideContent | Validate focus inside tooltip | `() => boolean \| undefined` |
| updatePopper | Update el-popper component | `() => void` |
| onOpen | Open tooltip | `(event?) => void` |
| onClose | Close tooltip | `(event?) => void` |
| hide | Hide tooltip | `(event?) => void` |

## Usage Examples

### Basic Usage

```vue
<template>
  <el-tooltip content="Top center" placement="top">
    <el-button>Top</el-button>
  </el-tooltip>
  
  <el-tooltip content="Bottom center" placement="bottom">
    <el-button>Bottom</el-button>
  </el-tooltip>
</template>
```

### Theme

```vue
<template>
  <el-tooltip content="Dark theme" effect="dark">
    <el-button>Dark</el-button>
  </el-tooltip>
  
  <el-tooltip content="Light theme" effect="light">
    <el-button>Light</el-button>
  </el-tooltip>
</template>
```

### Rich Content

```vue
<template>
  <el-tooltip placement="top">
    <template #content>
      <div>Multiple lines</div>
      <div>Second line</div>
      <div>Third line</div>
    </template>
    <el-button>Rich Content</el-button>
  </el-tooltip>
</template>
```

### HTML Content

```vue
<template>
  <el-tooltip
    raw-content
    content="<strong>Bold</strong> and <i>italic</i>"
  >
    <el-button>HTML Content</el-button>
  </el-tooltip>
</template>
```

### Advanced Usage

```vue
<template>
  <el-tooltip
    :disabled="disabled"
    :hide-after="0"
    placement="bottom"
  >
    <template #content>
      <span>Custom content</span>
    </template>
    <el-button>Advanced</el-button>
  </el-tooltip>
</template>

<script setup>
import { ref } from 'vue'

const disabled = ref(false)
</script>
```

### Virtual Triggering

```vue
<template>
  <el-button ref="triggerRef">Trigger</el-button>
  
  <el-tooltip
    virtual-triggering
    :virtual-ref="triggerRef"
    content="Virtual tooltip"
  />
</template>

<script setup>
import { ref } from 'vue'

const triggerRef = ref()
</script>
```

### Controlled Visibility

```vue
<template>
  <el-tooltip
    v-model:visible="visible"
    content="Controlled tooltip"
  >
    <el-button @click="visible = !visible">
      Toggle Tooltip
    </el-button>
  </el-tooltip>
</template>

<script setup>
import { ref } from 'vue'

const visible = ref(false)
</script>
```

### Custom Animation

```vue
<template>
  <el-tooltip
    content="Custom animation"
    transition="el-zoom-in-top"
  >
    <el-button>Custom Animation</el-button>
  </el-tooltip>
</template>
```

### Click Trigger

```vue
<template>
  <el-tooltip
    content="Click to show"
    trigger="click"
  >
    <el-button>Click Trigger</el-button>
  </el-tooltip>
</template>
```

### With Form Elements

```vue
<template>
  <!-- Wrap disabled elements in a container -->
  <el-tooltip content="This field is disabled">
    <div>
      <el-input disabled placeholder="Disabled input" />
    </div>
  </el-tooltip>
</template>
```

## Common Issues

### 1. Tooltip Not Showing on Disabled Elements

Wrap disabled elements in a container:

```vue
<el-tooltip content="Tooltip">
  <div>
    <el-button disabled>Disabled Button</el-button>
  </div>
</el-tooltip>
```

### 2. Router-link Not Working in Tooltip

Use `vm.$router.push` instead:

```vue
<el-tooltip>
  <template #content>
    <span @click="$router.push('/path')">Link</span>
  </template>
</el-tooltip>
```

### 3. Space Key Not Working in Nested Input

Set `trigger-keys` to empty array:

```vue
<el-tooltip :trigger-keys="[]">
  <el-input v-model="value" />
</el-tooltip>
```

## Best Practices

1. **Keep content short**: Tooltips should be concise
2. **Use appropriate placement**: Position tooltip near the trigger
3. **Avoid HTML content**: Prefer VNode for security
4. **Disabled element handling**: Wrap disabled elements in a container
5. **Controlled mode**: Use v-model:visible for programmatic control
