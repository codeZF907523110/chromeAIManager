# Component Patterns

> Patterns for splitting, composing, and communicating between Vue 3 components.

## Smart vs Dumb Components

### Smart (Container) Component

Fetches data, manages state, delegates rendering:

```vue
<!-- pages/users/UsersListPage.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useUsersStore } from '@/stores/users'
import UserTable from './components/UserTable.vue'
import UserFilters from './components/UserFilters.vue'

const store = useUsersStore()
const { list, loading } = storeToRefs(store)
const { fetchAll } = store

onMounted(fetchAll)

function handleDelete(id: number) {
  // confirm, then delete
}
</script>

<template>
  <div>
    <h1>Users</h1>
    <UserFilters @search="fetchAll" />
    <UserTable :users="list" :loading="loading" @delete="handleDelete" />
  </div>
</template>
```

### Dumb (Presentational) Component

Pure UI — receives props, emits events, no data fetching:

```vue
<!-- components/UserTable.vue -->
<script setup lang="ts">
import type { User } from '@/types/user'

defineProps<{
  users: User[]
  loading: boolean
}>()

defineEmits<{
  delete: [id: number]
}>()
</script>

<template>
  <div v-if="loading">Loading...</div>
  <table v-else>
    <thead>
      <tr><th>Name</th><th>Email</th><th>Actions</th></tr>
    </thead>
    <tbody>
      <tr v-for="user in users" :key="user.id">
        <td>{{ user.name }}</td>
        <td>{{ user.email }}</td>
        <td><button @click="$emit('delete', user.id)">Delete</button></td>
      </tr>
    </tbody>
  </table>
</template>
```

---

## Table Decomposition

For complex data tables, split into layers:

```
DataTableContainer.vue        ← data fetching, pagination state
├── DataTableToolbar.vue      ← search, filters, bulk actions
├── DataTable.vue             ← table layout, sorting
│   ├── DataTableHeader.vue   ← column headers, sort indicators
│   └── DataTableRow.vue      ← row rendering, row actions
└── DataTablePagination.vue   ← page controls
```

### Reusable Table with Slots

```vue
<!-- shared/components/common/DataTable.vue -->
<script setup lang="ts" generic="T extends { id: string | number }">
defineProps<{
  items: T[]
  columns: { key: keyof T; label: string }[]
  loading?: boolean
}>()

defineEmits<{
  rowClick: [item: T]
}>()
</script>

<template>
  <table>
    <thead>
      <tr>
        <th v-for="col in columns" :key="String(col.key)">{{ col.label }}</th>
        <th v-if="$slots.actions">Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="loading"><td :colspan="columns.length + 1">Loading...</td></tr>
      <tr v-for="item in items" :key="item.id" @click="$emit('rowClick', item)">
        <td v-for="col in columns" :key="String(col.key)">
          <slot :name="`cell-${String(col.key)}`" :item="item" :value="item[col.key]">
            {{ item[col.key] }}
          </slot>
        </td>
        <td v-if="$slots.actions">
          <slot name="actions" :item="item" />
        </td>
      </tr>
    </tbody>
  </table>
</template>
```

Usage:

```vue
<DataTable :items="users" :columns="columns" @row-click="goToUser">
  <template #cell-status="{ value }">
    <AppBadge :variant="value === 'active' ? 'success' : 'warning'">{{ value }}</AppBadge>
  </template>
  <template #actions="{ item }">
    <button @click.stop="editUser(item)">Edit</button>
  </template>
</DataTable>
```

---

## Form Decomposition

Split complex forms into sections:

```
UserFormContainer.vue          ← submit logic, validation orchestration
├── UserBasicInfoSection.vue   ← name, email, phone
├── UserAddressSection.vue     ← address fields
├── UserRolesSection.vue       ← role/permission selection
└── FormActions.vue            ← save, cancel, reset buttons
```

### Form with v-model sections

