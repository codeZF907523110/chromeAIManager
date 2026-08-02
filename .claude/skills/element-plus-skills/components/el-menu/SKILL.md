---
name: "el-menu"
description: "Menu component for website navigation with horizontal and vertical modes. Invoke when user needs to create navigation menus, sidebars, or dropdown menus."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Menu Component

Menu that provides navigation for your website.

## When to Invoke

Invoke this skill when:
- User needs to create a navigation menu
- User wants horizontal or vertical menu
- User needs collapsible sidebar menu
- User wants to integrate with Vue Router
- User asks about submenu or menu groups

## Features

- **Multiple Modes**: Horizontal (top bar) and vertical (sidebar)
- **Collapsible**: Vertical menu can be collapsed
- **Vue Router Integration**: Automatic route navigation
- **Submenus**: Multi-level nested menus
- **Menu Groups**: Group related menu items
- **Customizable**: Colors, icons, and themes
- **Accessibility**: Keyboard navigation support

## API Reference

### Menu Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| mode | menu display mode | `'horizontal' \| 'vertical'` | vertical |
| collapse | whether the menu is collapsed (only vertical mode) | `boolean` | false |
| ellipsis | whether the menu is ellipsis (only horizontal mode) | `boolean` | true |
| ellipsis-icon | custom ellipsis icon (only horizontal mode) | `string \| Component` | — |
| popper-offset | offset of the popper | `number` | 6 |
| default-active | index of active menu on page load | `string` | '' |
| default-openeds | array of expanded sub-menus indexes | `string[]` | [] |
| unique-opened | whether only one sub-menu can be active | `boolean` | false |
| menu-trigger | how sub-menus are triggered (horizontal mode) | `'hover' \| 'click'` | hover |
| router | whether vue-router mode is activated | `boolean` | false |
| collapse-transition | whether to enable collapse transition | `boolean` | true |
| popper-effect | Tooltip theme when collapsed | `'dark' \| 'light'` | dark |
| close-on-click-outside | whether menu collapses when clicking outside | `boolean` | false |
| popper-class | custom class for popup menus | `string` | — |
| popper-style | custom style for popup menus | `string \| object` | — |
| show-timeout | timeout before showing menu | `number` | 300 |
| hide-timeout | timeout before hiding menu | `number` | 300 |

### Menu Events

| Name | Description | Type |
|------|-------------|------|
| select | callback when menu is activated | `(index, indexPath, item, routerResult) => void` |
| open | callback when sub-menu expands | `(index, indexPath) => void` |
| close | callback when sub-menu collapses | `(index, indexPath) => void` |

### Menu Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | customize default content | SubMenu / MenuItem / MenuItemGroup |

### Menu Exposes

| Name | Description | Type |
|------|-------------|------|
| open | open a specific sub-menu | `(index: string) => void` |
| close | close a specific sub-menu | `(index: string) => void` |
| handleResize | manually trigger menu width recalculation | `() => void` |
| updateActiveIndex | set index of active menu | `(index: string) => void` |

### SubMenu Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| index | unique identification (required) | `string` | — |
| popper-class | custom class for popup menu | `string` | — |
| popper-style | custom style for popup menu | `string \| object` | — |
| show-timeout | timeout before showing | `number` | — |
| hide-timeout | timeout before hiding | `number` | — |
| disabled | whether disabled | `boolean` | false |
| teleported | whether popup is teleported | `boolean` | undefined |
| popper-offset | offset of the popper | `number` | — |
| expand-close-icon | icon when expanded and submenu closed | `string \| Component` | — |
| expand-open-icon | icon when expanded and submenu open | `string \| Component` | — |
| collapse-close-icon | icon when collapsed and submenu closed | `string \| Component` | — |
| collapse-open-icon | icon when collapsed and submenu open | `string \| Component` | — |

### SubMenu Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | customize default content | SubMenu / MenuItem / MenuItemGroup |
| title | customize title content | — |

### MenuItem Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| index | unique identification (required) | `string` | — |
| route | Vue Router route parameters | `string \| object` | — |
| disabled | whether disabled | `boolean` | false |

### MenuItem Events

| Name | Description | Type |
|------|-------------|------|
| click | callback when menu-item is clicked | `(item) => void` |

### MenuItem Slots

| Name | Description |
|------|-------------|
| default | customize default content |
| title | customize title content |

### MenuItemGroup Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| title | group title | `string` | — |

### MenuItemGroup Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | customize default content | MenuItem |
| title | customize group title | — |

## Usage Examples

### Top Bar (Horizontal)

```vue
<template>
  <el-menu
    :default-active="activeIndex"
    mode="horizontal"
    @select="handleSelect"
  >
    <el-menu-item index="1">Processing Center</el-menu-item>
    <el-sub-menu index="2">
      <template #title>Workspace</template>
      <el-menu-item index="2-1">Item One</el-menu-item>
      <el-menu-item index="2-2">Item Two</el-menu-item>
      <el-menu-item index="2-3">Item Three</el-menu-item>
    </el-sub-menu>
    <el-menu-item index="3" disabled>Info</el-menu-item>
    <el-menu-item index="4">Orders</el-menu-item>
  </el-menu>
</template>

<script setup>
import { ref } from 'vue'

const activeIndex = ref('1')

const handleSelect = (key, keyPath) => {
  console.log(key, keyPath)
}
</script>
```

