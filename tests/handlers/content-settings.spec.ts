import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as contentSettings from '../../src/service-worker/handlers/content-settings'

const chromeMock = {
  contentSettings: {
    get: vi.fn(async () => ({ setting: 'block' })),
    set: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('contentSettings handlers', () => {
  it('拒绝非法 pattern', async () => {
    const result = await contentSettings.get({
      primaryPattern: 'javascript:alert(1)',
      resourceId: 'notifications',
    })
    expect(result.code).toBe('INVALID_PARAMS')
    expect(chromeMock.contentSettings.get).not.toHaveBeenCalled()
  })

  it('拒绝未注册的资源类型', async () => {
    const result = await contentSettings.get({
      primaryPattern: 'https://example.com/*',
      resourceId: 'totallyMade',
    })
    expect(result.code).toBe('INVALID_PARAMS')
  })

  it('通过 get 调用 Chrome API 并返回设置', async () => {
    const result = await contentSettings.get({
      primaryPattern: 'https://example.com/*',
      resourceId: 'notifications',
    })
    expect(result.code).toBeUndefined()
    expect(result.setting).toBe('block')
  })

  it('清除后再读取设置', async () => {
    await contentSettings.clear({
      primaryPattern: 'https://example.com/*',
      resourceId: 'notifications',
    })
    expect(chromeMock.contentSettings.clear).toHaveBeenCalledWith({
      primaryPattern: 'https://example.com/*',
      resourceIdentifier: { id: 'notifications' },
    })
  })
})
