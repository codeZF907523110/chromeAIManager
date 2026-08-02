---
name: "el-carousel"
description: "Carousel component for looping images or texts in limited space. Invoke when user needs to display image sliders, content carousels, or rotating banners."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Carousel Component

Carousel component loops a series of images or texts in a limited space with various display modes.

## When to Use

- Image sliders
- Content carousels
- Rotating banners
- Product showcases

## Basic Usage

```vue
<template>
  <el-carousel height="150px">
    <el-carousel-item v-for="item in 4" :key="item">
      <h3>{{ item }}</h3>
    </el-carousel-item>
  </el-carousel>
</template>
```

## Motion Blur

```vue
<template>
  <el-carousel height="200px" motion-blur>
    <el-carousel-item v-for="item in 4" :key="item">
      <h3>{{ item }}</h3>
    </el-carousel-item>
  </el-carousel>
</template>
```

## Indicators

```vue
<template>
  <el-carousel indicator-position="outside">
    <el-carousel-item v-for="item in 4" :key="item">
      <h3>{{ item }}</h3>
    </el-carousel-item>
  </el-carousel>
</template>
```

## Arrows

```vue
<template>
  <el-carousel :interval="4000" arrow="always">
    <el-carousel-item v-for="item in 4" :key="item">
      <h3>{{ item }}</h3>
    </el-carousel-item>
  </el-carousel>
</template>
```

## Card Mode

```vue
<template>
  <el-carousel type="card" height="200px">
    <el-carousel-item v-for="item in 6" :key="item">
      <h3>{{ item }}</h3>
    </el-carousel-item>
  </el-carousel>
</template>
```

## Vertical

```vue
<template>
  <el-carousel height="200px" direction="vertical">
    <el-carousel-item v-for="item in 4" :key="item">
      <h3>{{ item }}</h3>
    </el-carousel-item>
  </el-carousel>
</template>
```

## API Reference

### Carousel Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| height | Height of the carousel | `string` | `''` |
| initial-index | Index of initially active slide | `number` | `0` |
| trigger | How indicators are triggered | `'hover' \| 'click'` | `'hover'` |
| autoplay | Whether to auto loop | `boolean` | `true` |
| interval | Interval of auto loop (ms) | `number` | `3000` |
| indicator-position | Position of indicators | `'' \| 'none' \| 'outside'` | `''` |
| arrow | When arrows are shown | `'always' \| 'hover' \| 'never'` | `'hover'` |
| type | Type of carousel | `'' \| 'card'` | `''` |
| card-scale | Scale of secondary cards in card mode | `number` | `0.83` |
| loop | Display items in loop | `boolean` | `true` |
| direction | Display direction | `'horizontal' \| 'vertical'` | `'horizontal'` |
| pause-on-hover | Pause autoplay on hover | `boolean` | `true` |
| motion-blur | Enable motion blur effect | `boolean` | `false` |

### Carousel Events

| Name | Description | Type |
|------|-------------|------|
| change | Triggers when active slide switches | `(current: number, prev: number) => void` |

### Carousel Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | Customize default content | Carousel-Item |

### Carousel Exposes

| Name | Description | Type |
|------|-------------|------|
| activeIndex | Active slide index | `number` |
| setActiveItem | Manually switch slide | `(index: string \| number) => void` |
| prev | Switch to previous slide | `() => void` |
| next | Switch to next slide | `() => void` |

### CarouselItem Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| name | Name of the item | `string` | `''` |
| label | Text for corresponding indicator | `string \| number` | `''` |

## Best Practices

1. Use `type="card"` for product showcases
2. Set `motion-blur` for smoother transitions
3. Use `arrow="always"` for better accessibility
