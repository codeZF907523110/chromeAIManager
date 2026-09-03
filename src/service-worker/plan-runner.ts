/**
 * Plan DAG 调度器 — SW 端
 *
 * 接收前端 usePlanRunner 发来的 AIPlan（{ thought, plan: [{id, tool, args, deps, mergedFrom}] }），
 * 按依赖层级并发执行；NEEDS_CONFIRM 阻断后续调度；$ref 占位符解析。
 *
 * 详见 docs/ai-api-architecture.md §5.3。
 */

import { dispatchTool, DANGEROUS_TOOLS } from './handlers'
import type { AIPlan, PlanItemResult } from '../shared/ai/plan-types'

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
  console.log(`[PlanRunner] enter, thought=${(plan.thought ?? '').slice(0, 80)}`)
  const items = plan.plan ?? []
  if (!items.length) {
    console.log('[PlanRunner] empty plan, return success')
    return { thought: plan.thought, items: [], success: true }
  }
  if (items.length > 50) {
    console.warn(`[PlanRunner] too many items: ${items.length} > 50, abort`)
    return { thought: plan.thought, items: [], success: false }
  }

  // 1) 重复 id 和基本结构检测
  const seen = new Set<string>()
  for (const item of items) {
    if (!item.id || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || seen.has(item.id)) {
      console.warn('[PlanRunner] reject: DUPLICATE_ITEM_ID', {
        id: item.id,
        tool: item.tool,
      })
      return failPlanItems(plan.thought, items, 'DUPLICATE_ITEM_ID', '重复的 item id')
    }
    if (!item.tool || !item.args || !Array.isArray(item.deps)) {
      console.warn('[PlanRunner] reject: INVALID_PLAN (missing tool/args/deps)', {
        id: item.id,
        hasTool: !!item.tool,
        hasArgs: !!item.args,
        depsIsArray: Array.isArray(item.deps),
        argsType: typeof item.args,
        depsType: typeof item.deps,
        itemKeys: Object.keys(item),
        rawItem: JSON.stringify(item)?.slice(0, 500),
      })
      return failPlanItems(plan.thought, items, 'INVALID_PLAN', 'plan item 结构无效')
    }
    if (item.deps.includes(item.id) || new Set(item.deps).size !== item.deps.length) {
      console.warn('[PlanRunner] reject: INVALID_PLAN (self dep or duplicate dep)', {
        id: item.id,
        deps: item.deps,
      })
      return failPlanItems(plan.thought, items, 'INVALID_PLAN', 'deps 不能包含自依赖或重复依赖')
    }
    seen.add(item.id)
  }

  // 在调度前拒绝不存在的依赖，避免非法 DAG 被误报为普通阻断。
  const itemIds = new Set(items.map((item) => item.id))
  for (const item of items) {
    const missingDependency = item.deps.find((dependencyId) => !itemIds.has(dependencyId))
    if (missingDependency) {
      console.warn('[PlanRunner] reject: REF_NOT_FOUND', {
        id: item.id,
        missingDependency,
      })
      return {
        thought: plan.thought,
        items: items.map((candidate) => ({
          id: candidate.id,
          tool: candidate.tool,
          args: candidate.args,
          mergedFrom: candidate.mergedFrom,
          result:
            candidate.id === item.id
              ? {
                  success: false,
                  code: 'REF_NOT_FOUND',
                  message: `找不到依赖步骤 ${missingDependency}`,
                }
              : {
                  success: false,
                  code: 'BLOCKED_BY_FAILED_DEP',
                  message: '依赖项无效，整 plan 未执行',
                },
          durationMs: 0,
        })),
        success: false,
      }
    }
  }

  if (hasDependencyCycle(items)) {
    console.warn('[PlanRunner] reject: BLOCKED_BY_FAILED_DEP (cycle)', {
      items: items.map((it) => ({ id: it.id, deps: it.deps })),
    })
    return failPlanItems(plan.thought, items, 'BLOCKED_BY_FAILED_DEP', 'plan 存在循环依赖')
  }

  // 2) DAG 调度
  const finished = new Map<string, PlanItemResult>()
  let needsConfirm: PlanExecutionReport['needsConfirm']

  // 把第一轮 SW 已执行过的结果（来自 usePlanRunner 的 seededResults）作为种子注入 finished。
  // 这样后续合成 item 的 $ref 可解析，且 deps 等待条件立即满足。
  for (const item of items) {
    const seed = item.seededResults
    if (!seed || typeof seed !== 'object') continue
    for (const [seedId, seedValue] of Object.entries(seed)) {
      if (finished.has(seedId)) continue
      const seedItem = items.find((candidate) => candidate.id === seedId)
      if (!seedItem) continue
      const seedResult =
        (seedValue as { result?: unknown; tool?: string; args?: Record<string, unknown> } | undefined)
          ?.result ?? seedValue
      const seedTool =
        (seedValue as { tool?: string } | undefined)?.tool ?? seedItem.tool
      const seedArgs =
        (seedValue as { args?: Record<string, unknown> } | undefined)?.args ?? seedItem.args
      const execResult =
        seedResult && typeof seedResult === 'object'
          ? (seedResult as PlanItemResult['result'])
          : { success: true, value: seedResult }
      finished.set(seedId, {
        id: seedId,
        tool: seedTool,
        args: seedArgs,
        result: execResult,
        durationMs: 0,
      })
      console.log(`[PlanRunner] seeded dep injected id=${seedId} tool=${seedTool}`)
    }
  }

  let round = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    round++
    const ready = items.filter(
      (it) =>
        !finished.has(it.id) &&
        it.deps.every((dependencyId) => {
          const dependency = finished.get(dependencyId)
          return dependency !== undefined && dependency.result.success !== false
        }) &&
        !needsConfirm
    )
    console.log(
      `[PlanRunner] round ${round}: ready=${ready.map((r) => `${r.id}:${r.tool}`).join(',') || '<none>'}`
    )
    if (!ready.length) break

    // 同一层如果包含危险操作，先只执行危险项；确认返回前不允许其它副作用发生。
    const confirmReady = ready.filter((it) => isDangerousTool(it.tool))
    const batch = confirmReady.length > 0 ? [confirmReady[0]] : ready
    console.log(
      `[PlanRunner] round ${round}: batch=${batch.map((b) => `${b.id}:${b.tool}`).join(',')}`,
      `dangerousFiltered=${confirmReady.length - batch.length}`
    )
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
        console.log(
          `[PlanRunner] dispatch done id=${it.id} tool=${it.tool} args=${JSON.stringify(it.args)}`,
          `result=${JSON.stringify({
            success: result.success !== false,
            code: result.code,
            needsConfirm: result.code === 'NEEDS_CONFIRM',
          })}`,
          `duration=${Date.now() - t0}ms`
        )
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
      console.log(
        `[PlanRunner] NEEDS_CONFIRM hit id=${confirmItem.id} tool=${confirmItem.tool}, plan paused`
      )
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

  const all = items
    .map((item) => finished.get(item.id) ?? blocked.find((candidate) => candidate.id === item.id)!)
    .filter(Boolean)
  const success = !needsConfirm && blocked.length === 0
  console.log(
    `[PlanRunner] done: items=${all.length}, success=${success}, needsConfirm=${!!needsConfirm}, blocked=${blocked.length}`
  )
  return { thought: plan.thought, items: all, success, needsConfirm }
}

