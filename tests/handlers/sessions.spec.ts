import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as sessions from '../../src/service-worker/handlers/sessions'

const chromeMock = {
  sessions: {
    getRecentlyClosed: vi.fn(async () => [
      { sessionId: 's1', tab: { id: 3, title: 'Closed', url: 'https://example.com?a=secret' } },
    ]),
    getDevices: vi.fn(async () => [
      {
        deviceName: 'Laptop',
        sessions: [{ tab: { title: 'Tab', url: 'https://example.com?q=secret' } }],
      },
    ]),
    restore: vi.fn(async () => ({ sessionId: 's1' })),
  },
  tabs: { get: vi.fn(async (id: number) => ({ id })) },
  windows: { get: vi.fn(async (id: number) => ({ id })) },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('session handlers', () => {
  it('查询最近关闭会话', async () => {
    const result = await sessions.observe({ maxResults: 10 })
    expect(result.sessions[0].sessionId).toBe('s1')
  })
  it('设备 URL 移除 query', async () => {
    const result = await sessions.getDevices()
    expect(result.devices[0].sessions[0].tabs[0].url).toBe('https://example.com/')
  })
  it('恢复前验证会话存在', async () => {
    const result = await sessions.restore({ sessionId: 's1' })
    expect(result.success).toBe(true)
    expect(chromeMock.sessions.restore).toHaveBeenCalledWith('s1')
  })
})
