---
name: "el-table"
description: "Table component for displaying data with sorting, filtering, selection, and pagination. Invoke when user needs to display tabular data or implement data grid functionality."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Table Component

Display multiple data with similar format. You can sort, filter, compare your data in a table.

## When to Invoke

Invoke this skill when:
- User needs to display data in a table format
- User wants to implement sorting or filtering
- User needs row selection (single or multiple)
- User wants fixed columns or header
- User needs expandable rows or tree data
- User asks about table pagination

## Features

- **Flexible Layout**: Fixed header, fixed columns, fluid height
- **Row Selection**: Single or multiple selection
- **Sorting**: Local or remote sorting
- **Filtering**: Column-based filtering
- **Custom Templates**: Custom cell and header content
- **Expandable Rows**: Row expansion for detailed content
- **Tree Data**: Hierarchical data display
- **Summary Row**: Automatic or custom summaries
- **Cell Merging**: Rowspan and colspan support

## API Reference

### Table Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| data | table data | `any[]` | [] |
| height | table's height | `string \| number` | — |
| max-height | table's max-height | `string \| number` | — |
| stripe | whether Table is striped | `boolean` | false |
| border | whether Table has vertical border | `boolean` | false |
| size | size of Table | `'' \| 'large' \| 'default' \| 'small'` | — |
| fit | whether width fits container | `boolean` | true |
| show-header | whether Table header is visible | `boolean` | true |
| highlight-current-row | whether current row is highlighted | `boolean` | false |
| current-row-key | key of current row | `string \| number` | — |
| row-class-name | custom class names for rows | `Function \| string` | — |
| row-style | custom style for rows | `Function \| object` | — |
| cell-class-name | custom class names for cells | `Function \| string` | — |
| cell-style | custom style for cells | `Function \| object` | — |
| row-key | key of row data | `Function \| string` | — |
| empty-text | displayed text when data is empty | `string` | No Data |
| default-expand-all | whether expand all rows | `boolean` | false |
| expand-row-keys | keys of expanded rows | `string[]` | — |
| default-sort | default sort column and order | `object` | — |
| tooltip-effect | effect of overflow tooltip | `'dark' \| 'light'` | dark |
| show-summary | whether to display summary row | `boolean` | false |
| sum-text | text for first column of summary | `string` | Sum |
| summary-method | custom summary method | `Function` | — |
| span-method | method for rowspan and colspan | `Function` | — |
| select-on-indeterminate | controls master checkbox behavior | `boolean` | true |
| indent | indentation of tree data | `number` | 16 |
| lazy | whether to lazy load data | `boolean` | false |
| load | method for loading child rows | `Function` | — |
| tree-props | configuration for nested data | `object` | — |
| table-layout | table layout algorithm | `'fixed' \| 'auto'` | fixed |
| scrollbar-always-on | always show scrollbar | `boolean` | false |

### Table Events

| Name | Description | Type |
|------|-------------|------|
| select | triggers when checkbox is clicked | `(selection, row) => void` |
| select-all | triggers when header checkbox is clicked | `(selection) => void` |
| selection-change | triggers when selection changes | `(selection) => void` |
| cell-mouse-enter | triggers when mouse enters a cell | `(row, column, cell, event) => void` |
| cell-mouse-leave | triggers when mouse leaves a cell | `(row, column, cell, event) => void` |
| cell-click | triggers when clicking a cell | `(row, column, cell, event) => void` |
| cell-dblclick | triggers when double clicking a cell | `(row, column, cell, event) => void` |
| cell-contextmenu | triggers when right clicking a cell | `(row, column, cell, event) => void` |
| row-click | triggers when clicking a row | `(row, column, event) => void` |
| row-contextmenu | triggers when right clicking a row | `(row, column, event) => void` |
| row-dblclick | triggers when double clicking a row | `(row, column, event) => void` |
| header-click | triggers when clicking a column header | `(column, event) => void` |
| header-contextmenu | triggers when right clicking a column header | `(column, event) => void` |
| sort-change | triggers when sorting changes | `(data) => void` |
| filter-change | triggers when filter changes | `(filters) => void` |
| current-change | triggers when current row changes | `(currentRow, oldCurrentRow) => void` |
| header-dragend | triggers after header column width changes | `(newWidth, oldWidth, column, event) => void` |
| expand-change | triggers when row expands/collapses | `(row, expandedRows) => void` |

### Table Exposes

