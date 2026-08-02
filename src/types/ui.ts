/**
 * UI 相关类型定义
 */

// ──── 显示模式类型 ────

export type DisplayMode = 'sidepanel' | 'popup'

// ──── 消息类型 ────

export interface MessageLog {
  type: 'user' | 'system' | 'ai' | 'ai-chat' | 'error'
  text: string
}

// ──── 聊天消息类型 ────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

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
  displayMode: DisplayMode
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
