import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as storage from '../../src/service-worker/handlers/storage'

const area = {
  get: vi.fn(async (key?: string) => (key ? { [key]: 'value' } : { theme: 'value' })),
  set: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
}
vi.stubGlobal('chrome', {
  storage: { local: area, session: area, sync: area, managed: { get: area.get } },
})
beforeEach(() => vi.clearAllMocks())

describe('storage handlers', () => {
  it('拒绝读取敏感 key', async () => {
    const result = await storage.areaGet({ area: 'local', key: 'apiKey' })
    expect(result.code).toBe('ACCESS_DENIED')
  })
  it('拒绝读取整个 area', async () => {
    const result = await storage.areaGet({ area: 'local' })
    expect(result.code).toBe('ACCESS_DENIED')
  })
  it('拒绝隐式 area', async () => {
    const result = await storage.areaGet({ key: 'theme' })
    expect(result.code).toBe('INVALID_PARAMS')
  })

  it('managed area 只读', async () => {
    const result = await storage.areaSet({ area: 'managed', key: 'theme', value: 'dark' })
    expect(result.code).toBe('READ_ONLY_AREA')
  })

  it('写入后回读 key', async () => {
    const result = await storage.areaSet({ area: 'local', key: 'theme', value: 'dark' })
    expect(result.success).toBe(true)
    expect(area.set).toHaveBeenCalledWith({ theme: 'dark' })
    expect(area.get).toHaveBeenCalledWith('theme')
  })
  it('Chrome 写入异常时返回 reject', async () => {
    area.set.mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(storage.areaSet({ area: 'local', key: 'theme', value: 'dark' })).rejects.toThrow(
      'storage unavailable'
    )
  })
})
