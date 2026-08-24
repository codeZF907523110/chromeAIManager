---
title: Vue 3 New APIs — Reactivity, Lifecycle, Effect Scope
source: antfu/skills vue skill, generated from vuejs/docs
tags: [vue3, lifecycle, effectScope, watchEffect, onWatcherCleanup]
---

# Vue 3 Core APIs

## Lifecycle Hooks

```ts
import {
  onBeforeMount, onMounted,
  onBeforeUpdate, onUpdated,
  onBeforeUnmount, onUnmounted,
  onErrorCaptured,
  onActivated, onDeactivated,
  onServerPrefetch
} from 'vue'

onMounted(() => { /* DOM ready */ })
onUnmounted(() => { /* cleanup timers, listeners */ })

onErrorCaptured((err, instance, info) => {
  console.error(err)
  return false
})
```

## `watch` Advanced Patterns

```ts
watch(count, (newVal, oldVal) => { /* ... */ })

watch(() => props.id, (id) => fetchData(id), { immediate: true })

watch([firstName, lastName], ([first, last]) => { fullName.value = `${first} ${last}` })

watch(state, callback, { deep: 2 })

watch(source, callback, { once: true })
```

## `watchEffect` with Cleanup (Vue 3.5+)

```ts
watchEffect(async () => {
  const controller = new AbortController()
  onWatcherCleanup(() => controller.abort())
  const res = await fetch(`/api/${id.value}`, { signal: controller.signal })
  data.value = await res.json()
})

const { pause, resume, stop } = watchEffect(() => {})
pause()
resume()
stop()
```

## Flush Timing

```ts
watch(source, callback, { flush: 'post' })
watchPostEffect(() => {})
```

## Effect Scope

```ts
const scope = effectScope()

scope.run(() => {
  const count = shallowRef(0)
  const doubled = computed(() => count.value * 2)
  watch(count, () => console.log(count.value))
  onScopeDispose(() => console.log('Scope disposed'))
})

scope.stop()
```

## `toValue` (Vue 3.3+)

Normalize `MaybeRefOrGetter`:

```ts
import { toValue, type MaybeRefOrGetter } from 'vue'

function useFetch(url: MaybeRefOrGetter<string>) {
  watchEffect(async () => {
    const res = await fetch(toValue(url))
    data.value = await res.json()
  })
}
```
