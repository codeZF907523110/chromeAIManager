import { describe, it, expect } from 'vitest'

import {
  INTENT_RULES,
  detectHalfPlan,
  extractStepsFromText,
  extractArgs,
  type IntentRule,
} from './intent-rules'
import type { AIPlan } from './plan-types'

// ──── Verb → Intent 表查找 ─────────────────────────────────────────────

describe('INTENT_RULES — verb table lookup', () => {
  function findByIntent(intent: string): IntentRule | undefined {
    return INTENT_RULES.find((r) => r.intent === intent)
  }

  it('covers 18 domains', () => {
    const intents = new Set(INTENT_RULES.map((r) => r.intent))
    expect(intents.size).toBeGreaterThanOrEqual(40)
    // 至少包含这些核心 intent
    expect(intents.has('close_tabs_by_domain')).toBe(true)
    expect(intents.has('mute_tabs_by_domain')).toBe(true)
    expect(intents.has('add_bookmark')).toBe(true)
    expect(intents.has('remove_bookmark')).toBe(true)
    expect(intents.has('clear_cookies')).toBe(true)
    expect(intents.has('browsing_data_remove')).toBe(true)
    expect(intents.has('set_site_permission')).toBe(true)
    expect(intents.has('record_screen')).toBe(true)
    expect(intents.has('screenshot')).toBe(true)
  })

  it('每条规则都有 id / intent / 非空 verbs', () => {
    for (const rule of INTENT_RULES) {
      expect(rule.id).toBeTruthy()
      expect(rule.intent).toBeTruthy()
      expect(rule.verbs.length).toBeGreaterThan(0)
    }
  })

  it('tab-close-by-domain 包含「关闭」动词', () => {
    const rule = findByIntent('close_tabs_by_domain')
    expect(rule?.verbs).toContain('关闭')
  })

  it('cookie-clear 包含「清 cookie」动词', () => {
    const rule = findByIntent('clear_cookies')
    expect(rule?.verbs).toContain('清 cookie')
  })

  it('standalone 步骤（截图、停止录屏）正确标注', () => {
    const screenshot = findByIntent('screenshot')
    expect(screenshot?.standalone).toBe(true)
  })
})

// ──── Connector 多步拆分 ───────────────────────────────────────────────

describe('extractStepsFromText — multi-step connector splitter', () => {
  it('中文单段无 connector', () => {
    expect(extractStepsFromText('关闭 baidu 标签')).toEqual(['关闭 baidu 标签'])
  })

  it('中文 connector 然后', () => {
    expect(extractStepsFromText('关闭 baidu 然后截图')).toEqual(['关闭 baidu', '截图'])
  })

  it('中文多 connector', () => {
    expect(extractStepsFromText('关闭 A 然后关闭 B 接着截图')).toEqual(['关闭 A', '关闭 B', '截图'])
  })

  it('英文 then connector', () => {
    expect(extractStepsFromText('close A then take a screenshot')).toEqual([
      'close A',
      'take a screenshot',
    ])
  })

  it('英文 and then', () => {
    expect(extractStepsFromText('close A and then close B')).toEqual(['close A', 'close B'])
  })

  it('剥离 honorifics（帮我 / 请 / please）', () => {
    expect(extractStepsFromText('帮我关闭 baidu 然后请截图').length).toBeGreaterThanOrEqual(1)
  })

  it('空字符串返回 []', () => {
    expect(extractStepsFromText('')).toEqual([])
  })
})

// ──── 参数抽取 ──────────────────────────────────────────────────────────

describe('extractArgs — argument extraction priority chain', () => {
  const fakeObserve: AIPlan['plan'] = [
    {
      id: 'p1',
      tool: 'tabs_observe',
      args: { domain: 'baidu.com' },
      deps: [],
    },
  ]

  it('从 plan items 的 args.domain 抽取（首选）', () => {
    const result = extractArgs('domain', fakeObserve, '无关文本')
    expect(result).toEqual({ domain: 'baidu.com' })
  })

  it('从 userText URL 正则抽取', () => {
    const result = extractArgs('url', [], '打开 https://github.com')
    expect(result).toEqual({ url: 'https://github.com' })
  })

  it('从 userText domain 正则抽取', () => {
    const result = extractArgs('domain', [], '清 cookie github.com')
    expect(result).toEqual({ domain: 'github.com' })
  })

  it('从 userText 引号抽取', () => {
    const result = extractArgs('title', [], '收藏「Vue 官方文档」')
    expect(result?.title).toBe('Vue 官方文档')
  })

  it('引号 query 抽取', () => {
    const result = extractArgs('query', [], '删除标题包含 "React" 的书签')
    expect(result?.query).toBe('React')
  })

  it('残余文本作为 query', () => {
    const result = extractArgs('query', [], '打开 baidu')
    expect(result?.query).toBeTruthy()
  })

  it('特殊槽位 dataTypes 默认 cache', () => {
    const result = extractArgs('dataTypes', [], '清缓存')
    expect(result).toEqual({ dataTypes: ['cache'] })
  })

  it('特殊槽位 order 默认 domain', () => {
    const result = extractArgs('order', [], '按域名排序')
    expect(result).toEqual({ order: 'domain' })
  })

  it('特殊槽位 state 推断 maximize', () => {
    const result = extractArgs('state', [], '把窗口最大化')
    expect(result).toEqual({ state: 'maximized' })
  })

  it('拿不到参数返回 undefined', () => {
    const result = extractArgs('url', [], '完全无意义的句子')
    expect(result).toBeUndefined()
  })
})

