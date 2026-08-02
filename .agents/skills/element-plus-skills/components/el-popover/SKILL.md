---
name: "el-popover"
description: "Popover component for displaying rich content in a popup. Invoke when user needs to show complex content, nested operations, or rich information in a popup."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Popover Component

Display rich content in a popup, triggered by hover, click, focus, or contextmenu.

## When to Invoke

Invoke this skill when:
- User needs to show rich content in a popup
- User wants to create nested operations
- User needs to display tables or forms in a popup
- User wants to trigger popup by click or hover
- User asks about virtual triggering

## Features

- **9 Placements**: Same as Tooltip
- **Multiple Triggers**: hover, click, focus, contextmenu
- **Rich Content**: Support for complex content like tables, forms
- **Virtual Triggering**: Separate trigger and content elements
- **Nested Components**: Can nest other components
- **Customizable Width**: Configurable width

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| trigger | How popover is triggered | `'click' \| 'focus' \| 'hover' \| 'contextmenu' \| Array` | hover |
| trigger-keys | Keyboard codes to control display | `Array` | ['Enter', 'Space'] |
| title | Popover title | `string` | — |
| effect | Tooltip theme | `'dark' \| 'light'` | light |
| content | Popover content | `string` | '' |
| width | Popover width | `string \| number` | 150 |
| placement | Popover placement | `'top' \| 'top-start' \| 'top-end' \| 'bottom' \| 'bottom-start' \| 'bottom-end' \| 'left' \| 'left-start' \| 'left-end' \| 'right' \| 'right-start' \| 'right-end'` | bottom |
| disabled | Whether Popover is disabled | `boolean` | false |
| visible / v-model:visible | Whether popover is visible | `boolean \| null` | null |
| offset | Popover offset | `number` | undefined |
| transition | Transition animation | `string` | — |
| show-arrow | Whether arrow is displayed | `boolean` | true |
| popper-options | popper.js parameters | `object` | {} |
| popper-class | Custom class for popover | `string` | — |
| popper-style | Custom style for popover | `string \| object` | — |
| show-after | Delay of appearance (ms) | `number` | 0 |
| hide-after | Delay of disappear (ms) | `number` | 200 |
| auto-close | Timeout to hide (ms) | `number` | 0 |
| tabindex | tabindex of Popover | `number \| string` | 0 |
| teleported | Whether popover is teleported | `boolean` | true |
| append-to | Which element popover appends to | `CSSSelector \| HTMLElement` | body |
| persistent | Whether popover persists when inactive | `boolean` | true |
| virtual-triggering | Whether virtual triggering is enabled | `boolean` | — |
| virtual-ref | Reference element for virtual triggering | `HTMLElement` | — |

### Slots

| Name | Description | Type |
|------|-------------|------|
| default | Content of popover | `{hide: () => void}` |
| reference | HTML element that triggers popover | — |

### Events

| Name | Description | Type |
|------|-------------|------|
| show | Triggers when popover shows | `() => void` |
| before-enter | Triggers before entering transition | `() => void` |
| after-enter | Triggers after entering transition | `() => void` |
| hide | Triggers when popover hides | `() => void` |
| before-leave | Triggers before leaving transition | `() => void` |
| after-leave | Triggers after leaving transition | `() => void` |

### Exposes

| Name | Description | Type |
|------|-------------|------|
| hide | Hide popover | `() => void` |

## Usage Examples

### Basic Usage

```vue
<template>
  <el-popover
    title="Title"
    content="This is popover content"
    trigger="click"
  >
    <template #reference>
      <el-button>Click to activate</el-button>
    </template>
  </el-popover>
</template>
```

### Hover Trigger

```vue
<template>
  <el-popover
    placement="top"
    title="Title"
    :width="200"
    trigger="hover"
    content="This is popover content"
  >
    <template #reference>
      <el-button>Hover to activate</el-button>
    </template>
  </el-popover>
</template>
```

### Rich Content

