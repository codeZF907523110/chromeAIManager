# Permission & Access Architecture

> RBAC (Role-Based Access Control) patterns for Vue 3 applications.

## Permission Layers

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Route** | Navigation guard + `meta.requiredRoles` | Page-level access control |
| **Component** | `v-if="can('action')"` | Section/element visibility |
| **Directive** | `v-can="'admin'"` | Declarative element-level access |
| **API** | Server-side validation | Ultimate source of truth |

---

## Permission Composable

```ts
// src/composables/usePermission.ts
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

export type Permission = string

export function usePermission() {
  const auth = useAuthStore()

  const roles = computed(() => auth.user?.roles ?? [])

  function hasRole(role: string): boolean {
    return roles.value.includes(role)
  }

  function hasAnyRole(requiredRoles: string[]): boolean {
    return requiredRoles.some(role => roles.value.includes(role))
  }

  function hasAllRoles(requiredRoles: string[]): boolean {
    return requiredRoles.every(role => roles.value.includes(role))
  }

  // Permission-based (if using granular permissions alongside roles)
  function can(permission: Permission): boolean {
    return auth.user?.permissions?.includes(permission) ?? false
  }

  function canAny(permissions: Permission[]): boolean {
    return permissions.some(p => can(p))
  }

  return { roles, hasRole, hasAnyRole, hasAllRoles, can, canAny }
}
```

---

## Route-Level Protection

### Route Meta

```ts
// Route config
{
  path: 'admin/users',
  name: 'AdminUsers',
  component: () => import('@/pages/admin/AdminUsersPage.vue'),
  meta: {
    requiresAuth: true,
    requiredRoles: ['admin'],
  },
}

// Nested routes inherit parent meta
{
  path: '/admin',
  component: () => import('@/layouts/AdminLayout.vue'),
  meta: { requiresAuth: true, requiredRoles: ['admin'] },
  children: [
    // All children require admin role
    { path: 'dashboard', name: 'AdminDashboard', component: () => import('@/pages/admin/DashboardPage.vue') },
    { path: 'settings', name: 'AdminSettings', component: () => import('@/pages/admin/SettingsPage.vue') },
  ],
}
```

### Permission Guard

```ts
// src/middleware/permissionGuard.ts
import type { NavigationGuardWithThis } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const permissionGuard: NavigationGuardWithThis<undefined> = (to) => {
  // Check all matched routes (parent + child)
  const requiredRoles = to.matched
    .flatMap(record => record.meta.requiredRoles ?? [])
    .filter(Boolean)

  if (!requiredRoles.length) return

  const auth = useAuthStore()
  if (!auth.hasAnyRole(requiredRoles)) {
    return { name: 'Forbidden' }
  }
}
```

---

## Component-Level Protection

```vue
<script setup lang="ts">
import { usePermission } from '@/composables/usePermission'

const { hasRole, can } = usePermission()
</script>

<template>
  <div>
    <!-- Role-based -->
    <button v-if="hasRole('admin')" @click="deleteUser">Delete User</button>

    <!-- Permission-based -->
    <section v-if="can('users.export')">
      <button @click="exportUsers">Export CSV</button>
    </section>

    <!-- Show disabled state for unauthorized -->
    <button :disabled="!can('orders.approve')" @click="approveOrder">
      Approve Order
    </button>
  </div>
</template>
```

---

## Custom Directive

```ts
// src/directives/vCan.ts
import type { Directive } from 'vue'
import { useAuthStore } from '@/stores/auth'

export const vCan: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const auth = useAuthStore()
    const required = Array.isArray(binding.value) ? binding.value : [binding.value]

    const hasAccess = binding.modifiers.all
      ? required.every(r => auth.user?.roles?.includes(r) || auth.user?.permissions?.includes(r))
      : required.some(r => auth.user?.roles?.includes(r) || auth.user?.permissions?.includes(r))

    if (!hasAccess) {
      if (binding.modifiers.disable) {
        el.setAttribute('disabled', 'true')
        el.style.opacity = '0.5'
        el.style.pointerEvents = 'none'
      } else {
        el.style.display = 'none'
      }
    }
  },
}

// Register globally
// app.directive('can', vCan)
```

Usage:

```vue
<!-- Hide if no access -->
<button v-can="'admin'">Admin Panel</button>

<!-- Disable if no access -->
<button v-can.disable="'orders.approve'">Approve</button>

<!-- Require ALL roles -->
<button v-can.all="['admin', 'manager']">Super Action</button>
```

---

## Navigation Menu Filtering

```ts
// src/composables/useNavigation.ts
import { computed } from 'vue'
import { usePermission } from '@/composables/usePermission'

interface NavItem {
  label: string
  to: { name: string }
  icon?: string
  requiredRoles?: string[]
  children?: NavItem[]
}

const allNavItems: NavItem[] = [
  { label: 'Dashboard', to: { name: 'Dashboard' }, icon: 'dashboard' },
  { label: 'Users', to: { name: 'Users' }, icon: 'people', requiredRoles: ['admin', 'manager'] },
  { label: 'Orders', to: { name: 'Orders' }, icon: 'receipt' },
  {
    label: 'Admin',
    to: { name: 'Admin' },
    icon: 'settings',
    requiredRoles: ['admin'],
    children: [
      { label: 'Settings', to: { name: 'AdminSettings' } },
      { label: 'Logs', to: { name: 'AdminLogs' } },
    ],
  },
]

export function useNavigation() {
  const { hasAnyRole } = usePermission()

  const navItems = computed(() =>
    allNavItems.filter(item =>
      !item.requiredRoles?.length || hasAnyRole(item.requiredRoles)
    )
  )

  return { navItems }
}
```

---

## Permission Types Pattern

```ts
// src/constants/permissions.ts

export const Permissions = {
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_EXPORT: 'users.export',
  ORDERS_VIEW: 'orders.view',
  ORDERS_APPROVE: 'orders.approve',
  ORDERS_CANCEL: 'orders.cancel',
  ADMIN_SETTINGS: 'admin.settings',
} as const

export type Permission = (typeof Permissions)[keyof typeof Permissions]
```

```ts
// src/types/auth.ts
import type { Permission } from '@/constants/permissions'

export interface User {
  id: number
  name: string
  email: string
  roles: string[]
  permissions: Permission[]
}
```

---

## Key Rules

1. **Server is the authority** — client-side checks are UX, not security. Always validate on the server.
2. **Hide, don't just disable** — users shouldn't see features they can't use (unless it drives upgrades).
3. **Check at multiple layers** — route guard + component `v-if` + API validation.
4. **Keep permission data in auth store** — fetched once on login/app init, available everywhere.
5. **Use constants for permission strings** — avoid typos and enable IDE autocomplete.
