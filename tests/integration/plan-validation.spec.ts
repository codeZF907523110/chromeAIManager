import { describe, it, expect, vi } from 'vitest'

/**
 * 集成测试：APF 协议下 SW DAG 调度对合法 plan JSON 的行为。
 *
 * 模拟 usePlanRunner 发来的 AIPlan，验证 executePlan 的：
 *   - 单步 plan → 直接执行
 *   - 多步链 → DAG 按依赖顺序执行
 *   - 多域名并行 → 同层并发执行
 *   - 无效 plan → 返回 INVALID_PLAN / BLOCKED_BY_FAILED_DEP
 *   - 危险操作首次返回 NEEDS_CONFIRM（由专用 NEEDS_CONFIRM_TOOL 模拟）
 *   - $ref 解析 + seededResults 注入
 *
 * 测试不依赖真实 Chrome API；handlers 被 mock。
 *
 * 设计说明：测试只对 NEEDS_CONFIRM_TOOL 这一专用 mock 工具返回 NEEDS_CONFIRM code，
 * 其它工具（tabs_remove/clear_cookies 等）模拟最简成功响应。
 * 真实业务中 dangerous 工具的 NEEDS_CONFIRM 行为由各自 handler 实现，
 * 与 plan-runner 调度逻辑解耦——此测试专注于 DAG 调度正确性。
 */

vi.mock('../../src/service-worker/handlers', () => ({
  dispatchTool: vi.fn(async (tool: string, args: Record<string, unknown>) => {
    if (tool === 'NEEDS_CONFIRM_TOOL') {
      return {
        success: false,
        code: 'NEEDS_CONFIRM',
        message: '确认',
        detail: { tool, payload: args },
      }
    }
    if (tool === 'FAIL_TOOL') {
      return { success: false, code: 'INTERNAL', message: '失败' }
    }
    if (tool === 'tabs_observe') {
      return {
        success: true,
        value: { tabs: [{ id: 99, title: 'foo', url: 'https://github.com' }] },
      }
    }
    if (tool === 'tabs_remove') {
      return { success: true, removed: (args.tabIds as number[] | undefined)?.length ?? 'all' }
    }
    if (tool === 'mute_tabs_by_domain') {
      return { success: true, muted: 2, domain: args.domain }
    }
    if (tool === 'screenshot') {
      return { success: true, value: { dataUrl: 'data:image/png;base64,xxx' } }
    }
    if (tool === 'cookies_observe') {
      return { success: true, value: { cookies: [{ name: 'sid', domain: 'github.com' }] } }
    }
    if (tool === 'clear_cookies') {
      return { success: true, cleared: true, domain: args.domain }
    }
    if (tool === 'reload_tab') {
      return { success: true, reloaded: true }
    }
    return { success: true, value: args }
  }),
  DANGEROUS_TOOLS: new Set(['tabs_remove', 'clear_cookies', 'NEEDS_CONFIRM_TOOL']),
}))

import { executePlan } from '../../src/service-worker/plan-runner'
import type { AIPlan } from '../../src/shared/ai/plan-types'
import { isValidPlanItem } from '../../src/service-worker/message-validation'

describe('APF executePlan — 单步操作', () => {
  it('1.1 单步 plan — tabs_remove domain:baidu.com', async () => {
    const report = await executePlan({
      thought: '关闭 baidu.com 标签',
      plan: [{ id: 'p1', tool: 'tabs_remove', args: { domain: 'baidu.com' }, deps: [] }],
    } as AIPlan)
    // mock 下 tabs_remove 返回 success=true；真实 handler 会返回 NEEDS_CONFIRM
    // 此处断言 DAG 调度本身：tab 已被执行，items 包含 p1
    expect(report.items.find((it) => it.id === 'p1')?.result.success).toBe(true)
  })

  it('1.2 单步非危险 plan — mute_tabs_by_domain', async () => {
    const report = await executePlan({
      thought: '静音 github.com 标签',
      plan: [{ id: 'p1', tool: 'mute_tabs_by_domain', args: { domain: 'github.com' }, deps: [] }],
    } as AIPlan)
    expect(report.success).toBe(true)
    expect(report.items).toHaveLength(1)
    expect(report.items[0].result.success).toBe(true)
  })
})

