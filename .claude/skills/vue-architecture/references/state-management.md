# State Management Patterns

> Pinia-based patterns for enterprise Vue 3 applications.

## Store Categories

| Category | Purpose | Example |
|----------|---------|---------|
| **Domain** | Business entity state | `useUsersStore`, `useOrdersStore` |
| **Auth** | Session, tokens, user identity | `useAuthStore` |
| **UI** | Global UI state (theme, sidebar, toasts) | `useUiStore` |
| **Feature** | Feature-specific ephemeral state | `useUserFiltersStore` |

---

## Auth Store Pattern

```ts
// src/stores/auth.ts (or src/features/auth/stores/auth.ts)
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { useRouter } from 'vue-router'
import type { User, LoginCredentials } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('auth_token'))
  const refreshToken = ref<string | null>(localStorage.getItem('refresh_token'))
  const loading = ref(false)

  const isAuthenticated = computed(() => !!token.value)
  const roles = computed(() => user.value?.roles ?? [])

  function hasRole(role: string): boolean {
    return roles.value.includes(role)
  }

  function hasAnyRole(requiredRoles: string[]): boolean {
    return requiredRoles.some(role => roles.value.includes(role))
  }

  async function login(credentials: LoginCredentials) {
    loading.value = true
    try {
      const { data } = await authApi.login(credentials)
      token.value = data.accessToken
      refreshToken.value = data.refreshToken
      user.value = data.user
      localStorage.setItem('auth_token', data.accessToken)
      localStorage.setItem('refresh_token', data.refreshToken)
    } finally {
      loading.value = false
    }
  }

  async function refreshSession() {
    if (!refreshToken.value) throw new Error('No refresh token')
    const { data } = await authApi.refresh(refreshToken.value)
    token.value = data.accessToken
    refreshToken.value = data.refreshToken
    localStorage.setItem('auth_token', data.accessToken)
    localStorage.setItem('refresh_token', data.refreshToken)
  }

  async function fetchProfile() {
    if (!token.value) return
    const { data } = await authApi.getProfile()
    user.value = data
  }

  function logout() {
    user.value = null
    token.value = null
    refreshToken.value = null
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
  }

  function $reset() {
    logout()
  }

  return {
    user, token, loading,
    isAuthenticated, roles,
    hasRole, hasAnyRole,
    login, logout, refreshSession, fetchProfile,
    $reset,
  }
})
```

---

## Store Composition (Cross-Store Dependencies)

```ts
// src/stores/orders.ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { ordersApi, type Order } from '@/api/orders'

export const useOrdersStore = defineStore('orders', () => {
  const auth = useAuthStore()
  const list = ref<Order[]>([])

  const myOrders = computed(() =>
    list.value.filter(o => o.userId === auth.user?.id)
  )

  async function fetchAll() {
    if (!auth.isAuthenticated) return
    const { data } = await ordersApi.getAll()
    list.value = data
  }

  return { list, myOrders, fetchAll }
})
```

### Composition Rules

- Call `useOtherStore()` **inside** the setup function — never at module scope.
- For SSR: all `useStore()` calls must come **before** any `await`.
- Avoid circular dependencies — if store A needs B and B needs A, extract shared logic into a composable.

---

## Caching Patterns

### Time-based Cache

```ts
export const useUsersStore = defineStore('users', () => {
  const list = ref<User[]>([])
  const lastFetched = ref<number | null>(null)
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  const isCacheValid = computed(() =>
    lastFetched.value != null && Date.now() - lastFetched.value < CACHE_TTL
  )

  async function fetchAll(force = false) {
    if (!force && isCacheValid.value) return
    const { data } = await usersApi.getAll()
    list.value = data
    lastFetched.value = Date.now()
  }

  function invalidateCache() {
    lastFetched.value = null
  }

  return { list, fetchAll, invalidateCache }
})
```

### Entity Cache (Map-based)

