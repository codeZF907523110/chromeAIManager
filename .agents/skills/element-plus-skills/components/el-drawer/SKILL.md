---
name: "el-drawer"
description: "Drawer component for displaying content in a slide-out panel. Invoke when user needs to create side panels, slide-out menus, or form drawers."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Drawer Component

Sometimes, Dialog does not always satisfy our requirements. Drawer has almost identical API with Dialog, but it introduces different user experience.

## When to Invoke

Invoke this skill when:
- User needs a slide-out panel
- User wants to display forms in a drawer
- User needs a side navigation drawer
- User wants resizable drawer
- User asks about nested drawers

## Features

- **Multiple Directions**: Left, right, top, bottom
- **Resizable**: Drag to resize drawer
- **Nested Support**: Multiple layers of drawers
- **Customizable Size**: Configurable width/height
- **Modal/Modeless**: With or without overlay
- **Custom Header/Footer**: Customizable sections

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | Should Drawer be displayed | `boolean` | false |
| append-to-body | Controls should Drawer be inserted to DocumentBody | `boolean` | false |
| append-to | Which element the Drawer appends to | `CSSSelector \| HTMLElement` | body |
| lock-scroll | Whether scroll of body is disabled | `boolean` | true |
| before-close | If set, closing procedure will be halted | `(done) => void` | — |
| close-on-click-modal | Whether Drawer can be closed by clicking mask | `boolean` | true |
| close-on-press-escape | Whether Drawer can be closed by pressing ESC | `boolean` | true |
| open-delay | Time before open (ms) | `number` | 0 |
| close-delay | Time before close (ms) | `number` | 0 |
| destroy-on-close | Whether children should be destroyed after closed | `boolean` | false |
| modal | Should show shadowing layer | `boolean` | true |
| modal-penetrable | Whether the mask is penetrable | `boolean` | false |
| direction | Drawer's opening direction | `'rtl' \| 'ltr' \| 'ttb' \| 'btt'` | rtl |
| resizable | Enable resizable feature | `boolean` | false |
| show-close | Should show close button | `boolean` | true |
| size | Drawer's size (width or height) | `number \| string` | 30% |
| title | Drawer's title | `string` | — |
| with-header | Flag that controls header section's existence | `boolean` | true |
| modal-class | Extra class names for shadowing layer | `string` | — |
| header-class | Custom class names for header wrapper | `string` | — |
| body-class | Custom class names for body wrapper | `string` | — |
| footer-class | Custom class names for footer wrapper | `string` | — |
| z-index | Set z-index | `number` | — |
| header-aria-level | Header's aria-level attribute | `string` | 2 |

### Events

| Name | Description | Type |
|------|-------------|------|
| open | Triggered before Drawer opening animation begins | `() => void` |
| opened | Triggered after Drawer opening animation ended | `() => void` |
| close | Triggered before Drawer closing animation begins | `() => void` |
| closed | Triggered after Drawer closing animation ended | `() => void` |
| open-auto-focus | Triggers after Drawer opens and content focused | `() => void` |
| close-auto-focus | Triggers after Drawer closed and content focused | `() => void` |
| resize-start | Triggered when resizing starts | `(evt, size) => void` |
| resize | Triggered while resizing | `(evt, size) => void` |
| resize-end | Triggered when resizing ends | `(evt, size) => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Drawer's Content |
| header | Drawer header section |
| footer | Drawer footer Section |

### Exposes

| Name | Description |
|------|-------------|
| handleClose | Close Drawer, calls before-close |

## Usage Examples

### Basic Usage

```vue
<template>
  <el-button @click="drawer = true">Open Drawer</el-button>
  
  <el-drawer v-model="drawer" title="I am the title">
    <span>Hi, there!</span>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'

const drawer = ref(false)
</script>
```

### No Title

```vue
<template>
  <el-button @click="drawer = true">Open Drawer</el-button>
  
  <el-drawer v-model="drawer" :with-header="false">
    <span>Hi, there!</span>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'

const drawer = ref(false)
</script>
```

### Custom Content

```vue
<template>
  <el-button @click="drawer = true">Open Form Drawer</el-button>
  
  <el-drawer v-model="drawer" title="Edit Profile">
    <el-form :model="form" label-width="100px">
      <el-form-item label="Name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="Email">
        <el-input v-model="form.email" />
      </el-form-item>
      <el-form-item label="Bio">
        <el-input v-model="form.bio" type="textarea" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="drawer = false">Cancel</el-button>
      <el-button type="primary" @click="saveForm">Save</el-button>
    </template>
  </el-drawer>
</template>

<script setup>
import { ref, reactive } from 'vue'

