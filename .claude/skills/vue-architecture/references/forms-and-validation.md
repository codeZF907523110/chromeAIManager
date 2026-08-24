# Forms & Validation Architecture

> Patterns for building scalable, composable forms in Vue 3.

## Form Architecture Principles

1. **Isolate form state** — never mix form state with page/component state.
2. **Validation in composables** — not scattered in templates.
3. **Container submits, form emits** — the form component is presentational.
4. **`defineModel()` for bindings** — clean two-way data flow.
5. **Progressive enhancement** — start simple, add validation layers as needed.

---

## Basic Form Composable

```ts
// src/composables/useForm.ts
import { reactive, computed } from 'vue'

export function useForm<T extends Record<string, unknown>>(
  initialValues: T,
  validators?: Partial<Record<keyof T, (value: unknown) => string | null>>,
) {
  const form = reactive({ ...initialValues }) as T
  const errors = reactive<Partial<Record<keyof T, string | null>>>(
    Object.fromEntries(Object.keys(initialValues).map(k => [k, null])) as Partial<Record<keyof T, string | null>>
  )
  const touched = reactive<Partial<Record<keyof T, boolean>>>(
    Object.fromEntries(Object.keys(initialValues).map(k => [k, false])) as Partial<Record<keyof T, boolean>>
  )

  const isValid = computed(() =>
    Object.values(errors).every(e => !e)
  )

  const isDirty = computed(() =>
    Object.keys(initialValues).some(
      key => form[key as keyof T] !== initialValues[key as keyof T],
    )
  )

  function validateField(field: keyof T) {
    const validator = validators?.[field]
    errors[field] = validator ? validator(form[field]) : null
  }

  function validateAll(): boolean {
    for (const key of Object.keys(initialValues) as (keyof T)[]) {
      validateField(key)
    }
    return isValid.value
  }

  function touch(field: keyof T) {
    touched[field] = true
    validateField(field)
  }

  function reset() {
    Object.assign(form, initialValues)
    for (const key of Object.keys(errors)) {
      errors[key as keyof T] = null
    }
    for (const key of Object.keys(touched)) {
      touched[key as keyof T] = false
    }
  }

  return { form, errors, touched, isValid, isDirty, validateField, validateAll, touch, reset }
}
```

---

## Domain-Specific Form Composable

```ts
// src/features/users/composables/useUserForm.ts
import { useForm } from '@/composables/useForm'
import type { User, CreateUserDto } from '@/types/user'

const validators = {
  name: (v: unknown) => (typeof v === 'string' && v.trim()) ? null : 'Name is required',
  email: (v: unknown) => {
    if (typeof v !== 'string' || !v.trim()) return 'Email is required'
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Invalid email format'
  },
  role: (v: unknown) => (v ? null : 'Role is required'),
}

export function useUserForm(initial?: Partial<CreateUserDto>) {
  const { form, errors, touched, isValid, isDirty, validateAll, touch, reset } = useForm(
    {
      name: initial?.name ?? '',
      email: initial?.email ?? '',
      role: initial?.role ?? '',
    },
    validators,
  )

  function toDto(): CreateUserDto {
    return { name: form.name, email: form.email, role: form.role }
  }

  return { form, errors, touched, isValid, isDirty, validateAll, touch, reset, toDto }
}
```

---

## Form Component Pattern

```vue
<!-- UserForm.vue (Presentational) -->
<script setup lang="ts">
import { useUserForm } from '../composables/useUserForm'
import type { CreateUserDto, User } from '@/types/user'

const props = defineProps<{
  initial?: Partial<User>
}>()

const emit = defineEmits<{
  submit: [data: CreateUserDto]
  cancel: []
}>()

const { form, errors, touched, isValid, isDirty, validateAll, touch } = useUserForm(props.initial)

function handleSubmit() {
  if (!validateAll()) return
  emit('submit', { name: form.name, email: form.email, role: form.role })
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div>
      <label>Name</label>
      <input v-model="form.name" @blur="touch('name')" />
      <span v-if="touched.name && errors.name" class="error">{{ errors.name }}</span>
    </div>
    <div>
      <label>Email</label>
      <input v-model="form.email" type="email" @blur="touch('email')" />
      <span v-if="touched.email && errors.email" class="error">{{ errors.email }}</span>
    </div>
    <div>
      <label>Role</label>
      <select v-model="form.role" @blur="touch('role')">
        <option value="">Select...</option>
        <option value="admin">Admin</option>
        <option value="manager">Manager</option>
        <option value="user">User</option>
      </select>
      <span v-if="touched.role && errors.role" class="error">{{ errors.role }}</span>
    </div>
    <div>
      <button type="submit" :disabled="!isValid || !isDirty">Save</button>
      <button type="button" @click="$emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
```

