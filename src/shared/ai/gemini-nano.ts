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

/**
 * 构造一个 AbortError。用 Error + name='AbortError' 而非 DOMException，
 * 兼容单测环境（Node 16 无 DOMException），同时仍携带 AbortError.name 供上层识别。
 */
function abortError(): Error {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

export class GeminiNanoAdapter implements AIAdapter {
  private capabilityType: AICapabilityType
  private session: AISession | null = null

  constructor(capabilityType: AICapabilityType) {
    this.capabilityType = capabilityType
    this.session = null
  }

  async chat(systemPrompt: string, userMessage: string, options: AIOptions = {}): Promise<string> {
    // C13 P2-10: window.ai.session.prompt 不支持原生 abort，
    // 先检查 signal，并在 prompt 外层 race 一个 AbortError，让上层不用等待模型完成。
    this.throwIfAborted(options.signal)
    if (!this.session) {
      this.session = await this.createSession(systemPrompt, options)
    }
    this.throwIfAborted(options.signal)
    try {
      return await this.promptWithAbort(userMessage, options.signal)
    } catch {
      // 用户主动停止时不能把 AbortError 当作 session 过期而重建重试。
      if (options.signal?.aborted) throw abortError()
      // session 可能过期，重建
      this.destroy()
      this.throwIfAborted(options.signal)
      this.session = await this.createSession(systemPrompt, options)
      return await this.promptWithAbort(userMessage, options.signal)
    }
  }

  /**
   * window.ai 没有 prompt cancel API；Promise race 只中止上层等待，
   * 底层 prompt 仍由 Chrome 完成，但不会再触发重试或后续 plan 渲染。
   */
  private async promptWithAbort(userMessage: string, signal?: AbortSignal): Promise<string> {
    if (!signal) return await this.session!.prompt(userMessage)
    this.throwIfAborted(signal)

    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(abortError())
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      return await Promise.race([this.session!.prompt(userMessage), aborted])
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort)
    }
  }

  private throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
      throw abortError()
    }
  }

  private async createSession(systemPrompt: string, options: AIOptions): Promise<AISession> {
    // 根据 mode 决定默认 temperature：任务执行严格（0.1），纯聊天宽松（1.2）
    const defaultTemp = options.mode === 'chat' ? 1.2 : 0.1
    const opts = {
      systemPrompt,
      temperature: options.temperature ?? defaultTemp,
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
