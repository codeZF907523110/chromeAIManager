---
name: vue-architecture
description: "Enterprise-grade Vue 3 frontend architecture skill. Covers project structure, scalable patterns, component architecture, state management strategy, API layer design, routing, layouts, permissions, modals, forms, performance, DX tooling, naming conventions, and team standards. Use when bootstrapping a new Vue 3 project, designing application architecture, organizing large codebases, or enforcing engineering standards across teams."
license: MIT
metadata:
  version: "1.0.0"
  stack:
    - Vue 3
    - Composition API
    - Vite
    - Pinia
    - Vue Router
    - Axios
    - TypeScript
  compatible-with:
    - Quasar
    - Vuetify
    - Tailwind CSS
    - VueUse
    - Day.js
    - Husky
    - ESLint
    - Prettier
---

# Vue 3 Enterprise Architecture

> Scalable, maintainable frontend architecture for Vue 3 + Composition API + `<script setup lang="ts">`.
> Designed for medium-to-large applications and professional teams.

## Core Principles

- **Single source of truth** — derive state with `computed`, never duplicate.
- **Separation of concerns** — UI, business logic, data access, and state are distinct layers.
- **Feature-oriented structure** — group by domain, not by file type, as the app grows.
- **Props down, events up** — explicit, typed data flow.
- **Low coupling, high cohesion** — modules expose minimal APIs, encapsulate internals.
- **Composability over inheritance** — compose small, focused composables.
- **TypeScript-first** — type all props, emits, API responses, and store state.
- **Predictable state** — Pinia for shared state, composables for local state.
- **Testability** — logic in composables/stores is testable without mounting components.

---

## 1) Project Structure

### 1.1 Standard Structure (small–medium projects)

```
src/
├── api/                    # Axios instances + typed API modules
│   ├── instance.ts         # axios.create() setup
│   ├── interceptors.ts     # Auth, error, retry interceptors
│   ├── users.ts            # usersApi — typed CRUD
│   └── orders.ts
├── assets/                 # Static assets (images, fonts, global CSS)
│   ├── styles/
│   │   ├── variables.scss
│   │   └── global.scss
│   └── images/
├── components/             # Shared/reusable UI components
│   ├── ui/                 # Atomic UI primitives (AppButton, AppInput, AppModal)
│   ├── layout/             # Layout shells (AppHeader, AppSidebar, AppFooter)
│   └── common/             # Domain-agnostic composed components (DataTable, Pagination)
├── composables/            # Shared composables
│   ├── useAuth.ts
│   ├── useNotification.ts
│   └── useBreakpoint.ts
├── constants/              # App-wide constants and enums
│   ├── roles.ts
│   └── routes.ts
├── directives/             # Custom Vue directives
│   └── vClickOutside.ts
├── layouts/                # Page layout wrappers
│   ├── DefaultLayout.vue
│   ├── AuthLayout.vue
│   └── BlankLayout.vue
├── middleware/             # Router guards and middleware
│   ├── authGuard.ts
│   └── permissionGuard.ts
├── pages/                  # Route-level page components (views)
│   ├── HomePage.vue
│   ├── LoginPage.vue
│   └── users/
│       ├── UsersListPage.vue
│       └── UserDetailPage.vue
├── plugins/                # Vue plugin registrations
│   ├── pinia.ts
│   └── router.ts
├── router/                 # Router config
│   ├── index.ts
│   └── routes.ts
├── stores/                 # Pinia stores
│   ├── auth.ts
│   ├── users.ts
│   └── ui.ts
├── types/                  # Shared TypeScript types/interfaces
│   ├── user.ts
│   ├── api.ts
│   └── router.d.ts
├── utils/                  # Pure utility functions (no Vue dependency)
│   ├── formatDate.ts
│   ├── debounce.ts
│   └── validators.ts
├── App.vue
├── main.ts
└── env.d.ts
```

### 1.2 Enterprise/Feature-Module Structure (large projects)

See [`references/folder-structure.md`](references/folder-structure.md) for the complete enterprise layout with feature modules, shared libraries, and module boundaries.

---

## 2) Component Architecture

### 2.1 Component Categories

