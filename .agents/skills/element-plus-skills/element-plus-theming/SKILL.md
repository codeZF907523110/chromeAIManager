---
name: "element-plus-theming"
description: "Helps customize Element Plus themes using SCSS variables or CSS variables. Invoke when user needs to change theme colors, override styles, or create custom themes."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Theming

This skill provides comprehensive guidance for customizing Element Plus themes using SCSS variables and CSS variables.

## When to Invoke

Invoke this skill when:
- User wants to change the primary theme color
- User needs to customize component styles
- User asks about SCSS variable override
- User wants to use CSS variables for theming
- User needs to create a custom theme

## Theming Methods

Element Plus provides two main methods for theme customization:

### 1. SCSS Variables Override

Best for large-scale theme changes and build-time customization.

#### Available Variables

Find all SCSS variables in:
- [`packages/theme-chalk/src/common/var.scss`](https://github.com/element-plus/element-plus/blob/dev/packages/theme-chalk/src/common/var.scss)

Key variable categories:
- `$colors`: Color palette (primary, success, warning, danger, info)
- `$font-size`: Font sizes
- `$border-radius`: Border radius values
- `$box-shadow`: Box shadow styles
- Component-specific variables (e.g., `$button`, `$input`, `$table`)

#### Override SCSS Variables

Create a custom SCSS file (e.g., `styles/element/index.scss`):

```scss
/* Override what you need */
@forward 'element-plus/theme-chalk/src/common/var.scss' with (
  $colors: (
    'primary': (
      'base': green,
    ),
  )
);

/* Import all styles if needed */
/* @use "element-plus/theme-chalk/src/index.scss" as *; */
```

**Important**: Use `@use` instead of `@import` (Sass team will remove `@import` eventually).

#### Import Custom Theme

```ts
import { createApp } from 'vue'
import './styles/element/index.scss'
import ElementPlus from 'element-plus'
import App from './App.vue'

const app = createApp(App)
app.use(ElementPlus)
```

#### Vite Configuration for On-Demand Import

```ts
import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ElementPlus from 'unplugin-element-plus/vite'

export default defineConfig({
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "~/styles/element/index.scss" as *;`,
      },
    },
  },
  plugins: [
    vue(),
    ElementPlus({
      useSource: true,
    }),
  ],
})
```

#### Webpack Configuration

```js
import ElementPlus from 'unplugin-element-plus/webpack'

export default defineConfig({
  css: {
    loaderOptions: {
      scss: {
        additionalData: `@use "~/styles/element/index.scss" as *;`,
      },
    },
  },
  plugins: [
    ElementPlus({
      useSource: true,
    }),
  ],
})
```

### 2. CSS Variables Override

Best for runtime theme switching and dynamic customization.

#### Global CSS Variables

Override variables in `:root` or a custom class:

```css
:root {
  --el-color-primary: green;
  --el-color-primary-light-3: #79bbff;
  --el-color-primary-light-5: #a0cfff;
  --el-color-primary-light-7: #c6e2ff;
  --el-color-primary-light-8: #d9ecff;
  --el-color-primary-light-9: #ecf5ff;
  --el-color-primary-dark-2: #337ecc;
}
```

#### Component-Specific Variables

Customize individual components:

```html
<el-tag style="--el-tag-bg-color: red">Tag</el-tag>
```

Or use a class for better performance:

```css
.custom-tag {
  --el-tag-bg-color: red;
}
```

```html
<el-tag class="custom-tag">Tag</el-tag>
```

#### Dynamic CSS Variable Control

```ts
// Get the element
const el = document.documentElement
// Or use a specific element
// const el = document.getElementById('xxx')

// Get CSS variable
const primaryColor = getComputedStyle(el).getPropertyValue('--el-color-primary')

// Set CSS variable
el.style.setProperty('--el-color-primary', 'red')
```

#### Using VueUse

For a more elegant approach, use [useCssVar](https://vueuse.org/core/usecssvar/):

```ts
import { useCssVar } from '@vueuse/core'

const el = ref<HTMLElement | null>(null)
const color = useCssVar('--el-color-primary', el)

// Change color
color.value = 'green'
```

## Color System

### Primary Colors

```scss
$colors: (
  'primary': (
    'base': #409eff,
  ),
  'success': (
    'base': #67c23a,
  ),
  'warning': (
    'base': #e6a23c,
  ),
  'danger': (
    'base': #f56c6c,
  ),
  'error': (
    'base': #f56c6c,
  ),
  'info': (
    'base': #909399,
  ),
);
```

### CSS Variable Naming

Element Plus automatically generates CSS variables from SCSS:

| SCSS Variable | CSS Variable |
|---------------|--------------|
| `$colors.primary.base` | `--el-color-primary` |
| `$colors.primary.light-3` | `--el-color-primary-light-3` |
| `$colors.primary.light-5` | `--el-color-primary-light-5` |
| `$colors.primary.light-7` | `--el-color-primary-light-7` |
| `$colors.primary.light-8` | `--el-color-primary-light-8` |
| `$colors.primary.light-9` | `--el-color-primary-light-9` |
| `$colors.primary.dark-2` | `--el-color-primary-dark-2` |

## Best Practices

### 1. Separate SCSS Files

Keep your custom variables separate from Element Plus variables:

```
styles/
├── element/
│   └── index.scss    # Element Plus variable overrides
└── custom/
    └── variables.scss # Your custom variables
```

This prevents slow hot updates caused by recompiling large SCSS files.

### 2. Import Order

Import your custom theme file **before** Element Plus styles:

```ts
import './styles/element/index.scss'  // Custom theme first
import ElementPlus from 'element-plus'
```

### 3. Use CSS Variables for Runtime Changes

For theme switching at runtime, prefer CSS variables over SCSS:

```vue
<script setup>
import { ref } from 'vue'

const isDark = ref(false)

const toggleTheme = () => {
  isDark.value = !isDark.value
  document.documentElement.style.setProperty(
    '--el-color-primary',
    isDark.value ? '#409eff' : '#67c23a'
  )
}
</script>
```

### 4. Performance Optimization

For better performance, use a class instead of `:root`:

```css
/* Better performance */
.custom-theme {
  --el-color-primary: green;
}
```

## Example Projects

- Full import: [element-plus-vite-starter](https://github.com/element-plus/element-plus-vite-starter)
- On demand: [unplugin-element-plus/examples/vite](https://github.com/element-plus/unplugin-element-plus)

## Input Parameters

When using this skill, provide:
- **Theme method**: SCSS variables or CSS variables
- **Build tool**: Vite, Webpack, or other
- **Import method**: Full import or on-demand import
- **Customization scope**: Global theme or component-specific

## Output Format

This skill provides:
1. SCSS variable override examples
2. CSS variable override examples
3. Build tool configuration
4. Best practices and performance tips

## Usage Limitations

- SCSS method requires build-time compilation
- CSS variables are not supported in IE11
- Some complex customizations may require both methods
- Hot module replacement may be slow with large SCSS files
