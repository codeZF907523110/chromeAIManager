/**
 * 危险操作 confirm token 测试
 *
 * 验证 dispatchTool 在危险 tool + force:true + 缺失 confirmationToken 时返回 CONFIRM_INVALID，
 * 并验证 confirmationToken + 一致的 fingerprint 路径能通过。
 *
 * 覆盖：
 *   - close-duplicates (swIntent: tabs_remove) 走 confirm 闭环
 *   - close-url (swIntent: tabs_remove_by_url) 走 confirm 闭环
 *   - ungroup-all (swIntent: tabs_ungroup_all) 走 confirm 闭环
 *   - clear-history (swIntent: history_remove) 走 confirm 闭环
 *   - clear-cookies (swIntent: cookies_remove) 走 confirm 闭环
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 用代理返回 vi.fn，让 vi.mock 接收真实函数列表的同时不报错：
// dispatchTool 顶层 import * as tabs 会按需访问 mock 上的所有具名 export。
const noop = () => ({ success: true })

vi.mock('../../src/service-worker/handlers/tabs', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {}
  const exportNames = [
    'observe',
    'get',
    'create',
    'reload',
    'duplicate',
    'discard',
    'highlight',
    'goBack',
    'goForward',
    'captureVisibleTab',
    'getZoom',
    'setZoom',
    'getZoomSettings',
    'setZoomSettings',
    'update',
    'move',
    'observeGroups',
    'groupByDomain',
  ]
  for (const name of exportNames) fns[name] = vi.fn(noop)
  // 测试关心的三个 handler：接 args，返回结构化 ExecutionResult
  fns.remove = vi.fn(async (args: Record<string, unknown>) => {
    const ids = (args.tabIds as number[]) ?? []
    return { success: true, removed: ids.length }
  })
  fns.removeByUrl = vi.fn(async (args: Record<string, unknown>) => {
    const ids = (args.tabIds as number[]) ?? []
    return { success: true, removed: ids.length }
  })
  fns.ungroupAll = vi.fn(async (args: Record<string, unknown>) => {
    const ids = (args.tabIds as number[]) ?? []
    return { success: true, ungrouped: ids.length }
  })
  return fns
})

vi.mock('../../src/service-worker/handlers/history', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {
    getTimeRange: vi.fn(() => null),
    search: vi.fn(noop),
    searchMin: vi.fn(noop),
    getVisits: vi.fn(noop),
    deleteUrl: vi.fn(noop),
    deleteRange: vi.fn(noop),
    deleteAll: vi.fn(noop),
    remove: vi.fn(async (args: Record<string, unknown>) => {
      const urls = (args.selectedUrls as string[]) ?? []
      return { success: true, deleted: urls.length }
    }),
  }
  return fns
})

vi.mock('../../src/service-worker/handlers/cookies', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {
    validateDomain: vi.fn(() => null),
    resolveDomain: vi.fn(() => Promise.resolve(null)),
    get: vi.fn(noop),
    getAll: vi.fn(noop),
    getAllCookieStores: vi.fn(noop),
    set: vi.fn(noop),
    observe: vi.fn(noop),
    remove: vi.fn(async (args: Record<string, unknown>) => ({
      success: true,
      removed: 1,
      domain: args.domain,
    })),
  }
  return fns
})

const { dispatchTool, DANGEROUS_TOOLS } = await import('../../src/service-worker/handlers')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dangerous tool confirm token', () => {
  it('close-duplicates 走 NEEDS_CONFIRM 并签发 confirmationToken', async () => {
    const r = await dispatchTool('tabs_remove', { tabIds: [1, 2] })
    expect(r.success).toBe(false)
    expect(r.code).toBe('NEEDS_CONFIRM')
    expect(r.detail?.confirmationToken).toEqual(expect.any(String))
    expect(r.detail?.tool).toBe('tabs_remove')
  })

  it('close-url 走 NEEDS_CONFIRM', async () => {
    // tabs_remove_by_url 的 slots.query 被设为 optional:true，但仍走完整 validateToolArgs；
    // 在真实流程里 slash runner 会先传 query 进入 NEEDS_CONFIRM。这里我们直接走 dispatchTool：
    // 先 mock validateToolArgs 绕过契约缺失（aiHidden 工具 contract 不暴露 query optional），
    // 同时 mock getToolPolicy 绕过 aiHidden 不出 policy 的问题，
    // 验证 DANGEROUS_TOOLS 路径生效。
    const toolContracts = await import('../../src/shared/tool-contracts')
    const spyValidate = vi.spyOn(toolContracts, 'validateToolArgs').mockReturnValue(undefined)
    const spyPolicy = vi.spyOn(toolContracts, 'getToolPolicy').mockReturnValue({
      name: 'tabs_remove_by_url',
      requiredPermissions: [],
      allowedContexts: ['service-worker', 'extension-page'],
      risk: 'L2',
      requiresUserConfirmation: true,
      hostAccess: 'none',
      sensitiveOutput: false,
    })
    try {
      const r = await dispatchTool('tabs_remove_by_url', { query: 'github' })
      expect(r.code).toBe('NEEDS_CONFIRM')
      expect(r.detail?.confirmationToken).toEqual(expect.any(String))
    } finally {
      spyValidate.mockRestore()
      spyPolicy.mockRestore()
    }
  })

  it('ungroup-all 走 NEEDS_CONFIRM', async () => {
    const toolContracts = await import('../../src/shared/tool-contracts')
    const spyValidate = vi.spyOn(toolContracts, 'validateToolArgs').mockReturnValue(undefined)
    const spyPolicy = vi.spyOn(toolContracts, 'getToolPolicy').mockReturnValue({
      name: 'tabs_ungroup_all',
      requiredPermissions: [],
      allowedContexts: ['service-worker', 'extension-page'],
      risk: 'L2',
      requiresUserConfirmation: true,
      hostAccess: 'none',
      sensitiveOutput: false,
    })
    try {
      const r = await dispatchTool('tabs_ungroup_all', {})
      expect(r.code).toBe('NEEDS_CONFIRM')
      expect(r.detail?.confirmationToken).toEqual(expect.any(String))
    } finally {
      spyValidate.mockRestore()
      spyPolicy.mockRestore()
    }
  })

  it('clear-history 走 NEEDS_CONFIRM', async () => {
    const r = await dispatchTool('history_remove', { timeRange: 'today' })
    expect(r.code).toBe('NEEDS_CONFIRM')
    expect(r.detail?.confirmationToken).toEqual(expect.any(String))
  })

  it('clear-cookies 走 NEEDS_CONFIRM', async () => {
    const r = await dispatchTool('cookies_remove', { domain: 'example.com' })
    expect(r.code).toBe('NEEDS_CONFIRM')
    expect(r.detail?.confirmationToken).toEqual(expect.any(String))
  })

  it('force:true 无 confirmationToken → CONFIRM_INVALID', async () => {
    const r = await dispatchTool('tabs_remove', { tabIds: [1, 2], force: true })
    expect(r.success).toBe(false)
    expect(r.code).toBe('CONFIRM_INVALID')
  })

  it('force:true + confirmationToken 一致 → 通过', async () => {
    const first = await dispatchTool('tabs_remove', { tabIds: [1, 2] })
    const token = first.detail?.confirmationToken as string
    expect(typeof token).toBe('string')

    const ok = await dispatchTool('tabs_remove', {
      tabIds: [1, 2],
      force: true,
      confirmationToken: token,
    })
    expect(ok.success).toBe(true)
    expect(ok.removed).toBe(2)
  })

  it('confirmationToken 重放 → 第二次返回 NEEDS_CONFIRM', async () => {
    const first = await dispatchTool('tabs_remove', { tabIds: [1, 2] })
    const token = first.detail?.confirmationToken as string

    const ok = await dispatchTool('tabs_remove', {
      tabIds: [1, 2],
      force: true,
      confirmationToken: token,
    })
    expect(ok.success).toBe(true)

    const replay = await dispatchTool('tabs_remove', {
      tabIds: [1, 2],
      force: true,
      confirmationToken: token,
    })
    expect(replay.code).toBe('CONFIRM_INVALID')
  })

  it('confirmationToken 与参数指纹不一致 → CONFIRM_INVALID', async () => {
    const first = await dispatchTool('tabs_remove', { tabIds: [1, 2] })
    const token = first.detail?.confirmationToken as string

    // 第二次参数被改（tabIds 不同），token 仍存在但 fingerprint 不一致
    const mismatch = await dispatchTool('tabs_remove', {
      tabIds: [9, 10],
      force: true,
      confirmationToken: token,
    })
    expect(mismatch.code).toBe('CONFIRM_INVALID')
  })

  it('DANGEROUS_TOOLS 集合包含 5 个 slash 危险命令对应的 swIntent', () => {
    for (const tool of [
      'tabs_remove',
      'tabs_remove_by_url',
      'tabs_ungroup_all',
      'history_remove',
      'cookies_remove',
    ]) {
      expect(DANGEROUS_TOOLS.has(tool)).toBe(true)
    }
  })
})
