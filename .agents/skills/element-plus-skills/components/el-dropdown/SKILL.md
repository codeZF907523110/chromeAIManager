---
name: "el-dropdown"
description: "Dropdown component for toggleable menus displaying lists of links and actions. Invoke when user needs to create dropdown menus, action menus, or context menus."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Dropdown Component

Dropdown component provides a toggleable menu for displaying lists of links and actions.

## When to Use

- Navigation menus
- Action menus
- Context menus
- Split button actions

## Basic Usage

```vue
<template>
  <el-dropdown>
    <span class="el-dropdown-link">
      Dropdown List
      <el-icon class="el-icon--right"><ArrowDown /></el-icon>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item>Action 1</el-dropdown-item>
        <el-dropdown-item>Action 2</el-dropdown-item>
        <el-dropdown-item>Action 3</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup>
import { ArrowDown } from '@element-plus/icons-vue'
</script>
```

## Triggering Element

```vue
<template>
  <el-dropdown split-button type="primary" @click="handleClick">
    Dropdown List
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item>Action 1</el-dropdown-item>
        <el-dropdown-item>Action 2</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
```

## Trigger Methods

```vue
<template>
  <el-dropdown trigger="click">
    <span>Click to trigger</span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item>Action</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  
  <el-dropdown trigger="hover">
    <span>Hover to trigger</span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item>Action</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
```

## Command Event

```vue
<template>
  <el-dropdown @command="handleCommand">
    <span>Dropdown</span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="a">Action 1</el-dropdown-item>
        <el-dropdown-item command="b">Action 2</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup>
const handleCommand = (command) => {
  console.log('Command:', command)
}
</script>
```

## Sizes

```vue
<template>
  <el-dropdown size="large">
    <el-button>Large</el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item>Action</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
```

## API Reference

### Dropdown Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| type | Menu button type | Button type enum | `''` |
| size | Menu size | `'large' \| 'default' \| 'small'` | `''` |
| max-height | Max height of menu | `string \| number` | `''` |
| split-button | Display as button group | `boolean` | `false` |
| disabled | Whether disabled | `boolean` | `false` |
| placement | Placement of pop menu | Placement enum | `'bottom'` |
| effect | Tooltip theme | `'dark' \| 'light'` | `'light'` |
| trigger | How to trigger | `'click' \| 'hover' \| 'contextmenu'` | `'hover'` |
| hide-on-click | Hide menu after clicking | `boolean` | `true` |
| show-timeout | Delay before show | `number` | `150` |
| hide-timeout | Delay before hide | `number` | `150` |
| teleported | Teleport to body | `boolean` | `true` |

### Dropdown Events

| Name | Description | Type |
|------|-------------|------|
| click | Left button clicked (split-button) | `(e: MouseEvent) => void` |
| command | Dropdown item clicked | `(...args: any[]) => void` |
| visible-change | Dropdown visibility changes | `(val: boolean) => void` |

### Dropdown Exposes

| Name | Description | Type |
|------|-------------|------|
| handleOpen | Open dropdown menu | `() => void` |
| handleClose | Close dropdown menu | `() => void` |

### DropdownItem Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| command | Command to dispatch | `string \| number \| object` | — |
| disabled | Whether disabled | `boolean` | `false` |
| divided | Show divider | `boolean` | `false` |
| icon | Custom icon | `string \| Component` | — |

## Best Practices

1. Use `split-button` for primary action with dropdown
2. Use `command` event for action handling
3. Set `hide-on-click="false"` for multi-action menus
