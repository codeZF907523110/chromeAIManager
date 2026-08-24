---
name: vue-axios
description: Axios HTTP client best practices for Vue 3 with Composition API. Covers axios.create instance setup, typed API modules, request/response interceptors, centralized error handling, AbortController cancellation, and composables. Load when working with HTTP requests, axios, API calls, fetch data, useApi, interceptors, or REST API integration in Vue 3 projects.
license: MIT
metadata:
  sources:
    - https://axios.rest (official axios documentation v1.x)
    - https://vueuse.org/integrations/useAxios
  version: "1.0.0"
compatibility: Vue 3 + TypeScript + axios ^1.x
---

# Vue 3 + Axios — Best Practices

> Axios v1.x. Always use `axios.create()` — never import and call the global `axios` directly in components.

## Core Rules

- **Never call axios directly in `.vue` files** — use typed API modules or composables.
- **Always use `axios.create()`** — one instance per API base URL.
- **Always set `timeout`** — a stalled request hangs indefinitely without it.
- **Centralize error handling** in response interceptors, not in each component.
- **Never set `axios.defaults.headers.common.Authorization` globally** — it leaks to all hosts.
- **Use `AbortController`** for request cancellation — `CancelToken` is deprecated.
- **Type all responses** — never use `any` for response data.

---

## 1) Instance Setup

One instance per API. Keep in `src/api/instance.ts`:

```ts
import axios from 'axios'
import type { AxiosInstance } from 'axios'

export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
})
```

For multiple APIs (e.g. internal + third-party):

```ts
export const internalApi = axios.create({ baseURL: '/api/v1', timeout: 10_000 })
export const analyticsApi = axios.create({ baseURL: 'https://analytics.example.com', timeout: 5_000 })
```

See [`references/instance.md`](references/instance.md) for full config options.

---

## 2) Interceptors

Add interceptors to the instance, not to global `axios`.

```ts
import { useAuthStore } from '@/stores/auth'

apiClient.interceptors.request.use(
  (config) => {
    const auth = useAuthStore()
    if (auth.token) {
      config.headers.Authorization = `Bearer ${auth.token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        useAuthStore().logout()
      }
      if (error.response?.status === 429) {
        console.warn('Rate limited')
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        console.error('Request timed out')
      }
    }
    return Promise.reject(error)
  },
)
```

**Interceptor execution order:**
- Request interceptors: **LIFO** (last added runs first)
- Response interceptors: **FIFO** (first added runs first)

---

## 3) Typed API Modules

Keep all API calls in `src/api/` — never in components or stores.

```ts
// src/api/users.ts
import { apiClient } from './instance'
import type { AxiosResponse } from 'axios'

export interface User {
  id: number
  name: string
  email: string
}

export interface CreateUserDto {
  name: string
  email: string
}

export const usersApi = {
  getAll(): Promise<AxiosResponse<User[]>> {
    return apiClient.get('/users')
  },

  getById(id: number): Promise<AxiosResponse<User>> {
    return apiClient.get(`/users/${id}`)
  },

  create(data: CreateUserDto): Promise<AxiosResponse<User>> {
    return apiClient.post('/users', data)
  },

  update(id: number, data: Partial<CreateUserDto>): Promise<AxiosResponse<User>> {
    return apiClient.patch(`/users/${id}`, data)
  },

  remove(id: number): Promise<AxiosResponse<void>> {
    return apiClient.delete(`/users/${id}`)
  },
}
```

---

## 4) Composable Pattern

Wrap API calls in composables — components receive only reactive state:

```ts
// src/composables/useUsers.ts
import { shallowRef, readonly } from 'vue'
import { usersApi, type User } from '@/api/users'
import type { AxiosError } from 'axios'

export function useUsers() {
  const users = shallowRef<User[]>([])
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)

  async function fetchUsers() {
    loading.value = true
    error.value = null
    try {
      const { data } = await usersApi.getAll()
      users.value = data
    } catch (e) {
      const axiosError = e as AxiosError
      error.value = axiosError.message
    } finally {
      loading.value = false
    }
  }

  return {
    users: readonly(users),
    loading: readonly(loading),
    error: readonly(error),
    fetchUsers,
  }
}
```

Usage in component:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useUsers } from '@/composables/useUsers'

const { users, loading, error, fetchUsers } = useUsers()

onMounted(fetchUsers)
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">{{ error }}</div>
  <ul v-else>
    <li v-for="user in users" :key="user.id">{{ user.name }}</li>
  </ul>
</template>
```

---

## 5) Request Cancellation

Use `AbortController` (v0.22+). `CancelToken` is **deprecated** — never use it.

```ts
// src/composables/useSearch.ts
import axios from 'axios'
import { shallowRef, readonly } from 'vue'
import { apiClient } from '@/api/instance'

export function useSearch() {
  const results = shallowRef<unknown[]>([])
  const loading = shallowRef(false)
  let controller: AbortController | null = null

  async function search(query: string) {
    controller?.abort()
    controller = new AbortController()
    loading.value = true
    try {
      const { data } = await apiClient.get('/search', {
        params: { q: query },
        signal: controller.signal,
      })
      results.value = data
    } catch (e) {
      if (!axios.isCancel(e)) throw e
    } finally {
      loading.value = false
    }
  }

  return { results: readonly(results), loading: readonly(loading), search }
}
```

In Vue watchers:

```ts
watch(query, async (q, _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const { data } = await apiClient.get('/search', { params: { q }, signal: controller.signal })
  results.value = data
})
```

---

## 6) Error Handling

Always use `axios.isAxiosError()` to distinguish axios errors from unexpected ones:

```ts
import axios from 'axios'
import type { AxiosError } from 'axios'

interface ApiErrorResponse {
  message: string
  code?: string
}

function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorResponse>
    if (axiosError.response) {
      return axiosError.response.data?.message ?? `Error ${axiosError.response.status}`
    }
    if (axiosError.request) {
      return 'No response from server'
    }
    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return 'Request timed out'
    }
  }
  return 'Unexpected error'
}
```

**Error response structure:**
- `error.response` — server responded with non-2xx status
- `error.request` — request sent, no response received
- `error.message` — request setup failed
- `error.code` — `ECONNABORTED`, `ETIMEDOUT`, `ERR_NETWORK`, `ERR_CANCELED`

---

## 7) TypeScript Typing

```ts
import type { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios'

interface User { id: number; name: string }

const response: AxiosResponse<User> = await apiClient.get<User>('/users/1')
const user: User = response.data
```

Augment request config for custom metadata:

```ts
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean
    _startTime?: number
  }
}
```

---

## 8) Pinia Store Integration

Call stores inside functions — never at module scope (SSR safety):

```ts
// src/stores/users.ts
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { usersApi, type User } from '@/api/users'

export const useUsersStore = defineStore('users', () => {
  const list = shallowRef<User[]>([])
  const loading = shallowRef(false)

  async function fetchAll() {
    loading.value = true
    try {
      const { data } = await usersApi.getAll()
      list.value = data
    } finally {
      loading.value = false
    }
  }

  return { list, loading, fetchAll }
})
```

---

## References

- [`references/instance.md`](references/instance.md) — full `axios.create()` config options
- [`references/error-codes.md`](references/error-codes.md) — all axios error codes
- [`references/interceptors.md`](references/interceptors.md) — interceptor patterns (auth, retry, logging)
- [Official axios docs](https://axios.rest)
- [VueUse useAxios](https://vueuse.org/integrations/useAxios/)
