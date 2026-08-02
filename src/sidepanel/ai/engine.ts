/**
 * AI 引擎 — 自动选择后端（Gemini Nano 优先，OpenAI 降级）
 */

import { detectAICapability, AI_CAPABILITIES } from './api-detector'
import { GeminiNanoAdapter } from './gemini-nano'
import { OpenAIAdapter } from './openai-adapter'
import type { AIAdapter, AIOptions, AIStatus, ChatMessage } from '../../types'

export class AIEngine {
  private backend: AIAdapter | null = null
  private _checked: AIStatus | null = null
  private currentModel: any = null

  /**
   * 设置当前使用的模型
   */
  setModel(model: any): void {
    this.currentModel = model
    this.reset()
  }

  /**
   * 检查可用性，返回 { available, backend, offline, reason? }
   */
  async checkAvailability(): Promise<AIStatus> {
    if (this._checked) return this._checked

    const config = this.currentModel
    if (!config) {
      this._checked = { available: false, reason: '未选择模型' }
      return this._checked
    }

    const cap = await detectAICapability()

    if (
      cap !== AI_CAPABILITIES.NONE &&
      (config.provider === 'auto' || config.provider === 'gemini-nano')
    ) {
      this._checked = { available: true, backend: 'gemini-nano', offline: true }
    } else if (config.apiKey && (config.provider === 'auto' || config.provider === 'openai')) {
      this._checked = { available: true, backend: 'openai', offline: false }
    } else {
      this._checked = {
        available: false,
        reason: !config.apiKey
          ? '请配置 API Key（推荐 DeepSeek V3: https://platform.deepseek.com 申请 key，极便宜），或使用 OpenAI / Ollama'
          : 'AI 服务不可用，请检查配置',
      }
    }
    return this._checked
  }

  async prompt(
    systemPrompt: string,
    userMessage: string,
    options: AIOptions = {}
  ): Promise<string> {
    const backend = await this.getBackend()
    return backend.chat(systemPrompt, userMessage, options)
  }

  /**
   * Agent Loop 专用：传入完整 messages 数组（含历史）
   */
  async chatWithHistory(messages: ChatMessage[], options: AIOptions = {}): Promise<string> {
    const backend = await this.getBackend()
    if (backend.chatWithMessages) {
      return backend.chatWithMessages(messages, options)
    }
    const last = messages[messages.length - 1]
    const system = messages.find((m) => m.role === 'system')?.content || ''
    return backend.chat(system, last.content, options)
  }

  private async getBackend(): Promise<AIAdapter> {
    if (this.backend) return this.backend

    const status = await this.checkAvailability()
    if (!status.available) throw new Error('NO_AI_BACKEND')

    if (status.backend === 'gemini-nano') {
      const cap = await detectAICapability()
      this.backend = new GeminiNanoAdapter(cap)
    } else {
      if (!this.currentModel) throw new Error('NO_MODEL_CONFIGURED')
      this.backend = new OpenAIAdapter({
        apiKey: this.currentModel.apiKey,
        endpoint: this.currentModel.apiEndpoint,
        model: this.currentModel.modelName,
      })
    }
    return this.backend
  }

  reset(): void {
    this.backend = null
    this._checked = null
  }
}
