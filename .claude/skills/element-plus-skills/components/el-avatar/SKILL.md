---
name: "el-avatar"
description: "Avatar component for representing people or objects with images, icons, or characters. Invoke when user needs to display user avatars, profile pictures, or entity representations."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Avatar Component

Avatar component displays user avatars or entity representations, supporting images, icons, or characters.

## When to Use

- User profile pictures
- Team member displays
- Entity representations
- Avatar groups for teams

## Basic Usage

```vue
<template>
  <el-avatar :size="50" :src="avatarUrl" />
  <el-avatar shape="square" :size="50" :src="avatarUrl" />
</template>

<script setup>
const avatarUrl = 'https://example.com/avatar.jpg'
</script>
```

## Types

```vue
<template>
  <el-avatar :icon="UserFilled" />
  <el-avatar :src="avatarUrl" />
  <el-avatar>user</el-avatar>
</template>

<script setup>
import { UserFilled } from '@element-plus/icons-vue'
</script>
```

## Fallback

```vue
<template>
  <el-avatar :src="invalidUrl" @error="errorHandler">
    <img src="fallback.jpg" />
  </el-avatar>
</template>

<script setup>
const errorHandler = () => true
</script>
```

## Fit Container

```vue
<template>
  <el-avatar shape="square" :size="100" fit="fill" :src="avatarUrl" />
  <el-avatar shape="square" :size="100" fit="contain" :src="avatarUrl" />
  <el-avatar shape="square" :size="100" fit="cover" :src="avatarUrl" />
</template>
```

## Avatar Group

```vue
<template>
  <el-avatar-group>
    <el-avatar :src="url1" />
    <el-avatar :src="url2" />
    <el-avatar :src="url3" />
  </el-avatar-group>
</template>
```

## API Reference

### Avatar Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| icon | Icon representation | `string \| Component` | — |
| size | Avatar size | `number \| 'large' \| 'default' \| 'small'` | — |
| shape | Avatar shape | `'circle' \| 'square'` | — |
| src | Image source | `string` | — |
| src-set | Native srcset attribute | `string` | — |
| alt | Native alt attribute | `string` | — |
| fit | How image fits container | `'fill' \| 'contain' \| 'cover' \| 'none' \| 'scale-down'` | `'cover'` |

### Avatar Events

| Name | Description | Type |
|------|-------------|------|
| error | Trigger when image load error | `(e: Event) => void` |

### Avatar Slots

| Name | Description |
|------|-------------|
| default | Customize avatar content |

### AvatarGroup Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| size | Control size of avatars in group | `number \| 'large' \| 'default' \| 'small'` | — |
| shape | Control shape of avatars in group | `'circle' \| 'square'` | — |
| collapse-avatars | Whether to collapse avatars | `boolean` | `false` |
| collapse-avatars-tooltip | Show collapsed avatars on hover | `boolean` | `false` |
| max-collapse-avatars | Max avatars shown before collapse | `number` | `1` |
| effect | Tooltip theme | `'dark' \| 'light'` | `'light'` |
| placement | Tooltip placement | Placement enum | `'top'` |

## Best Practices

1. Use `fit="cover"` for consistent avatar appearance
2. Provide fallback content for image load errors
3. Use AvatarGroup for team displays with collapse feature
