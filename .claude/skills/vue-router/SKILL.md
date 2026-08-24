---
name: vue-router
description: Vue Router 4 best practices, navigation guards, route params, route lifecycle, and common gotchas. Load when working with routing, navigation, route-component lifecycle, or guard logic.
license: MIT
metadata:
  sources:
    - https://github.com/vuejs-ai/skills (vue-router-best-practices v1.0.0)
  version: "1.0.0"
---

# Vue Router 4 — Best Practices

> Covers Vue Router 4 patterns, common gotchas, and navigation guards.

## Setup

For production SPAs, always use Vue Router — do not implement custom routing.

```ts
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/views/HomeView.vue')
    },
    {
      path: '/users/:id',
      component: () => import('@/views/UserView.vue')
    }
  ]
})
```

## Navigation Guards

### Deprecated `next()` — Never Use It

**BAD:**
```ts
router.beforeEach((to, from, next) => {
  if (!isAuthenticated) next('/login')
  else next()
})
```

**GOOD:**
```ts
router.beforeEach((to) => {
  if (!isAuthenticated) return '/login'
})
```

### Always `await` Async Guards

```ts
router.beforeEach(async (to) => {
  const user = await fetchCurrentUser()
  if (!user && to.meta.requiresAuth) return '/login'
})
```

### Prevent Infinite Redirect Loops

Always add an escape condition:

```ts
router.beforeEach((to) => {
  if (!isAuthenticated && to.path !== '/login') return '/login'
})
```

### `beforeRouteEnter` — use route-level guard in `<script setup>`

`<script setup>` has no `beforeRouteEnter` composable. Define the guard on the route instead:

```ts
{
  path: '/posts/:id',
  component: () => import('@/views/PostView.vue'),
  beforeEnter: async (to) => {
    const post = await fetchPost(to.params.id as string)
    if (!post) return '/not-found'
  },
}
```

Inside the component, load data with `onBeforeRouteUpdate` or watch `route.params` (see below).

### Same Route, Different Params — Use `beforeRouteUpdate`

`beforeEach` does NOT re-trigger for same-route param changes:

```ts
import { onBeforeRouteUpdate } from 'vue-router'

onBeforeRouteUpdate(async (to) => {
  userData.value = await fetchUser(to.params.id)
})
```

---

## Route Lifecycle

### Stale Data on Same-Route Navigation

Param changes do NOT trigger `onMounted` again. Watch route params:

```ts
import { useRoute } from 'vue-router'
import { watch } from 'vue'

const route = useRoute()

watch(
  () => route.params.id,
  async (id) => { data.value = await fetchData(id as string) },
  { immediate: true }
)
```

### Cleanup on Unmount

Event listeners and timers must be cleaned up in `onBeforeRouteLeave` or `onUnmounted`:

```ts
import { onBeforeRouteLeave } from 'vue-router'

onBeforeRouteLeave(() => {
  clearInterval(timer)
})
```

---

## Composable Usage

```ts
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const id = computed(() => route.params.id as string)

function goHome() { router.push('/') }
function goBack() { router.back() }
```

## Route Meta Typing

```ts
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    title?: string
  }
}

const routes = [
  { path: '/admin', component: AdminView, meta: { requiresAuth: true } }
]
```

## Lazy Loading (Always for Route Components)

```ts
const routes = [
  { path: '/heavy', component: () => import('@/views/HeavyView.vue') }
]
```

## Named Routes (Prefer Over String Paths)

```ts
router.push({ name: 'UserProfile', params: { id: '123' } })
```

## Scroll Behavior

```ts
const router = createRouter({
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})
```
