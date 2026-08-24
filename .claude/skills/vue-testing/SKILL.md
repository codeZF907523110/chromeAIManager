---
name: vue-testing
description: Vue 3 testing with Vitest, Vue Test Utils, and Playwright E2E. Covers component testing, composable testing, mocking, async patterns, Pinia in tests, Suspense, Teleport, and snapshot anti-patterns. Load when writing or fixing tests for Vue components or composables.
license: MIT
metadata:
  sources:
    - https://github.com/vuejs-ai/skills (vue-testing-best-practices v1.0.0)
  version: "1.0.0"
---

# Vue 3 Testing — Best Practices

## Stack

- **Unit/Component:** [Vitest](https://vitest.dev/) + [Vue Test Utils](https://test-utils.vuejs.org/)
- **E2E:** [Playwright](https://playwright.dev/)

## Setup Vitest

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

## Component Testing Principles

### Black-Box Approach

Test **behavior from the user's perspective**, not implementation details.
Do NOT test internal state, method names, or computed property values directly.

**BAD:**
```ts
expect(wrapper.vm.internalCount).toBe(5)
wrapper.vm.privateMethod()
```

**GOOD:**
```ts
await wrapper.find('button').trigger('click')
expect(wrapper.find('.counter').text()).toBe('5')
```

### Basic Component Test

```ts
import { mount } from '@vue/test-utils'
import MyComponent from '@/components/MyComponent.vue'

describe('MyComponent', () => {
  it('increments counter on click', async () => {
    const wrapper = mount(MyComponent)
    await wrapper.find('[data-test="increment"]').trigger('click')
    expect(wrapper.find('[data-test="count"]').text()).toBe('1')
  })
})
```

## Async: Always Use `flushPromises`

Intermittent failures are caused by unresolved async. Always flush:

```ts
import { flushPromises } from '@vue/test-utils'

it('renders async data', async () => {
  const wrapper = mount(AsyncComponent)
  await flushPromises()
  expect(wrapper.find('.data').text()).toBe('expected value')
})
```

## Composable Testing

Composables that use lifecycle hooks or `inject` must be tested inside a wrapper component:

```ts
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useMyComposable } from '@/composables/useMyComposable'

function mountComposable<T>(composable: () => T) {
  let result!: T
  const TestComponent = defineComponent({
    setup() { result = composable(); return {} },
    template: '<div />'
  })
  const wrapper = mount(TestComponent)
  return { result, wrapper }
}

it('initializes state correctly', () => {
  const { result, wrapper } = mountComposable(() => useMyComposable())
  const { count, increment } = result
  expect(count.value).toBe(0)
  increment()
  expect(count.value).toBe(1)
  wrapper.unmount()
})
```

## Pinia in Tests

```ts
import { createTestingPinia } from '@pinia/testing'
import { useCounterStore } from '@/stores/counter'

const wrapper = mount(MyComponent, {
  global: {
    plugins: [createTestingPinia({
      createSpy: vi.fn,
      initialState: { counter: { count: 5 } }
    })]
  }
})

const store = useCounterStore()
store.count = 10
await nextTick()
expect(wrapper.find('.count').text()).toBe('10')
```

## Async Components with Suspense

```ts
it('renders async component', async () => {
  const wrapper = mount(
    defineComponent({
      components: { AsyncComp },
      template: '<Suspense><AsyncComp /></Suspense>'
    })
  )
  await flushPromises()
  expect(wrapper.html()).toContain('expected content')
})
```

## Teleport Testing

```ts
it('renders in teleport target', async () => {
  document.body.innerHTML = '<div id="modal-portal"></div>'
  const wrapper = mount(ModalComponent, {
    attachTo: document.body
  })
  await flushPromises()
  expect(document.querySelector('#modal-portal .modal')).not.toBeNull()
})
```

## No Snapshot-Only Tests

Snapshots catch unexpected changes but do NOT verify functionality.
Always pair snapshots with behavioral assertions:

```ts
it('renders correctly and is interactive', async () => {
  const wrapper = mount(MyComponent, { props: { title: 'Hello' } })
  await wrapper.find('button').trigger('click')
  expect(wrapper.emitted('submit')).toBeTruthy()
})
```

## Mocking

```ts
vi.mock('@/api/users', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Test User' })
}))

const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
  ok: true,
  json: async () => ({ data: 'mocked' })
} as Response)
```

## Browser vs Node Runners

Use `environment: 'jsdom'` (default) for most component tests.
Use `environment: 'happy-dom'` for faster tests when full DOM compatibility is not needed.
Use browser runner (`@vitest/browser`) only when you need:
- Real CSS `getComputedStyle`
- Real focus/blur behavior
- Native form events

## E2E with Playwright

```ts
import { test, expect } from '@playwright/test'

test('user can submit form', async ({ page }) => {
  await page.goto('/')
  await page.fill('[data-test="email"]', 'user@example.com')
  await page.click('[data-test="submit"]')
  await expect(page.locator('[data-test="success-message"]')).toBeVisible()
})
```

## References

- [Vue.js Testing Guide](https://vuejs.org/guide/scaling-up/testing)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
