# Routing & Layout Architecture

> Vue Router 4 patterns for scalable navigation, layouts, and access control.

## Layout Architecture

### Layout as Parent Route

```ts
// src/router/routes.ts
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      { path: '', name: 'Home', component: () => import('@/pages/HomePage.vue') },
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/pages/DashboardPage.vue') },
      { path: 'users', name: 'Users', component: () => import('@/pages/users/UsersListPage.vue') },
    ],
  },
  {
    path: '/auth',
    component: () => import('@/layouts/AuthLayout.vue'),
    children: [
      { path: 'login', name: 'Login', component: () => import('@/pages/LoginPage.vue') },
      { path: 'register', name: 'Register', component: () => import('@/pages/RegisterPage.vue') },
    ],
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiredRoles: ['admin'] },
    children: [
      { path: '', name: 'AdminDashboard', component: () => import('@/pages/admin/AdminDashboardPage.vue') },
      { path: 'settings', name: 'AdminSettings', component: () => import('@/pages/admin/AdminSettingsPage.vue') },
    ],
  },
]
```

### Layout Component Template

```vue
<!-- src/layouts/DefaultLayout.vue -->
<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
</script>

<template>
  <div class="layout">
    <AppHeader />
    <div class="layout-body">
      <AppSidebar />
      <main class="layout-content">
        <RouterView />
      </main>
    </div>
    <AppFooter />
  </div>
</template>
```

### Layout Rules

- **One `<RouterView>` per layout** — layouts are composition shells.
- **Layouts contain no business logic** — only structure and navigation UI.
- **Use nested routes for layout switching** — not conditional `v-if` in App.vue.
- **Keep layouts stateless** — they shouldn't fetch data or manage state.

---

## Route Meta Typing

```ts
// src/types/router.d.ts
import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    requiredRoles?: string[]
    breadcrumb?: string | ((route: RouteLocationNormalized) => string)
  }
}
```

Usage in route config:

```ts
{
  path: 'users',
  name: 'Users',
  component: () => import('@/pages/users/UsersListPage.vue'),
  meta: {
    title: 'User Management',
    requiresAuth: true,
    requiredRoles: ['admin', 'manager'],
    breadcrumb: 'Users',
  },
}
```

---

## Navigation Guards

### Auth Guard

```ts
// src/middleware/authGuard.ts
import type { NavigationGuardWithThis } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const authGuard: NavigationGuardWithThis<undefined> = (to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
}
```

### Permission Guard

```ts
// src/middleware/permissionGuard.ts
import type { NavigationGuardWithThis } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const permissionGuard: NavigationGuardWithThis<undefined> = (to) => {
  const requiredRoles = to.meta.requiredRoles
  if (!requiredRoles?.length) return

  const auth = useAuthStore()
  if (!auth.hasAnyRole(requiredRoles)) {
    return { name: 'Forbidden' }
  }
}
```

### Title Guard

```ts
// src/middleware/titleGuard.ts
import type { NavigationGuardWithThis } from 'vue-router'

const APP_TITLE = import.meta.env.VITE_APP_TITLE ?? 'My App'

export const titleGuard: NavigationGuardWithThis<undefined> = (to) => {
  const pageTitle = to.meta.title
  document.title = pageTitle ? `${pageTitle} — ${APP_TITLE}` : APP_TITLE
}
```

### Registering Guards

```ts
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { authGuard } from '@/middleware/authGuard'
import { permissionGuard } from '@/middleware/permissionGuard'
import { titleGuard } from '@/middleware/titleGuard'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash }
    return { top: 0 }
  },
})

router.beforeEach(authGuard)
router.beforeEach(permissionGuard)
router.afterEach(titleGuard)

export default router
```

---

## Navigation Patterns

### Programmatic Navigation

```ts
import { useRouter } from 'vue-router'

const router = useRouter()

// Named route (preferred)
router.push({ name: 'UserDetail', params: { id: '123' } })

// With query params
router.push({ name: 'Users', query: { search: 'admin', page: '2' } })

// Replace (no history entry)
router.replace({ name: 'Home' })

// Go back
router.back()
```

### Post-Login Redirect

```ts
// In login handler
const route = useRoute()
const router = useRouter()

async function handleLogin() {
  await authStore.login(credentials)
  const redirect = route.query.redirect as string
  router.push(redirect ?? { name: 'Home' })
}
```

### Route-Based Data Fetching

```ts
// Watch route params for data re-fetching
const route = useRoute()

watch(
  () => route.params.id,
  async (id) => {
    if (id) await fetchUser(id as string)
  },
  { immediate: true },
)
```

---

## Route Organization Patterns

### Lazy Loading (Always)

```ts
// GOOD — lazy loaded
component: () => import('@/pages/UsersListPage.vue')

// BAD — eagerly loaded (bundles into main chunk)
import UsersListPage from '@/pages/UsersListPage.vue'
component: UsersListPage
```

### Route Grouping with Named Chunks

```ts
// Group related routes into named chunks
component: () => import(/* webpackChunkName: "admin" */ '@/pages/admin/AdminDashboardPage.vue')
```

### Catch-All Route (404)

```ts
{
  path: '/:pathMatch(.*)*',
  name: 'NotFound',
  component: () => import('@/pages/NotFoundPage.vue'),
}
```

---

## Breadcrumbs from Route Meta

```ts
// src/composables/useBreadcrumbs.ts
import { computed } from 'vue'
import { useRoute, type RouteLocationMatched } from 'vue-router'

export function useBreadcrumbs() {
  const route = useRoute()

  const breadcrumbs = computed(() =>
    route.matched
      .filter(r => r.meta.breadcrumb)
      .map(r => ({
        label: typeof r.meta.breadcrumb === 'function'
          ? r.meta.breadcrumb(route)
          : r.meta.breadcrumb!,
        path: r.path,
      }))
  )

  return { breadcrumbs }
}
```