const drawer = ref(false)
const form = reactive({
  name: '',
  email: '',
  bio: ''
})

const saveForm = () => {
  console.log('Saving:', form)
  drawer.value = false
}
</script>
```

### Custom Header

```vue
<template>
  <el-drawer v-model="drawer">
    <template #header>
      <div class="custom-header">
        <h4>Custom Header</h4>
        <el-button type="primary" size="small" @click="drawer = false">
          Close
        </el-button>
      </div>
    </template>
    <span>Content</span>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'

const drawer = ref(false)
</script>

<style scoped>
.custom-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
```

### Multiple Directions

```vue
<template>
  <el-button @click="drawer1 = true">From Right</el-button>
  <el-button @click="drawer2 = true">From Left</el-button>
  <el-button @click="drawer3 = true">From Top</el-button>
  <el-button @click="drawer4 = true">From Bottom</el-button>
  
  <el-drawer v-model="drawer1" direction="rtl" title="From Right" />
  <el-drawer v-model="drawer2" direction="ltr" title="From Left" />
  <el-drawer v-model="drawer3" direction="ttb" title="From Top" />
  <el-drawer v-model="drawer4" direction="btt" title="From Bottom" />
</template>

<script setup>
import { ref } from 'vue'

const drawer1 = ref(false)
const drawer2 = ref(false)
const drawer3 = ref(false)
const drawer4 = ref(false)
</script>
```

### Resizable Drawer

```vue
<template>
  <el-button @click="drawer = true">Open Resizable Drawer</el-button>
  
  <el-drawer
    v-model="drawer"
    title="Resizable Drawer"
    resizable
    @resize="handleResize"
  >
    <span>Drag the edge to resize</span>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'

const drawer = ref(false)

const handleResize = (evt, size) => {
  console.log('New size:', size)
}
</script>
```

### Nested Drawers

```vue
<template>
  <el-button @click="outerDrawer = true">Open Outer Drawer</el-button>
  
  <el-drawer v-model="outerDrawer" title="Outer Drawer">
    <el-button @click="innerDrawer = true">Open Inner Drawer</el-button>
    
    <el-drawer
      v-model="innerDrawer"
      title="Inner Drawer"
      append-to-body
    >
      <span>This is the inner drawer</span>
    </el-drawer>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'

const outerDrawer = ref(false)
const innerDrawer = ref(false)
</script>
```

### Before Close

```vue
<template>
  <el-button @click="drawer = true">Open Drawer</el-button>
  
  <el-drawer
    v-model="drawer"
    title="Drawer with Confirmation"
    :before-close="handleClose"
  >
    <span>Are you sure you want to close?</span>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'

const drawer = ref(false)

const handleClose = (done) => {
  ElMessageBox.confirm('Are you sure you want to close?')
    .then(() => {
      done()
    })
    .catch(() => {
      // Cancel close
    })
}
</script>
```

### No Modal

```vue
<template>
  <el-button @click="drawer = true">Open No Modal Drawer</el-button>
  
  <el-drawer
    v-model="drawer"
    title="No Modal"
    :modal="false"
  >
    <span>You can interact with the page behind</span>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'

const drawer = ref(false)
</script>
```

### Custom Size

```vue
<template>
  <el-button @click="drawer = true">Open 50% Drawer</el-button>
  
  <el-drawer
    v-model="drawer"
    title="Custom Size"
    size="50%"
  >
    <span>50% width drawer</span>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'

const drawer = ref(false)
</script>
```

### Destroy on Close

```vue
<template>
  <el-button @click="drawer = true">Open Drawer</el-button>
  
  <el-drawer
    v-model="drawer"
    title="Destroy on Close"
    destroy-on-close
  >
    <ChildComponent />
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'

const drawer = ref(false)
</script>
```

## Common Issues

### 1. Drawer Not Closing

Check `before-close` function:

```vue
<script setup>
const handleClose = (done) => {
  // Make sure to call done() to close
  done()
}
</script>
```

### 2. Nested Drawer Positioning

Use `append-to-body` for nested drawers:

```vue
<el-drawer v-model="outer">
  <el-drawer v-model="inner" append-to-body />
</el-drawer>
```

### 3. Content Not Updating

Use `destroy-on-close` to re-render content:

```vue
<el-drawer v-model="drawer" destroy-on-close>
  <!-- Content will be destroyed and recreated -->
</el-drawer>
```

## Best Practices

1. **Use append-to-body**: For nested drawers, always use `append-to-body`
2. **Confirm before close**: Use `before-close` for unsaved changes
3. **Appropriate size**: Set size based on content
4. **Destroy on close**: Use `destroy-on-close` for performance
5. **Direction choice**: Choose direction based on use case