| Category | Purpose | Examples |
|----------|---------|---------|
| **Page** | Route-level entry, orchestrates features | `UsersListPage.vue` |
| **Container** (Smart) | Fetches data, holds state, delegates to presentational | `UserListContainer.vue` |
| **Presentational** (Dumb) | Pure UI, receives props, emits events | `UserCard.vue`, `UserTable.vue` |
| **UI Primitive** | Atomic reusable controls | `AppButton.vue`, `AppInput.vue` |
| **Layout** | Page shell (header, sidebar, content slot) | `DefaultLayout.vue` |

### 2.2 Splitting Rules

- **One responsibility per component** — if you describe it with "and", split it.
- **Max ~200 lines of `<script setup>`** — extract logic into composables.
- **Max ~150 lines of `<template>`** — break into child components.
- **Never put API calls in presentational components.**
- **Never put business logic in UI primitives.**

### 2.3 Component Communication

```
Props (down) → Events (up) → defineModel (v-model) → provide/inject (deep tree)
```

See [`references/component-patterns.md`](references/component-patterns.md) for table/form decomposition, modal extraction, slot architecture, and anti-patterns.

---

## 3) Composables Architecture

### 3.1 When to Extract a Composable

- Logic is reused across 2+ components.
- Component script exceeds ~100 lines of business logic.
- Logic involves reactive state + watchers + lifecycle hooks.
- You need to test business logic without mounting a component.

### 3.2 Composable Conventions

```ts
// src/composables/useUserSearch.ts
import { shallowRef, readonly, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { usersApi, type User } from '@/api/users'

export function useUserSearch(query: MaybeRefOrGetter<string>) {
  const results = shallowRef<User[]>([])
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)

  async function search() {
    const q = toValue(query)
    if (!q) { results.value = []; return }
    loading.value = true
    error.value = null
    try {
      const { data } = await usersApi.search(q)
      results.value = data
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  watch(() => toValue(query), search, { immediate: true })

  return { results: readonly(results), loading: readonly(loading), error: readonly(error), search }
}
```

### 3.3 Composable Rules

- **Always prefix with `use`** — `useAuth`, `useUsers`, `usePagination`.
- **Accept `MaybeRefOrGetter`** for inputs — maximum flexibility.
- **Return `readonly()` refs** — prevent external mutation.
- **Return plain functions for actions** — no wrapping needed.
- **Clean up side effects** — use `onScopeDispose` or `onUnmounted`.
- **Never call stores at module scope** — always inside the function body.

---

## 4) State Management (Pinia)

### 4.1 Store Organization

```
src/stores/
├── auth.ts          # Authentication, session, tokens
├── users.ts         # Users domain state
├── ui.ts            # Global UI state (sidebar, theme, toasts)
└── orders.ts        # Orders domain state
```

### 4.2 Store Rules

- **One store per domain** — don't create a "global" store.
- **Prefer Setup Stores** — they support composables, watchers, computed.
- **Use `storeToRefs()`** for reactive destructuring.
- **Keep stores thin** — stores call API modules, they don't contain HTTP logic.
- **Avoid over-centralization** — local component state stays local.

### 4.3 Setup Store Template

```ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { usersApi, type User } from '@/api/users'

export const useUsersStore = defineStore('users', () => {
  const list = ref<User[]>([])
  const loading = ref(false)

  const activeCount = computed(() => list.value.filter(u => u.active).length)

  async function fetchAll() {
    loading.value = true
    try {
      const { data } = await usersApi.getAll()
      list.value = data
    } finally {
      loading.value = false
    }
  }

  function $reset() {
    list.value = []
    loading.value = false
  }

  return { list, loading, activeCount, fetchAll, $reset }
})
```

See [`references/state-management.md`](references/state-management.md) for auth store patterns, caching, persistence, websocket state, and store composition.

---

## 5) API Layer Architecture

### 5.1 Layer Diagram

```
Component → Composable/Store → API Module → Axios Instance → Server
                                   ↑
                              Interceptors (auth, errors, retry)
```

### 5.2 Rules

- **Never import axios in components** — always go through API modules.
- **One `axios.create()` per API base URL.**
- **Typed responses** — every API function returns `Promise<AxiosResponse<T>>`.
- **DTO mapping** — transform API shapes into internal types in the API module.
- **Centralized error normalization** — in interceptors, not per-call.

See [`references/api-layer.md`](references/api-layer.md) for full interceptor setup, retry logic, token refresh, request cancellation, and repository pattern.

---

## 6) Router & Navigation Architecture

