/**
 * AI 相关类型定义
 */

// ──── 消息类型 ────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface MessageLog {
  type: 'user' | 'system' | 'ai' | 'ai-chat' | 'error'
  text: string
  image?: string // base64 data URL for screenshots
  video?: string // base64 data URL for recordings
}

// ──── AI 响应类型 ────

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface AIResponse {
  thought?: string
  action: 'exec_tool' | 'execute' | 'done' | 'ask' | 'scan' | 'chat'
  plan?: string
  predict?: string
  toolCall?: ToolCall
  reply?: string
  content?: string
}

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
}

// ──── AI 适配器接口 ────

export interface AIAdapter {
  chat(systemPrompt: string, userMessage: string, options?: AIOptions): Promise<string>
  chatWithMessages?(messages: ChatMessage[], options?: AIOptions): Promise<string>
}
