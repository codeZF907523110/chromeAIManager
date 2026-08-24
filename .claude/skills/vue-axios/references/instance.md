# axios.create() — Config Reference

Full config options for `axios.create()`. All fields are optional.

```ts
import axios from 'axios'

const api = axios.create({
  // Base URL — prepended to all relative request URLs
  baseURL: 'https://api.example.com/v1',

  // Abort after N milliseconds — ALWAYS set in production
  timeout: 10_000,

  // Default headers for all requests
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },

  // Default query params sent with every request
  params: {
    api_version: '2',
  },

  // Only treat responses as successful if validateStatus returns true
  // Default: status >= 200 && status < 300
  validateStatus: (status) => status < 500,

  // Max redirects to follow (Node.js only; 0 = no redirects)
  maxRedirects: 5,

  // Max response body size in bytes (Node.js only)
  maxContentLength: 5 * 1024 * 1024, // 5 MB

  // Timeout clarification: receive ETIMEDOUT instead of ECONNABORTED on timeout
  transitional: {
    clarifyTimeoutError: true,
  },

  // Decompress gzip/deflate automatically (Node.js only; ignored in browser)
  decompress: true,
})
```

## Config Precedence

Lower number = lower priority (overridden by higher):

1. Library defaults (e.g. `timeout: 0`)
2. Instance defaults set via `axios.create(config)`
3. Instance defaults mutated via `instance.defaults.timeout = 2500`
4. Per-request config passed to `instance.get(url, config)`

## Mutating Instance Defaults After Creation

```ts
api.defaults.headers.common['Authorization'] = `Bearer ${token}`
api.defaults.timeout = 5_000
```

## Response Schema

Every resolved response has this shape:

```ts
import type { AxiosResponse, AxiosResponseHeaders } from 'axios'

interface AxiosResponse<T = unknown> {
  data: T
  status: number
  statusText: string
  headers: AxiosResponseHeaders
  config: InternalAxiosRequestConfig
  request: XMLHttpRequest | ClientRequest
}
```
