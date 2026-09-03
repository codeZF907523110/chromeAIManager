/**
 * 执行结果相关类型定义
 */

export interface ExecutionResult {
  success: boolean
  code?: string
  message?: string
  suggestion?: string
  data?: unknown
  meta?: {
    api: string
    namespace: string
    durationMs?: number
  }
  error?: string
  result?: unknown
  detail?: Record<string, unknown>
  [key: string]: unknown
}

// ──── 执行命令载荷 ────

export interface ExecuteCommandPayload {
  intent: string
  payload: Record<string, unknown>
}

// ──── Plan-First 协议（re-export 自 shared/ai/plan-types）─────

export type { PlanItemResult, PlanExecutionReport } from '../shared/ai/plan-types'
