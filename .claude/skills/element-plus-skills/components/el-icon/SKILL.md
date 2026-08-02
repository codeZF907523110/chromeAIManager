---
name: "el-icon"
description: "Icon component for displaying SVG icons. Invoke when user needs to display icons, customize icon sizes and colors, or use Element Plus icon collection."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Icon Component

Icon component provides SVG icons with customizable size and color.

## When to Use

- UI icons
- Button icons
- Status indicators
- Visual elements

## Installation

```bash
npm install @element-plus/icons-vue
```

## Basic Usage

```vue
<template>
  <el-icon :size="30" :color="color">
    <Edit />
  </el-icon>
</template>

<script setup>
import { ref } from 'vue'
import { Edit } from '@element-plus/icons-vue'

const color = ref('#409EFC')
</script>
```

## Combined with Components

```vue
<template>
  <el-button type="primary">
    <el-icon style="vertical-align: middle;">
      <Search />
    </el-icon>
    <span style="vertical-align: middle;">Search</span>
  </el-button>
</template>

<script setup>
import { Search } from '@element-plus/icons-vue'
</script>
```

## Loading Icon

```vue
<template>
  <el-icon class="is-loading">
    <Loading />
  </el-icon>
</template>

<script setup>
import { Loading } from '@element-plus/icons-vue'
</script>
```

## Using SVG Directly

```vue
<template>
  <Edit style="width: 1em; height: 1em; margin-right: 8px;" />
  <Share style="width: 1em; height: 1em; margin-right: 8px;" />
  <Delete style="width: 1em; height: 1em; margin-right: 8px;" />
</template>

<script setup>
import { Edit, Share, Delete } from '@element-plus/icons-vue'
</script>
```

## Global Registration

```ts
// main.ts
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

const app = createApp(App)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| color | SVG fill color | `string` | inherit from parent |
| size | Icon size | `number \| string` | inherit from font size |

### Slots

| Name | Description |
|------|-------------|
| default | SVG icon component |

## Icon Collection

Element Plus provides 300+ icons including:
- Action icons: Edit, Delete, Share, Download, Upload
- Arrow icons: ArrowLeft, ArrowRight, ArrowUp, ArrowDown
- Status icons: SuccessFilled, WarningFilled, CircleCloseFilled, InfoFilled
- Media icons: Picture, VideoCamera, Microphone
- And many more...

## Best Practices

1. Use `el-icon` wrapper for consistent sizing
2. Add `is-loading` class for loading animations
3. Import icons individually for tree-shaking
