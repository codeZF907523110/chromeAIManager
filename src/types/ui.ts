/**
 * UI 相关类型定义
 */

// 导入依赖类型
import type { Context } from './context'
import type { MessageLog, ChatMessage } from './ai'
import type { Lesson, PlanTracker } from './context'

// Lesson、PlanTracker 的权威定义在 types/context.ts，此处 re-export 保持单一数据源
export type { Lesson, PlanTracker } from './context'

// ──── Agent 状态类型 ────

export interface AgentState {
  messageLog: MessageLog[]
  commandHistory: string[]
  contextCache: Context | null
  isSettingsOpen: boolean
  activeLoopId: string | null
  conversationMessages: ChatMessage[] | null
  planTracker: PlanTracker | null
  lessons: Lesson[]
  lastScreenshot: string | null
  commandInputValue: string
}

// ──── 设置类型 ────

export interface Settings {
  aiProvider: string
  apiKey: string
  apiEndpoint: string
  modelName: string
}
