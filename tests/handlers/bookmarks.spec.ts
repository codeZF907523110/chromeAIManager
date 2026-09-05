import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as bookmarks from '../../src/service-worker/handlers/bookmarks'

const chromeMock = {
  bookmarks: {
    get: vi.fn(async () => [{ id: '1', title: 'Bookmark', url: 'https://example.com' }]),
    getChildren: vi.fn(async () => [{ id: '2', title: 'Child' }]),
    getSubTree: vi.fn(async () => [{ id: '1', title: 'Folder', children: [] }]),
    search: vi.fn(async () => [{ id: '1', title: 'Bookmark', url: 'https://example.com' }]),
    getRecent: vi.fn(async () => [{ id: '1', title: 'Bookmark', url: 'https://example.com' }]),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('bookmark handlers', () => {
  it('查询单个节点', async () => {
    const result = await bookmarks.get({ nodeId: '1' })
    expect(result.success).toBe(true)
    expect(chromeMock.bookmarks.get).toHaveBeenCalledWith('1')
  })
  it('拒绝数字 nodeId', async () => {
    const result = await bookmarks.get({ nodeId: 1 })
    expect(result.code).toBe('INVALID_PARAMS')
  })
  it('搜索书签', async () => {
    const result = await bookmarks.search({ query: 'example' })
    expect(result.nodes).toHaveLength(1)
  })
  it('限制最近书签数量', async () => {
    const result = await bookmarks.getRecent({ maxResults: 101 })
    expect(result.code).toBe('INVALID_PARAMS')
  })
  it('updateNode 缺 nodeId → INVALID_PARAMS', async () => {
    const result = await bookmarks.updateNode({})
    expect(result.code).toBe('INVALID_PARAMS')
  })
  it('updateNode 同时缺 title 和 url → INVALID_PARAMS', async () => {
    const result = await bookmarks.updateNode({ nodeId: '1' })
    expect(result.code).toBe('INVALID_PARAMS')
  })
  it('updateNode 非法 URL → INVALID_PARAMS', async () => {
    const result = await bookmarks.updateNode({ nodeId: '1', url: 'javascript:alert(1)' })
    expect(result.code).toBe('INVALID_PARAMS')
  })
  it('updateNode 成功返回更新后的节点', async () => {
    chromeMock.bookmarks.update = vi.fn(async () => ({
      id: '1',
      title: 'new',
      url: 'https://example.com',
    })) as never
    const result = await bookmarks.updateNode({ nodeId: '1', title: 'new' })
    expect(result.success).toBe(true)
  })
})