| Name | Description | Type |
|------|-------------|------|
| clearSelection | clear selection | `() => void` |
| getSelectionRows | returns selected rows | `() => any[]` |
| toggleRowSelection | toggle row selection | `(row, selected?, ignoreSelectable?) => void` |
| toggleAllSelection | toggle select all | `() => void` |
| toggleRowExpansion | toggle row expansion | `(row, expanded?) => void` |
| setCurrentRow | set current row | `(row) => void` |
| clearSort | clear sorting | `() => void` |
| clearFilter | clear filters | `(columnKeys?) => void` |
| doLayout | refresh layout | `() => void` |
| sort | sort manually | `(prop, order) => void` |
| scrollTo | scroll to position | `(options) => void` |
| setScrollTop | set scroll top | `(top) => void` |
| setScrollLeft | set scroll left | `(left) => void` |

### TableColumn Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| type | type of column | `'selection' \| 'index' \| 'expand'` | — |
| index | customize index | `number \| Function` | — |
| column-key | column's key | `string` | — |
| label | column label | `string` | — |
| prop | field name | `string` | — |
| width | column width | `string \| number` | — |
| min-width | minimum column width | `string \| number` | — |
| fixed | fixed column | `'left' \| 'right' \| boolean` | — |
| render-header | render function for header | `Function` | — |
| sortable | whether column is sortable | `boolean \| 'custom'` | false |
| sort-method | custom sort method | `Function` | — |
| sort-by | sort by field | `Function \| string \| string[]` | — |
| sort-orders | sort orders | `array` | ['ascending', 'descending', null] |
| resizable | whether column is resizable | `boolean` | true |
| formatter | cell formatter | `Function` | — |
| show-overflow-tooltip | show tooltip on overflow | `boolean \| object` | false |
| align | alignment | `'left' \| 'center' \| 'right'` | — |
| header-align | header alignment | `'left' \| 'center' \| 'right'` | — |
| class-name | class name for cells | `string` | — |
| label-class-name | class name for header | `string` | — |
| selectable | whether row is selectable | `Function` | — |
| reserve-selection | reserve selection after refresh | `boolean` | false |
| filters | filter options | `array` | — |
| filter-placement | filter popup placement | `string` | — |
| filter-multiple | whether multiple filter | `boolean` | true |
| filter-method | filter method | `Function` | — |
| filtered-value | filter value | `array` | — |

### TableColumn Slots

| Name | Description | Type |
|------|-------------|------|
| default | custom content | `{ row, column, $index }` |
| header | custom header | `{ column, $index }` |

## Usage Examples

### Basic Table

```vue
<template>
  <el-table :data="tableData" style="width: 100%">
    <el-table-column prop="date" label="Date" width="180" />
    <el-table-column prop="name" label="Name" width="180" />
    <el-table-column prop="address" label="Address" />
  </el-table>
</template>

<script setup>
const tableData = [
  { date: '2016-05-03', name: 'Tom', address: 'No. 189, Grove St' },
  { date: '2016-05-02', name: 'Jack', address: 'No. 189, Grove St' }
]
</script>
```

### Striped Table

```vue
<template>
  <el-table :data="tableData" stripe style="width: 100%">
    <el-table-column prop="date" label="Date" />
    <el-table-column prop="name" label="Name" />
  </el-table>
</template>
```

### Table with Border

```vue
<template>
  <el-table :data="tableData" border style="width: 100%">
    <el-table-column prop="date" label="Date" />
    <el-table-column prop="name" label="Name" />
  </el-table>
</template>
```

### Fixed Header

```vue
<template>
  <el-table :data="tableData" height="250" style="width: 100%">
    <el-table-column prop="date" label="Date" width="180" />
    <el-table-column prop="name" label="Name" width="180" />
    <el-table-column prop="address" label="Address" />
  </el-table>
</template>
```

### Fixed Column

```vue
<template>
  <el-table :data="tableData" style="width: 100%">
    <el-table-column fixed prop="date" label="Date" width="150" />
    <el-table-column prop="name" label="Name" width="120" />
    <el-table-column prop="address" label="Address" width="300" />
    <el-table-column fixed="right" label="Operations" width="120">
      <template #default>
        <el-button type="text" size="small">Detail</el-button>
        <el-button type="text" size="small">Edit</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>
```

### Multiple Selection

