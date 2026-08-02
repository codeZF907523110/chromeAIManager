---
name: "el-tabs"
description: "Tabs component for dividing data collections into different types. Invoke when user needs to create tabbed interfaces, dynamic tabs, or card-style tabs."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Tabs Component

Divide data collections which are related yet belong to different types.

## When to Invoke

Invoke this skill when:
- User needs to create tabbed content
- User wants to add/close tabs dynamically
- User needs card or border-card style tabs
- User wants to position tabs (top, left, right, bottom)
- User asks about tab switching with confirmation

## Features

- **Multiple Styles**: Default, card, border-card
- **Tab Position**: Top, bottom, left, right
- **Dynamic Tabs**: Add and remove tabs
- **Custom Labels**: Custom content in tab labels
- **Lazy Rendering**: Lazy load tab content
- **Before Leave Hook**: Confirm before switching tabs

## API Reference

### Tabs Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| model-value / v-model | binding value, name of selected tab | `string \| number` | — |
| default-value | The value of the tab that should be active when initially rendered | `string \| number` | — |
| type | type of Tab | `'' \| 'card' \| 'border-card'` | '' |
| closable | whether Tab is closable | `boolean` | false |
| addable | whether Tab is addable | `boolean` | false |
| editable | whether Tab is addable and closable | `boolean` | false |
| tab-position | position of tabs | `'top' \| 'right' \| 'bottom' \| 'left'` | top |
| stretch | whether width fits container | `boolean` | false |
| before-leave | hook before switching tab | `(activeName, oldActiveName) => Awaitable<void \| boolean>` | () => true |
| tabindex | tabs tabindex | `string \| number` | 0 |

### Tabs Events

| Name | Description | Parameters |
|------|-------------|------------|
| tab-click | triggers when a tab is clicked | `(pane, ev)` |
| tab-change | triggers when activeName changes | `(name)` |
| tab-remove | triggers when remove button is clicked | `(name)` |
| tab-add | triggers when add button is clicked | `()` |
| edit | triggers when add or remove is clicked | `(paneName, action)` |

### Tabs Slots

| Name | Description | Subtags |
|------|-------------|---------|
| default | customize default content | Tab-pane |
| add-icon | customize add button icon | — |

### Tabs Exposes

| Name | Description | Type |
|------|-------------|------|
| currentName | current active pane name | `Ref<TabPaneName>` |
| tabNavRef | tab-nav component instance | `Ref<TabNavInstance \| undefined>` |

### Tab-pane Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| label | title of the tab | `string` | '' |
| disabled | whether Tab is disabled | `boolean` | false |
| name | identifier corresponding to Tabs name | `string \| number` | — |
| closable | whether Tab is closable | `boolean` | false |
| lazy | whether Tab is lazily rendered | `boolean` | false |

### Tab-pane Slots

| Name | Description |
|------|-------------|
| default | Tab-pane's content |
| label | Tab-pane's label |

## Usage Examples

### Basic Usage

```vue
<template>
  <el-tabs v-model="activeName" @tab-click="handleClick">
    <el-tab-pane label="User" name="first">User</el-tab-pane>
    <el-tab-pane label="Config" name="second">Config</el-tab-pane>
    <el-tab-pane label="Role" name="third">Role</el-tab-pane>
    <el-tab-pane label="Task" name="fourth">Task</el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { ref } from 'vue'

const activeName = ref('first')

const handleClick = (tab, event) => {
  console.log(tab, event)
}
</script>
```

### Card Style

```vue
<template>
  <el-tabs v-model="activeName" type="card">
    <el-tab-pane label="User" name="first">User</el-tab-pane>
    <el-tab-pane label="Config" name="second">Config</el-tab-pane>
    <el-tab-pane label="Role" name="third">Role</el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { ref } from 'vue'

const activeName = ref('first')
</script>
```

### Border Card

```vue
<template>
  <el-tabs type="border-card">
    <el-tab-pane label="User">User</el-tab-pane>
    <el-tab-pane label="Config">Config</el-tab-pane>
    <el-tab-pane label="Role">Role</el-tab-pane>
  </el-tabs>
</template>
```

### Tab Position

```vue
<template>
  <el-radio-group v-model="tabPosition" style="margin-bottom: 32px">
    <el-radio-button value="top">Top</el-radio-button>
    <el-radio-button value="right">Right</el-radio-button>
    <el-radio-button value="bottom">Bottom</el-radio-button>
    <el-radio-button value="left">Left</el-radio-button>
  </el-radio-group>

  <el-tabs :tab-position="tabPosition" style="height: 200px">
    <el-tab-pane label="User">User</el-tab-pane>
    <el-tab-pane label="Config">Config</el-tab-pane>
    <el-tab-pane label="Role">Role</el-tab-pane>
    <el-tab-pane label="Task">Task</el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { ref } from 'vue'

const tabPosition = ref('left')
</script>
```