// ──── detectHalfPlan 主逻辑 ─────────────────────────────────────────────

describe('detectHalfPlan — orchestrator', () => {
  const observeOnlyPlan: AIPlan = {
    thought: '查看 baidu 标签',
    plan: [{ id: 'p1', tool: 'tabs_observe', args: { domain: 'baidu.com' }, deps: [] }],
  }

  it('empty plan → completed:false', () => {
    expect(detectHalfPlan({ thought: '', plan: [] }, '关闭 baidu')).toEqual({
      completed: false,
      diagnostics: { reason: 'empty-plan' },
    })
  })

  it('chat-only → completed:false', () => {
    expect(detectHalfPlan({ thought: 'hi', chat: { reply: 'hello' } }, '关闭 baidu')).toEqual({
      completed: false,
      diagnostics: { reason: 'empty-plan' },
    })
  })

  it('plan 已含 mutation → completed:false', () => {
    const result = detectHalfPlan(
      {
        thought: '',
        plan: [
          { id: 'p1', tool: 'tabs_observe', args: {}, deps: [] },
          { id: 'p2', tool: 'tabs_remove', args: { domain: 'baidu.com' }, deps: ['p1'] },
        ],
      },
      '关闭 baidu'
    )
    expect(result.completed).toBe(false)
    expect(result.diagnostics?.reason).toBe('has-mutation')
  })

  it('纯 observe + 命中关闭动词 → completed:true，合成 tabs_remove', () => {
    const result = detectHalfPlan(observeOnlyPlan, '关闭 baidu.com 标签')
    expect(result.completed).toBe(true)
    expect(result.newPlan?.length).toBe(2)
    const synth = result.newPlan?.[1]
    expect(synth?.tool).toBe('close_tabs_by_domain')
    expect((synth?.args as { domain?: string })?.domain).toBe('baidu.com')
    expect(synth?.deps).toEqual(['p1'])
  })

  it('清 cookie + 仅 observe → 合成 clear_cookies', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'cookies_observe', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(plan, '清 cookie github.com')
    expect(result.completed).toBe(true)
    const synth = result.newPlan?.[1]
    expect(synth?.tool).toBe('clear_cookies')
    expect((synth?.args as { domain?: string })?.domain).toBe('github.com')
  })

  it('拿不到必需 domain → completed:false（绝不猜测）', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(plan, '关闭所有标签')
    expect(result.completed).toBe(false)
  })

  it('多步连接词 X 然后 Y → 合成 2 个 mutations', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(plan, '关闭 baidu.com 然后截图')
    expect(result.completed).toBe(true)
    expect(result.newPlan?.length).toBe(3) // observe + close + screenshot
    const tools = result.newPlan?.slice(1).map((it) => it.tool)
    expect(tools).toContain('close_tabs_by_domain')
    expect(tools).toContain('screenshot')
  })

  it('多步链「X 然后 Y 然后 Z」→ 3 个合成', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(plan, '关闭 baidu 然后关闭 youtube 然后打开 github')
    expect(result.completed).toBe(true)
    expect(result.newPlan?.length).toBeGreaterThanOrEqual(4)
  })

  it('idempotency: 二次调用不重复追加', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: [] }],
    }
    const first = detectHalfPlan(plan, '关闭 baidu')
    expect(first.completed).toBe(true)
    // 第二次：传入的 plan 已是 augmented（含 mutation），应 fall through
    const second = detectHalfPlan({ thought: '', plan: first.newPlan ?? [] }, '关闭 baidu')
    expect(second.completed).toBe(false)
  })

  it('合成 items 携带 mergedFrom:[half-plan] 标记', () => {
    const result = detectHalfPlan(observeOnlyPlan, '关闭 baidu')
    const synth = result.newPlan?.[1]
    expect(synth?.mergedFrom).toEqual(['half-plan'])
  })

  it('existingResults 注入 seededResults 字段', () => {
    const existingResults = [
      {
        id: 'p1',
        tool: 'tabs_observe',
        args: {},
        result: { success: true, tabs: [] },
        durationMs: 1,
      },
    ]
    const result = detectHalfPlan(observeOnlyPlan, '关闭 baidu', existingResults)
    const synth = result.newPlan?.[1]
    expect(synth?.seededResults).toBeDefined()
    expect(synth?.seededResults?.p1).toBeDefined()
  })

  it('多步链中若有段无法解析 → 整体 fall through', () => {
    const plan: AIPlan = {
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_observe', args: {}, deps: [] }],
    }
    const result = detectHalfPlan(plan, '关闭 baidu 然后随便聊点什么')
    // 第二段无 verb 命中 → 整链 fall through
    expect(result.completed).toBe(false)
    expect(result.diagnostics?.reason).toBe('multi-step-inconclusive')
  })
})
