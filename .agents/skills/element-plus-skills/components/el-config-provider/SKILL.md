---
name: "el-config-provider"
description: "ConfigProvider component for global configuration. Invoke when user needs to configure global settings, i18n, theme, or component defaults."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# ConfigProvider Component

ConfigProvider provides global configurations accessible throughout the application.

## When to Use

- Internationalization
- Global component size
- Theme configuration
- Component defaults

## i18n Configuration

```vue
<template>
  <el-config-provider :locale="locale">
    <App />
  </el-config-provider>
</template>

<script setup>
import { ref } from 'vue'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'

const locale = ref(zhCn)
</script>
```

## Global Size

```vue
<template>
  <el-config-provider size="small">
    <App />
  </el-config-provider>
</template>
```

## Button Configuration

```vue
<template>
  <el-config-provider :button="{ autoInsertSpace: true, type: 'primary' }">
    <App />
  </el-config-provider>
</template>
```

## Message Configuration

```vue
<template>
  <el-config-provider :message="{ max: 3 }">
    <App />
  </el-config-provider>
</template>
```

## Empty Values Configuration

```vue
<template>
  <el-config-provider
    :empty-values="[null, undefined]"
    :value-on-clear="null"
  >
    <App />
  </el-config-provider>
</template>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| locale | Locale object | `{ name: string, el: TranslatePair }` | English |
| size | Global component size | `'large' \| 'default' \| 'small'` | `'default'` |
| zIndex | Initial zIndex | `number` | — |
| namespace | Component class prefix | `string` | `'el'` |
| button | Button configuration | `{ autoInsertSpace?, type?, plain?, text?, round?, dashed? }` | — |
| link | Link configuration | `{ type?, underline? }` | — |
| dialog | Dialog configuration | `{ alignCenter?, draggable?, overflow?, transition? }` | — |
| message | Message configuration | `{ max?, grouping?, duration?, showClose?, offset?, plain?, placement? }` | — |
| table | Table configuration | `{ showOverflowTooltip?, tooltipEffect?, tooltipOptions?, tooltipFormatter? }` | — |
| empty-values | Empty values for components | `array` | `['', null, undefined]` |
| value-on-clear | Value when cleared | `string \| number \| boolean \| Function` | `undefined` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| default | Default content | `{ config }` |

## Best Practices

1. Use for global i18n configuration
2. Set `size` for consistent component sizing
3. Use `empty-values` for form handling
