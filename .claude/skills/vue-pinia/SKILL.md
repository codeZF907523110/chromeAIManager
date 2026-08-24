---
name: vue-pinia
description: Pinia state management for Vue 3. Covers setup stores, storeToRefs, state patterns, actions, plugins, composables in stores, store composition, testing, SSR, and common gotchas. Load when working with Pinia stores or app-wide state.
license: MIT
metadata:
  sources:
    - https://github.com/antfu/skills (pinia skill, generated from vuejs/pinia v3.0.4)
    - https://github.com/vuejs-ai/skills (vue-pinia-best-practices)
  version: "1.0.0"
---

# Vue Pinia — State Management

> Based on Pinia v3.0.4. Prefer **Setup Stores** (Composition API style).

## Key Rules

- **Prefer Setup Stores** for complex logic, composables, watchers.
- **Use `storeToRefs()`** when destructuring state/getters — never destructure directly.
- **Actions can be destructured directly** — they are bound to the store.
- **Call stores inside functions** — not at module scope (critical for SSR).
- **Return all state** in setup stores — Pinia tracks only what you return.
- **Add HMR support** to each store for better DX.

## Core Reference

See [`references/core-stores.md`](references/core-stores.md) for full API.

---

## Setup Store (Preferred)

```ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const name = ref('User')
  const doubleCount = computed(() => count.value * 2)

  function increment() { count.value++ }

  async function fetchAndSet(id: number) {
    const data = await api.get(id)
    count.value = data.count
  }

  function $reset() { count.value = 0 }

  return { count, name, doubleCount, increment, fetchAndSet, $reset }
})
```

## Using a Store

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCounterStore } from '@/stores/counter'

const store = useCounterStore()

const { count, doubleCount } = storeToRefs(store)
const { increment } = store
</script>
```

## Common Gotchas from `vuejs-ai/skills`

### Store Setup

- **"getActivePinia was called" at startup** → store is called at module scope, before app is created. Always call stores inside functions/composables/components.
- **Setup stores missing state in DevTools** → you forgot to return a state ref from the setup function.

### Reactivity

- **Store destructuring stops updating UI** → use `storeToRefs()` for state/getters.
  ```ts
  const { count } = store          // BAD: breaks reactivity
  const { count } = storeToRefs(store) // GOOD
  ```
- **Store methods lose context in templates** → use `store.methodName()` in template, not destructured.

### State Patterns

- **Filters reset on refresh** → persist ephemeral filter/search state to URL params.
- **Large production app without conventions** → use Pinia for all shared state; keep stores in `src/stores/`.

---

## State Mutation Patterns

```ts
store.$patch({ count: store.count + 1, name: 'DIO' })

store.$patch((state) => {
  state.items.push({ name: 'shoes', qty: 1 })
  state.hasChanged = true
})
```

## Store Composition

```ts
import { useAuthStore } from './auth'

export const useProfileStore = defineStore('profile', () => {
  const auth = useAuthStore()

  async function loadProfile() {
    if (!auth.isAuthenticated) return
    profile.value = await api.getProfile(auth.userId)
  }

  return { loadProfile }
})
```

**SSR rule:** call all `useStore()` calls BEFORE any `await` in actions.

## Subscribing to State

```ts
store.$subscribe((mutation, state) => {
  localStorage.setItem('cart', JSON.stringify(state))
})

store.$onAction(({ name, after, onError }) => {
  after((result) => console.log(`${name} done`))
  onError((error) => console.warn(`${name} failed:`, error))
})
```

## Plugins

```ts
import type { PiniaPlugin } from 'pinia'

const persistPlugin: PiniaPlugin = ({ store }) => {
  const key = `store-${store.$id}`
  const saved = localStorage.getItem(key)
  if (saved) store.$patch(JSON.parse(saved))
  store.$subscribe((_, state) => localStorage.setItem(key, JSON.stringify(state)))
}

const pinia = createPinia()
pinia.use(persistPlugin)
```

## HMR Support

```ts
import { acceptHMRUpdate } from 'pinia'

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCounterStore, import.meta.hot))
}
```

## SSR

For Nuxt 3, use the official `@pinia/nuxt` module — do not create a manual plugin:

```bash
npm install @pinia/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
})
```

For custom SSR (non-Nuxt), create a **fresh Pinia instance per request**:

```ts
import { createApp as createVueApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

export function createApp() {
  const app = createVueApp(App)
  const pinia = createPinia()
  app.use(pinia)
  return { app, pinia }
}
```

## Testing with `@pinia/testing`

```ts
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'

const wrapper = mount(MyComponent, {
  global: {
    plugins: [createTestingPinia({
      createSpy: vi.fn,
      initialState: { counter: { count: 10 } }
    })]
  }
})

const store = useCounterStore()
store.count = 20
await nextTick()
```
