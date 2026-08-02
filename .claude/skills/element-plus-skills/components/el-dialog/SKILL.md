---
name: "el-dialog"
description: "Dialog modal component for displaying content in a layer above the page. Invoke when user needs modal dialogs, confirmations, or form popups."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Dialog Component

Informs users while preserving the current page state.

## When to Invoke

Invoke this skill when:
- User needs to display modal content
- User wants to create confirmation dialogs
- User needs form dialogs
- User wants draggable dialogs
- User needs nested dialogs
- User asks about dialog customization

## Features

- **Modal/Modeless**: With or without overlay
- **Customizable Size**: Width, height, fullscreen
- **Draggable**: Drag dialog by header
- **Nested Support**: Multiple dialog layers
- **Custom Content**: Header, body, footer slots
- **Animations**: Custom transition effects
- **Center Alignment**: Horizontal and vertical centering
- **Destroy on Close**: Clean up DOM when closed

## API Reference

### Dialog Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | visibility of Dialog | `boolean` | false |
| title | title of Dialog | `string` | '' |
| width | width of Dialog | `string \| number` | '' |
| fullscreen | whether fullscreen | `boolean` | false |
| top | value for margin-top | `string` | '' |
| modal | whether a mask is displayed | `boolean` | true |
| modal-penetrable | whether the mask is penetrable | `boolean` | false |
| modal-class | custom class names for mask | `string` | — |
| header-class | custom class names for header | `string` | — |
| body-class | custom class names for body | `string` | — |
| footer-class | custom class names for footer | `string` | — |
| append-to-body | whether to append Dialog to body | `boolean` | false |
| append-to | which element the Dialog appends to | `CSSSelector \| HTMLElement` | body |
| lock-scroll | whether scroll of body is disabled | `boolean` | true |
| open-delay | time before open (ms) | `number` | 0 |
| close-delay | time before close (ms) | `number` | 0 |
| close-on-click-modal | whether can be closed by clicking mask | `boolean` | true |
| close-on-press-escape | whether can be closed by ESC | `boolean` | true |
| show-close | whether to show close button | `boolean` | true |
| before-close | callback before close | `(done: DoneFn) => void` | — |
| draggable | enable dragging | `boolean` | false |
| overflow | draggable can overflow viewport | `boolean` | false |
| center | align header and footer in center | `boolean` | false |
| align-center | align dialog horizontally and vertically | `boolean` | false |
| destroy-on-close | destroy elements when closed | `boolean` | false |
| close-icon | custom close icon | `string \| Component` | — |
| z-index | z-order of dialog | `number` | — |
| header-aria-level | header's aria-level attribute | `string` | 2 |
| transition | custom transition configuration | `string \| object` | dialog-fade |

### Dialog Slots

| Name | Description |
|------|-------------|
| default | default content of Dialog |
| header | content of the Dialog header |
| footer | content of the Dialog footer |

### Dialog Events

| Name | Description | Type |
|------|-------------|------|
| open | triggers when Dialog opens | `() => void` |
| opened | triggers when opening animation ends | `() => void` |
| close | triggers when Dialog closes | `() => void` |
| closed | triggers when closing animation ends | `() => void` |
| open-auto-focus | triggers after Dialog opens and content focused | `() => void` |
| close-auto-focus | triggers after Dialog closed and content focused | `() => void` |

### Dialog Exposes

| Name | Description | Type |
|------|-------------|------|
| resetPosition | reset position | `() => void` |
| handleClose | close dialog | `() => void` |

## Usage Examples

### Basic Dialog

```vue
<template>
  <el-button @click="dialogVisible = true">Open Dialog</el-button>

  <el-dialog v-model="dialogVisible" title="Tips" width="30%">
    <span>This is a message</span>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="dialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="dialogVisible = false">Confirm</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'

const dialogVisible = ref(false)
</script>
```

### Custom Content

```vue
<template>
  <el-button @click="dialogVisible = true">Open Form Dialog</el-button>

  <el-dialog v-model="dialogVisible" title="Shipping Address" width="500">
    <el-form :model="form">
      <el-form-item label="Name" :label-width="formLabelWidth">
        <el-input v-model="form.name" autocomplete="off" />
      </el-form-item>
      <el-form-item label="Zone" :label-width="formLabelWidth">
        <el-select v-model="form.region" placeholder="Select">
          <el-option label="Zone No.1" value="shanghai" />
          <el-option label="Zone No.2" value="beijing" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">Cancel</el-button>
      <el-button type="primary" @click="dialogVisible = false">Confirm</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive } from 'vue'

const dialogVisible = ref(false)
const formLabelWidth = '140px'

const form = reactive({
  name: '',
  region: ''
})
</script>
```

### Custom Header

