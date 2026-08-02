---
name: "el-button"
description: "Button component with various types, sizes, and styles. Invoke when user needs to implement buttons, button groups, or customize button appearance."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Button Component

Button component for user interactions with multiple types, sizes, and styles.

## When to Invoke

Invoke this skill when:
- User needs to implement a button with specific type or style
- User wants to create button groups
- User needs loading or disabled state buttons
- User wants to customize button colors
- User asks about button icons or accessibility

## Features

- **Multiple Types**: default, primary, success, warning, danger, info
- **Multiple Sizes**: large, default, small
- **Style Variants**: plain, round, circle, dashed, text, link
- **States**: loading, disabled
- **Custom Colors**: automatic hover/active color calculation
- **Button Groups**: horizontal or vertical grouping
- **Icon Support**: prefix icons and custom loading icons
- **Tag Customization**: custom element tag (button, a, router-link, etc.)

## API Reference

### Button Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| size | button size | `'large' \| 'default' \| 'small'` | — |
| type | button type, when setting `color`, the latter prevails | `'default' \| 'primary' \| 'success' \| 'warning' \| 'danger' \| 'info' \| '' \| 'text' (deprecated)` | — |
| plain | determine whether it's a plain button | `boolean` | false |
| text | determine whether it's a text button | `boolean` | false |
| bg | determine whether the text button background color is always on | `boolean` | false |
| link | determine whether it's a link button | `boolean` | false |
| round | determine whether it's a round button | `boolean` | false |
| circle | determine whether it's a circle button | `boolean` | false |
| dashed | determine whether it's a dashed button | `boolean` | false |
| loading | determine whether it's loading | `boolean` | false |
| loading-icon | customize loading icon component | `string \| Component` | Loading |
| disabled | disable the button | `boolean` | false |
| icon | icon component | `string \| Component` | — |
| autofocus | same as native button's `autofocus` | `boolean` | false |
| native-type | same as native button's `type` | `'button' \| 'submit' \| 'reset'` | button |
| auto-insert-space | automatically insert a space between two chinese characters | `boolean` | false |
| color | custom button color, automatically calculate `hover` and `active` color | `string` | — |
| dark | dark mode, which automatically converts `color` to dark mode colors | `boolean` | false |
| tag | custom element tag | `string \| Component` | button |

### Button Slots

| Name | Description |
|------|-------------|
| default | customize default content |
| loading | customize loading component |
| icon | customize icon component |

### Button Exposes

| Name | Description | Type |
|------|-------------|------|
| ref | button html element | `Ref<HTMLButtonElement>` |
| size | button size | `ComputedRef<'' \| 'small' \| 'default' \| 'large'>` |
| type | button type | `ComputedRef<'' \| 'default' \| 'primary' \| 'success' \| 'warning' \| 'info' \| 'danger' \| 'text'>` |
| disabled | button disabled | `ComputedRef<boolean>` |
| shouldAddSpace | whether adding space | `ComputedRef<boolean>` |

### ButtonGroup Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| size | control the size of buttons in this button-group | `'large' \| 'default' \| 'small'` | — |
| type | control the type of buttons in this button-group | `'primary' \| 'success' \| 'warning' \| 'danger' \| 'info'` | — |
| direction | display direction | `'horizontal' \| 'vertical'` | horizontal |

### ButtonGroup Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | customize button group content | Button |

## Usage Examples

### Basic Button Types

```vue
<template>
  <el-row class="mb-4">
    <el-button>Default</el-button>
    <el-button type="primary">Primary</el-button>
    <el-button type="success">Success</el-button>
    <el-button type="warning">Warning</el-button>
    <el-button type="danger">Danger</el-button>
    <el-button type="info">Info</el-button>
  </el-row>
</template>
```

### Plain Buttons

```vue
<template>
  <el-row class="mb-4">
    <el-button plain>Plain</el-button>
    <el-button type="primary" plain>Primary</el-button>
    <el-button type="success" plain>Success</el-button>
    <el-button type="warning" plain>Warning</el-button>
    <el-button type="danger" plain>Danger</el-button>
    <el-button type="info" plain>Info</el-button>
  </el-row>
</template>
```

### Round Buttons

```vue
<template>
  <el-row class="mb-4">
    <el-button round>Round</el-button>
    <el-button type="primary" round>Primary</el-button>
    <el-button type="success" round>Success</el-button>
    <el-button type="warning" round>Warning</el-button>
    <el-button type="danger" round>Danger</el-button>
    <el-button type="info" round>Info</el-button>
  </el-row>
</template>
```

### Circle Buttons

```vue
<template>
  <el-row class="mb-4">
    <el-button :icon="Search" circle />
    <el-button type="primary" :icon="Edit" circle />
    <el-button type="success" :icon="Check" circle />
    <el-button type="info" :icon="Message" circle />
    <el-button type="warning" :icon="Star" circle />
    <el-button type="danger" :icon="Delete" circle />
  </el-row>
</template>

<script setup>
import { Search, Edit, Check, Message, Star, Delete } from '@element-plus/icons-vue'
</script>
```

### Disabled Button

