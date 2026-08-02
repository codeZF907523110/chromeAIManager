---
name: "element-plus-dark-mode"
description: "Enables and customizes dark mode for Element Plus applications. Invoke when user needs to implement dark mode, toggle themes, or customize dark mode styles."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Dark Mode

This skill provides comprehensive guidance for implementing and customizing dark mode in Element Plus applications (available since version 2.2.0).

## When to Invoke

Invoke this skill when:
- User wants to enable dark mode
- User needs to toggle between light and dark themes
- User wants to customize dark mode colors
- User asks about dark mode CSS variables
- User needs to persist dark mode preference

## Quick Start

### Enable Dark Mode

Add the `dark` class to the HTML element:

```html
<html class="dark">
  <head></head>
  <body></body>
</html>
```

### Import Dark Mode CSS

Import the dark mode CSS variables:

```ts
import 'element-plus/theme-chalk/dark/css-vars.css'
```

That's it! Your Element Plus components will now use dark mode styles.

## Implementation Methods

### 1. Static Dark Mode

If you only need dark mode, simply add the `dark` class to HTML:

```html
<html class="dark">
```

And import the CSS:

```ts
import 'element-plus/theme-chalk/dark/css-vars.css'
```

### 2. Toggle Dark Mode (Recommended)

Use [VueUse's useDark](https://vueuse.org/core/useDark/) for easy toggling:

```vue
<script setup>
import { useDark, useToggle } from '@vueuse/core'

const isDark = useDark()
const toggleDark = useToggle(isDark)
</script>

<template>
  <el-button @click="toggleDark()">
    Toggle Dark Mode
  </el-button>
</template>
```

### 3. Manual Toggle

Implement your own toggle:

```vue
<script setup>
import { ref, watch } from 'vue'

const isDark = ref(false)

watch(isDark, (value) => {
  if (value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
})
</script>

<template>
  <el-switch v-model="isDark" active-text="Dark" inactive-text="Light" />
</template>
```

### 4. System Preference

Follow system preference:

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const isDark = ref(false)

const updateTheme = (e) => {
  isDark.value = e.matches
  document.documentElement.classList.toggle('dark', e.matches)
}

onMounted(() => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  isDark.value = mediaQuery.matches
  updateTheme(mediaQuery)
  mediaQuery.addEventListener('change', updateTheme)
})

onUnmounted(() => {
  window.matchMedia('(prefers-color-scheme: dark)')
    .removeEventListener('change', updateTheme)
})
</script>
```

## Customizing Dark Mode

### 1. CSS Variables Override

Create a custom dark mode CSS file:

```css
/* styles/dark/css-vars.css */
html.dark {
  /* Custom dark background color */
  --el-bg-color: #141414;
  --el-bg-color-page: #0a0a0a;
  --el-bg-color-overlay: #1d1e1f;
  
  /* Custom text colors */
  --el-text-color-primary: #E5EAF3;
  --el-text-color-regular: #CFD3DC;
  --el-text-color-secondary: #A3A6AD;
  --el-text-color-placeholder: #8D9095;
  
  /* Custom border colors */
  --el-border-color: #4C4D4F;
  --el-border-color-light: #414243;
  --el-border-color-lighter: #363637;
  --el-border-color-extra-light: #2B2B2C;
}
```

Import it after Element Plus dark mode CSS:

```ts
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/dark/css-vars.css'
```

### 2. SCSS Variables Override

For SCSS-based customization:

```scss
/* styles/element/index.scss */
@forward 'element-plus/theme-chalk/src/dark/var.scss' with (
  $bg-color: (
    'page': #0a0a0a,
    '': #141414,
    'overlay': #1d1e1f,
  )
);
```

Then import:

```ts
import './styles/element/index.scss'
```

Or import the SCSS directly:

```ts
import 'element-plus/theme-chalk/src/dark/css-vars.scss'
```

## Available Dark Mode Variables

### Background Colors

| Variable | Description | Default |
|----------|-------------|---------|
| `--el-bg-color` | Main background | `#141414` |
| `--el-bg-color-page` | Page background | `#0a0a0a` |
| `--el-bg-color-overlay` | Overlay background | `#1d1e1f` |

