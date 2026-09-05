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
  tabs: {
    query: vi.fn(async () => [{ id: 9, url: 'https://current.example.com/page' }]),
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

  // B36: 找不到 cookie 必须返回 NOT_FOUND，而不是 success:true + cookie:null。
  it('查询不存在的 cookie 返回 COOKIE_NOT_FOUND (B36)', async () => {
    chromeMock.cookies.get.mockResolvedValueOnce(null)
    const result = await cookies.get({ url: 'https://example.com/', name: 'missing' })
    expect(result.success).toBe(false)
    expect(result.code).toBe('COOKIE_NOT_FOUND')
  })

  // B21: cookies.set 返回 null 时视为失败，不能 success:true。
  it('cookies.set 浏览器拒绝时返回 COOKIE_SET_FAILED (B21)', async () => {
    chromeMock.cookies.set.mockResolvedValueOnce(null)
    const result = await cookies.set({
      url: 'https://example.com/',
      name: 'sid',
      value: 'new',
    })
    expect(result.success).toBe(false)
    expect(result.code).toBe('COOKIE_SET_FAILED')
  })

  // B22: secure=true 时 URL 必须升级为 https，否则协议错配后续 remove 会失败。
  it('cookies.set secure=true 自动把 http URL 升为 https (B22)', async () => {
    chromeMock.cookies.set.mockClear()
    chromeMock.cookies.set.mockResolvedValueOnce({
      name: 'sid',
      domain: 'example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      session: false,
    })
    const result = await cookies.set({
      url: 'http://example.com/',
      name: 'sid',
      value: 'new',
      secure: true,
    })
    expect(result.success).toBe(true)
    const callArgs = chromeMock.cookies.set.mock.calls[0][0]
    expect(callArgs.url).toBe('https://example.com/')
  })

  // P2-9：无 domain 时走当前活动标签的 hostname 兜底。
  it('cookies.remove 无参时取 active tab hostname 作为 domain (P2-9)', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 9, url: 'https://current.example.com/page' },
    ] as never)
    const result = await cookies.remove({})
    expect(result.success).toBe(true)
    expect(result.domain).toBe('current.example.com')
    expect(chromeMock.cookies.remove).toHaveBeenCalledTimes(1)
  })

  it('cookies.remove 无参但无活动标签时返回 INVALID_PARAMS', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([] as never)
    const result = await cookies.remove({})
    expect(result.success).toBe(false)
    expect(result.code).toBe('INVALID_PARAMS')
  })
})
