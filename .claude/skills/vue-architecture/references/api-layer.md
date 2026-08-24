# API Layer Architecture

> Axios-based patterns for structured, typed, and maintainable API communication.

## Layer Diagram

```
Vue Component
    ↓ (uses)
Composable / Pinia Store
    ↓ (calls)
API Module (typed functions)
    ↓ (uses)
Axios Instance (instance.ts)
    ↓ (processed by)
Interceptors (auth, error normalization, retry)
    ↓
HTTP Request → Server
```

**Rule:** Components and stores never import `axios` directly. They call API module functions.

---

## Instance Setup

```ts
// src/api/instance.ts (or src/shared/api/instance.ts)
import axios from 'axios'
import type { AxiosInstance } from 'axios'

export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// For multiple backends:
export const analyticsClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_ANALYTICS_API_URL,
  timeout: 30_000,
})
```

---

## Interceptor Setup

```ts
// src/api/interceptors.ts
import axios from 'axios'
import { apiClient } from './instance'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

// === Auth Token Injection ===
apiClient.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

// === Response Error Handling ===
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error)

    const status = error.response?.status

    // Token expired — attempt silent refresh
    if (status === 401 && !error.config?._retry) {
      error.config!._retry = true
      try {
        const auth = useAuthStore()
        await auth.refreshSession()
        error.config!.headers.Authorization = `Bearer ${auth.token}`
        return apiClient(error.config!)
      } catch {
        const auth = useAuthStore()
        auth.logout()
        router.push({ name: 'Login' })
        return Promise.reject(error)
      }
    }

    // Forbidden
    if (status === 403) {
      router.push({ name: 'Forbidden' })
    }

    // Server error
    if (status && status >= 500) {
      console.error('[API] Server error:', error.response?.data)
    }

    return Promise.reject(error)
  },
)

// TypeScript: augment config for _retry flag
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean
  }
}
```

---

## Typed API Module

```ts
// src/api/users.ts
import { apiClient } from './instance'
import type { AxiosResponse } from 'axios'
import type { User, CreateUserDto, UpdateUserDto } from '@/types/user'
import type { PaginatedResponse } from '@/types/api'

export const usersApi = {
  getAll(params?: { page?: number; limit?: number; search?: string }): Promise<AxiosResponse<PaginatedResponse<User>>> {
    return apiClient.get('/users', { params })
  },

  getById(id: number): Promise<AxiosResponse<User>> {
    return apiClient.get(`/users/${id}`)
  },

  create(data: CreateUserDto): Promise<AxiosResponse<User>> {
    return apiClient.post('/users', data)
  },

  update(id: number, data: UpdateUserDto): Promise<AxiosResponse<User>> {
    return apiClient.patch(`/users/${id}`, data)
  },

  remove(id: number): Promise<AxiosResponse<void>> {
    return apiClient.delete(`/users/${id}`)
  },

  search(query: string, signal?: AbortSignal): Promise<AxiosResponse<User[]>> {
    return apiClient.get('/users/search', { params: { q: query }, signal })
  },
}
```

---

## Shared Types

```ts
// src/types/api.ts
export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ApiError {
  message: string
  code?: string
  details?: Record<string, string[]>
}
```

---

## DTO Mapping

When API response shape differs from internal types, map in the API module:

```ts
// API returns snake_case
interface UserApiResponse {
  id: number
  full_name: string
  created_at: string
}

// Internal type uses camelCase
interface User {
  id: number
  fullName: string
  createdAt: Date
}

function mapUser(raw: UserApiResponse): User {
  return {
    id: raw.id,
    fullName: raw.full_name,
    createdAt: new Date(raw.created_at),
  }
}

export const usersApi = {
  async getById(id: number): Promise<User> {
    const { data } = await apiClient.get<UserApiResponse>(`/users/${id}`)
    return mapUser(data)
  },
}
```

---

## Error Normalization

```ts
// src/utils/apiError.ts
import axios from 'axios'
import type { AxiosError } from 'axios'
import type { ApiError } from '@/types/api'

export function normalizeApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiError>

    // Server returned structured error
    if (axiosError.response?.data?.message) {
      return axiosError.response.data
    }

    // HTTP status errors
    if (axiosError.response) {
      return { message: `Server error: ${axiosError.response.status}` }
    }

    // Network / timeout
    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return { message: 'Request timed out. Please try again.' }
    }
    if (axiosError.code === 'ERR_NETWORK') {
      return { message: 'Network error. Check your connection.' }
    }

    return { message: axiosError.message }
  }

  return { message: 'An unexpected error occurred.' }
}
```

---

## Retry Strategy

```ts
// In interceptors.ts — simple retry for network errors
apiClient.interceptors.response.use(undefined, async (error) => {
  const config = error.config
  if (!config || config._retryCount >= 3) return Promise.reject(error)

  // Only retry on network errors or 5xx
  const shouldRetry =
    !error.response ||
    (error.response.status >= 500 && error.config.method === 'get')

  if (!shouldRetry) return Promise.reject(error)

  config._retryCount = (config._retryCount ?? 0) + 1
  const delay = Math.min(1000 * 2 ** config._retryCount, 10_000)

  await new Promise(resolve => setTimeout(resolve, delay))
  return apiClient(config)
})

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retryCount?: number
  }
}
```

---

## Request Cancellation

### In Composables

```ts
import { onUnmounted } from 'vue'

export function useUserDetail(id: MaybeRefOrGetter<number>) {
  const user = shallowRef<User | null>(null)
  let controller: AbortController | null = null

  async function fetch() {
    controller?.abort()
    controller = new AbortController()
    try {
      const { data } = await usersApi.getById(toValue(id))
      user.value = data
    } catch (e) {
      if (!axios.isCancel(e)) throw e
    }
  }

  onUnmounted(() => controller?.abort())

  return { user, fetch }
}
```

### In Watchers

```ts
watch(() => toValue(id), async (newId, _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const { data } = await usersApi.getById(newId, controller.signal)
  user.value = data
}, { immediate: true })
```

---

## Repository Pattern (Optional — Large Projects)

For complex domains, wrap API modules in repositories that add caching and state:

```ts
// src/features/users/repositories/userRepository.ts
import { usersApi, type User } from '../api/users'

const cache = new Map<number, { user: User; fetchedAt: number }>()
const CACHE_TTL = 60_000

export const userRepository = {
  async getById(id: number, force = false): Promise<User> {
    const cached = cache.get(id)
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return cached.user
    }
    const { data } = await usersApi.getById(id)
    cache.set(id, { user: data, fetchedAt: Date.now() })
    return data
  },

  invalidate(id: number) {
    cache.delete(id)
  },

  invalidateAll() {
    cache.clear()
  },
}
```

Use the repository pattern when:
- You need client-side caching with TTL.
- Multiple stores/composables access the same entity.
- You want a single place to add offline support or optimistic updates later.