```ts
const byId = ref<Map<number, User>>(new Map())

async function fetchById(id: number) {
  if (byId.value.has(id)) return byId.value.get(id)!
  const { data } = await usersApi.getById(id)
  byId.value.set(id, data)
  return data
}
```

---

## Persistence Strategies

### Manual localStorage

```ts
// Persist on change
watch(token, (val) => {
  if (val) localStorage.setItem('auth_token', val)
  else localStorage.removeItem('auth_token')
})

// Restore on init
const token = ref(localStorage.getItem('auth_token'))
```

### Pinia Plugin (generic persistence)

```ts
import type { PiniaPlugin } from 'pinia'

export const persistPlugin: PiniaPlugin = ({ store }) => {
  const key = `pinia-${store.$id}`
  const saved = localStorage.getItem(key)
  if (saved) {
    try { store.$patch(JSON.parse(saved)) } catch { /* ignore corrupt data */ }
  }
  store.$subscribe((_, state) => {
    localStorage.setItem(key, JSON.stringify(state))
  })
}
```

### When to Persist

| Data | Persist? | Storage |
|------|----------|---------|
| Auth tokens | ✅ Yes | `localStorage` |
| User preferences (theme, lang) | ✅ Yes | `localStorage` |
| Filter/search state | ⚠️ URL params preferred | `URLSearchParams` |
| Fetched entity data | ❌ No | In-memory only |
| Form draft (auto-save) | ⚠️ Optional | `sessionStorage` |

---

## WebSocket / Event-Driven State Updates

```ts
// src/composables/useWebSocket.ts
import { shallowRef, onUnmounted } from 'vue'

export function useWebSocket(url: string) {
  const ws = shallowRef<WebSocket | null>(null)
  const lastMessage = shallowRef<unknown>(null)

  function connect() {
    ws.value = new WebSocket(url)
    ws.value.onmessage = (event) => {
      lastMessage.value = JSON.parse(event.data)
    }
    ws.value.onclose = () => {
      setTimeout(connect, 3000) // auto-reconnect
    }
  }

  function disconnect() {
    ws.value?.close()
  }

  connect()
  onUnmounted(disconnect)

  return { lastMessage, disconnect }
}
```

### Store with WebSocket Updates

```ts
export const useNotificationsStore = defineStore('notifications', () => {
  const list = ref<Notification[]>([])
  const unreadCount = computed(() => list.value.filter(n => !n.read).length)

  function handleWsMessage(message: unknown) {
    const notification = message as Notification
    list.value.unshift(notification)
  }

  return { list, unreadCount, handleWsMessage }
})
```

```vue
<!-- App.vue or layout -->
<script setup lang="ts">
import { watch } from 'vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useNotificationsStore } from '@/stores/notifications'

const { lastMessage } = useWebSocket(import.meta.env.VITE_WS_URL)
const notifications = useNotificationsStore()

watch(lastMessage, (msg) => {
  if (msg) notifications.handleWsMessage(msg)
})
</script>
```

---

## State Architecture Decision Guide

| Question | If Yes | If No |
|----------|--------|-------|
| Is the state used by 2+ components? | Pinia store | Local `ref`/`reactive` |
| Is the state tied to a specific component lifecycle? | Composable | Store |
| Does the state survive navigation? | Store (+ persistence if needed) | Local ref |
| Is it derived from other state? | `computed` (never a separate ref) | — |
| Is it server data displayed as-is? | Composable with fetch | Store if shared |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| Single monolithic store | God object, merge conflicts | One store per domain |
| Storing everything in Pinia | Over-centralization, unnecessary reactivity | Local state for single-component data |
| Mutating store state from components | Unpredictable, no audit trail | Actions for all mutations |
| Calling stores at module scope | SSR hydration failures | Call inside functions/setup |
| Destructuring store without `storeToRefs` | Breaks reactivity | Always `storeToRefs` for state/getters |
| Watchers on store state for derived values | Unnecessary complexity | `computed` inside the store |
