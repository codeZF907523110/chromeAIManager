---
name: "element-plus-ssr"
description: "Configures Element Plus for server-side rendering (SSR) applications. Invoke when user needs to implement SSR with Element Plus or fix hydration errors."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Server-Side Rendering (SSR)

This skill provides comprehensive guidance for using Element Plus in SSR environments, including Nuxt.js and custom SSR setups.

## When to Invoke

Invoke this skill when:
- User is building an SSR application with Element Plus
- User encounters hydration errors with Element Plus components
- User needs to configure Element Plus for Nuxt.js
- User asks about Teleport handling in SSR
- User needs to fix ID or z-index hydration mismatches

## Nuxt.js Integration (Recommended)

For Nuxt.js users, use the official Element Plus Nuxt module:

### Installation

```bash
npm install -D @element-plus/nuxt
```

### Configuration

Add to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@element-plus/nuxt'],
})
```

The module automatically handles all SSR-specific configurations.

Refer to [Element Plus Nuxt documentation](https://github.com/element-plus/element-plus-nuxt#readme) for more details.

## Custom SSR Configuration

For custom SSR setups, you need to handle several special cases to avoid hydration errors.

### 1. Provide ID Injection

Element Plus generates unique IDs for components. In SSR, different IDs on server and client cause hydration errors.

**Solution**: Inject `ID_INJECTION_KEY`:

```ts
import { createApp } from 'vue'
import { ID_INJECTION_KEY } from 'element-plus'
import App from './App.vue'

const app = createApp(App)
app.provide(ID_INJECTION_KEY, {
  prefix: 1024,
  current: 0,
})
```

### 2. Provide ZIndex

Components like Dialog, Drawer, and Tooltip use z-index. Hydration errors can occur if z-index values differ between server and client.

**Solution**: Inject `ZINDEX_INJECTION_KEY`:

```ts
import { createApp } from 'vue'
import { ZINDEX_INJECTION_KEY } from 'element-plus'
import App from './App.vue'

const app = createApp(App)
app.provide(ZINDEX_INJECTION_KEY, { current: 0 })
```

### 3. Handle Teleports

Many Element Plus components use Vue's [Teleport](https://vuejs.org/guide/scaling-up/ssr.html#teleports) internally:
- ElDialog
- ElDrawer
- ElTooltip
- ElDropdown
- ElSelect
- ElDatePicker
- ElPopover
- ElPopconfirm

#### Option A: Client-Only Rendering

Render Teleport components only on the client:

**Using Nuxt's ClientOnly**:

```html
<client-only>
  <el-tooltip content="the tooltip content">
    <el-button>tooltip</el-button>
  </el-tooltip>
</client-only>
```

**Manual Client-Only**:

```vue
<script setup>
import { ref, onMounted } from 'vue'

const isClient = ref(false)

onMounted(() => {
  isClient.value = true
})
</script>

<template>
  <el-tooltip v-if="isClient" content="the tooltip content">
    <el-button>tooltip</el-button>
  </el-tooltip>
</template>
```

#### Option B: Inject Teleport Markup

Inject the Teleport markup into the correct location in your HTML template.

**HTML Template**:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Element Plus SSR</title>
    <!--preload-links-->
  </head>
  <body>
    <!--app-teleports-->
    <div id="app"><!--app-html--></div>
    <script type="module" src="/src/entry-client.js"></script>
  </body>
</html>
```

**Server Entry (entry-server.js)**:

```js
import { renderToString } from 'vue/server-renderer'
import { createApp } from './main'

export async function render(url, manifest) {
  const { app } = createApp()
  
  const ctx = {}
  const html = await renderToString(app, ctx)
  const preloadLinks = renderPreloadLinks(ctx.modules, manifest)
  const teleports = renderTeleports(ctx.teleports)

  return [html, preloadLinks, teleports]
}

function renderTeleports(teleports) {
  if (!teleports) return ''
  return Object.entries(teleports).reduce((all, [key, value]) => {
    if (key.startsWith('#el-popper-container-')) {
      return `${all}<div id="${key.slice(1)}">${value}</div>`
    }
    return all
  }, teleports.body || '')
}
```

**Server/Prerender Script**:

