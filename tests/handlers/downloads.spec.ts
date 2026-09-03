import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as downloads from '../../src/service-worker/handlers/downloads'

const chromeMock = {
  downloads: {
    download: vi.fn(async () => 1),
    search: vi.fn(async () => [{ id: 1, state: 'in_progress', paused: false }]),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    open: vi.fn(async () => undefined),
    erase: vi.fn(async () => 1),
    removeFile: vi.fn(async () => undefined),
    show: vi.fn(async () => undefined),
  },
}
vi.stubGlobal('chrome', chromeMock)

beforeEach(() => vi.clearAllMocks())

describe('downloads handlers', () => {
  it('拒绝不安全 filename', async () => {
    const result = await downloads.download({
      url: 'https://example.com/file',
      filename: '../file',
    })
    expect(result.code).toBe('INVALID_PARAMS')
    expect(chromeMock.downloads.download).not.toHaveBeenCalled()
  })

  it('暂停任务前检查目标并回读状态', async () => {
    const result = await downloads.pause({ downloadId: 1 })
    expect(result.success).toBe(true)
    expect(chromeMock.downloads.pause).toHaveBeenCalledWith(1)
    expect(chromeMock.downloads.search).toHaveBeenCalled()
  })
})
