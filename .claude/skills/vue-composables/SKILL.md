---
name: vue-composables
description: Create library-grade Vue 3 composables with adaptive MaybeRef/MaybeRefOrGetter inputs. Use when the user asks to create a reusable, adaptable, or library-grade composable. Normalizes inputs with toValue()/toRef() for maximum reusability.
license: MIT
metadata:
  sources:
    - https://github.com/vuejs-ai/skills (create-adaptable-composable v17.0.0)
  version: "1.0.0"
compatibility: Vue 3.3+ or Nuxt 3+
---

# Create Adaptable Composable

Adaptable composables accept both reactive and non-reactive inputs, making them reusable across all contexts.

## Steps

1. Confirm purpose, API, and expected inputs/outputs.
2. Identify which input params should be reactive (`MaybeRef` / `MaybeRefOrGetter`).
3. Normalize with `toValue()` (snapshot) or `toRef()` (watcher source) inside reactive effects.
4. Implement logic using Vue reactivity APIs.
5. Return `readonly` state + explicit actions.

---

## Type Reference

```ts
import type { MaybeRef, MaybeRefOrGetter } from 'vue'

type MaybeRef<T> = T | Ref<T> | ShallowRef<T> | WritableComputedRef<T>
type MaybeRefOrGetter<T> = MaybeRef<T> | ComputedRef<T> | (() => T)
```

| Input need | Type |
|------------|------|
| Read-only, can be computed or getter | `MaybeRefOrGetter<T>` |
| Writable / two-way | `MaybeRef<T>` |
| Callback / predicate / comparator | plain `T` — never `MaybeRefOrGetter` |
| DOM/element targets | `MaybeRefOrGetter<HTMLElement \| null>` |

Normalize: `toRef(input)` for watcher source, `toValue(input)` for snapshot read.

---

## Examples

### Read-only input: `MaybeRefOrGetter`

```ts
import { watch, toRef } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

export function useDocumentTitle(title: MaybeRefOrGetter<string>) {
  watch(toRef(title), (t) => { document.title = t }, { immediate: true })
}

useDocumentTitle('Static title')
useDocumentTitle(ref('Dynamic'))
useDocumentTitle(() => `${route.name} | App`)
```

### Writable input: `MaybeRef`

```ts
import { toRef } from 'vue'
import type { MaybeRef } from 'vue'

export function useCounter(count: MaybeRef<number>) {
  const countRef = toRef(count)
  function add(step = 1) { countRef.value += step }
  function subtract(step = 1) { countRef.value -= step }
  return { count: countRef, add, subtract }
}
```

### Reactive fetch: `MaybeRefOrGetter` + `watchEffect` cleanup

```ts
import { shallowRef, watchEffect, toValue, readonly } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

export function useFetch<T>(url: MaybeRefOrGetter<string>) {
  const data = shallowRef<T | null>(null)
  const error = shallowRef<unknown>(null)
  const loading = shallowRef(false)

  watchEffect(async () => {
    const controller = new AbortController()
    onWatcherCleanup(() => controller.abort())

    loading.value = true
    data.value = null
    error.value = null

    try {
      const res = await fetch(toValue(url), { signal: controller.signal })
      data.value = await res.json()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error.value = e
    } finally {
      loading.value = false
    }
  })

  return { data: readonly(data), error: readonly(error), loading: readonly(loading) }
}
```

### Element target: `MaybeRefOrGetter<HTMLElement | null | undefined>`

```ts
import { shallowRef, readonly, watch, toRef } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

export function useFocusVisible(el: MaybeRefOrGetter<HTMLElement | null | undefined>) {
  const isFocusVisible = shallowRef(false)

  watch(toRef(el), (target, _, onCleanup) => {
    if (!target) return
    const onFocus = () => (isFocusVisible.value = true)
    const onBlur = () => (isFocusVisible.value = false)
    target.addEventListener('focus', onFocus)
    target.addEventListener('blur', onBlur)
    onCleanup(() => {
      target.removeEventListener('focus', onFocus)
      target.removeEventListener('blur', onBlur)
    })
  }, { immediate: true })

  return { isFocusVisible: readonly(isFocusVisible) }
}
```

### Options object pattern (multiple optional params)

```ts
interface UseScrollOptions {
  throttle?: number
  onScroll?: (x: number, y: number) => void
}

export function useWindowScroll(options: UseScrollOptions = {}) {
  const { throttle = 0, onScroll } = options
  const x = shallowRef(window.scrollX)
  const y = shallowRef(window.scrollY)

  const update = useThrottleFn(() => {
    x.value = window.scrollX
    y.value = window.scrollY
    onScroll?.(x.value, y.value)
  }, throttle)

  useEventListener(window, 'scroll', update, { passive: true })

  return { x: readonly(x), y: readonly(y) }
}
```

---

## Composable Checklist

- [ ] Inputs use `MaybeRefOrGetter` or `MaybeRef` when appropriate.
- [ ] All `MaybeRef`/`MaybeRefOrGetter` inputs normalized with `toRef()` / `toValue()` inside effects.
- [ ] State is returned as `readonly()` unless explicitly writable.
- [ ] Lifecycle cleanup is handled (`onUnmounted`, `onWatcherCleanup`, `onCleanup`).
- [ ] Options object used when 3+ optional params.
- [ ] Composable is standalone and does NOT mutate external state.
- [ ] Name starts with `use`.
