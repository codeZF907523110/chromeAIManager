---
name: "element-plus-design-border"
description: "Border design specifications for Element Plus components. Invoke when user needs to understand border styles, radius options, or shadow styles used throughout Element Plus."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Border Design Specifications

Element Plus standardizes borders used in buttons, cards, pop-ups, and other components for consistent visual design.

## When to Use

- Understanding border style options
- Applying consistent radius styles
- Using shadow styles for depth
- Maintaining design consistency

---

## Border Styles

Element Plus provides several border style options:

### Border Width

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-border-width` | `1px` | Standard border width |
| `--el-border-width-light` | `1px` | Light border |
| `--el-border-width-lighter` | `1px` | Lighter border |
| `--el-border-width-extra-light` | `1px` | Extra light border |

### Border Style

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-border-style` | `solid` | Default solid border |
| `--el-border-color` | `var(--el-border-color-base)` | Default border color |

### Border Colors

| Variable | Usage |
|----------|-------|
| `--el-border-color` | Base border color |
| `--el-border-color-light` | Light border color |
| `--el-border-color-lighter` | Lighter border color |
| `--el-border-color-extra-light` | Extra light border color |
| `--el-border-color-dark` | Dark border color |
| `--el-border-color-darker` | Darker border color |

---

## Border Radius

Element Plus provides standardized border radius values:

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-border-radius-base` | `4px` | Base radius for components |
| `--el-border-radius-small` | `2px` | Small radius for buttons, tags |
| `--el-border-radius-round` | `20px` | Round radius for avatars, pills |
| `--el-border-radius-circle` | `100%` | Circle for avatars |

### Usage Examples

```css
/* Base radius */
.card {
  border-radius: var(--el-border-radius-base);
}

/* Small radius */
.button {
  border-radius: var(--el-border-radius-small);
}

/* Round elements */
.pill-button {
  border-radius: var(--el-border-radius-round);
}

/* Circle elements */
.avatar {
  border-radius: var(--el-border-radius-circle);
}
```

---

## Shadow Styles

Element Plus provides shadow styles for depth and elevation:

| Variable | Usage |
|----------|-------|
| `--el-box-shadow` | Base shadow for cards, dropdowns |
| `--el-box-shadow-light` | Light shadow for subtle elevation |
| `--el-box-shadow-lighter` | Lighter shadow for minimal elevation |
| `--el-box-shadow-dark` | Dark shadow for modals, dialogs |

### Shadow Values

```css
:root {
  --el-box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  --el-box-shadow-light: 0 2px 8px 0 rgba(0, 0, 0, 0.06);
  --el-box-shadow-lighter: 0 1px 4px 0 rgba(0, 0, 0, 0.04);
  --el-box-shadow-dark: 0 4px 16px 0 rgba(0, 0, 0, 0.12);
}
```

### Usage Examples

```css
/* Card shadow */
.card {
  box-shadow: var(--el-box-shadow-light);
}

/* Dropdown shadow */
.dropdown {
  box-shadow: var(--el-box-shadow);
}

/* Modal shadow */
.modal {
  box-shadow: var(--el-box-shadow-dark);
}
```

---

## CSS Variables Summary

```css
:root {
  /* Border */
  --el-border-width: 1px;
  --el-border-style: solid;
  --el-border-color: var(--el-border-color-base);
  
  /* Border Colors */
  --el-border-color-base: #dcdfe6;
  --el-border-color-light: #e4e7ed;
  --el-border-color-lighter: #ebeef5;
  --el-border-color-extra-light: #f2f6fc;
  --el-border-color-dark: #d4d7de;
  --el-border-color-darker: #cdd0d6;
  
  /* Border Radius */
  --el-border-radius-base: 4px;
  --el-border-radius-small: 2px;
  --el-border-radius-round: 20px;
  --el-border-radius-circle: 100%;
  
  /* Box Shadow */
  --el-box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  --el-box-shadow-light: 0 2px 8px 0 rgba(0, 0, 0, 0.06);
  --el-box-shadow-lighter: 0 1px 4px 0 rgba(0, 0, 0, 0.04);
  --el-box-shadow-dark: 0 4px 16px 0 rgba(0, 0, 0, 0.12);
}
```

---

## Best Practices

1. **Use CSS Variables**: Always use predefined CSS variables for consistency
2. **Match Context**: Choose appropriate shadow depth based on element importance
3. **Responsive Radius**: Consider smaller radius values for mobile interfaces
4. **Dark Mode**: Border colors automatically adjust in dark mode