```vue
<!-- UserFormContainer.vue -->
<script setup lang="ts">
import { reactive } from 'vue'
import UserBasicInfoSection from './UserBasicInfoSection.vue'
import UserAddressSection from './UserAddressSection.vue'

const form = reactive({
  name: '',
  email: '',
  address: { street: '', city: '', zip: '' },
})

function handleSubmit() {
  // validate and submit
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <UserBasicInfoSection v-model:name="form.name" v-model:email="form.email" />
    <UserAddressSection v-model="form.address" />
    <button type="submit">Save</button>
  </form>
</template>
```

```vue
<!-- UserBasicInfoSection.vue -->
<script setup lang="ts">
const name = defineModel<string>('name', { required: true })
const email = defineModel<string>('email', { required: true })
</script>

<template>
  <fieldset>
    <label>Name <input v-model="name" /></label>
    <label>Email <input v-model="email" type="email" /></label>
  </fieldset>
</template>
```

---

## Modal Extraction

### Rules

- **Never nest modals inside triggering components.**
- **Register modals at the layout or app level.**
- **Control open/close via composable or store.**
- **Pass data via props, not global state.**

### Modal Host Pattern

```vue
<!-- App.vue or DefaultLayout.vue -->
<script setup lang="ts">
import { useModal } from '@/composables/useModal'

const { current, close } = useModal()
</script>

<template>
  <RouterView />
  <Teleport to="body">
    <component
      v-if="current"
      :is="current.component"
      v-bind="current.props"
      @close="close"
    />
  </Teleport>
</template>
```

### Opening a Modal from Anywhere

```vue
<script setup lang="ts">
import { useModal } from '@/composables/useModal'
import UserEditModal from '@/features/users/components/UserEditModal.vue'

const { open } = useModal()

function editUser(user: User) {
  open(UserEditModal, { user, onSaved: () => fetchUsers() })
}
</script>
```

---

## Slot Architecture

### Named Slots for Flexible Layouts

```vue
<!-- AppCard.vue -->
<template>
  <div class="card">
    <div v-if="$slots.header" class="card-header">
      <slot name="header" />
    </div>
    <div class="card-body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>
```

### Scoped Slots for Render Delegation

```vue
<!-- AppList.vue -->
<script setup lang="ts" generic="T">
defineProps<{ items: T[] }>()
</script>

<template>
  <ul>
    <li v-for="(item, index) in items" :key="index">
      <slot :item="item" :index="index" />
    </li>
  </ul>
</template>
```

### When to Use Slots

| Scenario | Use |
|----------|-----|
| Parent controls child layout | Named slots |
| Parent controls item rendering in a list | Scoped slots |
| Wrapper provides context (auth, theme) | Provide/inject + default slot |
| Conditional sections (header, footer) | Optional named slots with `$slots` check |

---

## Props & Emits Conventions

### Props

- **Type all props** with `defineProps<{...}>()`.
- **Use `withDefaults()`** for optional props with defaults.
- **Prefer primitive props** over passing entire objects when the child only uses 1–2 fields.
- **Never mutate props** — copy to local ref if editing is needed.

```ts
const props = withDefaults(defineProps<{
  title: string
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}>(), {
  variant: 'primary',
  disabled: false,
})
```

### Emits

- **Type all emits** with `defineEmits<{...}>()`.
- **Use descriptive event names** — `itemSelect`, not `select`.
- **Emit domain events, not DOM events** — `userDelete`, not `click`.

```ts
const emit = defineEmits<{
  itemSelect: [item: User]
  pageChange: [page: number]
  filtersUpdate: [filters: UserFilters]
}>()
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| God component (500+ LOC) | Untestable, hard to modify | Split into container + children |
| Business logic in template | Can't unit test | Move to composable/computed |
| Prop drilling 3+ levels deep | Fragile, verbose | `provide/inject` or Pinia store |
| Component fetches its own data AND renders | Mixing concerns | Smart/dumb split |
| Using `$parent` / `$refs` for communication | Tight coupling | Props/events or provide/inject |
| Inline styles for layout logic | Unmaintainable | CSS classes or utility framework |
| Massive `v-if`/`v-else` chains in template | Unreadable | Computed + component map or `<component :is>` |
