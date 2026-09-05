/**
 * C13 confirm flow test matrix (任务 #67)
 *
 * 覆盖 dispatchTool 危险工具确认闭环的所有分支：
 *   M1 初次调用危险工具 → NEEDS_CONFIRM + 签发 confirmationToken + children 不为 undefined
 *   M2 force:true 无 confirmationToken → CONFIRM_INVALID
 *   M3 force:true + 改原 args（fingerprint mismatch） → CONFIRM_INVALID
 *   M4 force:true + 新增非白名单字段（url/evilField）→ CONFIRM_INVALID
 *   M5 force:true + confirmationToken 一致 → 通过；handler 收到的 args 没有 force/confirmationToken
 *   M6 confirmationToken 重放 → 第二次 CONFIRM_INVALID
 *   M7 tool 名不匹配（拿 A 工具的 token 调用 B） → CONFIRM_INVALID
 *   M8 __preConfirmed:true 单字段不再作为信任旁路（即便加上 force 也必须带有效 token）
 *
 * 测试矩阵基于现有 confirm-token.spec.ts 的 mock 模式，确保 dispatchTool
 * 全链路行为一致；不依赖具体 handler 实现，便于未来切换。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/service-worker/handlers/tabs', () => {
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
    'removeDuplicates',
    'ungroupAll',
    'removeByUrl',
  ]
  for (const name of exportNames) fns[name] = vi.fn(async () => ({ success: true }))
  fns.remove = vi.fn(async (args: Record<string, unknown>) => ({
    success: true,
    removed: ((args.tabIds as number[]) ?? []).length,
    received: args,
  }))
  return fns
})

vi.mock('../src/service-worker/handlers/history', () => {
  return {
    search: vi.fn(async () => ({ success: true })),
    searchMin: vi.fn(async () => ({ success: true })),
    getVisits: vi.fn(async () => ({ success: true })),
    deleteUrl: vi.fn(async () => ({ success: true })),
    deleteRange: vi.fn(async () => ({ success: true })),
    deleteAll: vi.fn(async () => ({ success: true })),
    remove: vi.fn(async (args: Record<string, unknown>) => ({
      success: true,
      received: args,
      deleted: ((args.selectedUrls as string[]) ?? []).length,
    })),
  }
})

vi.mock('../src/service-worker/handlers/cookies', () => {
  return {
    validateDomain: vi.fn(() => null),
    resolveDomain: vi.fn(async () => null),
    get: vi.fn(async () => ({ success: true })),
    getAll: vi.fn(async () => ({ success: true })),
    getAllCookieStores: vi.fn(async () => ({ success: true })),
    set: vi.fn(async () => ({ success: true })),
    observe: vi.fn(async () => ({ success: true })),
    remove: vi.fn(async (args: Record<string, unknown>) => ({
      success: true,
      received: args,
      removed: ((args.selectedNames as string[]) ?? []).length,
    })),
  }
})

vi.mock('../src/service-worker/handlers/bookmarks', () => {
  return {
    observeTree: vi.fn(async () => ({ success: true })),
    get: vi.fn(async () => ({ success: true })),
    getChildren: vi.fn(async () => ({ success: true })),
    getSubTree: vi.fn(async () => ({ success: true })),
    search: vi.fn(async () => ({ success: true })),
    getRecent: vi.fn(async () => ({ success: true })),
    createNode: vi.fn(async () => ({ success: true })),
    updateNode: vi.fn(async () => ({ success: true })),
    moveNode: vi.fn(async () => ({ success: true })),
    removeNode: vi.fn(async (args: Record<string, unknown>) => ({
      success: true,
      received: args,
      removed: ((args.selectedIds as string[]) ?? []).length,
    })),
    openNode: vi.fn(async () => ({ success: true })),
    addCurrentPage: vi.fn(async () => ({ success: true })),
  }
})

const { dispatchTool } = await import('../src/service-worker/handlers')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('C13 dangerous tool confirm flow 矩阵', () => {
  describe('M1 初次调用危险工具 → NEEDS_CONFIRM', () => {
    it('tabs_remove 初次 → NEEDS_CONFIRM + confirmationToken + children', async () => {
      const r = await dispatchTool('tabs_remove', { tabIds: [1, 2] })
      expect(r.success).toBe(false)
      expect(r.code).toBe('NEEDS_CONFIRM')
      expect(r.detail?.confirmationToken).toEqual(expect.any(String))
      expect(r.detail?.tool).toBe('tabs_remove')
    })

    it('history_remove 初次 → NEEDS_CONFIRM + confirmationToken', async () => {
      const r = await dispatchTool('history_remove', { timeRange: 'today' })
      expect(r.code).toBe('NEEDS_CONFIRM')
      expect(r.detail?.confirmationToken).toEqual(expect.any(String))
    })

    it('cookies_remove 初次 → NEEDS_CONFIRM + confirmationToken', async () => {
      const r = await dispatchTool('cookies_remove', { domain: 'example.com' })
      expect(r.code).toBe('NEEDS_CONFIRM')
      expect(r.detail?.confirmationToken).toEqual(expect.any(String))
    })

    it('bookmarks_remove_node 初次 → NEEDS_CONFIRM', async () => {
      const r = await dispatchTool('bookmarks_remove_node', { nodeId: '42' })
      expect(r.code).toBe('NEEDS_CONFIRM')
      expect(r.detail?.confirmationToken).toEqual(expect.any(String))
    })

    it('ungroup_all 初次 → NEEDS_CONFIRM', async () => {
      const r = await dispatchTool('ungroup_all', {})
      expect(r.code).toBe('NEEDS_CONFIRM')
      expect(r.detail?.confirmationToken).toEqual(expect.any(String))
    })
  })

  describe('M2 force:true 无 confirmationToken → CONFIRM_INVALID', () => {
    it('tabs_remove 裸 force → CONFIRM_INVALID', async () => {
      const r = await dispatchTool('tabs_remove', { tabIds: [1, 2], force: true })
      expect(r.success).toBe(false)
      expect(r.code).toBe('CONFIRM_INVALID')
    })

    it('history_remove 裸 force → CONFIRM_INVALID', async () => {
      const r = await dispatchTool('history_remove', { timeRange: 'today', force: true })
      expect(r.code).toBe('CONFIRM_INVALID')
    })

    it('cookies_remove 裸 force → CONFIRM_INVALID', async () => {
      const r = await dispatchTool('cookies_remove', { domain: 'example.com', force: true })
      expect(r.code).toBe('CONFIRM_INVALID')
    })

    it('confirmationToken 非字符串（数字） → CONFIRM_INVALID', async () => {
      const r = await dispatchTool('tabs_remove', {
        tabIds: [1, 2],
        force: true,
        confirmationToken: 123,
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })

    it('confirmationToken 是不存在的字符串 → CONFIRM_INVALID', async () => {
      const r = await dispatchTool('tabs_remove', {
        tabIds: [1, 2],
        force: true,
        confirmationToken: 'never-issued-token',
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })
  })

  describe('M3 fingerprint mismatch → CONFIRM_INVALID', () => {
    it('tabs_remove{domain:baidu.com} 重发改 domain → CONFIRM_INVALID', async () => {
      const first = await dispatchTool('tabs_remove', { domain: 'baidu.com' })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('tabs_remove', {
        domain: 'evil.com',
        tabIds: [10],
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })

    it('history_remove{query:github} 重发改 query → CONFIRM_INVALID', async () => {
      const first = await dispatchTool('history_remove', { query: 'github' })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('history_remove', {
        query: 'facebook',
        selectedUrls: ['https://facebook.com'],
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })

    it('bookmarks_remove_node{nodeId:42} 重发改 nodeId → CONFIRM_INVALID', async () => {
      const first = await dispatchTool('bookmarks_remove_node', { nodeId: '42' })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('bookmarks_remove_node', {
        nodeId: '99',
        selectedIds: ['99'],
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })

    it('cookies_remove{domain:example.com} 重发改 domain → CONFIRM_INVALID', async () => {
      const first = await dispatchTool('cookies_remove', { domain: 'example.com' })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('cookies_remove', {
        domain: 'evil.com',
        selectedNames: ['sid'],
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })

    it('tabs_remove{tabIds:[1,2]} 重发 tabIds 不同 → CONFIRM_INVALID', async () => {
      const first = await dispatchTool('tabs_remove', { tabIds: [1, 2] })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('tabs_remove', {
        tabIds: [9, 10],
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })
  })

  describe('M4 携带非白名单字段的确认回执 → validateToolArgs 先拦截', () => {
    // 注意：dispatchTool 在 validateToolArgs 阶段就会拦截非白名单字段，
    // 这些用例覆盖"即便有合法 confirmationToken，新增字段也会被拒"。
    // 行为不变量：必须返回 INVALID_PARAMS（早于 CONFIRM_INVALID 的失败路径），
    // 或 UNKNOWN_TOOL（工具名不在注册表中）。这正说明 unwhitelisted 字段/未知工具
    // 不可越权。
    it('tabs_remove 重发塞 url 字段 → INVALID_PARAMS', async () => {
      const first = await dispatchTool('tabs_remove', { domain: 'baidu.com' })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('tabs_remove', {
        domain: 'baidu.com',
        tabIds: [10],
        url: 'https://evil.com',
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('INVALID_PARAMS')
      expect(r.success).toBe(false)
    })

    it('close_tabs_by_domain 不是已注册工具 → UNKNOWN_TOOL', async () => {
      const r = await dispatchTool('close_tabs_by_domain', {
        domain: 'baidu.com',
        tabIds: [10],
        selectedUrls: ['https://baidu.com'],
      })
      // close_tabs_by_domain 不在 COMMANDS 注册表（intent/swIntent）中 → UNKNOWN_TOOL。
      expect(r.code).toBe('UNKNOWN_TOOL')
    })

    it('history_remove 重发塞 tabIds（不在白名单）→ INVALID_PARAMS', async () => {
      const first = await dispatchTool('history_remove', { query: 'github' })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('history_remove', {
        query: 'github',
        tabIds: [99],
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('INVALID_PARAMS')
      expect(r.success).toBe(false)
    })

    it('任意未知 evilField → INVALID_PARAMS', async () => {
      const first = await dispatchTool('tabs_remove', { domain: 'baidu.com' })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('tabs_remove', {
        domain: 'baidu.com',
        evilField: 'pwned',
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('INVALID_PARAMS')
      expect(r.success).toBe(false)
    })
  })

  describe('M5 force:true + confirmationToken 一致 → 通过；handler args 已净化', () => {
    it('tabs_remove 完整闭环 → handler 收到纯净 args（无 force/confirmationToken）', async () => {
      const first = await dispatchTool('tabs_remove', { tabIds: [1, 2] })
      const token = first.detail?.confirmationToken as string

      const ok = await dispatchTool('tabs_remove', {
        tabIds: [1, 2],
        force: true,
        confirmationToken: token,
      })
      expect(ok.success).toBe(true)

      const tabsModule = await import('../src/service-worker/handlers/tabs')
      const removeSpy = tabsModule.remove as ReturnType<typeof vi.fn>
      expect(removeSpy).toHaveBeenCalledTimes(1)
      const passedArgs = removeSpy.mock.calls[0][0] as Record<string, unknown>
      expect(passedArgs.tabIds).toEqual([1, 2])
      expect('force' in passedArgs).toBe(false)
      expect('confirmationToken' in passedArgs).toBe(false)
    })

    it('history_remove 闭环 → handler 收到 selectedUrls', async () => {
      const first = await dispatchTool('history_remove', { query: 'github' })
      const token = first.detail?.confirmationToken as string

      const ok = await dispatchTool('history_remove', {
        query: 'github',
        selectedUrls: ['https://github.com/foo'],
        force: true,
        confirmationToken: token,
      })
      expect(ok.success).toBe(true)

      const historyModule = await import('../src/service-worker/handlers/history')
      const removeSpy = historyModule.remove as ReturnType<typeof vi.fn>
      const passedArgs = removeSpy.mock.calls[0][0] as Record<string, unknown>
      expect(passedArgs.selectedUrls).toEqual(['https://github.com/foo'])
      expect('force' in passedArgs).toBe(false)
      expect('confirmationToken' in passedArgs).toBe(false)
    })

    it('cookies_remove 闭环 → handler 收到 selectedNames + domain', async () => {
      const first = await dispatchTool('cookies_remove', { domain: 'example.com' })
      const token = first.detail?.confirmationToken as string

      const ok = await dispatchTool('cookies_remove', {
        domain: 'example.com',
        selectedNames: ['sid'],
        force: true,
        confirmationToken: token,
      })
      expect(ok.success).toBe(true)

      const cookiesModule = await import('../src/service-worker/handlers/cookies')
      const removeSpy = cookiesModule.remove as ReturnType<typeof vi.fn>
      const passedArgs = removeSpy.mock.calls[0][0] as Record<string, unknown>
      expect(passedArgs.selectedNames).toEqual(['sid'])
      expect(passedArgs.domain).toBe('example.com')
      expect('force' in passedArgs).toBe(false)
    })

    it('bookmarks_remove_node 闭环 → handler 收到字符串 selectedIds', async () => {
      const first = await dispatchTool('bookmarks_remove_node', { nodeId: '42' })
      const token = first.detail?.confirmationToken as string

      const ok = await dispatchTool('bookmarks_remove_node', {
        nodeId: '42',
        selectedIds: ['42'],
        force: true,
        confirmationToken: token,
      })
      expect(ok.success).toBe(true)

      const bookmarksModule = await import('../src/service-worker/handlers/bookmarks')
      const removeSpy = bookmarksModule.removeNode as ReturnType<typeof vi.fn>
      const passedArgs = removeSpy.mock.calls[0][0] as Record<string, unknown>
      expect(passedArgs.selectedIds).toEqual(['42'])
      expect(typeof (passedArgs.selectedIds as string[])[0]).toBe('string')
      expect('force' in passedArgs).toBe(false)
      expect('confirmationToken' in passedArgs).toBe(false)
    })
  })

  describe('M6 confirmationToken 重放 → 第二次 CONFIRM_INVALID', () => {
    it('tabs_remove token 第二次消费 → CONFIRM_INVALID', async () => {
      const first = await dispatchTool('tabs_remove', { tabIds: [1, 2] })
      const token = first.detail?.confirmationToken as string

      const first_ = await dispatchTool('tabs_remove', {
        tabIds: [1, 2],
        force: true,
        confirmationToken: token,
      })
      expect(first_.success).toBe(true)

      const replay = await dispatchTool('tabs_remove', {
        tabIds: [1, 2],
        force: true,
        confirmationToken: token,
      })
      expect(replay.code).toBe('CONFIRM_INVALID')
    })

    it('history_remove token 第二次消费 → CONFIRM_INVALID', async () => {
      const first = await dispatchTool('history_remove', { query: 'github' })
      const token = first.detail?.confirmationToken as string

      const first_ = await dispatchTool('history_remove', {
        query: 'github',
        selectedUrls: ['https://github.com/foo'],
        force: true,
        confirmationToken: token,
      })
      expect(first_.success).toBe(true)

      const replay = await dispatchTool('history_remove', {
        query: 'github',
        selectedUrls: ['https://github.com/foo'],
        force: true,
        confirmationToken: token,
      })
      expect(replay.code).toBe('CONFIRM_INVALID')
    })
  })

  describe('M7 tool 名与 token 不匹配 → CONFIRM_INVALID', () => {
    it('tabs_remove 的 token 用于 cookies_remove → CONFIRM_INVALID', async () => {
      const first = await dispatchTool('tabs_remove', { tabIds: [1, 2] })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('cookies_remove', {
        domain: 'example.com',
        selectedNames: ['sid'],
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })

    it('history_remove 的 token 用于 bookmarks_remove_node → CONFIRM_INVALID', async () => {
      const first = await dispatchTool('history_remove', { query: 'github' })
      const token = first.detail?.confirmationToken as string

      const r = await dispatchTool('bookmarks_remove_node', {
        nodeId: '42',
        selectedIds: ['42'],
        force: true,
        confirmationToken: token,
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })
  })

  describe('M8 __preConfirmed 不再作为独立信任旁路', () => {
    it('__preConfirmed:true 单独存在（无 force/token）→ 仍 NEEDS_CONFIRM', async () => {
      const r = await dispatchTool('tabs_remove', {
        tabIds: [1, 2],
        __preConfirmed: true,
      })
      // 没有 force + confirmationToken，必须走二次确认
      expect(r.code).toBe('NEEDS_CONFIRM')
    })

    it('__preConfirmed:true + force:true 但无 token → 仍 CONFIRM_INVALID', async () => {
      const r = await dispatchTool('tabs_remove', {
        tabIds: [1, 2],
        force: true,
        __preConfirmed: true,
      })
      expect(r.code).toBe('CONFIRM_INVALID')
    })
  })
})
