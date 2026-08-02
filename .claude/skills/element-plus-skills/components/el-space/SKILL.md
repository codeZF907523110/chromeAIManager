---
name: "el-space"
description: "Space component for consistent spacing between elements. Invoke when user needs to create consistent gaps between components, layout spacing, or element arrangement."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Space Component

Space component provides consistent spacing between elements for better layout control.

## When to Use

- Consistent component spacing
- Button groups
- Form layouts
- Navigation items

## Basic Usage

```vue
<template>
  <el-space>
    <el-button>Button 1</el-button>
    <el-button>Button 2</el-button>
    <el-button>Button 3</el-button>
  </el-space>
</template>
```

## Vertical Layout

```vue
<template>
  <el-space direction="vertical">
    <el-button>Button 1</el-button>
    <el-button>Button 2</el-button>
  </el-space>
</template>
```

## Control Size

```vue
<template>
  <el-space size="small">
    <el-button>Small</el-button>
  </el-space>
  <el-space size="default">
    <el-button>Default</el-button>
  </el-space>
  <el-space size="large">
    <el-button>Large</el-button>
  </el-space>
</template>
```

## Custom Size

```vue
<template>
  <el-space :size="20">
    <el-button>Button 1</el-button>
    <el-button>Button 2</el-button>
  </el-space>
</template>
```

## Auto Wrapping

```vue
<template>
  <el-space wrap>
    <el-button v-for="i in 20" :key="i">Button {{ i }}</el-button>
  </el-space>
</template>
```

## Spacer

```vue
<template>
  <el-space spacer="|">
    <el-button>Button 1</el-button>
    <el-button>Button 2</el-button>
  </el-space>
</template>
```

## Fill Container

```vue
<template>
  <el-space fill>
    <el-button>Button 1</el-button>
    <el-button>Button 2</el-button>
  </el-space>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| alignment | Alignment of items | CSS align-items | `'center'` |
| direction | Placement direction | `'vertical' \| 'horizontal'` | `'horizontal'` |
| spacer | Spacer element | `string \| number \| VNode` | — |
| size | Spacing size | `'default' \| 'small' \| 'large' \| number \| [number, number]` | `'small'` |
| wrap | Auto wrapping | `boolean` | `false` |
| fill | Fill container | `boolean` | `false` |
| fill-ratio | Fill ratio | `number` | `100` |

### Slots

| Name | Description |
|------|-------------|
| default | Items to be spaced |

## Best Practices

1. Use `wrap` for responsive layouts
2. Use `spacer` for custom separators
3. Use `fill` for equal-width items
