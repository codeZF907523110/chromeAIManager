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
    const timeout = options.timeout || 60000
    const maxRetries = 1
    let lastError: Error | null = null

    // 权限检查只在首次调用时执行（后续调用不再重复弹窗）
    await this.ensurePermission()

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 合并：超时定时器 + 调用方传入的 AbortSignal
      // 任一触发都会立即中断当前 fetch
      const controller = new AbortController()
      const onAbort = () => controller.abort(new Error('ABORTED'))
      if (options.signal) {
        if (options.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
      const timer = setTimeout(() => controller.abort(new Error('请求超时')), timeout)

      try {
        // 根据 mode 决定默认 temperature：任务执行严格（0.1），纯聊天宽松（1.2）
        const defaultTemp = options.mode === 'chat' ? 1.2 : 0.1
        const body: Record<string, unknown> = {
          model: this.model,
          messages,
          temperature: options.temperature ?? defaultTemp,
          max_tokens: options.maxTokens ?? 4096,
        }

        // 仅在未显式禁用 JSON mode 时启用
        if (options.jsonMode !== false) {
          body.response_format = { type: 'json_object' }
        }

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
          let friendly = `API 请求失败 (${resp.status})`
          try {
            const err = JSON.parse(text)
            friendly = err.error?.message || err.message || friendly
          } catch {
            // plain text fallback
            friendly = `${friendly}: ${text.slice(0, 100)}`
          }
          throw new Error(friendly)
        }

        const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
        return data.choices?.[0]?.message?.content || ''
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        // 超时或权限错误不重试
        const isAbort = e instanceof DOMException && e.name === 'AbortError'
        if (isAbort || lastError.message.includes('权限')) {
          throw lastError
        }
        // 最后一次尝试不再重试
        if (attempt >= maxRetries) throw lastError
        // 短暂延迟后重试
        await new Promise((r) => setTimeout(r, 1000))
      } finally {
        clearTimeout(timer)
        if (options.signal) {
          options.signal.removeEventListener('abort', onAbort)
        }
      }
    }

    throw lastError || new Error('API 调用失败')
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