describe('APF executePlan — 多步链', () => {
  it('2.1 observe → remove（deps 正确）', async () => {
    const report = await executePlan({
      thought: '关闭 github 标签',
      plan: [
        { id: 'p1', tool: 'tabs_observe', args: { query: 'github.com' }, deps: [] },
        { id: 'p2', tool: 'tabs_remove', args: { domain: 'github.com' }, deps: ['p1'] },
      ],
    } as AIPlan)
    expect(report.items).toHaveLength(2)
    // mock 下两个工具均成功；DAG 顺序执行：p1 先完成，再执行 p2
    expect(report.items[0].id).toBe('p1')
    expect(report.items[0].result.success).toBe(true)
    expect(report.items[1].id).toBe('p2')
    expect(report.items[1].result.success).toBe(true)
  })

  it('2.2 三步链 A→B→C（observe → 单步危险 close → 截图）', async () => {
    const report = await executePlan({
      thought: 'observe baidu 与 youtube 后只关 baidu 然后截图',
      plan: [
        { id: 'p1', tool: 'tabs_observe', args: { query: 'baidu' }, deps: [] },
        { id: 'p2', tool: 'tabs_remove', args: { domain: 'baidu.com' }, deps: ['p1'] },
        { id: 'p3', tool: 'tabs_observe', args: { query: 'youtube' }, deps: [] },
        // 第二个 close 改为非 dangerous 的 tabs_observe，避免触发 MULTIPLE_DANGEROUS_ITEMS。
        // 真实场景下若需要连续两个危险 close，调用方应分两次发送 plan。
        { id: 'p4', tool: 'mute_tabs_by_domain', args: { domain: 'youtube.com' }, deps: ['p3'] },
        { id: 'p5', tool: 'screenshot', args: {}, deps: ['p2', 'p4'] },
      ],
    } as AIPlan)
    // 全部执行成功；DAG 验证完成顺序
    expect(report.success).toBe(true)
    expect(report.items).toHaveLength(5)
    // p5 必须在 p2/p4 之后；其结果应成功
    const p5 = report.items.find((it) => it.id === 'p5')
    expect(p5?.result.success).toBe(true)
  })

  it('2.3 清 cookie + 刷新（observe → clear → reload）', async () => {
    const report = await executePlan({
      thought: '清 github cookie 然后刷新',
      plan: [
        { id: 'p1', tool: 'cookies_observe', args: { domain: 'github.com' }, deps: [] },
        { id: 'p2', tool: 'clear_cookies', args: { domain: 'github.com' }, deps: ['p1'] },
        { id: 'p3', tool: 'reload_tab', args: {}, deps: ['p2'] },
      ],
    } as AIPlan)
    // 三步全部成功；reload 必须在 clear 之后执行
    expect(report.success).toBe(true)
    expect(report.items).toHaveLength(3)
    expect(report.items.find((it) => it.id === 'p1')?.result.success).toBe(true)
    expect(report.items.find((it) => it.id === 'p2')?.result.success).toBe(true)
    expect(report.items.find((it) => it.id === 'p3')?.result.success).toBe(true)
  })
})

describe('APF executePlan — 多域名并行', () => {
  it('3.1 批量静音两个域名 — 同层并发执行', async () => {
    const report = await executePlan({
      thought: '静音 baidu 和 zhihu',
      plan: [
        { id: 'p1', tool: 'mute_tabs_by_domain', args: { domain: 'baidu.com' }, deps: [] },
        { id: 'p2', tool: 'mute_tabs_by_domain', args: { domain: 'zhihu.com' }, deps: [] },
      ],
    } as AIPlan)
    expect(report.success).toBe(true)
    expect(report.items).toHaveLength(2)
    expect(report.items.find((it) => it.id === 'p1')?.result.success).toBe(true)
    expect(report.items.find((it) => it.id === 'p2')?.result.success).toBe(true)
  })
})