```vue
<template>
  <el-dialog v-model="dialogVisible">
    <template #header="{ titleId, titleClass }">
      <div class="my-header">
        <h4 :id="titleId" :class="titleClass">Custom Header</h4>
        <el-button type="danger" @click="dialogVisible = false">
          <el-icon class="el-icon--left"><CircleCloseFilled /></el-icon>
          Close
        </el-button>
      </div>
    </template>
    This is content
  </el-dialog>
</template>
```

### Nested Dialog

```vue
<template>
  <el-button @click="outerVisible = true">Open Outer Dialog</el-button>

  <el-dialog v-model="outerVisible" title="Outer Dialog">
    <el-button @click="innerVisible = true">Open Inner Dialog</el-button>
    
    <el-dialog
      v-model="innerVisible"
      title="Inner Dialog"
      append-to-body
    />
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'

const outerVisible = ref(false)
const innerVisible = ref(false)
</script>
```

### Centered Content

```vue
<template>
  <el-dialog v-model="dialogVisible" title="Tips" width="30%" center>
    <span>Content should be centered</span>
    <template #footer>
      <el-button @click="dialogVisible = false">Cancel</el-button>
      <el-button type="primary" @click="dialogVisible = false">Confirm</el-button>
    </template>
  </el-dialog>
</template>
```

### Align Center

```vue
<template>
  <el-dialog v-model="dialogVisible" title="Tips" width="30%" align-center>
    <span>Dialog is centered both horizontally and vertically</span>
  </el-dialog>
</template>
```

### Draggable Dialog

```vue
<template>
  <el-dialog v-model="dialogVisible" title="Tips" draggable>
    <span>Drag the header to move the dialog</span>
  </el-dialog>
</template>
```

### Fullscreen

```vue
<template>
  <el-dialog v-model="dialogVisible" title="Tips" fullscreen>
    <span>Fullscreen dialog</span>
  </el-dialog>
</template>
```

### Before Close

```vue
<template>
  <el-dialog
    v-model="dialogVisible"
    title="Tips"
    :before-close="handleClose"
  >
    <span>This dialog will ask for confirmation before closing</span>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'

const dialogVisible = ref(false)

const handleClose = (done) => {
  ElMessageBox.confirm('Are you sure to close this dialog?')
    .then(() => {
      done()
    })
    .catch(() => {
      // catch error
    })
}
</script>
```

### Destroy on Close

```vue
<template>
  <el-dialog v-model="dialogVisible" destroy-on-close>
    <span>Content will be destroyed when closed</span>
  </el-dialog>
</template>
```

### Modal Configuration

```vue
<template>
  <!-- No modal overlay -->
  <el-dialog v-model="dialogVisible" :modal="false">
    <span>Dialog without modal overlay</span>
  </el-dialog>
</template>
```

### Custom Animation

```vue
<template>
  <el-dialog v-model="dialogVisible" transition="el-zoom-in-top">
    <span>Dialog with custom animation</span>
  </el-dialog>
</template>
```

## Common Issues

### 1. Scoped Styles Not Working

Dialog uses Teleport, so styles should be global:

```vue
<style>
/* Global styles for dialog */
.my-dialog .el-dialog__body {
  padding: 20px;
}
</style>
```

### 2. Page Scroll Issues

Use `lock-scroll` properly:

```vue
<el-dialog v-model="dialogVisible" lock-scroll>
  <!-- content -->
</el-dialog>
```

### 3. Nested Dialog Positioning

Use `append-to-body` for nested dialogs:

```vue
<el-dialog v-model="outer">
  <el-dialog v-model="inner" append-to-body />
</el-dialog>
```

## Component Interactions

### With Form

```vue
<template>
  <el-dialog v-model="dialogVisible" title="Edit User">
    <el-form :model="form" :rules="rules" ref="formRef">
      <el-form-item label="Name" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">Cancel</el-button>
      <el-button type="primary" @click="handleSubmit">Save</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
const handleSubmit = async () => {
  try {
    await formRef.value.validate()
    await saveUser(form)
    dialogVisible.value = false
  } catch (error) {
    console.error('Validation failed')
  }
}
</script>
```

### With Table

```vue
<template>
  <el-dialog v-model="dialogVisible" title="Select Items" width="70%">
    <el-table :data="tableData" @selection-change="handleSelection">
      <el-table-column type="selection" />
      <el-table-column prop="name" label="Name" />
    </el-table>
  </el-dialog>
</template>
```

## Best Practices

1. **Use v-model**: Always use `v-model` for visibility control
2. **Set width**: Set appropriate width for content
3. **Use before-close**: Handle unsaved changes gracefully
4. **Destroy on close**: Use `destroy-on-close` for performance
5. **Nested dialogs**: Always use `append-to-body` for nested dialogs
6. **Accessibility**: Use proper `title` and `aria-level`
