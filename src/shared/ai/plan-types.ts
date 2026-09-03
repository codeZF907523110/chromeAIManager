/**
 * AI Plan-First 协议类型定义
 *
 * 替代旧的 AIResponse / ToolCall：AI 单次调用直接返回合法 JSON，SW 端按 DAG 调度执行。
 * 详见 docs/ai-api-architecture.md v3.1。
 */

import type { ExecutionResult } from '../../types/execution'

/** plan 内单项：一项 = 一次 SW handler 调用 */
export interface PlanItem {
  /** plan 内唯一；用于 results 索引、UI 步骤序号 */
  id: string
  /** COMMANDS 注册表中的 sw intent 名 */
  tool: string
  /** 工具参数；由 tool 的 slots 定义校验 */
  args: Record<string, unknown>
  /** 依赖的 item id；deps 全部成功后才执行；空数组 = 顶层可并行 */
  deps: string[]
  /** AI 合并标记：本次调用由哪些用户指令合并而来；仅用于 UI 展示 */
  mergedFrom?: string[]
  /**
   * 半成品 plan 补全时携带的种子结果（来自第一轮 SW report.items）。
   * SW plan-runner 在解析 $ref 时优先使用本字段，跳过对应 deps 的重复执行。
   * 仅在 usePlanRunner.detectAndCompleteHalfPlan 路径下填充；普通 plan 不带此字段。
   */
  seededResults?: Record<string, unknown>
}

/** AI 单次响应（替代旧 AIResponse） */
export interface AIPlan {
  /** 简短思考；不超过 200 字 */
  thought: string
  /** 计划项列表；空数组 = 纯闲聊 */
  plan?: PlanItem[]
  /** 闲聊模式（无工具调用） */
  chat?: { reply: string }
}

/** Plan 单项执行结果（SW → 前端） */
export interface PlanItemResult {
  id: string
  tool: string
  args: Record<string, unknown>
  mergedFrom?: string[]
  result: ExecutionResult
  durationMs: number
}

/** Plan 整体执行报告（SW → 前端） */
export interface PlanExecutionReport {
  thought: string
  items: PlanItemResult[]
  success: boolean
  needsConfirm?: { itemId: string; detail: Record<string, unknown> }
}
