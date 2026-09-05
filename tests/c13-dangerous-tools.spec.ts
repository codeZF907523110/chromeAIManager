import { describe, expect, it } from 'vitest'
import { COMMANDS } from '../src/shared/commands'
import { DANGEROUS_TOOLS } from '../src/service-worker/handlers'

/**
 * C13 阶段 6 验收：P2-6 / P3-5 — DANGEROUS_TOOLS 改为从 COMMANDS 动态构建
 *
 * 单源：src/shared/commands.ts 的 dangerous 标记。
 * 推导：handlers/index.ts 的 DANGEROUS_TOOLS = COMMANDS.filter(c => c.dangerous)
 * 收集的别名 = intent + swIntent（去重，过滤 null）。
 *
 * 验收点：
 *   1. 每个 dangerous intent / swIntent 都被纳入 DANGEROUS_TOOLS
 *   2. DANGEROUS_TOOLS 与 COMMANDS.dangerous 的真实差距 = 0
 *   3. RISKY_NAMES（tool-contracts.ts）只剩历史 / downloads 的 SW 内部别名补充
 */

describe('C13 P2-6 DANGEROUS_TOOLS 与 COMMANDS.dangerous 单源对齐', () => {
  it('COMMANDS 中 dangerous=true 的每条 intent 都被纳入 DANGEROUS_TOOLS', () => {
    const dangerousIntents = COMMANDS.filter((c) => c.dangerous).map((c) => c.intent)
    expect(dangerousIntents.length).toBeGreaterThan(0)
    for (const intent of dangerousIntents) {
      expect(DANGEROUS_TOOLS.has(intent), `${intent} 应在 DANGEROUS_TOOLS 中`).toBe(true)
    }
  })

  it('COMMANDS 中 dangerous=true 的每条 swIntent 都被纳入 DANGEROUS_TOOLS', () => {
    const dangerousSwIntents = COMMANDS.filter((c) => c.dangerous && c.swIntent).map(
      (c) => c.swIntent as string
    )
    expect(dangerousSwIntents.length).toBeGreaterThan(0)
    for (const sw of dangerousSwIntents) {
      expect(DANGEROUS_TOOLS.has(sw), `${sw} 应在 DANGEROUS_TOOLS 中`).toBe(true)
    }
  })

  it('DANGEROUS_TOOLS 与 COMMANDS.dangerous 推导结果完全一致', () => {
    const expected = new Set<string>(
      COMMANDS.filter((c) => c.dangerous).flatMap((c) =>
        [c.intent, c.swIntent].filter((name): name is string => Boolean(name))
      )
    )
    expect([...DANGEROUS_TOOLS].sort()).toEqual([...expected].sort())
  })

  it('风险工具覆盖核心"清空 / 删除 / 批量"操作', () => {
    // 这些是用户最关心的危险操作：必须被 DANGEROUS_TOOLS 拦截。
    const MUST_BE_DANGEROUS = [
      'cookies_remove',
      'clear_cookies',
      'history_remove',
      'delete_history',
      'tabs_remove',
      'close_tabs_by_domain',
      'close_duplicate_tabs',
      'close_tabs_by_url',
      'bookmarks_remove_node',
      'remove_bookmark',
      'ungroup_all',
      'notifications_clear',
      'downloads_erase',
      'storage_area_clear',
      'content_settings_clear',
      'browsing_data_remove',
    ]
    for (const intent of MUST_BE_DANGEROUS) {
      expect(DANGEROUS_TOOLS.has(intent), `${intent} 应在 DANGEROUS_TOOLS 中`).toBe(true)
    }
  })

  it('非 dangerous 工具（observe 类）不在 DANGEROUS_TOOLS 中', () => {
    const NON_DANGEROUS = [
      'tabs_observe',
      'tabs_create',
      'tabs_reload',
      'tabs_duplicate',
      'tabs_move',
      'history_search',
      'search_history',
      'cookies_observe',
      'bookmarks_observe_tree',
      'screenshot',
    ]
    for (const intent of NON_DANGEROUS) {
      expect(DANGEROUS_TOOLS.has(intent), `${intent} 不应在 DANGEROUS_TOOLS 中`).toBe(false)
    }
  })
})

describe('C13 P3-5 RISKY_NAMES 收敛（tool-contracts）', () => {
  // P3-5：之前 RISKY_NAMES 与 DANGEROUS_TOOLS 有 16 条重复，已收敛。
  // 这里用源码 + 静态扫描守护：RISKY_NAMES 只剩 4 个内部历史 / 下载别名。
  it('RISKY_NAMES 只剩 history 下载 4 个内部别名', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../src/shared/tool-contracts.ts'), 'utf8')
    expect(src).toMatch(/const RISKY_NAMES = new Set\(\[/)
    expect(src).toMatch(/'history_delete_url'/)
    expect(src).toMatch(/'history_delete_range'/)
    expect(src).toMatch(/'history_delete_all'/)
    expect(src).toMatch(/'downloads_remove_file'/)
    // 不应再包含任何与 DANGEROUS_TOOLS 重复的别名：
    expect(src).not.toMatch(/'cookies_remove'/)
    expect(src).not.toMatch(/'close_duplicate_tabs'/)
    expect(src).not.toMatch(/'bookmarks_remove_node'/)
    expect(src).not.toMatch(/'notifications_clear'/)
    expect(src).not.toMatch(/'storage_area_clear'/)
  })
})