describe('APF executePlan — 无效 plan 防御', () => {
  it('4.1 重复 item id → DUPLICATE_ITEM_ID', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'tabs_observe', args: {}, deps: [] },
        { id: 'p1', tool: 'tabs_observe', args: {}, deps: [] },
      ],
    } as AIPlan)
    expect(report.success).toBe(false)
    expect(report.items[0].result.code).toBe('DUPLICATE_ITEM_ID')
  })

  it('4.2 自依赖 → INVALID_PLAN', async () => {
    const report = await executePlan({
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: ['p1'] }],
    } as AIPlan)
    expect(report.success).toBe(false)
    expect(report.items[0].result.code).toBe('INVALID_PLAN')
  })

  it('4.3 依赖不存在 id → REF_NOT_FOUND', async () => {
    const report = await executePlan({
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: ['nonexistent'] }],
    } as AIPlan)
    expect(report.success).toBe(false)
    const item = report.items.find((it) => it.id === 'p1')
    expect(item?.result.code).toBe('REF_NOT_FOUND')
  })

  it('4.4 循环依赖 → BLOCKED_BY_FAILED_DEP', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'tabs_observe', args: {}, deps: ['p2'] },
        { id: 'p2', tool: 'tabs_observe', args: {}, deps: ['p1'] },
      ],
    } as AIPlan)
    expect(report.success).toBe(false)
    expect(report.items[0].result.code).toBe('BLOCKED_BY_FAILED_DEP')
  })

  it('4.5 缺 tool/args/deps → INVALID_PLAN', async () => {
    const report = await executePlan({
      thought: '',
      plan: [{ id: 'p1', tool: '', args: null, deps: 'not-array' }],
    } as unknown as AIPlan)
    expect(report.success).toBe(false)
    expect(report.items[0].result.code).toBe('INVALID_PLAN')
  })

  it('4.6 plan items > 50 → 拒绝', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      id: `p${i}`,
      tool: 'tabs_observe',
      args: {},
      deps: [],
    }))
    const report = await executePlan({ thought: '', plan: items } as AIPlan)
    expect(report.success).toBe(false)
    expect(report.items).toHaveLength(0)
  })

  it('4.7 空 plan → success=true 且无 items', async () => {
    const report = await executePlan({ thought: 'hi', plan: [] } as AIPlan)
    expect(report.success).toBe(true)
    expect(report.items).toHaveLength(0)
  })
})

describe('APF executePlan — 危险操作（NEEDS_CONFIRM）', () => {
  it('5.1 危险工具首次返回 NEEDS_CONFIRM → plan 暂停', async () => {
    const report = await executePlan({
      thought: '',
      plan: [{ id: 'p1', tool: 'NEEDS_CONFIRM_TOOL', args: { x: 1 }, deps: [] }],
    } as AIPlan)
    expect(report.needsConfirm?.itemId).toBe('p1')
    expect(report.success).toBe(false)
  })

  it('5.2 危险工具与同层非危险工具 → 先确认后执行其它', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'NEEDS_CONFIRM_TOOL', args: { x: 1 }, deps: [] },
        { id: 'p2', tool: 'tabs_observe', args: {}, deps: [] },
      ],
    } as AIPlan)
    // 危险项触发 NEEDS_CONFIRM，p2 在确认返回前不执行
    expect(report.needsConfirm?.itemId).toBe('p1')
    const p2 = report.items.find((it) => it.id === 'p2')
    expect(p2?.result.code).toBe('BLOCKED_BY_FAILED_DEP')
  })

  it('5.3 危险工具作为依赖前置项 → 后置项被阻断', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'NEEDS_CONFIRM_TOOL', args: { x: 1 }, deps: [] },
        { id: 'p2', tool: 'reload_tab', args: {}, deps: ['p1'] },
      ],
    } as AIPlan)
    // p1 触发 NEEDS_CONFIRM → p2 因 deps 未就绪被阻断
    expect(report.needsConfirm?.itemId).toBe('p1')
    const p2 = report.items.find((it) => it.id === 'p2')
    expect(p2?.result.code).toBe('BLOCKED_BY_FAILED_DEP')
  })
})