### Text Colors

| Variable | Description | Default |
|----------|-------------|---------|
| `--el-text-color-primary` | Primary text | `#E5EAF3` |
| `--el-text-color-regular` | Regular text | `#CFD3DC` |
| `--el-text-color-secondary` | Secondary text | `#A3A6AD` |
| `--el-text-color-placeholder` | Placeholder text | `#8D9095` |

### Border Colors

| Variable | Description | Default |
|----------|-------------|---------|
| `--el-border-color` | Main border | `#4C4D4F` |
| `--el-border-color-light` | Light border | `#414243` |
| `--el-border-color-lighter` | Lighter border | `#363637` |

### Fill Colors

| Variable | Description | Default |
|----------|-------------|---------|
| `--el-fill-color` | Main fill | `#303030` |
| `--el-fill-color-light` | Light fill | `#262727` |
| `--el-fill-color-lighter` | Lighter fill | `#1D1D1D` |

## Complete Example

```vue
<template>
  <div class="app">
    <el-header>
      <el-button @click="toggleDark()">
        <el-icon>
          <component :is="isDark ? 'Sunny' : 'Moon'" />
        </el-icon>
        {{ isDark ? 'Light Mode' : 'Dark Mode' }}
      </el-button>
    </el-header>
    
    <el-main>
      <el-card>
        <template #header>
          <span>Card Title</span>
        </template>
        <p>Card content in {{ isDark ? 'dark' : 'light' }} mode</p>
        <el-button type="primary">Primary Button</el-button>
      </el-card>
    </el-main>
  </div>
</template>

<script setup>
import { useDark, useToggle } from '@vueuse/core'
import { Sunny, Moon } from '@element-plus/icons-vue'

const isDark = useDark()
const toggleDark = useToggle(isDark)
</script>

<style>
.app {
  min-height: 100vh;
  background-color: var(--el-bg-color-page);
  color: var(--el-text-color-primary);
  transition: background-color 0.3s, color 0.3s;
}
</style>
```

## Best Practices

### 1. Persist Preference

Store user preference in localStorage:

```ts
import { useDark } from '@vueuse/core'

const isDark = useDark({
  storageKey: 'theme-mode',
  valueDark: 'dark',
  valueLight: 'light',
})
```

### 2. Smooth Transition

Add transition for smooth theme switching:

```css
html {
  transition: background-color 0.3s, color 0.3s;
}

html.dark {
  background-color: #0a0a0a;
  color: #E5EAF3;
}
```

### 3. Custom Component Styles

When customizing components for dark mode:

```css
html.dark .my-custom-component {
  background-color: var(--el-bg-color);
  border-color: var(--el-border-color);
  color: var(--el-text-color-primary);
}
```

### 4. Image Adjustments

Adjust images for dark mode:

```css
html.dark img {
  filter: brightness(0.9);
}
```

## Input Parameters

When using this skill, provide:
- **Implementation method**: Static, toggle, or system preference
- **Customization needs**: Default colors or custom colors
- **Framework**: VueUse integration or manual implementation
- **Persistence**: Whether to save user preference

## Output Format

This skill provides:
1. Dark mode enablement code
2. Toggle implementation examples
3. CSS variable customization
4. SCSS variable override examples
5. Best practices and transition effects

## Usage Limitations

- Requires Element Plus 2.2.0 or later
- Dark mode is based on CSS variables
- Custom colors may need additional testing
- Some third-party components may need manual dark mode styling
- CSS variable support is required (IE11 not supported)

## Example Project

Refer to [element-plus-vite-starter](https://github.com/element-plus/element-plus-vite-starter) for a complete dark mode implementation example.