### 6.1 Route Structure

```ts
// src/router/routes.ts
import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      { path: '', name: 'Home', component: () => import('@/pages/HomePage.vue') },
      {
        path: 'users',
        children: [
          { path: '', name: 'UsersList', component: () => import('@/pages/users/UsersListPage.vue') },
          { path: ':id', name: 'UserDetail', component: () => import('@/pages/users/UserDetailPage.vue') },
        ],
      },
    ],
  },
  {
    path: '/login',
    component: () => import('@/layouts/AuthLayout.vue'),
    children: [
      { path: '', name: 'Login', component: () => import('@/pages/LoginPage.vue') },
    ],
  },
]
```

### 6.2 Route Rules

- **Always lazy-load route components** — `() => import(...)`.
- **Use named routes** for navigation — `router.push({ name: 'UserDetail', params: { id } })`.
- **Group routes by layout** — layouts as parent routes with `<RouterView>` slot.
- **Type route meta** — declare `RouteMeta` interface globally.
- **Guards in middleware files** — not inline in route config.

See [`references/routing-and-layouts.md`](references/routing-and-layouts.md) for layout architecture, permission guards, route meta typing, and navigation patterns.

---

## 7) Forms & Validation

### 7.1 Form Architecture

- **Isolate form state** in a composable or dedicated component.
- **Use `v-model` / `defineModel()`** for two-way binding.
- **Validation logic in composables** — not in templates.
- **Submit handler in the container** — form component emits validated data.

### 7.2 Form Composable Pattern

```ts
export function useUserForm(initial?: Partial<User>) {
  const form = reactive({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
  })

  const errors = reactive({ name: '', email: '' })

  function validate(): boolean {
    errors.name = form.name.trim() ? '' : 'Name is required'
    errors.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? '' : 'Invalid email'
    return !errors.name && !errors.email
  }

  function reset() {
    Object.assign(form, { name: '', email: '' })
    Object.assign(errors, { name: '', email: '' })
  }

  return { form, errors, validate, reset }
}
```

See [`references/forms-and-validation.md`](references/forms-and-validation.md) for advanced validation, field-level composables, and integration with UI frameworks.

---

## 8) Modal / Dialog Architecture

- **Register modals at layout or app level** — not inside triggering components.
- **Control via composable or store** — `useModal()` or `useDialogStore()`.
- **Pass data via props/provide** — not via global state hacks.
- **Use `<Teleport to="body">`** for proper z-index stacking.

```ts
// src/composables/useModal.ts
import { shallowRef, markRaw, type Component } from 'vue'

const current = shallowRef<{ component: Component; props: Record<string, unknown> } | null>(null)

export function useModal() {
  function open(component: Component, props: Record<string, unknown> = {}) {
    current.value = { component: markRaw(component), props }
  }
  function close() { current.value = null }
  return { current, open, close }
}
```

---

## 9) Permission / Access Architecture

See [`references/permissions.md`](references/permissions.md) for:
- Role-based access control (RBAC) patterns
- Route-level guards with `meta.requiredRoles`
- Component-level `v-if` permission checks
- `usePermission()` composable
- Directive-based access control (`v-can`)

---

## 10) Performance

### Critical Optimizations

| Technique | When | How |
|-----------|------|-----|
| Route-level code splitting | Always | `() => import(...)` on all routes |
| Lazy components | Heavy components loaded conditionally | `defineAsyncComponent` |
| Virtual lists | Lists > 100 items | `useVirtualList` (VueUse) or `vue-virtual-scroller` |
| `shallowRef` | Large objects, class instances | Avoids deep reactive proxy |
| `v-once` / `v-memo` | Static or rarely-changing subtrees | Skips re-render |
| Computed over watchers | Derived state | Cached, auto-tracked |
| `<KeepAlive>` | Tab/wizard navigation | Caches component state |
| Bundle analysis | Before release | `rollup-plugin-visualizer` |

See [`references/performance.md`](references/performance.md) for bundle optimization, watcher pitfalls, and caching strategies.

---

## 11) Developer Experience (DX)

### 11.1 Tooling Setup

| Tool | Purpose | Config file |
|------|---------|-------------|
| ESLint | Code quality + Vue rules | `eslint.config.js` |
| Prettier | Formatting | `.prettierrc` |
| Husky | Git hooks | `.husky/` |
| lint-staged | Pre-commit lint | `.lintstagedrc` |
| TypeScript | Type checking | `tsconfig.json` |
| Vite | Build + dev server | `vite.config.ts` |