```vue
<template>
  <el-table ref="multipleTableRef" :data="tableData" @selection-change="handleSelectionChange">
    <el-table-column type="selection" width="55" />
    <el-table-column prop="date" label="Date" width="120" />
    <el-table-column prop="name" label="Name" width="120" />
  </el-table>
  <div style="margin-top: 20px">
    <el-button @click="toggleSelection()">Clear selection</el-button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const multipleTableRef = ref()
const multipleSelection = ref([])

const handleSelectionChange = (val) => {
  multipleSelection.value = val
}

const toggleSelection = () => {
  multipleTableRef.value.clearSelection()
}
</script>
```

### Sorting

```vue
<template>
  <el-table :data="tableData" :default-sort="{ prop: 'date', order: 'descending' }">
    <el-table-column prop="date" label="Date" sortable width="180" />
    <el-table-column prop="name" label="Name" sortable width="180" />
    <el-table-column prop="address" label="Address" />
  </el-table>
</template>
```

### Custom Column Template

```vue
<template>
  <el-table :data="tableData" style="width: 100%">
    <el-table-column label="Date" width="180">
      <template #default="scope">
        <div style="display: flex; align-items: center">
          <el-icon><timer /></el-icon>
          <span style="margin-left: 10px">{{ scope.row.date }}</span>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="Name" width="180">
      <template #default="scope">
        <el-popover effect="light" trigger="hover" placement="top" width="auto">
          <template #default>
            <div>name: {{ scope.row.name }}</div>
          </template>
          <template #reference>
            <el-tag>{{ scope.row.name }}</el-tag>
          </template>
        </el-popover>
      </template>
    </el-table-column>
    <el-table-column label="Operations">
      <template #default="scope">
        <el-button size="small" @click="handleEdit(scope.$index, scope.row)">Edit</el-button>
        <el-button size="small" type="danger" @click="handleDelete(scope.$index, scope.row)">Delete</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>
```

### Expandable Row

```vue
<template>
  <el-table :data="tableData" style="width: 100%">
    <el-table-column type="expand">
      <template #default="props">
        <div m="4">
          <p m="t-0 b-2">State: {{ props.row.state }}</p>
          <p m="t-0 b-2">City: {{ props.row.city }}</p>
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="date" label="Date" width="180" />
    <el-table-column prop="name" label="Name" width="180" />
  </el-table>
</template>
```

### Summary Row

```vue
<template>
  <el-table :data="tableData" show-summary style="width: 100%">
    <el-table-column prop="id" label="ID" width="180" />
    <el-table-column prop="name" label="Name" />
    <el-table-column prop="amount1" label="Amount 1" />
    <el-table-column prop="amount2" label="Amount 2" />
  </el-table>
</template>
```

### Custom Summary

```vue
<template>
  <el-table :data="tableData" show-summary :summary-method="getSummaries">
    <el-table-column prop="id" label="ID" />
    <el-table-column prop="amount" label="Amount" />
  </el-table>
</template>

<script setup>
const getSummaries = (param) => {
  const { columns, data } = param
  const sums = []
  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = 'Total Cost'
      return
    }
    const values = data.map((item) => Number(item[column.property]))
    if (!values.every((value) => Number.isNaN(value))) {
      sums[index] = `$ ${values.reduce((prev, curr) => {
        const value = Number(curr)
        if (!Number.isNaN(value)) {
          return prev + curr
        } else {
          return prev
        }
      }, 0)}`
    } else {
      sums[index] = 'N/A'
    }
  })
  return sums
}
</script>
```

## Common Issues

### 1. Table Not Updating

Use `doLayout()` after data changes:

```vue
<script setup>
const tableRef = ref()

const updateData = async () => {
  await fetchData()
  nextTick(() => {
    tableRef.value?.doLayout()
  })
}
</script>
```

### 2. Selection Not Clearing

Use `clearSelection()`:

```vue
<script setup>
const tableRef = ref()

const clearAll = () => {
  tableRef.value?.clearSelection()
}
</script>
```

### 3. Sort Not Working

Ensure `prop` matches data field:

```vue
<el-table-column prop="name" sortable />  <!-- Must match row.name -->
```

## Best Practices

1. **Use row-key**: Set `row-key` for better performance and selection
2. **Virtual scroll**: Use TableV2 for large datasets
3. **Lazy loading**: Use `lazy` for tree data
4. **Debounce filters**: Debounce filter operations
5. **Fixed width**: Set width for fixed columns
