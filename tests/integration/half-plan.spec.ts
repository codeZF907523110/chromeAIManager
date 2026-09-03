import { describe, it, expect } from 'vitest'

import { detectHalfPlan } from '../../src/shared/ai/intent-rules'
import type { AIPlan, PlanItemResult } from '../../src/shared/ai/plan-types'

/**
 * 集成测试：模拟 SW 半成品 plan 报告，验证 detectHalfPlan 在 17.x 用例下的行为。
 *
 * 不直接走 SW（避免依赖真实 chrome.*），只验证 plan 层语义。
 */

function fakeObserveResult(id: string, tool: string): PlanItemResult {
  return {
    id,
    tool,
    args: {},
    result: { success: true, value: { tabs: [] } },
    durationMs: 1,
  }
}

describe('half-plan integration — 17.x test cases', () => {
  // 17.1 导航 + 截图合并
  it('17.1 导航+截图合并 — 已有 mutation 不应被覆盖', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [
        { id: 'p1', tool: 'tabs_observe', args: {}, deps: [] },
        { id: 'p2', tool: 'navigate', args: { url: 'https://github.com' }, deps: ['p1'] },
        { id: 'p3', tool: 'screenshot', args: {}, deps: ['p2'] },
      ],
    }
    const result = detectHalfPlan(plan, '打开 GitHub 然后截个图')
    expect(result.completed).toBe(false) // 已完整 → fall through
  })

  // 17.2 清理 + 重置（cookies + reload）— cookies_observe 是 observe-only → 应补全 clear_cookies + reload_tab
  it('17.2 清理+重置 半成品 → 合成 clear_cookies', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'cookies_observe', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(plan, '把今天的 cookie 都清掉然后刷新页面')
    expect(result.completed).toBe(true)
    const tools = result.newPlan?.map((it) => it.tool)
    expect(tools).toContain('clear_cookies')
  })

  // 17.3 多个域名（baidu 和 zhihu）
  it('17.3 多个域名静音 — 半成品 → 至少合成一个 mute', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(plan, '把 baidu.com 和 zhihu.com 的标签都静音了')
    expect(result.completed).toBe(true)
    const mutes = result.newPlan?.filter((it) => it.tool === 'mute_tabs_by_domain')
    expect(mutes?.length).toBeGreaterThanOrEqual(1)
  })

  // 17.4 复合查询（历史 + 搜索）— history_search 是 observe-only，
  // 但「看看我今天访问的所有 github 相关页面」是阅读型历史查询，
  // detectHalfPlan 必须避免合成跳转 GitHub 的 navigate mutation。
  it('17.4 历史+搜索 半成品 → 阅读型历史查询不合成 navigate', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'history_search', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(plan, '看看我今天访问的所有 github 相关页面')
    expect(result.completed).toBe(false)
    expect(result.diagnostics?.reason).toBe('single-segment-no-match')
    // 强化：合成结果里不允许出现 navigate 兜底
    const synthTools = (result.newPlan ?? []).map((it) => it.tool)
    expect(synthTools).not.toContain('navigate')
  })

  // 17.7 三步链
  it('17.7 三步链 半成品 → 合成多个 mutation items', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(
      plan,
      '关掉所有 baidu.com 标签然后关掉 youtube 的最后新开个窗口打开 github'
    )
    expect(result.completed).toBe(true)
    expect(result.newPlan?.length).toBeGreaterThanOrEqual(3) // observe + 3 mutations
  })

  // 18.6 AI 不可用降级 → plan 为空
  it('18.6 plan 为空 → no-op', () => {
    const result = detectHalfPlan({ thought: '', plan: [] }, '清空所有标签')
    expect(result.completed).toBe(false)
    expect(result.diagnostics?.reason).toBe('empty-plan')
  })

  // 18.7 plan 结构非法（缺 deps） → 不在本模块范围，由 usePlanRunner 兜底
  it('18.7 plan items 仍按 observe-only 路径处理', () => {
    const plan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {} /* missing deps */ }],
    } as unknown as AIPlan
    const result = detectHalfPlan(plan, '关闭 baidu')
    // 即便结构非法，仍尝试补全
    expect(result.completed).toBe(true)
  })
})

describe('half-plan integration — seededResults flow', () => {
  it('existingResults →  synth items 携带 seededResults', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: [] }],
    }
    const report = [fakeObserveResult('p1', 'tabs_observe')]
    const result = detectHalfPlan(plan, '关闭 baidu', report)
    expect(result.completed).toBe(true)
    const synth = result.newPlan?.[1]
    expect(synth?.seededResults).toBeDefined()
    expect((synth?.seededResults?.p1 as PlanItemResult).tool).toBe('tabs_observe')
  })

  it('无 existingResults → synth items 不携带 seededResults', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(plan, '关闭 baidu')
    expect(result.completed).toBe(true)
    const synth = result.newPlan?.[1]
    expect(synth?.seededResults).toBeUndefined()
  })
})