### Custom Tab Label

```vue
<template>
  <el-tabs type="border-card">
    <el-tab-pane>
      <template #label>
        <span>
          <el-icon><Calendar /></el-icon>
          Route
        </span>
      </template>
      Route
    </el-tab-pane>
    <el-tab-pane label="Message">Message</el-tab-pane>
    <el-tab-pane label="Config">Config</el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { Calendar } from '@element-plus/icons-vue'
</script>
```

### Dynamic Tabs

```vue
<template>
  <el-tabs
    v-model="editableTabsValue"
    type="card"
    editable
    @edit="handleTabsEdit"
  >
    <el-tab-pane
      v-for="item in editableTabs"
      :key="item.name"
      :label="item.title"
      :name="item.name"
    >
      {{ item.content }}
    </el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { ref } from 'vue'

let tabIndex = 2
const editableTabsValue = ref('2')
const editableTabs = ref([
  { title: 'Tab 1', name: '1', content: 'Tab 1 content' },
  { title: 'Tab 2', name: '2', content: 'Tab 2 content' }
])

const handleTabsEdit = (targetName, action) => {
  if (action === 'add') {
    const newTabName = `${++tabIndex}`
    editableTabs.value.push({
      title: 'New Tab',
      name: newTabName,
      content: 'New Tab content'
    })
    editableTabsValue.value = newTabName
  } else if (action === 'remove') {
    const tabs = editableTabs.value
    let activeName = editableTabsValue.value
    if (activeName === targetName) {
      tabs.forEach((tab, index) => {
        if (tab.name === targetName) {
          const nextTab = tabs[index + 1] || tabs[index - 1]
          if (nextTab) {
            activeName = nextTab.name
          }
        }
      })
    }
    editableTabsValue.value = activeName
    editableTabs.value = tabs.filter((tab) => tab.name !== targetName)
  }
}
</script>
```

### Before Leave Hook

```vue
<template>
  <el-tabs v-model="activeName" :before-leave="beforeLeave">
    <el-tab-pane label="User" name="first">User</el-tab-pane>
    <el-tab-pane label="Config" name="second">Config</el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const activeName = ref('first')

const beforeLeave = async (activeName, oldActiveName) => {
  if (oldActiveName === 'first') {
    const confirmed = await ElMessageBox.confirm(
      'Are you sure you want to leave? Unsaved changes will be lost.',
      'Warning',
      { type: 'warning' }
    ).catch(() => false)
    return confirmed
  }
  return true
}
</script>
```

### Lazy Loading

```vue
<template>
  <el-tabs v-model="activeName">
    <el-tab-pane label="Tab 1" name="1">Content 1</el-tab-pane>
    <el-tab-pane label="Tab 2" name="2" lazy>
      <!-- This content will only be rendered when tab is active -->
      <ExpensiveComponent />
    </el-tab-pane>
  </el-tabs>
</template>
```

### Custom Add Button Icon

```vue
<template>
  <el-tabs type="card" addable>
    <template #add-icon>
      <el-icon><Plus /></el-icon>
    </template>
    <el-tab-pane label="Tab 1">Content 1</el-tab-pane>
    <el-tab-pane label="Tab 2">Content 2</el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { Plus } from '@element-plus/icons-vue'
</script>
```

## Common Issues

### 1. Tab Content Not Updating

Use `:key` on tab-pane for dynamic content:

```vue
<el-tab-pane :key="tabKey" :label="label">
  {{ content }}
</el-tab-pane>
```

### 2. Height Issues with Left/Right Position

Set a fixed height:

```vue
<el-tabs tab-position="left" style="height: 400px">
  <!-- tabs -->
</el-tabs>
```

### 3. Tab Not Switching

Ensure `v-model` value matches tab `name`:

```vue
<el-tabs v-model="activeName">
  <el-tab-pane name="first">  <!-- activeName should be 'first' -->
</el-tabs>
```

## Best Practices

1. **Use lazy loading**: Use `lazy` for expensive tab content
2. **Unique names**: Ensure each tab-pane has a unique name
3. **Before leave hook**: Use before-leave for unsaved changes warning
4. **Card type for dynamic**: Use card type when adding/removing tabs
5. **Consistent styling**: Use consistent tab type throughout the app
