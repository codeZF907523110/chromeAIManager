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
    const callStart = Date.now()
    const timeout = options.timeout || 60000
    const maxRetries = 1
    let lastError: Error | null = null

    console.log('[AI-debug] OpenAIAdapter.call start', {
      model: this.model,
      endpoint: this.endpoint,
      timeout,
      maxRetries,
      msgCount: messages.length,
      hasSignal: !!options.signal,
    })

    // 权限检查只在首次调用时执行（后续调用不再重复弹窗）
    const permStart = Date.now()
    try {
      await this.ensurePermission()
      console.log('[AI-debug] ensurePermission ok', { elapsedMs: Date.now() - permStart })
    } catch (e) {
      console.log('[AI-debug] ensurePermission FAILED', {
        elapsedMs: Date.now() - permStart,
        error: e instanceof Error ? e.message : String(e),
      })
      throw e
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptStart = Date.now()
      console.log(`[AI-debug] attempt ${attempt}/${maxRetries} start`, { timeout })
      // 合并：超时定时器 + 调用方传入的 AbortSignal
      // 任一触发都会立即中断当前 fetch
      const controller = new AbortController()
      const onAbort = () => controller.abort(new Error('ABORTED'))
      if (options.signal) {
        if (options.signal.aborted) {
          console.log('[AI-debug] call aborted before fetch (signal already aborted)')
          throw new DOMException('Aborted', 'AbortError')
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
      const timer = setTimeout(
        () => controller.abort(new Error('请求超时')),
        timeout
      )

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

        const fetchStart = Date.now()
        console.log('[AI-debug] fetch start', { attempt, url: `${this.endpoint}/chat/completions` })
        const resp = await fetch(`${this.endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        console.log('[AI-debug] fetch response received', {
          attempt,
          status: resp.status,
          ok: resp.ok,
          elapsedMs: Date.now() - fetchStart,
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

        const data = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
        }
        const choice = data.choices?.[0]
        // 截断检测：finish_reason=length 表示输出超 max_tokens 被截断，
        // 返回的 content 大概率是不完整 JSON。打日志便于排查，上层 repairJSON 会尝试截断恢复。
        if (choice?.finish_reason === 'length') {
          console.warn('[AI] 输出被 max_tokens 截断 (finish_reason=length)，上层将尝试精简重试')
        }
        console.log('[AI-debug] call SUCCESS', {
          totalElapsedMs: Date.now() - callStart,
          attempt,
          finishReason: choice?.finish_reason,
          contentLen: choice?.message?.content?.length ?? 0,
        })
        return choice?.message?.content || ''
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        const isAbort = e instanceof DOMException && e.name === 'AbortError'
        console.log('[AI-debug] attempt FAILED', {
          attempt,
          elapsedMs: Date.now() - attemptStart,
          isAbort,
          message: lastError.message,
          willRetry: !isAbort && !lastError.message.includes('权限') && attempt < maxRetries,
        })
        // 超时或权限错误不重试
        if (isAbort || lastError.message.includes('权限')) {
          console.log('[AI-debug] call FINAL FAIL (no retry)', {
            totalElapsedMs: Date.now() - callStart,
            reason: isAbort ? 'AbortError' : 'permission',
            message: lastError.message,
          })
          throw lastError
        }
        // 最后一次尝试不再重试
        if (attempt >= maxRetries) {
          console.log('[AI-debug] call FINAL FAIL (retries exhausted)', {
            totalElapsedMs: Date.now() - callStart,
            message: lastError.message,
          })
          throw lastError
        }
        // 短暂延迟后重试
        console.log('[AI-debug] waiting 1s before retry')
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
    const containsStart = Date.now()
    const ok = await chrome.permissions.contains({ origins: [`${origin}/*`] })
    console.log('[AI-debug] permissions.contains', {
      origin,
      granted: ok,
      elapsedMs: Date.now() - containsStart,
    })
    if (!ok) {
      const requestStart = Date.now()
      console.log('[AI-debug] permissions.request ABOUT TO SHOW DIALOG', { origin })
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
      console.log('[AI-debug] permissions.request RESULT', {
        origin,
        granted,
        elapsedMs: Date.now() - requestStart,
      })
      if (!granted) throw new Error(`需要 ${origin} 的访问权限`)
    }
  }
}
