/**
 * Gemini Nano 适配器 — Chrome 内置 AI（离线推理）
 * 根据探测到的 API 形态选择正确的调用方式
 */

import {
  AI_CAPABILITIES,
  type AICapabilityType,
  getOriginTrialLM,
  type AISession,
} from './api-detector'
import type { AIAdapter, AIOptions } from '../../types'

export class GeminiNanoAdapter implements AIAdapter {
  private capabilityType: AICapabilityType
  private session: AISession | null = null

  constructor(capabilityType: AICapabilityType) {
    this.capabilityType = capabilityType
    this.session = null
  }

  async chat(systemPrompt: string, userMessage: string, options: AIOptions = {}): Promise<string> {
    if (!this.session) {
      this.session = await this.createSession(systemPrompt, options)
    }
    try {
      return await this.session.prompt(userMessage)
    } catch {
      // session 可能过期，重建
      this.destroy()
      this.session = await this.createSession(systemPrompt, options)
      return await this.session.prompt(userMessage)
    }
  }

  private async createSession(systemPrompt: string, options: AIOptions): Promise<AISession> {
    const opts = {
      systemPrompt,
      temperature: options.temperature ?? 0.1,
      topK: 1,
    }

    switch (this.capabilityType) {
      case AI_CAPABILITIES.WINDOW_AI_LM:
        return await window.ai!.languageModel!.create(opts)
      case AI_CAPABILITIES.WINDOW_AI_ASSISTANT:
        return await window.ai!.assistant!.create(opts)
      case AI_CAPABILITIES.ORIGIN_TRIAL: {
        const lm = getOriginTrialLM()
        if (!lm) throw new Error('OriginTrial not available')
        return await lm.create(opts)
      }
      default:
        throw new Error('Unsupported AI capability')
    }
  }

  destroy(): void {
    if (this.session) {
      try {
        this.session.destroy()
      } catch {
        // ignore
      }
      this.session = null
    }
  }
}
