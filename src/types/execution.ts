/**
 * 执行结果相关类型定义
 */

// ──── 执行结果类型 ────

export interface ExecutionResult {
  success?: boolean
  code?: string
  message?: string
  error?: string
  result?: unknown
  detail?: Record<string, unknown>
  // 动态属性
  [key: string]: unknown
}

// ──── 执行命令载荷 ────

export interface ExecuteCommandPayload {
  intent: string
  payload: Record<string, unknown>
}
