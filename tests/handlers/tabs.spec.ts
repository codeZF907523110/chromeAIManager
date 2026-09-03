import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as tabs from '../../src/service-worker/handlers/tabs'

const chromeMock = {
  tabs: {
    get: vi.fn(async (id: number) => ({
      id,
      title: 'Tab',
      url: 'https://example.com',
      windowId: 1,
    })),
    create: vi.fn(async () => ({ id: 2, url: 'https://example.com' })),
    highlight: vi.fn(async () => ({ windowId: 1 })),
    goBack: vi.fn(async () => undefined),
    goForward: vi.fn(async () => undefined),
    captureVisibleTab: vi.fn(async () => 'data:image/png;base64,test'),
    getZoom: vi.fn(async () => 1),
    setZoom: vi.fn(async () => undefined),
    getZoomSettings: vi.fn(async () => ({ mode: 'automatic' })),
    setZoomSettings: vi.fn(async () => undefined),
    query: vi.fn(async () => [{ id: 1, active: true, windowId: 1 }]),
    remove: vi.fn(async () => undefined),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('tabs handlers', () => {
  it('查询单个标签页', async () => {
    const result = await tabs.get({ tabId: 1 })
    expect(result.success).toBe(true)
    expect(chromeMock.tabs.get).toHaveBeenCalledWith(1)
  })
  it('拒绝非法 tabId', async () => {
    const result = await tabs.get({ tabId: '1' })
    expect(result.code).toBe('INVALID_PARAMS')
  })
  it('创建后回读标签页', async () => {
    await tabs.create({ url: 'https://example.com' })
    expect(chromeMock.tabs.get).toHaveBeenCalledWith(2)
  })
  it('设置缩放后回读', async () => {
    const result = await tabs.setZoom({ tabId: 1, zoomFactor: 1.25 })
    expect(result.zoomFactor).toBe(1)
    expect(chromeMock.tabs.setZoom).toHaveBeenCalledWith(1, 1.25)
  })
})

describe('tabs.remove', () => {
  it('domain 模式：匹配并关闭当前窗口的非固定标签', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 10, url: 'https://www.baidu.com/a', pinned: false },
      { id: 11, url: 'https://baidu.com/b', pinned: false },
      { id: 12, url: 'https://map.baidu.com/c', pinned: false },
      { id: 13, url: 'https://example.com', pinned: false },
      { id: 14, url: 'https://baidu.com/pinned', pinned: true },
    ])
    const result = await tabs.remove({ domain: 'baidu.com' })
    expect(result.success).toBe(true)
    expect(result.removed).toBe(3)
    expect(chromeMock.tabs.query).toHaveBeenCalledWith({ currentWindow: true })
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith([10, 11, 12])
  })

  it('tabIds 模式：关闭指定标签，向后兼容', async () => {
    const result = await tabs.remove({ tabIds: [21, 22] })
    expect(result.success).toBe(true)
    expect(result.removed).toBe(2)
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith([21, 22])
    expect(chromeMock.tabs.query).not.toHaveBeenCalled()
  })

  it('tabIds + domain 组合：去重后批量关闭', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 30, url: 'https://baidu.com/a', pinned: false },
      { id: 31, url: 'https://baidu.com/b', pinned: false },
    ])
    const result = await tabs.remove({ tabIds: [30, 99], domain: 'baidu.com' })
    expect(result.success).toBe(true)
    expect(result.removed).toBe(3)
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith([30, 99, 31])
  })

  it('domain 模式：currentWindow=false 跨窗口匹配', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 40, url: 'https://baidu.com/a', pinned: false },
    ])
    await tabs.remove({ domain: 'baidu.com', currentWindow: false })
    expect(chromeMock.tabs.query).toHaveBeenCalledWith({})
  })

  it('domain 模式：无匹配标签时返回 removed=0', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 50, url: 'https://example.com', pinned: false },
    ])
    const result = await tabs.remove({ domain: 'baidu.com' })
    expect(result.success).toBe(true)
    expect(result.removed).toBe(0)
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled()
  })

  it('既无 tabIds 也无 domain：返回空集，不关闭任何标签', async () => {
    const result = await tabs.remove({})
    expect(result.success).toBe(true)
    expect(result.removed).toBe(0)
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled()
  })
})
