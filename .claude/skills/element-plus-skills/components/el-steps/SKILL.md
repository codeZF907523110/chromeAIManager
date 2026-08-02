---
name: "el-steps"
description: "Steps component for guiding users through processes. Invoke when user needs to display step progress, wizard interfaces, or process workflows."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Steps Component

Steps component guides users through tasks in accordance with a process.

## When to Use

- Wizard interfaces
- Process workflows
- Step progress indicators
- Multi-step forms

## Basic Usage

```vue
<template>
  <el-steps :active="active" finish-status="success">
    <el-step title="Step 1" />
    <el-step title="Step 2" />
    <el-step title="Step 3" />
  </el-steps>
  
  <el-button @click="next">Next step</el-button>
</template>

<script setup>
import { ref } from 'vue'

const active = ref(0)

const next = () => {
  if (active.value++ > 2) active.value = 0
}
</script>
```

## With Status

```vue
<template>
  <el-steps :active="1">
    <el-step title="Step 1" description="Some description" />
    <el-step title="Step 2" description="Some description" status="process" />
    <el-step title="Step 3" description="Some description" status="wait" />
  </el-steps>
</template>
```

## Center

```vue
<template>
  <el-steps :active="2" align-center>
    <el-step title="Step 1" />
    <el-step title="Step 2" />
    <el-step title="Step 3" />
  </el-steps>
</template>
```

## With Description

```vue
<template>
  <el-steps :active="1">
    <el-step title="Step 1" description="Description for step 1" />
    <el-step title="Step 2" description="Description for step 2" />
    <el-step title="Step 3" description="Description for step 3" />
  </el-steps>
</template>
```

## With Icon

```vue
<template>
  <el-steps :active="1">
    <el-step title="Step 1" :icon="Edit" />
    <el-step title="Step 2" :icon="Upload" />
    <el-step title="Step 3" :icon="Picture" />
  </el-steps>
</template>

<script setup>
import { Edit, Upload, Picture } from '@element-plus/icons-vue'
</script>
```

## Vertical

```vue
<template>
  <el-steps :active="1" direction="vertical">
    <el-step title="Step 1" />
    <el-step title="Step 2" />
    <el-step title="Step 3" />
  </el-steps>
</template>
```

## Simple

```vue
<template>
  <el-steps :active="1" simple>
    <el-step title="Step 1" />
    <el-step title="Step 2" />
    <el-step title="Step 3" />
  </el-steps>
</template>
```

## API Reference

### Steps Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| space | Spacing of each step | `number \| string` | `''` |
| direction | Display direction | `'vertical' \| 'horizontal'` | `'horizontal'` |
| active | Current activation step | `number` | `0` |
| process-status | Status of current step | `'wait' \| 'process' \| 'finish' \| 'error' \| 'success'` | `'process'` |
| finish-status | Status of finished steps | `'wait' \| 'process' \| 'finish' \| 'error' \| 'success'` | `'finish'` |
| align-center | Center title and description | `boolean` | — |
| simple | Apply simple theme | `boolean` | — |

### Step Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| title | Step title | `string` | `''` |
| description | Step description | `string` | `''` |
| icon | Custom icon | `string \| Component` | — |
| status | Current status | `'' \| 'wait' \| 'process' \| 'finish' \| 'error' \| 'success'` | `''` |

### Step Slots

| Name | Description |
|------|-------------|
| icon | Custom icon |
| title | Step title |
| description | Step description |

## Best Practices

1. Use `active` to track current step
2. Use `direction="vertical"` for limited width
3. Use `simple` for minimal UI
