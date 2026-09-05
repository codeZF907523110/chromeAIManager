import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as bookmarks from '../../src/service-worker/handlers/bookmarks'

const chromeMock = {
  bookmarks: {
    get: vi.fn(async () => [{ id: '1', title: 'Bookmark', url: 'https://example.com' }]),
    getChildren: vi.fn(async () => [{ id: '2', title: 'Child' }]),
    getSubTree: vi.fn(async () => [{ id: '1', title: 'Folder', children: [] }]),
    search: vi.fn(async () => [{ id: '1', title: 'Bookmark', url: 'https://example.com' }]),
    getRecent: vi.fn(async () => [{ id: '1', title: 'Bookmark', url: 'https://example.com' }]),
    getTree: vi.fn(async () => [
      { id: '0', title: '', children: [{ id: '1', title: 'root-child', children: [] }] },
    ]),
    remove: vi.fn(async () => {}),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('bookmark handlers — C10 B20', () => {
  it('observeTree 接受 maxDepth=0', async () => {
    const result = await bookmarks.observeTree({ maxDepth: 0 })
    expect(result.success).toBe(true)
  })

  it('observeTree 接受 maxResults=0', async () => {
    const result = await bookmarks.observeTree({ maxResults: 0 })
    expect(result.success).toBe(true)
    expect(result.observed).toBe(0)
  })

  it('observeTree 拒绝非整数 maxDepth', async () => {
    const result = await bookmarks.observeTree({ maxDepth: 1.5 })
    expect(result.code).toBe('INVALID_PARAMS')
  })

  it('observeTree 拒绝负数 maxResults', async () => {
    const result = await bookmarks.observeTree({ maxResults: -1 })
    expect(result.code).toBe('INVALID_PARAMS')
  })
})

describe('bookmark handlers — C10 B35', () => {
  it('removeNode query 模式只删书签不删文件夹', async () => {
    // search 返回混合：1 个书签 + 1 个文件夹（无 url）
    chromeMock.bookmarks.search.mockResolvedValueOnce([
      { id: 'b1', title: 'foo', url: 'https://example.com' },
      { id: 'f1', title: 'foo-folder', url: undefined },
    ] as never)
    const result = await bookmarks.removeNode({ query: 'foo' })
    expect(result.success).toBe(true)
    expect(result.removed).toBe(1)
    expect(chromeMock.bookmarks.remove).toHaveBeenCalledTimes(1)
    expect(chromeMock.bookmarks.remove).toHaveBeenCalledWith('b1')
  })
})
