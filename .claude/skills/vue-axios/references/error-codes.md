# Axios Error Codes Reference

All `error.code` values and when they appear.

| Code | When it occurs |
|---|---|
| `ERR_BAD_OPTION_VALUE` | Invalid value in axios config |
| `ERR_BAD_OPTION` | Invalid config option key |
| `ECONNABORTED` | Request timed out or aborted by browser/plugin |
| `ETIMEDOUT` | Request timed out (`transitional.clarifyTimeoutError: true` required) |
| `ERR_NETWORK` | Network failure, CORS violation, or mixed content policy |
| `ERR_FR_TOO_MANY_REDIRECTS` | Exceeds `maxRedirects` |
| `ERR_DEPRECATED` | Deprecated axios feature used |
| `ERR_BAD_RESPONSE` | Unparseable response (usually 5xx) |
| `ERR_BAD_REQUEST` | Bad request format (usually 4xx) |
| `ERR_CANCELED` | Canceled via `AbortController` or `CancelToken` |
| `ERR_NOT_SUPPORT` | Feature not available in current environment |
| `ERR_INVALID_URL` | Malformed URL |
| `ERR_FORM_DATA_DEPTH_EXCEEDED` | Object depth > 100 in params/formData serialization |

## Error Narrowing Pattern

```ts
import axios from 'axios'
import type { AxiosError } from 'axios'

function classifyError(error: unknown): 'timeout' | 'network' | 'server' | 'client' | 'unknown' {
  if (!axios.isAxiosError(error)) return 'unknown'

  const { response, code } = error as AxiosError

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'timeout'
  if (code === 'ERR_NETWORK') return 'network'
  if (response) {
    return response.status >= 500 ? 'server' : 'client'
  }
  return 'unknown'
}
```

## Three Error States

```ts
catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      // Server responded with non-2xx status
      // error.response.status, error.response.data
    } else if (error.request) {
      // Request sent but no response received (network down, timeout)
    } else {
      // Request setup failed (bad config, invalid URL)
    }
  }
}
```

## Timeout with ETIMEDOUT

```ts
const api = axios.create({
  timeout: 5_000,
  transitional: { clarifyTimeoutError: true },
})

try {
  await api.get('/slow-endpoint')
} catch (e) {
  if (axios.isAxiosError(e) && e.code === 'ETIMEDOUT') {
    // definitive timeout — not an abort
  }
}
```

## Security: Redacting Sensitive Config from Logs

```ts
apiClient.get('/user', {
  headers: { Authorization: 'Bearer secret' },
  redact: ['authorization'],
}).catch((error) => {
  console.log(error.toJSON().config.headers.Authorization) // [REDACTED ****]
})
```
