/**
 * Gemini Nano 适配器 — Chrome 内置 AI（LanguageModel Prompt API，离线推理）
 */
import type { AIAdapter, AIOptions, ChatMessage } from '../../types'
import { getLanguageModelApi, type AISession } from './api-detector'

export class GeminiNanoAdapter implements AIAdapter {
  private session: AISession | null = null

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

  /**
   * 多轮消息接口：Chrome 内置 AI 只有单轮 prompt()，历史消息扁平化为文本
   * transcript 拼在当前指令前，system 消息仍走会话级 systemPrompt。
   * agent loop（chatWithHistory）依赖此方法，缺失会导致后端不可用。
   *
   * @param messages 完整消息数组（system 置顶，最后一条为当前指令）
   * @param options 调用选项（透传 chat）
   * @returns 模型回复文本
   */
  async chatWithMessages(messages: ChatMessage[], options: AIOptions = {}): Promise<string> {
    const system = messages.find((m) => m.role === 'system')?.content ?? ''
    const rest = messages.filter((m) => m.role !== 'system')
    const last = rest[rest.length - 1]
    const history = rest.slice(0, -1)
    const historyBlock = history.length
      ? '之前的对话（仅供参考的上下文）：\n' +
        history.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n') +
        '\n\n'
      : ''
    return this.chat(system, historyBlock + (last?.content ?? ''), options)
  }

  private async createSession(systemPrompt: string, options: AIOptions): Promise<AISession> {
    // 根据 mode 决定默认 temperature：任务执行严格（0.1），纯聊天宽松（1.0；与 openai 链路一致的上限）
    const defaultTemp = options.mode === 'chat' ? 1.0 : 0.1
    // 标准全局 LanguageModel（Chrome 138+）与 chrome.languageModel（预览版）都经此获取
    const lm = getLanguageModelApi()
    if (!lm) throw new Error('当前浏览器不支持内置 AI（未找到 LanguageModel API，需 Chrome 138+）')
    return await lm.create({
      // systemPrompt 经 initialPrompts 的 system 角色传入（Prompt API 的会话级系统提示）
      initialPrompts: systemPrompt ? [{ role: 'system', content: systemPrompt }] : [],
      temperature: options.temperature ?? defaultTemp,
      topK: 1,
    })
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
