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
  image?: string // base64 data URL for screenshots
  video?: string // base64 data URL for video preview
  recordingFile?: { url: string; name: string; size?: number; preview?: string } // recording download card
}

// ──── AI 响应类型 ────

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface AIResponse {
  thought?: string
  action:
    | 'browser_snapshot'
    | 'browser_click'
    | 'browser_type'
    | 'browser_select_option'
    | 'browser_hover'
    | 'browser_press_key'
    | 'browser_check'
    | 'browser_uncheck'
    | 'browser_fill_form'
    | 'browser_wait_for'
    | 'browser_take_screenshot'
    | 'browser_navigate'
    | 'browser_navigate_back'
    | 'browser_navigate_forward'
    | 'browser_reload'
    | 'browser_tab_list'
    | 'browser_tab_new'
    | 'browser_tab_select'
    | 'browser_tab_close'
    | 'exec_tool'
    | 'execute'
    | 'done'
    | 'ask'
    | 'scan'
    | 'chat'
    | 'exec_plan'
    | 'askUserResponse'
  args?: Record<string, unknown> // 扁平格式参数（方案 B）
  plan?: string
  predict?: string
  toolCall?: ToolCall // 兼容旧格式
  /**
   * AI 输出消息正文。
   * - string：纯 markdown（被 wrapCatReply 加 cat 人设）
   * - MessageBody：富文本（components 透传到 MessageBubble 挂载；不再加语气）
   *
   * 由 replyType 区分意图（不强制）：'plain' = string；'rich' = MessageBody。
   * 不填时按 reply 运行时类型推断。
   */
  replyType?: 'plain' | 'rich'
  reply?: string | MessageBody
  /** 老兼容字段：纯文本时也常被模型填到 content；统一在调用点收敛 */
  content?: string
  step?: number // 步骤序号
  // exec_plan 相关字段
  intent?: {
    goal: string
    type: string
    requiredData: string[]
    dataStatus: Record<string, string>
    precondition: string
    status: string
    missingDataKeys?: string[]
  }
  steps?: Array<{
    id: number
    goal: string
    action: { name: string; args: Record<string, unknown> }
    type: 'EXECUTE' | 'ASK_USER'
    expectState: string
    fallback?: { description: string; code: string; verify: string }
    userDataKey?: string
    userDataPrompt?: string
  }>
  planStatus?: 'READY' | 'PARTIAL'
  // askUserResponse 相关字段
  userDataKey?: string
  userDataValue?: unknown
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
