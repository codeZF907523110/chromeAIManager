/**
 * UI 相关类型定义
 */

// 注意：MessageLog 的权威定义在 types/ai.ts，此文件仅为备份，请以 ai.ts 为准

// ──── 历史记录类型 ────

export interface Lesson {
  domain: string
  userInput: string
  intent: string
  error: string
  timestamp: number
}

// ──── 计划追踪类型 ────

export interface PlanTracker {
  goal: string
  currentPlan: string
  steps: {
    step: number
    thought: string
    intent: string
    result: string
    status: 'ok' | 'failed'
  }[]
}

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

// 导入 Context 类型
import type { Context } from './context'
import type { MessageLog, ChatMessage } from './ai'
