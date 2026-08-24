---
title: Reactivity Core Patterns
source: vuejs-ai/skills vue-best-practices
tags: [vue3, reactivity, ref, reactive, shallowRef, computed, watch]
---

# Reactivity Core Patterns

## Choosing the Right Primitive

### `shallowRef` for primitives (ALWAYS prefer over `ref`)

```ts
import { shallowRef } from 'vue'

const count = shallowRef(0)
const name = shallowRef('')
const isOpen = shallowRef(false)
```

### `ref` — objects you replace frequently

```ts
import { ref } from 'vue'

const user = ref<User | null>(null)
user.value = await fetchUser(id)
```

### `reactive` — objects you mutate in-place

```ts
import { reactive } from 'vue'

const state = reactive({ count: 0, items: [] as string[] })
state.count++
state.items.push('new item')
```

Never destructure `reactive()` directly — it loses reactivity:

```ts
const { count } = toRefs(state)
watch(() => state.count, callback)
```

### `shallowRef` for opaque objects

```ts
import { shallowRef } from 'vue'

const sdkClient = shallowRef(new SomeSDK())
sdkClient.value = new SomeSDK()
```

---

## `computed` — Always Prefer Over Watcher-Assigned Refs

**BAD:**
```ts
const total = ref(0)
watchEffect(() => { total.value = items.value.reduce((s, i) => s + i.price, 0) })
```

**GOOD:**
```ts
const total = computed(() => items.value.reduce((s, i) => s + i.price, 0))
```

Keep computed getters **pure** — no side effects, no mutations, no API calls:

```ts
const doubled = computed(() => count.value * 2)

watch(count, (val) => {
  if (val > 10) console.warn('Too big!')
})
```

Keep derivations in script, not in template:

```ts
const activeUsers = computed(() => users.value.filter(u => u.active))
```

---

## `watch` — Side Effects Only

```ts
watch(
  userId,
  (id) => loadUser(id),
  { immediate: true }
)
```

Async cleanup:

```ts
watch(query, async (q, _prev, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  results.value = await fetch(`/api/search?q=${q}`, { signal: controller.signal }).then(r => r.json())
})
```

### `watchEffect` with `onWatcherCleanup` (Vue 3.5+)

```ts
watchEffect(async () => {
  const controller = new AbortController()
  onWatcherCleanup(() => controller.abort())
  data.value = await fetch(`/api/${id.value}`, { signal: controller.signal }).then(r => r.json())
})
```

### Pause/resume watchers (Vue 3.5+)

```ts
const { pause, resume, stop } = watchEffect(() => {})
```

---

## Effect Scope

```ts
import { effectScope, onScopeDispose } from 'vue'

const scope = effectScope()
scope.run(() => {
  watchEffect(() => { /* ... */ })
  onScopeDispose(() => console.log('cleaned up'))
})
scope.stop()
```