```js
const [appHtml, preloadLinks, teleports] = await render(url, manifest)

const html = template
  .replace('<!--preload-links-->', preloadLinks)
  .replace('<!--app-html-->', appHtml)
  .replace(/(\n|\r\n)\s*<!--app-teleports-->/, teleports)
```

## Complete SSR Setup Example

### main.ts

```ts
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import { ID_INJECTION_KEY, ZINDEX_INJECTION_KEY } from 'element-plus'
import App from './App.vue'

export function createApp() {
  const app = createApp(App)
  
  // SSR-specific injections
  app.provide(ID_INJECTION_KEY, {
    prefix: 1024,
    current: 0,
  })
  
  app.provide(ZINDEX_INJECTION_KEY, { current: 0 })
  
  app.use(ElementPlus)
  
  return { app }
}
```

### entry-client.ts

```ts
import { createApp } from './main'

const { app } = createApp()

app.mount('#app')
```

### entry-server.ts

```ts
import { renderToString } from 'vue/server-renderer'
import { createApp } from './main'

export async function render() {
  const { app } = createApp()
  
  const ctx = {}
  const html = await renderToString(app, ctx)
  
  return { html, teleports: ctx.teleports }
}
```

## Handling Custom Namespace

If you modify the [Namespace](https://element-plus.org/en-US/guide/namespace.html) or `append-to` attribute, adjust the teleport container ID:

```js
function renderTeleports(teleports) {
  if (!teleports) return ''
  return Object.entries(teleports).reduce((all, [key, value]) => {
    // Adjust the prefix if using custom namespace
    // Default: '#el-popper-container-'
    // Custom: '#your-namespace-popper-container-'
    if (key.startsWith('#el-popper-container-')) {
      return `${all}<div id="${key.slice(1)}">${value}</div>`
    }
    return all
  }, teleports.body || '')
}
```

## Common SSR Issues

### 1. Hydration Mismatch

**Symptom**: Console warnings about hydration mismatch.

**Causes**:
- Missing ID injection
- Missing z-index injection
- Teleport components rendered on server

**Solutions**:
- Add ID_INJECTION_KEY
- Add ZINDEX_INJECTION_KEY
- Use ClientOnly for Teleport components

### 2. Missing Styles

**Symptom**: Styles not applied on initial load.

**Solution**: Ensure CSS is extracted and included in the HTML:

```js
// In your SSR build config
import { createSSRApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
```

### 3. Icons Not Rendering

**Symptom**: Icons missing in SSR output.

**Solution**: Register icons globally or import them:

```ts
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
```

## Best Practices

### 1. Use Nuxt Module When Possible

For Nuxt projects, always use `@element-plus/nuxt` to avoid manual configuration.

### 2. Client-Only for Complex Components

For components with complex Teleport behavior, use client-only rendering:

```vue
<client-only>
  <el-dialog v-model="visible">
    <!-- Dialog content -->
  </el-dialog>
</client-only>
```

### 3. Test Hydration

Always test SSR hydration in development:

```bash
# Build and test SSR
npm run build:ssr
npm run serve:ssr
```

### 4. Avoid Direct DOM Access

Don't access DOM directly in setup or created hooks:

```vue
<script setup>
// ❌ Bad - will fail in SSR
const el = document.getElementById('my-element')

// ✅ Good - use onMounted
onMounted(() => {
  const el = document.getElementById('my-element')
})
</script>
```

## Input Parameters

When using this skill, provide:
- **Framework**: Nuxt.js or custom SSR
- **Issue type**: Hydration error, missing styles, or other
- **Components affected**: Which Element Plus components are problematic
- **Current setup**: Your SSR configuration

## Output Format

This skill provides:
1. SSR-specific configuration code
2. Hydration error solutions
3. Teleport handling examples
4. Best practices for SSR with Element Plus

## Usage Limitations

- Requires Vue 3.x with SSR support
- Some components require special handling in SSR
- Custom SSR setups need manual configuration
- Testing SSR thoroughly is recommended
- Performance may vary based on SSR implementation

## Resources

- [Vue SSR Documentation](https://vuejs.org/guide/scaling-up/ssr.html)
- [Element Plus Nuxt Module](https://github.com/element-plus/element-plus-nuxt)
- [Element Plus SSR Starter](https://github.com/element-plus/element-plus-nuxt-starter)
