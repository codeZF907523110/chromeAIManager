---
name: "el-collapse"
description: "Collapse component for storing expandable content. Invoke when user needs to create accordion panels, FAQ sections, or collapsible content areas."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Collapse Component

Collapse component stores content in expandable panels, supporting accordion mode and custom styling.

## When to Use

- FAQ sections
- Accordion panels
- Collapsible content areas
- Expandable lists

## Basic Usage

```vue
<template>
  <el-collapse v-model="activeNames">
    <el-collapse-item title="Consistency" name="1">
      <div>Content of panel 1</div>
    </el-collapse-item>
    <el-collapse-item title="Feedback" name="2">
      <div>Content of panel 2</div>
    </el-collapse-item>
    <el-collapse-item title="Efficiency" name="3">
      <div>Content of panel 3</div>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup>
import { ref } from 'vue'

const activeNames = ref(['1'])
</script>
```

## Accordion Mode

```vue
<template>
  <el-collapse v-model="activeName" accordion>
    <el-collapse-item title="Panel 1" name="1">
      <div>Content</div>
    </el-collapse-item>
    <el-collapse-item title="Panel 2" name="2">
      <div>Content</div>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup>
import { ref } from 'vue'

const activeName = ref('1')
</script>
```

## Custom Title

```vue
<template>
  <el-collapse v-model="activeNames">
    <el-collapse-item name="1">
      <template #title>
        <span>Custom Title</span>
        <el-icon><InfoFilled /></el-icon>
      </template>
      <div>Content</div>
    </el-collapse-item>
  </el-collapse>
</template>
```

## Custom Icon

```vue
<template>
  <el-collapse v-model="activeNames">
    <el-collapse-item title="Panel" name="1" :icon="CaretRight">
      <div>Content</div>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup>
import { CaretRight } from '@element-plus/icons-vue'
</script>
```

## Prevent Collapsing

```vue
<template>
  <el-collapse v-model="activeNames" :before-collapse="beforeCollapse">
    <el-collapse-item title="Panel" name="1">
      <div>Content</div>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup>
const beforeCollapse = () => {
  return confirm('Are you sure you want to collapse?')
}
</script>
```

## API Reference

### Collapse Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Active panel(s) | `string \| array` | `[]` |
| accordion | Enable accordion mode | `boolean` | `false` |
| expand-icon-position | Position of expand icon | `'left' \| 'right'` | `'right'` |
| before-collapse | Hook before collapse | `() => Promise<boolean> \| boolean` | — |

### Collapse Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when active panels change | `(activeNames: array \| string) => void` |

### Collapse Exposes

| Name | Description | Type |
|------|-------------|------|
| activeNames | Currently active panel names | `ComputedRef<(string \| number)[]>` |
| setActiveNames | Set active panel names | `(activeNames) => void` |

### CollapseItem Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| name | Unique identification | `string \| number` | — |
| title | Title of the panel | `string` | `''` |
| icon | Icon of the item | `string \| Component` | `ArrowRight` |
| disabled | Disable the item | `boolean` | `false` |

### CollapseItem Slots

| Name | Description | Type |
|------|-------------|------|
| default | Content of Collapse Item | — |
| title | Content of title | `{ isActive: boolean }` |
| icon | Content of icon | `{ isActive: boolean }` |

## Best Practices

1. Use `accordion` mode for single-panel expansion
2. Use `before-collapse` for confirmation dialogs
3. Customize icon position with `expand-icon-position`