### 11.2 Path Aliases

```ts
// vite.config.ts
resolve: {
  alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
}
```

```json
// tsconfig.json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

### 11.3 Environment Config

```
.env                # Shared defaults
.env.local          # Local overrides (gitignored)
.env.development    # Dev-specific
.env.production     # Prod-specific
```

All env vars exposed to client must be prefixed with `VITE_`.

See [`references/dx-and-tooling.md`](references/dx-and-tooling.md) for ESLint config, Prettier config, Husky setup, commit conventions, and CI/CD integration.

---

## 12) Naming Conventions & Team Standards

### 12.1 File Naming

| Type | Convention | Example |
|------|-----------|---------|
| Component | `PascalCase.vue` | `UserCard.vue` |
| Composable | `camelCase.ts`, prefixed `use` | `useAuth.ts` |
| Store | `camelCase.ts` | `auth.ts` (exports `useAuthStore`) |
| API module | `camelCase.ts` | `users.ts` (exports `usersApi`) |
| Utility | `camelCase.ts` | `formatDate.ts` |
| Type file | `camelCase.ts` | `user.ts` |
| Constant file | `camelCase.ts` | `roles.ts` |
| Page component | `PascalCase.vue`, suffixed `Page` | `UsersListPage.vue` |
| Layout component | `PascalCase.vue`, suffixed `Layout` | `DefaultLayout.vue` |

### 12.2 Code Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Component name | PascalCase | `UserCard` |
| Composable function | camelCase, `use` prefix | `useAuth()` |
| Store definition | camelCase, `use...Store` | `useAuthStore` |
| Store ID | kebab-case | `'auth'`, `'user-profile'` |
| Props | camelCase | `userName`, `isActive` |
| Events | camelCase | `update:modelValue`, `itemClick` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `API_TIMEOUT` |
| Types/Interfaces | PascalCase | `User`, `CreateUserDto` |
| Enums | PascalCase, members UPPER_SNAKE | `UserRole.ADMIN` |

### 12.3 Branch & Commit Conventions

- **Branches:** `feature/TASK-123-user-profile`, `fix/TASK-456-login-redirect`, `chore/update-deps`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`

See [`references/team-standards.md`](references/team-standards.md) for PR standards, code review checklist, documentation recommendations, and onboarding guide.

---

## 13) Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Do Instead |
|-------------|-------------|-----------|
| Options API in new code | Inconsistent, no composable support | Composition API + `<script setup>` |
| God component (500+ lines) | Untestable, unmaintainable | Split into container + children |
| API calls in components | Tight coupling, no reuse | API module → composable/store |
| Destructuring `reactive()` | Breaks reactivity | Use `toRefs()` or `storeToRefs()` |
| Global mutable state | Unpredictable, race conditions | Pinia stores |
| Inline route guards | Hard to test, cluttered config | Middleware files |
| `any` types | No safety | Typed interfaces and generics |
| Watch for derived state | Unnecessary, error-prone | `computed()` |
| Barrel exports everywhere | Tree-shaking issues, circular deps | Direct imports |
| Business logic in templates | Untestable | Composables/computed |

---

## References

- [`references/folder-structure.md`](references/folder-structure.md) — Enterprise feature-module structure
- [`references/component-patterns.md`](references/component-patterns.md) — Component splitting, communication, slots, modals, tables
- [`references/state-management.md`](references/state-management.md) — Auth store, caching, persistence, websockets, composition
- [`references/api-layer.md`](references/api-layer.md) — Interceptors, retry, token refresh, cancellation, repository pattern
- [`references/routing-and-layouts.md`](references/routing-and-layouts.md) — Layout architecture, guards, meta typing, navigation
- [`references/forms-and-validation.md`](references/forms-and-validation.md) — Form composables, validation, field patterns
- [`references/permissions.md`](references/permissions.md) — RBAC, guards, directives, composables
- [`references/performance.md`](references/performance.md) — Bundle, rendering, caching, virtual lists
- [`references/dx-and-tooling.md`](references/dx-and-tooling.md) — ESLint, Prettier, Husky, CI/CD, env config
- [`references/team-standards.md`](references/team-standards.md) — PR process, code review, documentation, onboarding
