# Performance Optimization

> Practical patterns for keeping Vue 3 applications fast.

## Route-Level Code Splitting

**Always lazy-load route components.** This is the single most impactful optimization.

```ts
// GOOD — each route is a separate chunk
{ path: '/users', component: () => import('@/pages/UsersListPage.vue') }

// BAD — bundled into the main chunk
import UsersListPage from '@/pages/UsersListPage.vue'
{ path: '/users', component: UsersListPage }
```

### Named Chunks (for grouping)

```ts
// Group admin pages into one chunk
component: () => import(/* webpackChunkName: "admin" */ '@/pages/admin/AdminDashboardPage.vue')
```

---

## Dynamic Component Imports

For heavy components that are conditionally rendered:

```ts
import { defineAsyncComponent } from 'vue'

const ChartWidget = defineAsyncComponent(() => import('@/components/ChartWidget.vue'))
const RichTextEditor = defineAsyncComponent({
  loader: () => import('@/components/RichTextEditor.vue'),
  loadingComponent: () => import('@/components/ui/AppSpinner.vue'),
  delay: 200,        // Show loading after 200ms
  timeout: 10_000,   // Timeout after 10s
})
```

### When to Use `defineAsyncComponent`

| Scenario | Use? |
|----------|------|
| Route-level pages | No — use `() => import()` in router |
| Heavy component behind `v-if` | ✅ Yes |
| Modal content | ✅ Yes |
| Tab content loaded on demand | ✅ Yes |
| Small, always-visible component | No — overhead not worth it |

---

## Rendering Optimization

### `v-once` — Render Once, Never Update

```vue
<!-- Static header that never changes -->
<h1 v-once>{{ appName }}</h1>
```

### `v-memo` — Skip Re-Render Unless Deps Change

```vue
<!-- Only re-renders row if item.id or selected changes -->
<div v-for="item in list" :key="item.id" v-memo="[item.id, selected === item.id]">
  <span :class="{ active: selected === item.id }">{{ item.name }}</span>
</div>
```

### Avoid Inline Functions in Templates

```vue
<!-- BAD — creates new function every render -->
<ChildComponent :handler="() => doSomething(item.id)" />

<!-- GOOD — stable reference -->
<script setup>
function handleClick(id: number) { doSomething(id) }
</script>
<ChildComponent :handler="() => handleClick(item.id)" />
```

---

## Watcher Optimization

### Prefer `computed` Over Watchers for Derived State

```ts
// BAD — watcher to update derived value
const fullName = ref('')
watch([firstName, lastName], ([f, l]) => {
  fullName.value = `${f} ${l}`
})

// GOOD — computed (cached, auto-tracked)
const fullName = computed(() => `${firstName.value} ${lastName.value}`)
```

### Use `watchEffect` Cleanup for Cancellation

```ts
watchEffect((onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())

  fetch(`/api/users/${id.value}`, { signal: controller.signal })
    .then(r => r.json())
    .then(data => { user.value = data })
})
```

### Avoid Deep Watchers on Large Objects

```ts
// BAD — triggers on any nested change, expensive
watch(largeObject, handler, { deep: true })

// GOOD — watch specific paths
watch(() => largeObject.value.status, handler)
watch(() => largeObject.value.items.length, handler)
```

---

## Virtual Lists

For lists with 100+ items, virtualize instead of rendering all DOM nodes.

### VueUse `useVirtualList`

```ts
import { useVirtualList } from '@vueuse/core'

const { list, containerProps, wrapperProps } = useVirtualList(items, {
  itemHeight: 50,
})
```

```vue
<div v-bind="containerProps" style="height: 400px; overflow-y: auto">
  <div v-bind="wrapperProps">
    <div v-for="{ data, index } in list" :key="index" style="height: 50px">
      {{ data.name }}
    </div>
  </div>
</div>
```

### `vue-virtual-scroller`

```vue
<RecycleScroller :items="items" :item-size="50" key-field="id" v-slot="{ item }">
  <div class="user-row">{{ item.name }}</div>
</RecycleScroller>
```

---

## `shallowRef` for Large Objects

```ts
import { shallowRef } from 'vue'

// GOOD — no deep reactivity proxy
const chartData = shallowRef<ChartDataset[]>([])
const mapInstance = shallowRef<MapboxMap | null>(null)

// To trigger reactivity on shallowRef objects, replace the entire value:
chartData.value = [...newData]
```

### When to Use `shallowRef`

| Data Type | Use |
|----------|-----|
| Primitives (string, number, boolean) | `shallowRef` (identical to `ref` for primitives) |
| Small objects with 2-5 fields | `ref` is fine |
| Large arrays (100+ items) | `shallowRef` |
| External SDK instances (Map, Chart, Editor) | `shallowRef` + `markRaw` |
| Deeply nested objects you replace wholesale | `shallowRef` |

---

## `<KeepAlive>` for View Caching

```vue
<!-- Cache tab contents to preserve state -->
<KeepAlive :include="['UsersTab', 'OrdersTab']" :max="5">
  <component :is="currentTab" />
</KeepAlive>
```

```vue
<!-- Cache specific route views -->
<RouterView v-slot="{ Component }">
  <KeepAlive :include="cachedViews">
    <component :is="Component" />
  </KeepAlive>
</RouterView>
```

**Rules:**
- Set `:max` to prevent memory leaks.
- Use `:include` / `:exclude` — don't cache everything.
- Use `onActivated` / `onDeactivated` instead of `onMounted` / `onUnmounted` in cached components.

---

## Bundle Optimization

### Vite Config

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          ui: ['quasar'],  // or 'vuetify'
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
})
```

### Bundle Analysis

```bash
# Install visualizer
npm install -D rollup-plugin-visualizer

# Add to vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

plugins: [
  visualizer({ open: true, gzipSize: true }),
]
```

### Tree-Shaking Tips

- **Import only what you use** — `import { ref, computed } from 'vue'`, not `import * as Vue`.
- **Avoid barrel files (`index.ts`) for large modules** — they break tree-shaking.
- **Check library support** — use `bundlephobia.com` before adding deps.
- **Use `Day.js` instead of `Moment.js`** — 2KB vs 70KB.

---

## Caching Strategies

| Strategy | Implementation | Use Case |
|----------|---------------|----------|
| Time-based store cache | `lastFetched` + TTL check | Entity lists |
| Map-based entity cache | `Map<id, entity>` in store | Detail views |
| HTTP cache headers | Server `Cache-Control` / `ETag` | Static resources |
| Service Worker | Workbox / `vite-plugin-pwa` | Offline-first apps |
| `<KeepAlive>` | Component-level DOM caching | Tab navigation |

---

## Performance Checklist

- [ ] All route components lazy-loaded.
- [ ] Heavy conditional components use `defineAsyncComponent`.
- [ ] Lists > 100 items are virtualized.
- [ ] Large objects use `shallowRef`.
- [ ] Derived state uses `computed`, not watchers.
- [ ] No deep watchers on large objects.
- [ ] No unnecessary `v-for` component wrappers in hot paths.
- [ ] Bundle analyzed with `rollup-plugin-visualizer`.
- [ ] Vendor chunks separated for caching.
- [ ] Images lazy-loaded (`loading="lazy"`).
