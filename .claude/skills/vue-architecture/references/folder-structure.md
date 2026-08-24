# Enterprise Feature-Module Folder Structure

> For large-scale Vue 3 applications with multiple domains and teams.

## Feature-Module Layout

```
src/
├── app/                        # App bootstrap
│   ├── App.vue
│   ├── main.ts
│   ├── env.d.ts
│   └── plugins/                # Global plugin registrations
│       ├── index.ts            # Registers all plugins
│       ├── pinia.ts
│       ├── router.ts
│       └── i18n.ts
│
├── features/                   # Feature modules (domain-driven)
│   ├── auth/
│   │   ├── api/
│   │   │   └── auth.ts         # authApi — login, logout, refresh
│   │   ├── components/
│   │   │   ├── LoginForm.vue
│   │   │   └── RegisterForm.vue
│   │   ├── composables/
│   │   │   └── useAuth.ts
│   │   ├── pages/
│   │   │   ├── LoginPage.vue
│   │   │   └── RegisterPage.vue
│   │   ├── stores/
│   │   │   └── auth.ts
│   │   ├── types/
│   │   │   └── auth.ts
│   │   └── routes.ts           # Feature route definitions
│   │
│   ├── users/
│   │   ├── api/
│   │   │   └── users.ts
│   │   ├── components/
│   │   │   ├── UserCard.vue
│   │   │   ├── UserTable.vue
│   │   │   ├── UserFilters.vue
│   │   │   └── UserForm.vue
│   │   ├── composables/
│   │   │   ├── useUsers.ts
│   │   │   ├── useUserForm.ts
│   │   │   └── useUserFilters.ts
│   │   ├── pages/
│   │   │   ├── UsersListPage.vue
│   │   │   └── UserDetailPage.vue
│   │   ├── stores/
│   │   │   └── users.ts
│   │   ├── types/
│   │   │   └── user.ts
│   │   └── routes.ts
│   │
│   ├── orders/
│   │   ├── api/
│   │   ├── components/
│   │   ├── composables/
│   │   ├── pages/
│   │   ├── stores/
│   │   ├── types/
│   │   └── routes.ts
│   │
│   └── dashboard/
│       ├── components/
│       ├── composables/
│       ├── pages/
│       └── routes.ts
│
├── shared/                     # Shared across all features
│   ├── api/
│   │   ├── instance.ts         # axios.create() instances
│   │   └── interceptors.ts     # Global interceptors
│   ├── components/
│   │   ├── ui/                 # Atomic UI primitives
│   │   │   ├── AppButton.vue
│   │   │   ├── AppInput.vue
│   │   │   ├── AppSelect.vue
│   │   │   ├── AppModal.vue
│   │   │   ├── AppSpinner.vue
│   │   │   ├── AppBadge.vue
│   │   │   ├── AppTooltip.vue
│   │   │   └── index.ts        # Re-export for convenience
│   │   ├── layout/
│   │   │   ├── AppHeader.vue
│   │   │   ├── AppSidebar.vue
│   │   │   ├── AppFooter.vue
│   │   │   └── AppBreadcrumbs.vue
│   │   └── common/
│   │       ├── DataTable.vue
│   │       ├── Pagination.vue
│   │       ├── ConfirmDialog.vue
│   │       ├── EmptyState.vue
│   │       └── ErrorBoundary.vue
│   ├── composables/
│   │   ├── useBreakpoint.ts
│   │   ├── useDebounce.ts
│   │   ├── useNotification.ts
│   │   ├── usePagination.ts
│   │   ├── useModal.ts
│   │   └── useClipboard.ts
│   ├── constants/
│   │   ├── roles.ts
│   │   ├── httpStatus.ts
│   │   └── dateFormats.ts
│   ├── directives/
│   │   ├── vClickOutside.ts
│   │   ├── vPermission.ts
│   │   └── index.ts
│   ├── types/
│   │   ├── api.ts              # ApiResponse<T>, PaginatedResponse<T>
│   │   ├── common.ts           # SelectOption, Nullable<T>
│   │   └── router.d.ts         # RouteMeta augmentation
│   └── utils/
│       ├── formatDate.ts
│       ├── formatCurrency.ts
│       ├── validators.ts
│       └── storage.ts
│
├── layouts/                    # Page-level layout wrappers
│   ├── DefaultLayout.vue
│   ├── AuthLayout.vue
│   ├── AdminLayout.vue
│   └── BlankLayout.vue
│
├── middleware/                 # Router guards
│   ├── authGuard.ts
│   ├── permissionGuard.ts
│   └── titleGuard.ts
│
├── router/                     # Router assembly
│   ├── index.ts                # createRouter + guard registration
│   └── routes.ts               # Aggregates feature routes
│
├── stores/                     # Global stores (non-feature-specific)
│   └── ui.ts                   # Theme, sidebar, toasts
│
└── assets/
    ├── styles/
    │   ├── variables.scss
    │   ├── reset.scss
    │   ├── global.scss
    │   └── transitions.scss
    ├── fonts/
    └── images/
```

## Route Aggregation

```ts
// src/router/routes.ts
import type { RouteRecordRaw } from 'vue-router'
import { authRoutes } from '@/features/auth/routes'
import { userRoutes } from '@/features/users/routes'
import { orderRoutes } from '@/features/orders/routes'
import { dashboardRoutes } from '@/features/dashboard/routes'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      ...dashboardRoutes,
      ...userRoutes,
      ...orderRoutes,
    ],
  },
  {
    path: '/auth',
    component: () => import('@/layouts/AuthLayout.vue'),
    children: authRoutes,
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/shared/components/common/ErrorBoundary.vue'),
  },
]
```

## Feature Route Example

```ts
// src/features/users/routes.ts
import type { RouteRecordRaw } from 'vue-router'

export const userRoutes: RouteRecordRaw[] = [
  {
    path: 'users',
    children: [
      {
        path: '',
        name: 'UsersList',
        component: () => import('./pages/UsersListPage.vue'),
        meta: { title: 'Users', requiredRoles: ['admin', 'manager'] },
      },
      {
        path: ':id',
        name: 'UserDetail',
        component: () => import('./pages/UserDetailPage.vue'),
        meta: { title: 'User Details' },
      },
    ],
  },
]
```

## Module Boundaries

### Rules

1. **Features never import from other features directly.** Cross-feature communication goes through:
   - Pinia stores (shared state)
   - Router navigation (cross-feature links)
   - Event bus / composable (rare, explicit)

2. **Shared modules never import from features.** The dependency arrow is always: `feature → shared`.

3. **Each feature is self-contained.** It can be deleted without breaking other features (except router references).

4. **Feature-local types stay in the feature.** Only promote to `shared/types/` when multiple features need them.

### Dependency Diagram

```
features/auth ──────┐
features/users ─────┼──→ shared/ ──→ (no imports back to features)
features/orders ────┘
features/dashboard ─┘

layouts/ ──→ shared/components/layout/
middleware/ ──→ features/auth/stores/ (exception: auth guard needs auth store)
router/ ──→ features/*/routes.ts
```

## When to Use Feature Modules

| Project Size | Team Size | Structure |
|-------------|-----------|-----------|
| Small (< 10 pages) | 1–2 devs | Standard flat structure |
| Medium (10–30 pages) | 3–5 devs | Hybrid: flat + feature folders for complex domains |
| Large (30+ pages) | 5+ devs | Full feature-module structure |

**Transition strategy:** Start flat. When a domain grows beyond 5–8 files, extract it into a feature module. Never refactor everything at once.
