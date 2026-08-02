/**
 * OpenAI 兼容 API 适配器
 * 支持 OpenAI / DeepSeek / Ollama / LM Studio / OpenRouter 等兼容 /v1/chat/completions 的服务
 */

import type { AIAdapter, AIOptions, ChatMessage } from '../../types'

export interface OpenAIAdapterConfig {
  apiKey: string
  endpoint: string
  model: string
}

export class OpenAIAdapter implements AIAdapter {
  private apiKey: string
  private endpoint: string
  private model: string

  constructor(config: OpenAIAdapterConfig) {
    this.apiKey = config.apiKey
    this.endpoint = config.endpoint.replace(/\/+$/, '')
    this.model = config.model
  }

  async chat(_systemPrompt: string, userMessage: string, options: AIOptions = {}): Promise<string> {
    return this.call([{ role: 'user', content: userMessage }], options)
  }

  async chatWithMessages(messages: ChatMessage[], options: AIOptions = {}): Promise<string> {
    return this.call(messages, options)
  }

  private async call(messages: ChatMessage[], options: AIOptions = {}): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeout || 60000)

    try {
      await this.ensurePermission()

      const body: Record<string, unknown> = {
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? 4096,
      }

      // 启用 JSON mode 确保输出纯 JSON
      body.response_format = { type: 'json_object' }

      const resp = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`)
      }

      const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
      return data.choices?.[0]?.message?.content || ''
    } finally {
      clearTimeout(timeout)
    }
  }

  private async ensurePermission(): Promise<void> {
    const origin = new URL(this.endpoint).origin
    const ok = await chrome.permissions.contains({ origins: [`${origin}/*`] })
    if (!ok) {
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
      if (!granted) throw new Error(`需要 ${origin} 的访问权限`)
    }
  }
}
