---
name: "el-pagination"
description: "Pagination component for splitting large datasets into pages. Invoke when user needs to display paginated data, navigate through pages, or control page size and current page."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Pagination Component

Pagination component splits large amounts of data into pages for better user experience and performance.

## When to Use

- Display large datasets in manageable chunks
- Navigate through search results
- Control page size and current page
- Show total item count and page information

## Basic Usage

```vue
<template>
  <el-pagination
    v-model:current-page="currentPage"
    v-model:page-size="pageSize"
    :page-sizes="[10, 20, 30, 40]"
    :total="total"
    layout="total, sizes, prev, pager, next, jumper"
    @size-change="handleSizeChange"
    @current-change="handleCurrentChange"
  />
</template>

<script setup>
import { ref } from 'vue'

const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(100)

const handleSizeChange = (size) => {
  console.log('Page size:', size)
}

const handleCurrentChange = (page) => {
  console.log('Current page:', page)
}
</script>
```

## Layout Configuration

```vue
<template>
  <el-pagination
    :total="100"
    layout="prev, pager, next"
  />
  
  <el-pagination
    :total="100"
    layout="total, prev, pager, next"
  />
  
  <el-pagination
    :total="100"
    layout="sizes, prev, pager, next"
    :page-sizes="[10, 20, 30, 40]"
  />
  
  <el-pagination
    :total="100"
    layout="prev, pager, next, jumper"
  />
  
  <el-pagination
    :total="100"
    layout="total, sizes, prev, pager, next, jumper, ->, slot"
  >
    <span>Custom content</span>
  </el-pagination>
</template>
```

## Background Color

```vue
<template>
  <el-pagination
    :total="100"
    background
    layout="prev, pager, next"
  />
</template>
```

## Small Size

```vue
<template>
  <el-pagination
    :total="100"
    size="small"
    layout="prev, pager, next"
  />
</template>
```

## Pager Count

```vue
<template>
  <el-pagination
    :total="1000"
    :pager-count="11"
    layout="prev, pager, next"
  />
</template>
```

## Hide on Single Page

```vue
<template>
  <el-pagination
    :total="10"
    :page-size="10"
    hide-on-single-page
    layout="prev, pager, next"
  />
</template>
```

## Custom Icons and Text

```vue
<template>
  <el-pagination
    :total="100"
    prev-text="Previous"
    next-text="Next"
    layout="prev, pager, next"
  />
  
  <el-pagination
    :total="100"
    :prev-icon="ArrowLeft"
    :next-icon="ArrowRight"
    layout="prev, pager, next"
  />
</template>

<script setup>
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
</script>
```

## Complete Example with Data Fetching

```vue
<template>
  <el-table :data="tableData">
    <el-table-column prop="id" label="ID" />
    <el-table-column prop="name" label="Name" />
  </el-table>
  
  <el-pagination
    v-model:current-page="currentPage"
    v-model:page-size="pageSize"
    :page-sizes="[10, 20, 50, 100]"
    :total="total"
    layout="total, sizes, prev, pager, next, jumper"
    background
    @change="fetchData"
  />
</template>

<script setup>
import { ref, onMounted } from 'vue'

const tableData = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fetchData = async () => {
  const response = await fetch(
    `/api/data?page=${currentPage.value}&size=${pageSize.value}`
  )
  const data = await response.json()
  tableData.value = data.items
  total.value = data.total
}

onMounted(() => {
  fetchData()
})
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| size | Pagination size | `'large' \| 'default' \| 'small'` | `'default'` |
| background | Buttons have background color | `boolean` | `false` |
| page-size / v-model:page-size | Items per page | `number` | — |
| default-page-size | Default page size | `number` | `10` |
| total | Total item count | `number` | — |
| page-count | Total page count | `number` | — |
| pager-count | Number of pagers shown | `5 \| 7 \| 9 \| 11 \| 13 \| 15 \| 17 \| 19 \| 21` | `7` |
| current-page / v-model:current-page | Current page number | `number` | — |
| default-current-page | Default current page | `number` | `1` |
| layout | Layout elements | `string` | `'prev, pager, next, jumper, ->, total'` |
| page-sizes | Options for page size | `number[]` | `[10, 20, 30, 40, 50, 100]` |
| append-size-to | Element for size dropdown | `string` | — |
| popper-class | Custom class for size dropdown | `string` | `''` |
| popper-style | Custom style for size dropdown | `string \| object` | — |
| prev-text | Text for prev button | `string` | `''` |
| prev-icon | Icon for prev button | `string \| Component` | `ArrowLeft` |
| next-text | Text for next button | `string` | `''` |
| next-icon | Icon for next button | `string \| Component` | `ArrowRight` |
| disabled | Disable pagination | `boolean` | `false` |
| teleported | Teleport dropdown to body | `boolean` | `true` |
| hide-on-single-page | Hide when only one page | `boolean` | `false` |

### Layout Elements

| Element | Description |
|---------|-------------|
| `sizes` | Page size selector |
| `prev` | Previous page button |
| `pager` | Page number list |
| `next` | Next page button |
| `jumper` | Jump to page input |
| `->` | Elements after this are pulled right |
| `total` | Total item count display |
| `slot` | Custom slot content |

### Events

| Name | Description | Type |
|------|-------------|------|
| size-change | Page size changed | `(value: number) => void` |
| current-change | Current page changed | `(value: number) => void` |
| change | Page or size changed | `(currentPage: number, pageSize: number) => void` |
| prev-click | Prev button clicked | `(value: number) => void` |
| next-click | Next button clicked | `(value: number) => void` |

### Slots

| Name | Description |
|------|-------------|
| default | Custom content (requires `slot` in layout) |

## Common Patterns

### With v-model Binding

```vue
<template>
  <el-pagination
    v-model:current-page="page"
    v-model:page-size="size"
    :total="total"
    layout="total, sizes, prev, pager, next"
  />
</template>

<script setup>
import { ref, watch } from 'vue'

const page = ref(1)
const size = ref(10)
const total = ref(100)

watch([page, size], ([newPage, newSize]) => {
  console.log('Page:', newPage, 'Size:', newSize)
})
</script>
```

### Responsive Pagination

```vue
<template>
  <el-pagination
    :total="total"
    :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
    :size="isMobile ? 'small' : 'default'"
  />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const isMobile = ref(false)
const total = ref(100)

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>
```

### Custom Slot Content

```vue
<template>
  <el-pagination
    :total="100"
    layout="slot, prev, pager, next"
  >
    <span class="pagination-info">Page {{ currentPage }}</span>
  </el-pagination>
</template>

<script setup>
import { ref } from 'vue'

const currentPage = ref(1)
</script>
```

## Component Interactions

- Use with **Table** for paginated data display
- Combine with **Select** for custom page size options
- Use with **Input** for custom page jumper
- Integrate with **Card** for paginated card lists

## Best Practices

1. Use `v-model:current-page` and `v-model:page-size` for two-way binding
2. Set `hide-on-single-page` when total items may be small
3. Use `background` for better visibility on light backgrounds
4. Choose appropriate `pager-count` based on available width
5. Use `size="small"` for compact layouts
6. Always define either `total` or `page-count`

## Deprecation Notes

- `small` attribute is deprecated, use `size="small"` instead
- Events are still supported but `v-model` binding is recommended
