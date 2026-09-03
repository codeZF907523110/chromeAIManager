import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as history from '../../src/service-worker/handlers/history'

const chromeMock = {
  history: {
    search: vi.fn(async () => []),
    getVisits: vi.fn(async () => []),
    deleteUrl: vi.fn(async () => undefined),
    deleteRange: vi.fn(async () => undefined),
    deleteAll: vi.fn(async () => undefined),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('history handlers', () => {
  it('按 timeRange 查询历史', async () => {
    const result = await history.search({
      query: 'example',
      timeRange: 'yesterday',
      maxResults: 10,
    })
    expect(result.success).toBe(true)
    expect(chromeMock.history.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'example', maxResults: 10 })
    )
  })

  it('拒绝非法时间范围', async () => {
    const result = await history.search({ timeRange: 'invalid' })
    expect(result.code).toBe('INVALID_PARAMS')
  })

  it('删除单个 URL', async () => {
    const result = await history.deleteUrl({ url: 'https://example.com/path' })
    expect(result.success).toBe(true)
    expect(chromeMock.history.deleteUrl).toHaveBeenCalledWith('https://example.com/path')
  })

  it('删除全部历史', async () => {
    const result = await history.deleteAll()
    expect(result.success).toBe(true)
    expect(chromeMock.history.deleteAll).toHaveBeenCalledOnce()
  })
})