## Container with Form

```vue
<!-- UserCreatePage.vue (Smart container) -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useUsersStore } from '@/stores/users'
import UserForm from '../components/UserForm.vue'
import type { CreateUserDto } from '@/types/user'

const router = useRouter()
const store = useUsersStore()

async function handleSubmit(data: CreateUserDto) {
  await store.create(data)
  router.push({ name: 'Users' })
}

function handleCancel() {
  router.back()
}
</script>

<template>
  <h1>Create User</h1>
  <UserForm @submit="handleSubmit" @cancel="handleCancel" />
</template>
```

---

## Multi-Section Form with v-model

```vue
<!-- OrderForm.vue -->
<script setup lang="ts">
import { reactive } from 'vue'
import CustomerSection from './CustomerSection.vue'
import ItemsSection from './ItemsSection.vue'
import ShippingSection from './ShippingSection.vue'

const form = reactive({
  customer: { name: '', email: '' },
  items: [] as { productId: number; quantity: number }[],
  shipping: { address: '', city: '', zip: '' },
})
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <CustomerSection v-model="form.customer" />
    <ItemsSection v-model="form.items" />
    <ShippingSection v-model="form.shipping" />
    <button type="submit">Place Order</button>
  </form>
</template>
```

```vue
<!-- CustomerSection.vue -->
<script setup lang="ts">
const model = defineModel<{ name: string; email: string }>({ required: true })
</script>

<template>
  <fieldset>
    <legend>Customer Info</legend>
    <input v-model="model.name" placeholder="Name" />
    <input v-model="model.email" type="email" placeholder="Email" />
  </fieldset>
</template>
```

---

## Validation Utilities

```ts
// src/utils/validators.ts

export const required = (label: string) => (v: unknown): string | null =>
  (typeof v === 'string' ? v.trim() : v) ? null : `${label} is required`

export const minLength = (label: string, min: number) => (v: unknown): string | null =>
  typeof v === 'string' && v.length >= min ? null : `${label} must be at least ${min} characters`

export const maxLength = (label: string, max: number) => (v: unknown): string | null =>
  typeof v === 'string' && v.length <= max ? null : `${label} must be at most ${max} characters`

export const email = (v: unknown): string | null =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Invalid email'

export const pattern = (label: string, regex: RegExp) => (v: unknown): string | null =>
  typeof v === 'string' && regex.test(v) ? null : `${label} format is invalid`

// Compose multiple validators
export function compose(...validators: ((v: unknown) => string | null)[]): (v: unknown) => string | null {
  return (value) => {
    for (const validate of validators) {
      const error = validate(value)
      if (error) return error
    }
    return null
  }
}
```

Usage:

```ts
import { required, email, minLength, compose } from '@/utils/validators'

const validators = {
  name: compose(required('Name'), minLength('Name', 2)),
  email: compose(required('Email'), email),
}
```

---

## Integration with UI Frameworks

### Quasar

```vue
<q-input
  v-model="form.name"
  label="Name"
  :error="touched.name && !!errors.name"
  :error-message="errors.name ?? undefined"
  @blur="touch('name')"
/>
```

### Vuetify

```vue
<v-text-field
  v-model="form.name"
  label="Name"
  :error-messages="touched.name && errors.name ? [errors.name] : []"
  @blur="touch('name')"
/>
```

### Tailwind (manual)

```vue
<div>
  <input
    v-model="form.name"
    :class="[
      'border rounded px-3 py-2',
      touched.name && errors.name ? 'border-red-500' : 'border-gray-300',
    ]"
    @blur="touch('name')"
  />
  <p v-if="touched.name && errors.name" class="text-red-500 text-sm mt-1">
    {{ errors.name }}
  </p>
</div>
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| Validation in template `v-if` | Untestable, duplicated | Composable validators |
| Form state in the same ref as page data | Entangled concerns | Dedicated form composable |
| Submit handler in the form component | Tight coupling | Emit validated data, submit in container |
| Inline validation rules per input | No reuse, inconsistent | Shared validator utilities |
| No `touched` tracking | Errors shown before user interacts | Track `touched` per field |