interface RefResolution {
  value?: unknown
  error?: { code: 'REF_NOT_FOUND'; message: string; suggestion: string }
}

function hasDependencyCycle(items: NonNullable<AIPlan['plan']>): boolean {
  const graph = new Map(items.map((item) => [item.id, item.deps]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  function visit(id: string): boolean {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of graph.get(id) ?? []) {
      if (visit(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return items.some((item) => visit(item.id))
}
function isDangerousTool(tool: string): boolean {
  return DANGEROUS_TOOLS.has(tool)
}

function failPlanItems(
  thought: string,
  items: NonNullable<AIPlan['plan']>,
  code: string,
  message: string
): Promise<PlanExecutionReport> {
  const results: PlanItemResult[] = (items ?? []).map((item) => ({
    id: item.id,
    tool: item.tool,
    args: item.args,
    mergedFrom: item.mergedFrom,
    result: { success: false, code, message },
    durationMs: 0,
  }))
  console.warn('[PlanRunner] failPlanItems', {
    code,
    message,
    itemCount: results.length,
    items: results.map((item) => ({ id: item.id, tool: item.tool })),
  })
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
  return resolveValue(args, finished)
}

/** 递归解析对象和数组中的安全引用。 */
function resolveValue(value: unknown, finished: Map<string, PlanItemResult>): RefResolution {
  if (typeof value === 'string' && value.startsWith('$ref:')) {
    const match = value.match(/^\$ref:([a-zA-Z0-9_-]+)\.(.+)$/)
    if (!match) return refError(value, '引用格式无效')
    const dependency = finished.get(match[1])
    if (!dependency) return refError(value, `找不到依赖步骤 ${match[1]}`)
    const resolved = resolvePath(dependency.result, match[2])
    return resolved === undefined
      ? refError(value, `找不到引用字段 ${match[2]}`)
      : { value: resolved }
  }
  if (Array.isArray(value)) {
    const result: unknown[] = []
    for (const item of value) {
      const resolved = resolveValue(item, finished)
      if (resolved.error) return resolved
      result.push(resolved.value)
    }
    return { value: result }
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const resolved = resolveValue(item, finished)
      if (resolved.error) return resolved
      result[key] = resolved.value
    }
    return { value: result }
  }
  return { value }
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
