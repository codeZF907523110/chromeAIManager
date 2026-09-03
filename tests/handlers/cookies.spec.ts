import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as cookies from '../../src/service-worker/handlers/cookies'

const chromeMock = {
  cookies: {
    get: vi.fn(async () => ({
      name: 'sid',
      domain: 'example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      session: true,
      value: 'secret',
    })),
    getAll: vi.fn(async () => [
      {
        name: 'sid',
        domain: 'example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        session: true,
        value: 'secret',
      },
    ]),
    getAllCookieStores: vi.fn(async () => [{ id: '0', tabIds: [1] }]),
    set: vi.fn(async () => ({
      name: 'sid',
      domain: 'example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      session: true,
      value: 'new',
    })),
    remove: vi.fn(async () => ({ name: 'sid' })),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('cookies handlers', () => {
  it('查询单条 cookie 时不应返回 value 字段', async () => {
    const result = await cookies.get({ url: 'https://example.com/', name: 'sid' })
    expect(result.success).toBe(true)
    expect(result.cookie).not.toHaveProperty('value')
  })

  it('批量查询 cookie 时每个都不应包含 value', async () => {
    const result = await cookies.getAll({ domain: 'example.com' })
    result.cookies.forEach((cookie) => expect(cookie).not.toHaveProperty('value'))
  })
})
