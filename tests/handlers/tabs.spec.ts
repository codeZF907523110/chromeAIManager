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

  it('__preConfirmed=true 时 domain 模式也包含 pinned', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 60, url: 'https://baidu.com/pinned', pinned: true },
      { id: 61, url: 'https://baidu.com/normal', pinned: false },
    ])
    const result = await tabs.remove({ domain: 'baidu.com', __preConfirmed: true })
    expect(result.removed).toBe(2)
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith([60, 61])
  })

  it('未 preConfirmed + 显式 pinned tabId：仍按用户显式选择执行', async () => {
    // 显式 tabIds 是用户精确选择，不被 domain 二次扩展过滤。
    const result = await tabs.remove({ tabIds: [70] })
    expect(result.removed).toBe(1)
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith([70])
  })
})

describe('tabs.removeByUrl', () => {
  it('__preConfirmed=true 时显式 tabIds 包含 pinned 也关闭', async () => {
    chromeMock.tabs.query.mockReset()
    chromeMock.tabs.remove.mockClear()
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 100, url: 'https://example.com/foo', title: 'foo', pinned: true },
      { id: 101, url: 'https://github.com/bar', title: 'bar', pinned: false },
    ])
    const result = await tabs.removeByUrl({
      query: 'github',
      tabIds: [100, 101],
      __preConfirmed: true,
    })
    expect(result.removed).toBe(2)
    expect(chromeMock.tabs.remove).toHaveBeenLastCalledWith([100, 101])
  })

  it('显式 tabIds + 未 preConfirmed：默认跳过 pinned', async () => {
    chromeMock.tabs.query.mockReset()
    chromeMock.tabs.remove.mockClear()
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 110, url: 'https://github.com/a', pinned: true },
      { id: 111, url: 'https://github.com/b', pinned: false },
    ])
    const result = await tabs.removeByUrl({ query: 'github', tabIds: [110, 111] })
    expect(result.removed).toBe(1)
    expect(chromeMock.tabs.remove).toHaveBeenLastCalledWith([111])
  })

  it('query 隐式模式：跳过 pinned', async () => {
    chromeMock.tabs.query.mockReset()
    chromeMock.tabs.remove.mockClear()
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 120, url: 'https://github.com/a', pinned: true },
      { id: 121, url: 'https://github.com/b', pinned: false },
    ])
    const result = await tabs.removeByUrl({ query: 'github' })
    expect(result.removed).toBe(1)
    expect(chromeMock.tabs.remove).toHaveBeenLastCalledWith([121])
  })
})

describe('tabs.groupByDomain', () => {
  it('同窗口同域名重复 tabId 去重', async () => {
    const groups = await import('../../src/service-worker/handlers/tab-groups')
    vi.spyOn(groups, 'query').mockResolvedValue({ success: true, groups: [] } as never)
    const chromeMock2 = {
      tabs: {
        query: vi.fn(async () => [
          { id: 200, url: 'https://github.com/a', windowId: 1 },
          { id: 200, url: 'https://github.com/a', windowId: 1 },
          { id: 201, url: 'https://github.com/b', windowId: 1 },
        ]),
      },
      windows: {
        getLastFocused: vi.fn(async () => ({ id: 1 })),
      },
    }
    vi.stubGlobal('chrome', chromeMock2)
    const result = await tabs.groupByDomain({ allWindows: false })
    expect(result.success).toBe(true)
    const groupArr = (result.groups as Array<{ tabIds: number[] }>).filter(
      (g) => g.tabIds.length >= 1
    )
    // tabId 200 不应该出现两次
    expect(groupArr[0].tabIds.filter((id) => id === 200).length).toBe(1)
  })
})
