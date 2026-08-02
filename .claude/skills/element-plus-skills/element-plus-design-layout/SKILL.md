---
name: "element-plus-design-layout"
description: "Layout grid system for Element Plus using 24-column grid. Invoke when user needs to create responsive layouts, grid systems, or understand Row and Col components."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Layout Grid System

Element Plus provides a 24-column grid system for quickly and easily creating responsive layouts.

## When to Use

- Creating responsive grid layouts
- Building page structures
- Implementing column-based designs
- Responsive design with breakpoints

---

## Basic Concepts

- **24-column system**: The basic unit is 1, with a maximum of 24 and a minimum of 0
- **Flex layout**: Uses flex layout by default
- **Responsive**: Five breakpoints preset: xs, sm, md, lg, xl

---

## Basic Layout

Create basic grid layout using Row and Col components with the `span` attribute.

```vue
<template>
  <el-row>
    <el-col :span="24"><div class="grid-content">24</div></el-col>
  </el-row>
  <el-row>
    <el-col :span="12"><div class="grid-content">12</div></el-col>
    <el-col :span="12"><div class="grid-content">12</div></el-col>
  </el-row>
  <el-row>
    <el-col :span="8"><div class="grid-content">8</div></el-col>
    <el-col :span="8"><div class="grid-content">8</div></el-col>
    <el-col :span="8"><div class="grid-content">8</div></el-col>
  </el-row>
</template>
```

---

## Column Spacing

Row provides `gutter` attribute to specify spacings between columns.

```vue
<template>
  <el-row :gutter="20">
    <el-col :span="6"><div class="grid-content">6</div></el-col>
    <el-col :span="6"><div class="grid-content">6</div></el-col>
    <el-col :span="6"><div class="grid-content">6</div></el-col>
    <el-col :span="6"><div class="grid-content">6</div></el-col>
  </el-row>
</template>
```

---

## Column Offset

Specify column offsets using the `offset` attribute.

```vue
<template>
  <el-row :gutter="20">
    <el-col :span="6"><div class="grid-content">6</div></el-col>
    <el-col :span="6" :offset="6"><div class="grid-content">6 offset 6</div></el-col>
  </el-row>
</template>
```

---

## Alignment

Use flex layout for flexible alignment with the `justify` attribute.

```vue
<template>
  <el-row justify="center">
    <el-col :span="6"><div class="grid-content">center</div></el-col>
  </el-row>
  <el-row justify="end">
    <el-col :span="6"><div class="grid-content">end</div></el-col>
  </el-row>
  <el-row justify="space-between">
    <el-col :span="6"><div class="grid-content">space-between</div></el-col>
    <el-col :span="6"><div class="grid-content">space-between</div></el-col>
  </el-row>
</template>
```

### Justify Options

| Value | Description |
|-------|-------------|
| `start` | Align items to the start |
| `end` | Align items to the end |
| `center` | Center items |
| `space-around` | Equal space around items |
| `space-between` | Equal space between items |
| `space-evenly` | Equal space between and around items |

---

## Responsive Layout

Five breakpoints are preset based on Bootstrap's responsive design:

| Breakpoint | Screen Width |
|------------|--------------|
| `xs` | `< 768px` |
| `sm` | `≥ 768px` |
| `md` | `≥ 992px` |
| `lg` | `≥ 1200px` |
| `xl` | `≥ 1920px` |

```vue
<template>
  <el-row :gutter="10">
    <el-col :xs="24" :sm="12" :md="8" :lg="6" :xl="4">
      <div class="grid-content">Responsive</div>
    </el-col>
    <el-col :xs="24" :sm="12" :md="8" :lg="6" :xl="4">
      <div class="grid-content">Responsive</div>
    </el-col>
  </el-row>
</template>
```

### Responsive Object Syntax

```vue
<template>
  <el-col :xs="{ span: 24, offset: 0 }" :sm="{ span: 12, offset: 2 }">
    <div class="grid-content">Responsive with offset</div>
  </el-col>
</template>
```

---

## Utility Classes for Hiding Elements

Import the CSS file to use hiding utility classes:

```js
import 'element-plus/theme-chalk/display.css'
```

### Available Classes

| Class | Description |
|-------|-------------|
| `hidden-xs-only` | Hide on extra small viewports only |
| `hidden-sm-only` | Hide on small viewports only |
| `hidden-sm-and-down` | Hide on small viewports and down |
| `hidden-sm-and-up` | Hide on small viewports and up |
| `hidden-md-only` | Hide on medium viewports only |
| `hidden-md-and-down` | Hide on medium viewports and down |
| `hidden-md-and-up` | Hide on medium viewports and up |
| `hidden-lg-only` | Hide on large viewports only |
| `hidden-lg-and-down` | Hide on large viewports and down |
| `hidden-lg-and-up` | Hide on large viewports and up |
| `hidden-xl-only` | Hide on extra large viewports only |

---

## API Reference

### Row Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| gutter | Grid spacing | `number` | `0` |
| justify | Horizontal alignment | `'start' \| 'end' \| 'center' \| 'space-around' \| 'space-between' \| 'space-evenly'` | `'start'` |
| align | Vertical alignment | `'top' \| 'middle' \| 'bottom'` | — |
| tag | Custom element tag | `string` | `'div'` |

### Col Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| span | Number of columns the grid spans | `number` | `24` |
| offset | Number of spacing on the left side | `number` | `0` |
| push | Number of columns to move right | `number` | `0` |
| pull | Number of columns to move left | `number` | `0` |
| xs | `<768px` Responsive columns | `number \| object` | — |
| sm | `≥768px` Responsive columns | `number \| object` | — |
| md | `≥992px` Responsive columns | `number \| object` | — |
| lg | `≥1200px` Responsive columns | `number \| object` | — |
| xl | `≥1920px` Responsive columns | `number \| object` | — |
| tag | Custom element tag | `string` | `'div'` |

---

## Best Practices

1. **Use gutter**: Add spacing between columns for better readability
2. **Responsive design**: Use breakpoint props for mobile-first design
3. **Avoid inline styles**: Parent containers should avoid inline styles
4. **Combine with Container**: Use with Container for full page layouts
