---
name: "el-container"
description: "Container components for scaffolding basic page structure with header, aside, main, and footer sections. Invoke when user needs to create page layouts."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Container Components

Container components for scaffolding basic structure of the page.

## When to Invoke

Invoke this skill when:
- User needs to create a page layout
- User wants to implement header/footer/aside/main sections
- User needs to create admin dashboard layouts
- User asks about responsive layouts
- User needs nested container layouts

## Features

- **Flex-based Layout**: Uses CSS Flexbox for layout
- **Automatic Direction**: Direction based on child elements
- **Nested Support**: Multiple levels of nesting
- **Customizable Sizes**: Configurable header height, aside width
- **Responsive**: Works with responsive design

## Components

### Container (`el-container`)
Wrapper container. When nested with a `<el-header>` or `<el-footer>`, all its child elements will be vertically arranged. Otherwise horizontally.

### Header (`el-header`)
Container for headers.

### Aside (`el-aside`)
Container for side sections (usually a side nav).

### Main (`el-main`)
Container for main sections.

### Footer (`el-footer`)
Container for footers.

## API Reference

### Container Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| direction | layout direction for child elements | `'horizontal' \| 'vertical'` | vertical when nested with `el-header` or `el-footer`; horizontal otherwise |

### Container Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | customize default content | Container / Header / Aside / Main / Footer |

### Header Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| height | height of the header | `string` | 60px |

### Header Slots

| Name | Description |
|------|-------------|
| default | customize default content |

### Aside Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| width | width of the side section | `string` | 300px |

### Aside Slots

| Name | Description |
|------|-------------|
| default | customize default content |

### Main Slots

| Name | Description |
|------|-------------|
| default | customize default content |

### Footer Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| height | height of the footer | `string` | 60px |

### Footer Slots

| Name | Description |
|------|-------------|
| default | customize default content |

## Usage Examples

### Basic Layout (Header + Main)

```vue
<template>
  <el-container>
    <el-header>Header</el-header>
    <el-main>Main</el-main>
  </el-container>
</template>

<style scoped>
.el-header,
.el-main {
  background-color: #b3c0d1;
  color: #333;
  text-align: center;
  line-height: 60px;
}

.el-main {
  background-color: #e9eef3;
  line-height: 160px;
}
</style>
```

### Header + Main + Footer

```vue
<template>
  <el-container>
    <el-header>Header</el-header>
    <el-main>Main</el-main>
    <el-footer>Footer</el-footer>
  </el-container>
</template>
```

### Aside + Main

```vue
<template>
  <el-container>
    <el-aside width="200px">Aside</el-aside>
    <el-main>Main</el-main>
  </el-container>
</template>

<style scoped>
.el-aside {
  background-color: #d3dce6;
  color: #333;
  text-align: center;
  line-height: 200px;
}

.el-main {
  background-color: #e9eef3;
  color: #333;
  text-align: center;
  line-height: 160px;
}
</style>
```

### Header + Aside + Main

```vue
<template>
  <el-container>
    <el-header>Header</el-header>
    <el-container>
      <el-aside width="200px">Aside</el-aside>
      <el-main>Main</el-main>
    </el-container>
  </el-container>
</template>
```

### Header + Aside + Main + Footer

```vue
<template>
  <el-container>
    <el-header>Header</el-header>
    <el-container>
      <el-aside width="200px">Aside</el-aside>
      <el-container>
        <el-main>Main</el-main>
        <el-footer>Footer</el-footer>
      </el-container>
    </el-container>
  </el-container>
</template>
```

### Aside + Header + Main

```vue
<template>
  <el-container>
    <el-aside width="200px">Aside</el-aside>
    <el-container>
      <el-header>Header</el-header>
      <el-main>Main</el-main>
    </el-container>
  </el-container>
</template>
```

### Aside + Header + Main + Footer

```vue
<template>
  <el-container>
    <el-aside width="200px">Aside</el-aside>
    <el-container>
      <el-header>Header</el-header>
      <el-main>Main</el-main>
      <el-footer>Footer</el-footer>
    </el-container>
  </el-container>
</template>
```

### Full Dashboard Layout

```vue
<template>
  <el-container style="height: 100vh">
    <el-aside width="200px">
      <el-menu
        :default-active="activeIndex"
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
    </el-aside>
    
    <el-container>
      <el-header>
        <div class="header-content">
          <span>Admin Dashboard</span>
          <el-dropdown>
            <span class="user-info">
              <el-avatar :size="32" />
              <span>Admin</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item>Profile</el-dropdown-item>
                <el-dropdown-item divided>Logout</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <el-main>
        <router-view />
      </el-main>
      
      <el-footer>
        © 2024 Your Company
      </el-footer>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref } from 'vue'
import { HomeFilled, User, Setting } from '@element-plus/icons-vue'

const activeIndex = ref('/dashboard')
</script>

<style scoped>
.el-header {
  background-color: #fff;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
}

.header-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.el-aside {
  background-color: #304156;
}

.el-menu {
  border-right: none;
}

.el-footer {
  background-color: #f5f5f5;
  text-align: center;
}
</style>
```

## Common Issues

### 1. Container Not Filling Screen

Set height on the container:

```vue
<el-container style="height: 100vh">
  <!-- content -->
</el-container>
```

### 2. Aside Width Not Changing

Use the `width` attribute:

```vue
<el-aside width="250px">Aside</el-aside>
```

### 3. Content Overflow

Add overflow styles:

```vue
<el-main style="overflow: auto">
  <!-- content -->
</el-main>
```

## Best Practices

1. **Use semantic structure**: Follow header-main-footer pattern
2. **Set container height**: Always set height for full-page layouts
3. **Responsive design**: Use CSS media queries for responsive layouts
4. **Nested containers**: Use nested containers for complex layouts
5. **Combine with Menu**: Use Aside with Menu for navigation