### Left And Right Alignment

```vue
<template>
  <el-menu mode="horizontal">
    <el-menu-item index="1">Left Item</el-menu-item>
    <el-menu-item index="2">Left Item</el-menu-item>
    <div style="flex-grow: 1" />
    <el-menu-item index="3">Right Item</el-menu-item>
    <el-menu-item index="4">Right Item</el-menu-item>
  </el-menu>
</template>
```

### Sidebar (Vertical)

```vue
<template>
  <el-menu
    :default-active="activeIndex"
    class="el-menu-vertical"
  >
    <el-menu-item index="1">
      <el-icon><location /></el-icon>
      <span>Navigator One</span>
    </el-menu-item>
    <el-menu-item index="2">
      <el-icon><document /></el-icon>
      <span>Navigator Two</span>
    </el-menu-item>
    <el-menu-item index="3">
      <el-icon><setting /></el-icon>
      <span>Navigator Three</span>
    </el-menu-item>
  </el-menu>
</template>

<script setup>
import { ref } from 'vue'
import { Location, Document, Setting } from '@element-plus/icons-vue'

const activeIndex = ref('1')
</script>

<style>
.el-menu-vertical {
  width: 200px;
  min-height: 400px;
}
</style>
```

### Collapsible Sidebar

```vue
<template>
  <el-radio-group v-model="isCollapse" style="margin-bottom: 20px">
    <el-radio-button :value="false">Expand</el-radio-button>
    <el-radio-button :value="true">Collapse</el-radio-button>
  </el-radio-group>
  
  <el-menu
    :default-active="activeIndex"
    :collapse="isCollapse"
    class="el-menu-vertical"
  >
    <el-menu-item index="1">
      <el-icon><HomeFilled /></el-icon>
      <template #title>Home</template>
    </el-menu-item>
    <el-sub-menu index="2">
      <template #title>
        <el-icon><Document /></el-icon>
        <span>Documents</span>
      </template>
      <el-menu-item index="2-1">Recent</el-menu-item>
      <el-menu-item index="2-2">Starred</el-menu-item>
    </el-sub-menu>
    <el-menu-item index="3">
      <el-icon><Setting /></el-icon>
      <template #title>Settings</template>
    </el-menu-item>
  </el-menu>
</template>

<script setup>
import { ref } from 'vue'
import { HomeFilled, Document, Setting } from '@element-plus/icons-vue'

const isCollapse = ref(false)
const activeIndex = ref('1')
</script>

<style>
.el-menu-vertical:not(.el-menu--collapse) {
  width: 200px;
}
</style>
```

### With Vue Router

```vue
<template>
  <el-menu
    :default-active="$route.path"
    router
  >
    <el-menu-item index="/dashboard">
      <el-icon><HomeFilled /></el-icon>
      <span>Dashboard</span>
    </el-menu-item>
    <el-menu-item index="/users">
      <el-icon><User /></el-icon>
      <span>Users</span>
    </el-menu-item>
    <el-menu-item index="/settings">
      <el-icon><Setting /></el-icon>
      <span>Settings</span>
    </el-menu-item>
  </el-menu>
</template>
```

### Menu Groups

```vue
<template>
  <el-menu :default-active="activeIndex">
    <el-menu-item-group title="Group One">
      <el-menu-item index="1-1">Option 1</el-menu-item>
      <el-menu-item index="1-2">Option 2</el-menu-item>
    </el-menu-item-group>
    <el-menu-item-group title="Group Two">
      <el-menu-item index="2-1">Option 3</el-menu-item>
      <el-menu-item index="2-2">Option 4</el-menu-item>
    </el-menu-item-group>
  </el-menu>
</template>
```

## Common Issues

### 1. Menu Not Updating Active State

Use `updateActiveIndex` method:

```vue
<script setup>
const menuRef = ref()

const updateActive = (index) => {
  menuRef.value?.updateActiveIndex(index)
}
</script>
```

### 2. Router Navigation Not Working

Ensure `router` prop is set and `index` matches route path:

```vue
<el-menu router>
  <el-menu-item index="/dashboard">Dashboard</el-menu-item>
</el-menu>
```

### 3. Custom Height in Horizontal Mode

Override CSS variable:

```css
.el-menu--horizontal {
  --el-menu-horizontal-height: 80px;
}
```

## Best Practices

1. **Use router mode**: Integrate with Vue Router for SPA navigation
2. **Consistent icons**: Use icons consistently across menu items
3. **Group related items**: Use MenuItemGroup for organization
4. **Collapse for mobile**: Use collapse mode for responsive design
5. **Unique indexes**: Ensure each menu item has a unique index