```vue
<template>
  <el-popover placement="right" :width="400">
    <template #reference>
      <el-button>Click to see table</el-button>
    </template>
    <el-table :data="tableData">
      <el-table-column prop="name" label="Name" />
      <el-table-column prop="address" label="Address" />
    </el-table>
  </el-popover>
</template>

<script setup>
const tableData = [
  { name: 'Tom', address: 'No. 189, Grove St' },
  { name: 'Jack', address: 'No. 189, Grove St' }
]
</script>
```

### Nested Operations

```vue
<template>
  <el-popover placement="top" :width="160">
    <template #reference>
      <el-button>Delete</el-button>
    </template>
    <p>Are you sure to delete this?</p>
    <div style="text-align: right; margin: 0">
      <el-button size="small" text @click="visible = false">Cancel</el-button>
      <el-button size="small" type="primary" @click="visible = false">
        Confirm
      </el-button>
    </div>
  </el-popover>
</template>

<script setup>
import { ref } from 'vue'

const visible = ref(false)
</script>
```

### With Form

```vue
<template>
  <el-popover placement="bottom" :width="300" trigger="click">
    <template #reference>
      <el-button>Open Form</el-button>
    </template>
    <el-form :model="form" label-width="80px">
      <el-form-item label="Name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="Email">
        <el-input v-model="form.email" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="submitForm">Submit</el-button>
      </el-form-item>
    </el-form>
  </el-popover>
</template>

<script setup>
import { reactive } from 'vue'

const form = reactive({
  name: '',
  email: ''
})

const submitForm = () => {
  console.log('Form submitted:', form)
}
</script>
```

### Virtual Triggering

```vue
<template>
  <el-button ref="buttonRef">Trigger</el-button>
  
  <el-popover
    virtual-triggering
    :virtual-ref="buttonRef"
    content="Virtual popover content"
  />
</template>

<script setup>
import { ref } from 'vue'

const buttonRef = ref()
</script>
```

### Controlled Visibility

```vue
<template>
  <el-popover v-model:visible="visible" content="Controlled popover">
    <template #reference>
      <el-button @click="visible = !visible">Toggle</el-button>
    </template>
  </el-popover>
</template>

<script setup>
import { ref } from 'vue'

const visible = ref(false)
</script>
```

### Multiple Triggers

```vue
<template>
  <el-popover
    :trigger="['click', 'hover']"
    content="Multiple triggers"
  >
    <template #reference>
      <el-button>Click or Hover</el-button>
    </template>
  </el-popover>
</template>
```

### Custom Width

```vue
<template>
  <el-popover :width="300" content="Wide popover content">
    <template #reference>
      <el-button>Wide Popover</el-button>
    </template>
  </el-popover>
</template>
```

### No Arrow

```vue
<template>
  <el-popover :show-arrow="false" content="No arrow popover">
    <template #reference>
      <el-button>No Arrow</el-button>
    </template>
  </el-popover>
</template>
```

### Close from Content

```vue
<template>
  <el-popover placement="top" :width="200">
    <template #reference>
      <el-button>Click</el-button>
    </template>
    <template #default="{ hide }">
      <p>Click button to close</p>
      <el-button @click="hide">Close</el-button>
    </template>
  </el-popover>
</template>
```

## Common Issues

### 1. Popover Not Closing

Use `hide` function from slot:

```vue
<el-popover>
  <template #default="{ hide }">
    <el-button @click="hide">Close</el-button>
  </template>
</el-popover>
```

### 2. Popover Position Issues

Use `placement` and `fallback-placements`:

```vue
<el-popover
  placement="top"
  :fallback-placements="['bottom', 'left', 'right']"
>
</el-popover>
```

### 3. Click Outside Not Closing

Set `trigger="click"`:

```vue
<el-popover trigger="click">
</el-popover>
```

## Best Practices

1. **Use appropriate trigger**: Choose trigger based on use case
2. **Set width**: Set appropriate width for content
3. **Close from content**: Use `hide` function for custom close
4. **Virtual triggering**: Use for complex trigger scenarios
5. **Controlled visibility**: Use v-model:visible for programmatic control
