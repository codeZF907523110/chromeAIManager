---
name: "el-image"
description: "Image component with lazy load, placeholder, and preview features. Invoke when user needs to display images with loading states, error handling, or preview functionality."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Image Component

Image component extends native img with lazy loading, placeholder, error handling, and preview features.

## When to Use

- Image display with lazy loading
- Image preview galleries
- Loading placeholders
- Error fallback images

## Basic Usage

```vue
<template>
  <el-image style="width: 100px; height: 100px" :src="url" fit="cover" />
</template>

<script setup>
const url = 'https://example.com/image.jpg'
</script>
```

## Placeholder

```vue
<template>
  <el-image :src="url" fit="cover">
    <template #placeholder>
      <div class="image-slot">Loading...</div>
    </template>
  </el-image>
</template>
```

## Load Failed

```vue
<template>
  <el-image :src="invalidUrl">
    <template #error>
      <div class="image-slot">
        <el-icon><icon-picture /></el-icon>
      </div>
    </template>
  </el-image>
</template>
```

## Lazy Load

```vue
<template>
  <el-image :src="url" lazy />
</template>
```

## Image Preview

```vue
<template>
  <el-image
    style="width: 100px; height: 100px"
    :src="url"
    :preview-src-list="srcList"
    :initial-index="0"
    fit="cover"
  />
</template>

<script setup>
const url = 'https://example.com/image1.jpg'
const srcList = [
  'https://example.com/image1.jpg',
  'https://example.com/image2.jpg',
  'https://example.com/image3.jpg'
]
</script>
```

## API Reference

### Image Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| src | Image source | `string` | `''` |
| fit | How image fits container | `'fill' \| 'contain' \| 'cover' \| 'none' \| 'scale-down'` | `''` |
| hide-on-click-modal | Hide on backdrop click | `boolean` | `false` |
| loading | Native loading attribute | `'eager' \| 'lazy'` | — |
| lazy | Enable lazy load | `boolean` | `false` |
| scroll-container | Scroll container for lazy load | `string \| HTMLElement` | — |
| alt | Native alt attribute | `string` | — |
| preview-src-list | Preview image list | `string[]` | `[]` |
| z-index | Preview z-index | `number` | — |
| initial-index | Initial preview index | `number` | `0` |
| close-on-press-escape | Close on ESC | `boolean` | `true` |
| preview-teleported | Teleport preview to body | `boolean` | `false` |
| infinite | Infinite preview | `boolean` | `true` |
| zoom-rate | Zoom rate | `number` | `1.2` |
| min-scale | Minimum scale | `number` | `0.2` |
| max-scale | Maximum scale | `number` | `7` |
| show-progress | Show progress | `boolean` | `false` |

### Image Events

| Name | Description | Type |
|------|-------------|------|
| load | Same as native load | `(e: Event) => void` |
| error | Same as native error | `(e: Event) => void` |
| switch | Trigger when switching images | `(index: number) => void` |
| close | Trigger when closing preview | `() => void` |
| show | Trigger when viewer displays | `() => void` |

### Image Slots

| Name | Description |
|------|-------------|
| placeholder | Custom placeholder content |
| error | Custom error content |

### Image Exposes

| Name | Description | Type |
|------|-------------|------|
| showPreview | Manually open preview | `() => void` |

## Best Practices

1. Use `lazy` for images below the fold
2. Provide `placeholder` for loading states
3. Use `preview-src-list` for image galleries
