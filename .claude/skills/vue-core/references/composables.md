---
title: Composable Organization Patterns
source: vuejs-ai/skills vue-best-practices
tags: [vue3, composables, composition-api, reusability, MaybeRef, MaybeRefOrGetter]
---

# Composable Organization Patterns

## Naming Convention

Always prefix with `use`: `useMouse`, `useFetch`, `useCounter`.

## Basic Pattern

```ts
import { shallowRef, onMounted, onUnmounted } from 'vue'

export function useMouse() {
  const x = shallowRef(0)
  const y = shallowRef(0)

  const update = (e: MouseEvent) => { x.value = e.pageX; y.value = e.pageY }

  onMounted(() => window.addEventListener('mousemove', update))
  onUnmounted(() => window.removeEventListener('mousemove', update))

  return { x: readonly(x), y: readonly(y) }
}
```

## Adaptive Inputs: `MaybeRef` / `MaybeRefOrGetter`

Accept both reactive and plain values:

```ts
import { toValue, watchEffect, type MaybeRefOrGetter } from 'vue'

export function useFetch(url: MaybeRefOrGetter<string>) {
  const data = shallowRef<unknown>(null)
  const error = shallowRef<unknown>(null)

  watchEffect(async () => {
    data.value = null
    error.value = null
    try {
      const res = await fetch(toValue(url))
      data.value = await res.json()
    } catch (e) {
      error.value = e
    }
  })

  return { data: readonly(data), error: readonly(error) }
}

useFetch('/api/users')
useFetch(urlRef)
useFetch(() => `/api/users/${props.id}`)
```

| Input type | Use |
|------------|-----|
| Read-only, getter | `MaybeRefOrGetter<T>` |
| Writable two-way | `MaybeRef<T>` |
| Callback/predicate | plain type (do NOT use `MaybeRefOrGetter`) |

Normalize with `toRef()` for watcher source, `toValue()` for snapshot read.

## Options Object Pattern

```ts
interface UseCounterOptions {
  initial?: number
  min?: number
  max?: number
  step?: number
}

export function useCounter(options: UseCounterOptions = {}) {
  const { initial = 0, min = -Infinity, max = Infinity, step = 1 } = options
  const count = shallowRef(initial)
  const increment = () => { count.value = Math.min(count.value + step, max) }
  const decrement = () => { count.value = Math.max(count.value - step, min) }
  return { count: readonly(count), increment, decrement }
}
```

## Return `readonly` State

```ts
export function useCart() {
  const _items = ref<CartItem[]>([])
  const total = computed(() => _items.value.reduce((s, i) => s + i.price * i.qty, 0))

  function addItem(product: Product, qty = 1) {
    const existing = _items.value.find(i => i.id === product.id)
    if (existing) { existing.qty += qty; return }
    _items.value.push({ ...product, qty })
  }

  function removeItem(id: string) {
    _items.value = _items.value.filter(i => i.id !== id)
  }

  return { items: readonly(_items), total, addItem, removeItem }
}
```

## Compose Composables from Smaller Ones

```ts
// useEventListener.ts
export function useEventListener<E extends keyof WindowEventMap>(
  target: MaybeRefOrGetter<EventTarget>,
  event: E,
  callback: (e: WindowEventMap[E]) => void
) {
  onMounted(() => toValue(target).addEventListener(event, callback as EventListener))
  onUnmounted(() => toValue(target).removeEventListener(event, callback as EventListener))
}

// useMouse.ts
export function useMouse() {
  const x = shallowRef(0)
  const y = shallowRef(0)
  useEventListener(window, 'mousemove', (e) => { x.value = e.pageX; y.value = e.pageY })
  return { x: readonly(x), y: readonly(y) }
}
```

## Organize by Feature Concern

```vue
<script setup lang="ts">
import { useItems } from '@/composables/useItems'
import { useSearch } from '@/composables/useSearch'
import { useSelectionModal } from '@/composables/useSelectionModal'

const { items, loading, fetchItems } = useItems()
const { query, visibleItems } = useSearch(items)
const { selectedItem, isModalOpen, selectItem, closeModal } = useSelectionModal()
</script>
```

## Keep Utilities as Plain Functions

Stateless formatters/utils are NOT composables:

```ts
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}
```

## Split Trigger Rules

Extract to composable when **any** is true:
- Logic is reused in 2+ places.
- Component has both orchestration/state and substantial presentational markup.
- Component has 3+ distinct UI sections.
- Template block is repeated or could be reused.
