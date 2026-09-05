import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * browsing-data 测试：
 * - SENSITIVE_TYPES 包括 cookies / history / downloads / passwords — 没有 force 一定 NEEDS_CONFIRM
 * - 数据类型校验 / since / originTypes
 */

const chromeMock = {
  browsingData: {
    remove: vi.fn(async () => undefined),
    settings: vi.fn(async () => ({})),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

import * as browsingData from '../../src/service-worker/handlers/browsing-data'

describe('browsing-data handlers', () => {
  it('cookies 清理属于敏感操作：缺 force → NEEDS_CONFIRM', async () => {
    const result = await browsingData.remove({ dataToRemove: { cookies: true } })
    expect(result.success).toBe(false)
    expect(result.code).toBe('NEEDS_CONFIRM')
  })

  it('history 清理属于敏感操作：缺 force → NEEDS_CONFIRM', async () => {
    const result = await browsingData.remove({ dataToRemove: { history: true } })
    expect(result.success).toBe(false)
    expect(result.code).toBe('NEEDS_CONFIRM')
  })

  it('cookies 清理 + force:true 通过 SENSITIVE_TYPES 检查', async () => {
    const result = await browsingData.remove({
      dataToRemove: { cookies: true },
      force: true,
    })
    expect(result.success).toBe(true)
    expect(chromeMock.browsingData.remove).toHaveBeenCalled()
  })

  it('cache 清理不属于敏感操作：直接通过', async () => {
    const result = await browsingData.remove({ dataToRemove: { cache: true } })
    expect(result.success).toBe(true)
  })
})
