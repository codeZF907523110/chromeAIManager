# Axios Interceptors — Patterns Reference

## Auth Token Injection

```ts
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
```

## Token Refresh (401 Retry)

```ts
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const newToken = await refreshToken()
      original.headers.Authorization = `Bearer ${newToken}`
      return apiClient(original)
    }

    return Promise.reject(error)
  },
)
```

## Request Logging (Dev Only)

```ts
if (import.meta.env.DEV) {
  apiClient.interceptors.request.use((config) => {
    config._startTime = Date.now()
    console.log(`→ ${config.method?.toUpperCase()} ${config.url}`)
    return config
  })

  apiClient.interceptors.response.use((response) => {
    const ms = Date.now() - (response.config._startTime ?? 0)
    console.log(`← ${response.status} ${response.config.url} (${ms}ms)`)
    return response
  })
}
```

## Global Loading Indicator

```ts
import { useLoadingStore } from '@/stores/loading'

let pendingCount = 0

apiClient.interceptors.request.use((config) => {
  if (pendingCount === 0) useLoadingStore().show()
  pendingCount++
  return config
})

apiClient.interceptors.response.use(
  (response) => {
    pendingCount--
    if (pendingCount === 0) useLoadingStore().hide()
    return response
  },
  (error) => {
    pendingCount--
    if (pendingCount === 0) useLoadingStore().hide()
    return Promise.reject(error)
  },
)
```

## Synchronous Interceptor (no microtask delay)

```ts
apiClient.interceptors.request.use(
  (config) => {
    config.headers['X-Custom'] = 'value'
    return config
  },
  null,
  { synchronous: true },
)
```

## Conditional Interceptor (`runWhen`)

```ts
apiClient.interceptors.request.use(
  async (config) => {
    await expensiveAsyncCheck()
    return config
  },
  null,
  { runWhen: (config) => config.method === 'post' },
)
```

## Removing Interceptors

```ts
const id = apiClient.interceptors.request.use(handler)
apiClient.interceptors.request.eject(id)

apiClient.interceptors.request.clear()
apiClient.interceptors.response.clear()
```

## Execution Order

```
Request sent → [Request Interceptor 3] → [Request Interceptor 2] → [Request Interceptor 1] → HTTP
HTTP → [Response Interceptor 1] → [Response Interceptor 2] → [Response Interceptor 3] → caller
```

Request interceptors: **LIFO** (reverse add order).
Response interceptors: **FIFO** (add order).