```vue
<template>
  <el-row class="mb-4">
    <el-button disabled>Default</el-button>
    <el-button type="primary" disabled>Primary</el-button>
    <el-button type="success" disabled>Success</el-button>
  </el-row>
</template>
```

### Loading Button

```vue
<template>
  <el-row class="mb-4">
    <el-button type="primary" :loading="loading" @click="handleClick">
      {{ loading ? 'Loading...' : 'Click me' }}
    </el-button>
  </el-row>
</template>

<script setup>
import { ref } from 'vue'

const loading = ref(false)

const handleClick = () => {
  loading.value = true
  setTimeout(() => {
    loading.value = false
  }, 2000)
}
</script>
```

### Button Sizes

```vue
<template>
  <el-row class="mb-4">
    <el-button size="large">Large</el-button>
    <el-button>Default</el-button>
    <el-button size="small">Small</el-button>
  </el-row>
</template>
```

### Button Group

```vue
<template>
  <el-button-group>
    <el-button type="primary" :icon="ArrowLeft">Previous</el-button>
    <el-button type="primary">
      Next<el-icon class="el-icon--right"><ArrowRight /></el-icon>
    </el-button>
  </el-button-group>

  <el-button-group class="ml-4">
    <el-button type="primary" :icon="Edit" />
    <el-button type="primary" :icon="Share" />
    <el-button type="primary" :icon="Delete" />
  </el-button-group>
</template>

<script setup>
import { ArrowLeft, ArrowRight, Edit, Share, Delete } from '@element-plus/icons-vue'
</script>
```

### Vertical Button Group

```vue
<template>
  <el-button-group direction="vertical">
    <el-button type="primary">Top</el-button>
    <el-button type="primary">Middle</el-button>
    <el-button type="primary">Bottom</el-button>
  </el-button-group>
</template>
```

### Custom Color

```vue
<template>
  <el-row class="mb-4">
    <el-button color="#626aef">Default</el-button>
    <el-button color="#626aef" plain>Plain</el-button>
    <el-button color="#626aef" disabled>Disabled</el-button>
  </el-row>
</template>
```

### Text Button

```vue
<template>
  <el-row class="mb-4">
    <el-button text>Text Button</el-button>
    <el-button text bg>Text Button with Background</el-button>
    <el-button type="primary" text>Primary Text</el-button>
  </el-row>
</template>
```

### Link Button

```vue
<template>
  <el-row class="mb-4">
    <el-button link>Default Link</el-button>
    <el-button type="primary" link>Primary Link</el-button>
    <el-button type="success" link>Success Link</el-button>
    <el-button type="warning" link>Warning Link</el-button>
    <el-button type="danger" link>Danger Link</el-button>
    <el-button type="info" link>Info Link</el-button>
  </el-row>
</template>
```

### Custom Tag

```vue
<template>
  <el-row class="mb-4">
    <el-button tag="div">Div Button</el-button>
    <el-button type="primary" tag="a" href="https://element-plus.org">
      A Link Button
    </el-button>
    <el-button type="success" tag="router-link" to="/home">
      Router Link
    </el-button>
  </el-row>
</template>
```

## Common Issues

### 1. Button Width Not Consistent

When using icons or loading states, button width may change. Set a fixed width:

```vue
<el-button style="width: 100px">Button</el-button>
```

### 2. Text Button Deprecated Warning

`type="text"` is deprecated. Use `text` attribute instead:

```vue
<!-- Deprecated -->
<el-button type="text">Text Button</el-button>

<!-- Recommended -->
<el-button text>Text Button</el-button>
```

### 3. Custom Color in Dark Mode

Use `dark` attribute to enable dark mode color conversion:

```vue
<el-button color="#626aef" dark>Dark Mode Button</el-button>
```

## Component Interactions

### With Form

```vue
<template>
  <el-form>
    <el-form-item>
      <el-button type="primary" native-type="submit">Submit</el-button>
      <el-button native-type="reset">Reset</el-button>
    </el-form-item>
  </el-form>
</template>
```

### With Dialog

```vue
<template>
  <el-button type="primary" @click="dialogVisible = true">
    Open Dialog
  </el-button>
  
  <el-dialog v-model="dialogVisible">
    <template #footer>
      <el-button @click="dialogVisible = false">Cancel</el-button>
      <el-button type="primary" @click="handleConfirm">Confirm</el-button>
    </template>
  </el-dialog>
</template>
```

### With Loading State

```vue
<template>
  <el-button 
    type="primary" 
    :loading="submitting" 
    @click="handleSubmit"
  >
    {{ submitting ? 'Submitting...' : 'Submit' }}
  </el-button>
</template>

<script setup>
import { ref } from 'vue'

const submitting = ref(false)

const handleSubmit = async () => {
  submitting.value = true
  try {
    await submitData()
  } finally {
    submitting.value = false
  }
}
</script>
```

## Best Practices

1. **Use semantic types**: Use appropriate type for different actions (primary for main actions, danger for destructive actions)
2. **Provide feedback**: Use loading state for async operations
3. **Accessibility**: Add aria-label for icon-only buttons
4. **Consistent sizing**: Use consistent sizes within the same context
5. **Button groups**: Use ButtonGroup for related actions