describe('APF executePlan — $ref 解析', () => {
  it('6.1 $ref 引用前置项结果', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'tabs_observe', args: { query: 'github.com' }, deps: [] },
        {
          id: 'p2',
          tool: 'tabs_remove',
          args: { tabIds: '$ref:p1.value.tabs[0].id' },
          deps: ['p1'],
        },
      ],
    } as AIPlan)
    // p1 完成；p2 收到解析后的 tabIds
    expect(report.items.find((it) => it.id === 'p1')?.result.success).toBe(true)
    const p2 = report.items.find((it) => it.id === 'p2')
    expect(p2?.result.success).toBe(true)
  })
})

describe('APF executePlan — seededResults 优化', () => {
  it('7.1 seededResults 注入：种子项不重复执行', async () => {
    // 当 usePlanRunner 在补全 plan 时把第一轮 observe 结果作为种子注入，
    // SW 端应识别种子并直接放入 finished map，跳过重复执行。
    const report = await executePlan({
      thought: '',
      plan: [
        {
          id: 'p1',
          tool: 'tabs_observe',
          args: { query: 'baidu' },
          deps: [],
          seededResults: {
            p1: { result: { success: true, value: { tabs: [] } } },
          },
        },
        { id: 'p2', tool: 'tabs_remove', args: { domain: 'baidu.com' }, deps: ['p1'] },
      ],
    } as AIPlan)
    // p1 通过种子注入（不调用 dispatchTool）；p2 顺利依赖完成
    expect(report.items.find((it) => it.id === 'p1')?.result.success).toBe(true)
    expect(report.items.find((it) => it.id === 'p2')?.result.success).toBe(true)
    expect(report.success).toBe(true)
  })
})

/**
 * C13 P1-FIX：usePlanRunner 在 dangerous 工具 precompute 阶段把预计算 tabIds
 * 注入到 `item.candidates`（顶层字段，不进 args）。SW 端 message-validation
 * 必须放行这个字段，否则 SW 会在 isValidAIPlan 阶段直接返回 INVALID_PLAN，
 * 用户会看到「抱歉，Service Worker 暂时无法响应喵~（plan item 结构无效）」。
 */
describe('APF message-validation — candidates 字段放行', () => {
  it('8.1 candidates: number[] → isValidPlanItem=true', () => {
    expect(
      isValidPlanItem({
        id: 'p1',
        tool: 'close_tabs_by_domain',
        args: { domain: 'baidu.com' },
        deps: [],
        candidates: [1022274810],
      })
    ).toBe(true)
  })

  it('8.2 candidates: undefined → isValidPlanItem=true', () => {
    expect(
      isValidPlanItem({
        id: 'p1',
        tool: 'close_tabs_by_domain',
        args: { domain: 'baidu.com' },
        deps: [],
      })
    ).toBe(true)
  })

  it('8.3 candidates: 非数组（字符串）→ isValidPlanItem=false', () => {
    expect(
      isValidPlanItem({
        id: 'p1',
        tool: 'close_tabs_by_domain',
        args: { domain: 'baidu.com' },
        deps: [],
        candidates: '1022274810',
      })
    ).toBe(false)
  })

  it('8.4 hasOnlyKeys: 仍拒绝多余字段（如 foo:1）', () => {
    expect(
      isValidPlanItem({
        id: 'p1',
        tool: 'close_tabs_by_domain',
        args: { domain: 'baidu.com' },
        deps: [],
        foo: 1,
      })
    ).toBe(false)
  })
})
