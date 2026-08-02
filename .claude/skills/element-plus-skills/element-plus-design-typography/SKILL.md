---
name: "element-plus-design-typography"
description: "Typography design specifications for Element Plus. Invoke when user needs to understand font conventions, font-family settings, or text styling guidelines."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Typography Design Specifications

Element Plus creates font conventions to ensure the best presentation across different platforms.

## When to Use

- Understanding font conventions
- Applying consistent text styles
- Setting font-family for cross-platform compatibility
- Managing font sizes and line heights

---

## Font Family

Element Plus uses a carefully selected font stack for optimal cross-platform display:

```css
font-family:
  Inter, 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB',
  'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
```

### Font Stack Explanation

| Font | Platform | Purpose |
|------|----------|---------|
| Inter | All | Primary modern font |
| Helvetica Neue | macOS | System fallback |
| Helvetica | macOS/iOS | System fallback |
| PingFang SC | macOS (Chinese) | Chinese characters |
| Hiragino Sans GB | macOS (Chinese) | Chinese characters |
| Microsoft YaHei | Windows (Chinese) | Chinese characters |
| Arial | All | Universal fallback |
| sans-serif | All | Generic fallback |

---

## Font Sizes

Element Plus provides standardized font size variables:

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-font-size-extra-large` | `20px` | Extra large headings |
| `--el-font-size-large` | `18px` | Large headings |
| `--el-font-size-medium` | `16px` | Medium text, subheadings |
| `--el-font-size-base` | `14px` | Base body text |
| `--el-font-size-small` | `13px` | Small text, captions |
| `--el-font-size-extra-small` | `12px` | Extra small text, hints |

### Usage Examples

```css
/* Heading */
h1 {
  font-size: var(--el-font-size-extra-large);
}

/* Subheading */
h2 {
  font-size: var(--el-font-size-large);
}

/* Body text */
p {
  font-size: var(--el-font-size-base);
}

/* Caption */
.caption {
  font-size: var(--el-font-size-small);
}

/* Hint text */
.hint {
  font-size: var(--el-font-size-extra-small);
}
```

---

## Font Weight

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-font-weight-primary` | `500` | Primary weight for emphasis |
| `--el-font-weight-secondary` | `100` | Secondary weight for light text |

```css
/* Emphasized text */
.emphasis {
  font-weight: var(--el-font-weight-primary);
}

/* Light text */
.light {
  font-weight: var(--el-font-weight-secondary);
}
```

---

## Line Height

Element Plus provides line height variables for consistent vertical rhythm:

| Variable | Value | Usage |
|----------|-------|-------|
| `--el-font-line-height-primary` | `24px` | Primary line height |
| `--el-font-line-height-secondary` | `16px` | Secondary line height |

### Line Height Guidelines

```css
/* Body text */
p {
  line-height: var(--el-font-line-height-primary);
}

/* Compact text */
.compact {
  line-height: var(--el-font-line-height-secondary);
}
```

---

## CSS Variables Summary

```css
:root {
  /* Font Family */
  --el-font-family: Inter, 'Helvetica Neue', Helvetica, 'PingFang SC', 
    'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
  
  /* Font Sizes */
  --el-font-size-extra-large: 20px;
  --el-font-size-large: 18px;
  --el-font-size-medium: 16px;
  --el-font-size-base: 14px;
  --el-font-size-small: 13px;
  --el-font-size-extra-small: 12px;
  
  /* Font Weight */
  --el-font-weight-primary: 500;
  --el-font-weight-secondary: 100;
  
  /* Line Height */
  --el-font-line-height-primary: 24px;
  --el-font-line-height-secondary: 16px;
}
```

---

## Text Component

Element Plus provides a Text component for styled text display:

```vue
<template>
  <!-- Text types -->
  <el-text>Default text</el-text>
  <el-text type="primary">Primary text</el-text>
  <el-text type="success">Success text</el-text>
  <el-text type="warning">Warning text</el-text>
  <el-text type="danger">Danger text</el-text>
  <el-text type="info">Info text</el-text>
  
  <!-- Text sizes -->
  <el-text size="large">Large text</el-text>
  <el-text size="default">Default text</el-text>
  <el-text size="small">Small text</el-text>
  
  <!-- Truncated text -->
  <el-text truncated>Long text that will be truncated...</el-text>
  
  <!-- Line clamped text -->
  <el-text :line-clamp="2">Long text clamped to 2 lines...</el-text>
</template>
```

---

## Best Practices

1. **Use CSS Variables**: Always use predefined font variables for consistency
2. **Cross-Platform**: The font stack ensures consistent display across platforms
3. **Hierarchy**: Use font sizes to establish visual hierarchy
4. **Line Height**: Maintain readable line heights for body text
5. **Dark Mode**: Typography automatically adjusts in dark mode
6. **Chinese Support**: Font stack includes Chinese-optimized fonts

---

## Related Resources

| Resource | Description |
|----------|-------------|
| [Text Component](./components/el-text/SKILL.md) | Text component documentation |
| [Color Design](./element-plus-design-color/SKILL.md) | Text color variables |
| [Border Design](./element-plus-design-border/SKILL.md) | Related design specifications |
