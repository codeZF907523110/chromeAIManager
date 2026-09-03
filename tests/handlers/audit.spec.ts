import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { summarizeArgsKeys, sanitizeForAudit } from '../../src/service-worker/audit'

describe('audit sanitization', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: { session: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('过滤 cookie/token/password/secret/apiKey/auth 字段', () => {
    const sanitized = sanitizeForAudit({
      url: 'https://example.com',
      password: 'pw',
      apiKey: 'k',
      token: 't',
      safe: 'ok',
    }) as Record<string, unknown>
    expect(sanitized).toEqual({ url: 'https://example.com', safe: 'ok' })
  })

  it('summarizeArgsKeys 不返回敏感键', () => {
    expect(summarizeArgsKeys({ force: true, tabIds: [1], password: 'x', token: 'y' })).toEqual([
      'tabIds',
    ])
  })
})
