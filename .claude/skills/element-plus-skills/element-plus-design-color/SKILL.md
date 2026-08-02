---
name: "element-plus-design-color"
description: "Color design specifications for Element Plus. Invoke when user needs to understand the color palette, main colors, secondary colors, or neutral colors used in Element Plus."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Color Design Specifications

Element Plus uses a specific set of palettes to specify colors, providing a consistent look and feel for the products you build.

## When to Use

- Understanding the color system
- Applying brand colors correctly
- Using semantic colors (success, warning, danger)
- Working with neutral colors for text and backgrounds

---

## Main Color

The main color of Element Plus is a bright and friendly blue.

| Color | Variable | Value | Usage |
|-------|----------|-------|-------|
| Primary | `--el-color-primary` | `#409eff` | Main brand color |
| Primary Light-3 | `--el-color-primary-light-3` | `#79bbff` | Hover state |
| Primary Light-5 | `--el-color-primary-light-5` | `#a0cfff` | Lighter variant |
| Primary Light-7 | `--el-color-primary-light-7` | `#c6e2ff` | Background |
| Primary Light-8 | `--el-color-primary-light-8` | `#d9ecff` | Light background |
| Primary Light-9 | `--el-color-primary-light-9` | `#ecf5ff` | Extra light background |
| Primary Dark-2 | `--el-color-primary-dark-2` | `#337ecc` | Active state |

---

## Secondary Colors

Secondary colors are used in different scenarios (e.g., danger color indicates dangerous operations).

### Success

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-color-success` | `#67c23a` | Success operations |
| `--el-color-success-light-3` | `#95d475` | Hover state |
| `--el-color-success-light-5` | `#b3e19d` | Lighter variant |
| `--el-color-success-light-7` | `#d1edc4` | Background |
| `--el-color-success-light-8` | `#e1f3d8` | Light background |
| `--el-color-success-light-9` | `#f0f9eb` | Extra light background |
| `--el-color-success-dark-2` | `#529b2e` | Active state |

### Warning

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-color-warning` | `#e6a23c` | Warning operations |
| `--el-color-warning-light-3` | `#eebe77` | Hover state |
| `--el-color-warning-light-5` | `#f3d19e` | Lighter variant |
| `--el-color-warning-light-7` | `#f8e3c5` | Background |
| `--el-color-warning-light-8` | `#faecd8` | Light background |
| `--el-color-warning-light-9` | `#fdf6ec` | Extra light background |
| `--el-color-warning-dark-2` | `#b88230` | Active state |

### Danger

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-color-danger` | `#f56c6c` | Danger/error operations |
| `--el-color-danger-light-3` | `#f89898` | Hover state |
| `--el-color-danger-light-5` | `#fab6b6` | Lighter variant |
| `--el-color-danger-light-7` | `#fcd3d3` | Background |
| `--el-color-danger-light-8` | `#fde2e2` | Light background |
| `--el-color-danger-light-9` | `#fef0f0` | Extra light background |
| `--el-color-danger-dark-2` | `#c45656` | Active state |

### Info

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-color-info` | `#909399` | Information operations |
| `--el-color-info-light-3` | `#b1b3b8` | Hover state |
| `--el-color-info-light-5` | `#c8c9cc` | Lighter variant |
| `--el-color-info-light-7` | `#dedfe0` | Background |
| `--el-color-info-light-8` | `#e9e9eb` | Light background |
| `--el-color-info-light-9` | `#f4f4f5` | Extra light background |
| `--el-color-info-dark-2` | `#73767a` | Active state |

---

## Neutral Colors

Neutral colors are for text, background, and border colors. Use different neutral colors to represent the hierarchical structure.

### Text Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-text-color-primary` | `#303133` | Primary text |
| `--el-text-color-regular` | `#606266` | Regular text |
| `--el-text-color-secondary` | `#909399` | Secondary text |
| `--el-text-color-placeholder` | `#a8abb2` | Placeholder text |
| `--el-text-color-disabled` | `#c0c4cc` | Disabled text |

### Background Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-bg-color` | `#ffffff` | Default background |
| `--el-bg-color-page` | `#f2f3f5` | Page background |
| `--el-bg-color-overlay` | `#ffffff` | Overlay background |
| `--el-fill-color` | `#f0f2f5` | Fill color |
| `--el-fill-color-light` | `#f5f7fa` | Light fill |
| `--el-fill-color-lighter` | `#fafafa` | Lighter fill |
| `--el-fill-color-extra-light` | `#fafcff` | Extra light fill |
| `--el-fill-color-dark` | `#ebedf0` | Dark fill |
| `--el-fill-color-darker` | `#e6e8eb` | Darker fill |
| `--el-fill-color-blank` | `#ffffff` | Blank fill |

---

## Color Usage Guidelines

### Semantic Usage

```css
/* Success states */
.success-message {
  color: var(--el-color-success);
  background-color: var(--el-color-success-light-9);
}

/* Warning states */
.warning-message {
  color: var(--el-color-warning);
  background-color: var(--el-color-warning-light-9);
}

/* Error states */
.error-message {
  color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-9);
}

/* Info states */
.info-message {
  color: var(--el-color-info);
  background-color: var(--el-color-info-light-9);
}
```

### Text Hierarchy

```css
/* Primary text - headings, important content */
h1, h2, h3 {
  color: var(--el-text-color-primary);
}

/* Regular text - body content */
p {
  color: var(--el-text-color-regular);
}

/* Secondary text - captions, hints */
.caption {
  color: var(--el-text-color-secondary);
}

/* Placeholder text */
input::placeholder {
  color: var(--el-text-color-placeholder);
}
```

---

## CSS Variables Summary

```css
:root {
  /* Primary */
  --el-color-primary: #409eff;
  
  /* Semantic Colors */
  --el-color-success: #67c23a;
  --el-color-warning: #e6a23c;
  --el-color-danger: #f56c6c;
  --el-color-info: #909399;
  
  /* Text Colors */
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-text-color-secondary: #909399;
  --el-text-color-placeholder: #a8abb2;
  --el-text-color-disabled: #c0c4cc;
  
  /* Background Colors */
  --el-bg-color: #ffffff;
  --el-bg-color-page: #f2f3f5;
  --el-bg-color-overlay: #ffffff;
  
  /* Fill Colors */
  --el-fill-color: #f0f2f5;
  --el-fill-color-light: #f5f7fa;
  --el-fill-color-lighter: #fafafa;
}
```

---

## Best Practices

1. **Use CSS Variables**: Always use predefined color variables for consistency
2. **Semantic Colors**: Use appropriate semantic colors for their intended purpose
3. **Text Hierarchy**: Use text color variables to establish visual hierarchy
4. **Dark Mode**: Colors automatically adjust in dark mode
5. **Customization**: Override primary color to match your brand
