---
name: "element-plus-quickstart"
description: "Helps set up and configure Element Plus in Vue 3 projects. Invoke when user needs to install, import, or configure Element Plus in a new or existing project."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Quick Start

This skill provides comprehensive guidance for setting up Element Plus in Vue 3 projects, including installation, import methods, and global configuration.

## When to Invoke

Invoke this skill when:
- User wants to install Element Plus in a Vue 3 project
- User needs help with full import vs on-demand import
- User asks about configuring Element Plus with Vite, Webpack, or Nuxt
- User needs to set up global configuration (size, zIndex)
- User encounters issues with Element Plus installation or setup

## Installation Methods

### Package Manager Installation

```bash
# npm
npm install element-plus --save

# yarn
yarn add element-plus

# pnpm
pnpm install element-plus
```

### Browser Import (CDN)

```html
<head>
  <!-- Import style -->
  <link rel="stylesheet" href="//unpkg.com/element-plus/dist/index.css" />
  <!-- Import Vue 3 -->
  <script src="//unpkg.com/vue@3"></script>
  <!-- Import component library -->
  <script src="//unpkg.com/element-plus"></script>
</head>
```

## Import Methods

### Full Import

Suitable for projects where bundle size is not a primary concern.

```ts
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'

const app = createApp(App)
app.use(ElementPlus)
app.mount('#app')
```

#### Volar Support

Add global component type definition in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["element-plus/global"]
  }
}
```

### On-Demand Import (Recommended)

Install required plugins:

```bash
npm install -D unplugin-vue-components unplugin-auto-import
```

#### Vite Configuration

```ts
import { defineConfig } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
})
```

#### Webpack Configuration

```js
const AutoImport = require('unplugin-auto-import/webpack')
const Components = require('unplugin-vue-components/webpack')
const { ElementPlusResolver } = require('unplugin-vue-components/resolvers')

module.exports = {
  plugins: [
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
}
```

### Nuxt Integration

Install the Nuxt module:

```bash
npm install -D @element-plus/nuxt
```

Add to Nuxt config:

```ts
export default defineNuxtConfig({
  modules: ['@element-plus/nuxt'],
})
```

## Global Configuration

### Full Import Configuration

```ts
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import App from './App.vue'

const app = createApp(App)
app.use(ElementPlus, { size: 'small', zIndex: 3000 })
```

### On-Demand Configuration

Use `el-config-provider`:

```vue
<template>
  <el-config-provider :size="size" :z-index="zIndex">
    <app />
  </el-config-provider>
</template>

<script setup>
import { ref } from 'vue'

const zIndex = ref(3000)
const size = ref('small')
</script>
```

## Browser Compatibility

| Version | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| < 2.5.0 | ≥ 64   | ≥ 79 | ≥ 78    | ≥ 12   |
| 2.5.0+  | ≥ 85   | ≥ 85 | ≥ 79    | ≥ 14.1 |

**Note:** Element Plus does not support IE11 since Vue 3 no longer supports IE11.

## Sass Configuration

For version 2.8.5+, the minimum compatible Sass version is 1.79.0.

To resolve legacy JS API deprecation warning, configure in `vite.config.ts`:

```ts
css: {
  preprocessorOptions: {
    scss: { api: 'modern-compiler' },
  }
}
```

## Starter Templates

- [Vite Template](https://github.com/element-plus/element-plus-vite-starter)
- [Nuxt Template](https://github.com/element-plus/element-plus-nuxt-starter)
- [Laravel Template](https://github.com/element-plus/element-plus-in-laravel-starter)

## Common Issues

### Double-Closed Tags in DOM Templates

When using Element Plus in DOM templates, use double-closed tags to avoid parsing issues:

```html
<!-- Correct -->
<el-table>
  <el-table-column></el-table-column>
</el-table>

<!-- Incorrect -->
<el-table>
  <el-table-column />
</el-table>
```

## Input Parameters

When using this skill, provide the following information:
- **Project type**: Vite, Webpack, Nuxt, or CDN
- **Import method**: Full import or on-demand import (recommended)
- **Configuration needs**: Size, zIndex, or other global settings
- **TypeScript usage**: Whether the project uses TypeScript

## Output Format

This skill provides:
1. Installation commands for the specified package manager
2. Configuration code snippets for the build tool
3. Global configuration examples
4. Troubleshooting tips for common setup issues

## Usage Limitations

- Requires Vue 3.x (does not support Vue 2)
- Does not support IE11
- For SSR projects, additional configuration may be needed (refer to SSR skill)
- CDN usage is not recommended for production applications
