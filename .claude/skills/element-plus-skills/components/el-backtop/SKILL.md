---
name: "el-backtop"
description: "Backtop component for back-to-top button. Invoke when user needs to provide quick navigation back to the top of a long page."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Backtop Component

Backtop component provides a button to scroll back to the top of the page.

## When to Use

- Long page navigation
- Quick scroll to top
- Improved user experience
- Document readers

## Basic Usage

```vue
<template>
  <el-backtop />
</template>
```

## Customizations

```vue
<template>
  <el-backtop :bottom="100">
    <div class="backtop-custom">
      UP
    </div>
  </el-backtop>
</template>

<style>
.backtop-custom {
  height: 100%;
  width: 100%;
  background-color: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-lighter);
  text-align: center;
  line-height: 40px;
  color: #1989fa;
}
</style>
```

## Target Container

```vue
<template>
  <div class="scroll-container" style="height: 400px; overflow: auto;">
    <el-backtop target=".scroll-container" :visibility-height="100">
      UP
    </el-backtop>
  </div>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| target | Target to trigger scroll | `string` | — |
| visibility-height | Min height to show button | `number` | `200` |
| right | Right distance | `number` | `40` |
| bottom | Bottom distance | `number` | `40` |

### Events

| Name | Description | Type |
|------|-------------|------|
| click | Triggers when clicked | `(evt: MouseEvent) => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Customize default content |

## Best Practices

1. Set appropriate `visibility-height` for your layout
2. Customize position with `right` and `bottom`
3. Use `target` for scrollable containers
