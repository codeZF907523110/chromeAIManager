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

  it('timeRange=all + query：只删匹配 query 的历史（不再吞掉 query）', async () => {
    chromeMock.history.search.mockResolvedValueOnce([
      { url: 'https://example.com/foo' },
      { url: 'https://example.com/bar' },
    ] as never)
    const result = await history.remove({ timeRange: 'all', query: 'example' })
    expect(result.success).toBe(true)
    expect(result.deleted).toBe(2)
    expect(chromeMock.history.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'example', startTime: 0 })
    )
    expect(chromeMock.history.deleteUrl).toHaveBeenCalledTimes(2)
    expect(chromeMock.history.deleteAll).not.toHaveBeenCalled()
  })

  it('timeRange=all + 无 query：全删', async () => {
    const result = await history.remove({ timeRange: 'all' })
    expect(result.success).toBe(true)
    expect(chromeMock.history.deleteAll).toHaveBeenCalledOnce()
  })

  it('timeRange=today + query：只删今天匹配 query 的历史', async () => {
    chromeMock.history.search.mockResolvedValueOnce([{ url: 'https://github.com/x' }] as never)
    const result = await history.remove({ timeRange: 'today', query: 'github' })
    expect(result.success).toBe(true)
    expect(result.deleted).toBe(1)
    expect(chromeMock.history.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'github' })
    )
  })
})
