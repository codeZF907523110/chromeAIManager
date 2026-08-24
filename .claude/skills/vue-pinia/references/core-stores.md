---
title: Pinia Core — Stores, State, Getters, Actions
source: antfu/skills pinia skill, generated from vuejs/pinia
tags: [pinia, store, state, getters, actions, storeToRefs, setup-store]
---

# Pinia Core Stores

## Setup Store (Recommended)

```ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const name = ref('Eduardo')
  const doubleCount = computed(() => count.value * 2)

  function increment() { count.value++ }

  return { count, name, doubleCount, increment }
})
```

Mapping: `ref()` → state, `computed()` → getters, `function()` → actions.
**You must return all state properties.**

## Options Store

```ts
export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0, name: 'Eduardo' }),
  getters: {
    doubleCount: (state) => state.count * 2,
    doublePlusOne(): number { return this.doubleCount + 1 },
  },
  actions: {
    increment() { this.count++ },
    async registerUser(login: string, password: string) {
      try {
        this.userData = await api.post({ login, password })
      } catch (error) {
        return error
      }
    },
  },
})
```

## Destructuring

```ts
const store = useCounterStore()

const { name, doubleCount } = storeToRefs(store)
const { increment } = store
```

## State TypeScript

```ts
interface State {
  userList: UserInfo[]
  user: UserInfo | null
}

export const useUserStore = defineStore('user', {
  state: (): State => ({ userList: [], user: null }),
})
```

## `$patch` Mutations

```ts
store.$patch({ count: store.count + 1, name: 'DIO' })

store.$patch((state) => {
  state.items.push({ name: 'shoes', quantity: 1 })
  state.hasChanged = true
})
```

## `$reset`

Options stores have built-in `$reset()`. For setup stores, implement manually:

```ts
function $reset() { count.value = 0 }
return { count, $reset }
```

## `$subscribe`

```ts
cartStore.$subscribe((mutation, state) => {
  mutation.type      // 'direct' | 'patch object' | 'patch function'
  mutation.storeId   // 'cart'
  localStorage.setItem('cart', JSON.stringify(state))
})

cartStore.$subscribe(callback, { flush: 'sync' })
cartStore.$subscribe(callback, { detached: true })
```

## Getters with Arguments (loses caching)

```ts
getters: {
  getUserById: (state) => (userId: string) => state.users.find(u => u.id === userId),
  getActiveUserById(state) {
    const active = state.users.filter(u => u.active)
    return (userId: string) => active.find(u => u.id === userId)
  },
},
```

## Cross-Store Access

```ts
import { useOtherStore } from './other-store'

getters: {
  combined(state) {
    const other = useOtherStore()
    return state.localData + other.data
  },
},

actions: {
  async fetchUserPreferences() {
    const auth = useAuthStore()
    if (auth.isAuthenticated) this.preferences = await fetchPreferences()
  },
},
```

## `$onAction`

```ts
const unsubscribe = someStore.$onAction(({ name, store, args, after, onError }) => {
  const start = Date.now()
  after((result) => console.log(`Finished "${name}" after ${Date.now() - start}ms`))
  onError((error) => console.warn(`Failed "${name}": ${error}`))
})

unsubscribe()
someStore.$onAction(callback, true)
```

## Composables in Setup Stores

```ts
import { useRoute } from 'vue-router'
import { inject } from 'vue'

export const useSearchFilters = defineStore('search-filters', () => {
  const route = useRoute()
  const appProvided = inject('appProvided')

  return { /* ... */ }
})
```
