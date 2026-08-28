/**
 * Plan DAG 调度器 — SW 端
 *
 * 接收前端 usePlanRunner 发来的 AIPlan（{ thought, plan: [{id, tool, args, deps, mergedFrom}] }），
 * 按依赖层级并发执行；NEEDS_CONFIRM 阻断后续调度；$ref 占位符解析。
 *
 * 详见 docs/ai-api-architecture.md §5.3。
 */

import { dispatchTool } from './handlers'
import type { AIPlan, PlanItemResult } from '../shared/ai/plan-types'
import type { ExecutionResult } from '../types/execution'

export interface PlanExecutionReport {
  thought: string
  items: PlanItemResult[]
  success: boolean
  needsConfirm?: { itemId: string; detail: Record<string, unknown> }
}

/**
 * 执行 plan：DAG 调度 + 危险拦截 + $ref 解析
 *
 * 流程：
 *   1. 防御：检测重复 item id（任一重复 → 整 plan 标 DUPLICATE_ITEM_ID）
 *   2. DAG 调度循环：每轮取所有"已就绪"项（deps 已完成），Promise.all 并发执行
 *   3. 任何一项返回 NEEDS_CONFIRM → 整 plan 暂停，前端弹卡后 force:true 重发
 *   4. 兜底：未执行的项标 BLOCKED_BY_FAILED_DEP（依赖失败或 confirm 阻断）
 *
 * 注意：并发执行是无序的，无 SW 端事务保证；
 * 若有强顺序需求必须用 deps 字段表达，不要依赖"事件因果"。
 */
export async function executePlan(plan: AIPlan): Promise<PlanExecutionReport> {
  const items = plan.plan ?? []
  if (!items.length) {
    return { thought: plan.thought, items: [], success: true }
  }

  // 1) 重复 id 检测
  const seen = new Set<string>()
  for (const it of items) {
    if (seen.has(it.id)) {
      return failDuplicateItems(plan.thought, items)
    }
    seen.add(it.id)
  }

  // 2) DAG 调度
  const finished = new Map<string, PlanItemResult>()
  let needsConfirm: PlanExecutionReport['needsConfirm']

  while (true) {
    const ready = items.filter(
      (it) =>
        !finished.has(it.id) &&
        it.deps.every((dependencyId) => {
          const dependency = finished.get(dependencyId)
          return dependency !== undefined && dependency.result.success !== false
        }) &&
        !needsConfirm
    )
    if (!ready.length) break

    // 同一层如果包含危险操作，先只执行危险项；确认返回前不允许其它副作用发生。
    const confirmReady = ready.filter((it) => isDangerousTool(it.tool))
    const batch = confirmReady.length > 0 ? [confirmReady[0]] : ready
    const results = await Promise.all(
      batch.map(async (it): Promise<PlanItemResult> => {
        const t0 = Date.now()
        const resolved = resolveRefs(it.args, finished)
        const result = resolved.error
          ? {
              success: false,
              code: resolved.error.code,
              message: resolved.error.message,
              suggestion: resolved.error.suggestion,
            }
          : await dispatchTool(it.tool, resolved.value as Record<string, unknown>)
        return {
          id: it.id,
          tool: it.tool,
          args: it.args,
          mergedFrom: it.mergedFrom,
          result,
          durationMs: Date.now() - t0,
        }
      })
    )

    for (const r of results) finished.set(r.id, r)

    const confirmItem = results.find((r) => r.result.code === 'NEEDS_CONFIRM')
    if (confirmItem) {
      needsConfirm = {
        itemId: confirmItem.id,
        detail: confirmItem.result.detail ?? {},
      }
    }
  }

  // 3) 兜底：未执行项标 BLOCKED_BY_FAILED_DEP
  const blocked: PlanItemResult[] = items
    .filter((it) => !finished.has(it.id))
    .map((it) => ({
      id: it.id,
      tool: it.tool,
      args: it.args,
      mergedFrom: it.mergedFrom,
      result: {
        success: false,
        code: 'BLOCKED_BY_FAILED_DEP',
        message: '依赖项失败或需要确认，整 plan 已暂停',
      },
      durationMs: 0,
    }))

  const all = [...finished.values(), ...blocked]
  const success = !needsConfirm && blocked.length === 0
  return { thought: plan.thought, items: all, success, needsConfirm }
}

interface RefResolution {
  value?: unknown
  error?: { code: 'REF_NOT_FOUND'; message: string; suggestion: string }
}

function isDangerousTool(tool: string): boolean {
  return new Set([
    'tabs_remove',
    'tabs_remove_by_url',
    'bookmarks_remove_node',
    'history_remove',
    'cookies_remove',
    'extensions_remove',
  ]).has(tool)
}

function failDuplicateItems(thought: string, items: AIPlan['plan']): Promise<PlanExecutionReport> {
  const fail = (code: string, message: string): PlanItemResult => ({
    id: '',
    tool: '',
    args: {},
    result: { success: false, code, message } as ExecutionResult,
    durationMs: 0,
  })
  void fail
  const results: PlanItemResult[] = (items ?? []).map((it) => ({
    id: it.id,
    tool: it.tool,
    args: it.args,
    mergedFrom: it.mergedFrom,
    result: {
      success: false,
      code: 'DUPLICATE_ITEM_ID',
      message: '重复的 item id',
    } as ExecutionResult,
    durationMs: 0,
  }))
  return Promise.resolve({ thought, items: results, success: false })
}

/**
 * $ref 占位符解析：把 args 里的 "$ref:pN.field" 替换为 finished[pN].result[field]
 *
 * 只支持 .field 和 [N].field 两种路径，不支持 [?expr] 过滤。
 * 不可解析的路径返回 undefined，让 handler 自行校验参数失败。
 */
function resolveRefs(
  args: Record<string, unknown>,
  finished: Map<string, PlanItemResult>
): RefResolution {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string' || !value.startsWith('$ref:')) {
      out[key] = value
      continue
    }
    const match = value.match(/^\$ref:([a-zA-Z0-9_-]+)\.(.+)$/)
    if (!match) return refError(value, '引用格式无效')
    const dependency = finished.get(match[1])
    if (!dependency) return refError(value, `找不到依赖步骤 ${match[1]}`)
    const resolved = resolvePath(dependency.result, match[2])
    if (resolved === undefined) return refError(value, `找不到引用字段 ${match[2]}`)
    out[key] = resolved
  }
  return { value: out }
}

/** 构造统一的引用错误结果。 */
function refError(reference: string, reason: string): RefResolution {
  return {
    error: {
      code: 'REF_NOT_FOUND',
      message: `${reason}：${reference}`,
      suggestion: '请先执行对应的 observe 工具并确认返回字段和步骤依赖关系',
    },
  }
}

/** 沿 path 解析 result 字段：支持 .field 与 [N].field */
function resolvePath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const seg of path.split('.')) {
    if (cur == null) return undefined
    const index = seg.match(/^(\w+)\[(\d+)\]$/)
    if (index) {
      if (!Array.isArray((cur as Record<string, unknown>)[index[1]])) return undefined
      cur = ((cur as Record<string, unknown[]>)[index[1]] ?? [])[Number(index[2])]
    } else if (Array.isArray(cur) && /^\d+$/.test(seg)) {
      cur = cur[Number(seg)]
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
}
