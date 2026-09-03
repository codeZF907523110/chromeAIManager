/**
 * AI 相关类型定义
 */

import type { MessageBody } from './message-block'

// ──── 消息类型 ────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface MessageLog {
  type: 'user' | 'system' | 'ai' | 'ai-chat' | 'error'
  /**
   * 消息正文：纯 markdown 或 markdown + 嵌入组件
   * 见 src/types/message-block.ts
   */
  text: MessageBody
  /**
   * 消息唯一 id。前端生成，用于 IndexedDB 去重与按 id 删除。
   * 第一版始终存在；不持久化的临时消息允许缺失（极少情况，例如来自 recordingExecutor 的纯下载卡）。
   */
  id?: string
  /** 时间戳，用于排序与历史上限裁剪；默认 Date.now()。 */
  createdAt?: number
  image?: string // base64 data URL for screenshots
  video?: string // base64 data URL for video preview
  recordingFile?: { url: string; name: string; size?: number; preview?: string } // recording download card
}

// ──── AI Plan-First 协议（替代旧 AIResponse）─────

export type { AIPlan, PlanItem, PlanItemResult, PlanExecutionReport } from '../shared/ai/plan-types'

// ──── AI 提供商类型 ────

export type AIProvider = 'auto' | 'gemini-nano' | 'openai'

// ──── AI 模型类型 ────

export interface AIModel {
  id: string
  name: string
  provider: AIProvider
  apiKey: string
  apiEndpoint: string
  modelName: string
  isDefault: boolean
  createdAt: number
}

// ──── AI 配置类型（兼容旧版） ────

export interface AIConfig {
  aiProvider: AIProvider
  apiKey: string
  apiEndpoint: string
  modelName: string
}

// ──── AI 状态类型 ────

export interface AIStatus {
  available: boolean
  backend?: 'gemini-nano' | 'openai'
  offline?: boolean
  reason?: string
}

export interface AIOptions {
  temperature?: number
  maxTokens?: number
  timeout?: number
  jsonMode?: boolean
  /** 对话模式：'task' 任务执行（严格），'chat' 纯聊天（宽松） */
  mode?: 'task' | 'chat'
  /** AbortSignal：用于用户点停止时立即中断当前 AI 请求 */
  signal?: AbortSignal
}

// ──── AI 适配器接口 ────

export interface AIAdapter {
  chat(systemPrompt: string, userMessage: string, options?: AIOptions): Promise<string>
  chatWithMessages?(messages: ChatMessage[], options?: AIOptions): Promise<string>
}
