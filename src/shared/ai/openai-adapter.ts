/**
 * OpenAI 兼容 API 适配器
 * 支持 OpenAI / DeepSeek / Ollama / LM Studio / OpenRouter 等兼容 /v1/chat/completions 的服务
 */

import type { AIAdapter, AIOptions, ChatMessage, StreamDeltaHandler } from '../../types'

export interface OpenAIAdapterConfig {
  apiKey: string
  endpoint: string
  model: string
}

/**
 * 流式请求被端点以 HTTP 状态拒绝的错误：携带状态码，
 * 供 chatWithMessagesStream 判定「协议不兼容」（见 PROTOCOL_STATUS）并降级非流式
 */
class StreamProtocolError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'StreamProtocolError'
  }
}

/** 视为「端点不支持 stream 参数」的协议类状态码（重试流式必然同样失败，应直接降级） */
const PROTOCOL_STATUS = new Set([400, 404, 415, 422])

export class OpenAIAdapter implements AIAdapter {
  private apiKey: string
  private endpoint: string
  private model: string
  /** 会话级降级标记：端点已确认不支持 stream:true，后续调用直接走非流式（换模型/端点会重建实例自然重置） */
  private streamUnsupported = false

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

  /**
   * 流式对话：请求 stream:true，手动解析 SSE 并逐段回调原始文本增量（方案见 docs/streaming-output.md §4.2）
   *
   * - 超时语义（仅本方法）：首块超时 + 块间空闲超时，复用 options.timeout（默认 60s）；
   *   任意字节到达即重置计时（SSE 心跳、reasoning 增量都算活性信号）。非流式方法维持整体超时不变。
   * - 重试语义：首块前失败重试 1 次（与 call 一致，中止/权限错误除外）；
   *   已收到首块后失败不重试（部分文本已经 onDelta 交付给显示层）。
   * - 降级回退：端点以协议类状态（PROTOCOL_STATUS）拒绝 stream:true 时立即改走非流式一次，
   *   并记入会话级标记 streamUnsupported，后续调用直接非流式。
   *
   * @param messages 完整消息数组（含 system/历史）
   * @param options 调用选项（timeout 复用为首块/空闲阈值）
   * @param onDelta 原始文本增量回调（可缺省；降级路径在结束时一次性回调全量）
   * @returns 完整回复文本
   * @throws 中止/权限/重试耗尽时抛出，与非流式语义一致
   */
  async chatWithMessagesStream(
    messages: ChatMessage[],
    options: AIOptions = {},
    onDelta?: StreamDeltaHandler
  ): Promise<string> {
    await this.ensurePermission()

    // 端点已确认不支持流式：直接非流式，结束时一次性交付全量
    if (this.streamUnsupported) {
      const full = await this.chatWithMessages(messages, options)
      onDelta?.(full)
      return full
    }

    const timeout = options.timeout || 60000
    const maxRetries = 1
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 合并：用户 AbortSignal + streamCall 内的首块/空闲超时定时器，任一触发立即中断 fetch
      const controller = new AbortController()
      const onAbort = () => controller.abort(new Error('ABORTED'))
      if (options.signal) {
        if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        options.signal.addEventListener('abort', onAbort, { once: true })
      }

      try {
        return await this.streamCall(messages, options, onDelta, controller, timeout)
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        const isAbort = e instanceof DOMException && e.name === 'AbortError'
        if (isAbort || lastError.message.includes('权限') || attempt >= maxRetries) throw lastError

        // 协议类状态拒绝：重试流式必然同样失败，立即降级非流式（其内部自带重试语义）
        if (e instanceof StreamProtocolError && PROTOCOL_STATUS.has(e.status)) {
          this.streamUnsupported = true
          console.warn(
            `[AI] 端点不支持流式 (HTTP ${e.status})，本次及后续调用降级为非流式: ${lastError.message}`
          )
          const full = await this.chatWithMessages(messages, options)
          onDelta?.(full)
          return full
        }
        // 短暂延迟后重试（与非流式一致）
        await new Promise((r) => setTimeout(r, 1000))
      } finally {
        if (options.signal) options.signal.removeEventListener('abort', onAbort)
      }
    }
    throw lastError || new Error('API 调用失败')
  }

  /**
   * 执行一次流式请求并消费 SSE 响应（重试/降级编排由 chatWithMessagesStream 承担）
   *
   * @param messages 完整消息数组
   * @param options 调用选项
   * @param onDelta 原始文本增量回调
   * @param controller 本次尝试的中止控制器（外层已合并用户 signal）
   * @param timeout 首块/块间空闲超时阈值（毫秒）
   * @returns 完整回复文本
   * @throws StreamProtocolError 端点以 HTTP 状态拒绝；AbortError 用户中止；网络/超时错误原样抛出
   */
  private async streamCall(
    messages: ChatMessage[],
    options: AIOptions,
    onDelta: StreamDeltaHandler | undefined,
    controller: AbortController,
    timeout: number
  ): Promise<string> {
    // 首块/块间空闲超时：任意字节到达即重置
    let timer = setTimeout(() => controller.abort(new Error('请求超时')), timeout)
    const resetIdle = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => controller.abort(new Error('请求超时')), timeout)
    }

    const resp = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(this.buildBody(messages, options, true)),
      signal: controller.signal,
    })
    resetIdle()

    if (!resp.ok) throw await this.readError(resp)

    // 端点忽略 stream:true 返回普通 JSON：按非流式等效处理，不报错不重试
    const contentType = resp.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const full = data.choices?.[0]?.message?.content || ''
      if (full) onDelta?.(full)
      return full
    }

    // SSE 手动解析：按行缓冲（\r\n 容错），只消费 data: 行，[DONE] 结束（业界标准格式）
    const reader = resp.body?.getReader()
    if (!reader) throw new Error('响应体不可读')
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    let finishReason: string | null = null
    /** 处理一条完整的 SSE 行：解析 delta.content 增量并回调，记录 finish_reason */
    const handleLine = (line: string): void => {
      if (!line.startsWith('data:')) return
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') return
      try {
        const evt = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
        }
        const choice = evt.choices?.[0]
        const delta = choice?.delta?.content
        if (typeof delta === 'string' && delta) {
          full += delta
          onDelta?.(delta)
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason
      } catch {
        // 跳过无法解析的行（SSE 注释、心跳等）
      }
    }

    try {
      for (;;) {
        const { done, value } = await reader.read()
        resetIdle() // 任意字节到达 = 活性信号
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? '' // 末段可能是半行，留到下一块拼接
        for (const line of lines) handleLine(line)
      }
      buffer += decoder.decode() // 冲刷解码器残留
      if (buffer) handleLine(buffer)
    } finally {
      clearTimeout(timer)
      reader.releaseLock()
    }

    // 截断检测：与非流式 call 保持同样的可观测性，上层 repairJSON 会尝试截断恢复
    if (finishReason === 'length') {
      console.warn('[AI] 流式输出被 max_tokens 截断 (finish_reason=length)，上层将尝试精简重试')
    }
    if (!full) throw new Error('AI 返回空响应')
    return full
  }

  /**
   * 构造 /chat/completions 请求体（流式/非流式共用）
   *
   * @param messages 完整消息数组
   * @param options 调用选项（temperature 默认按 mode 区分：chat 1.2 宽松 / task 0.1 严格）
   * @param stream 是否流式（附加 stream: true）
   * @returns 请求体对象
   */
  private buildBody(
    messages: ChatMessage[],
    options: AIOptions,
    stream: boolean
  ): Record<string, unknown> {
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
    if (stream) body.stream = true
    return body
  }

  /**
   * 将非 2xx 响应解析为错误对象：优先取服务端返回的 message，兜底状态码描述
   *
   * @param resp 非 2xx 的 fetch 响应
   * @returns 携带状态码的错误（流式侧用于协议不兼容判定）
   */
  private async readError(resp: Response): Promise<StreamProtocolError> {
    const text = await resp.text()
    let friendly = `API 请求失败 (${resp.status})`
    try {
      const err = JSON.parse(text) as { error?: { message?: string }; message?: string }
      friendly = err.error?.message || err.message || friendly
    } catch {
      // 响应体非 JSON：截取前 100 字符辅助定位
      friendly = `${friendly}: ${text.slice(0, 100)}`
    }
    return new StreamProtocolError(resp.status, friendly)
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
      const timer = setTimeout(() => controller.abort(new Error('请求超时')), timeout)

      try {
        const body = this.buildBody(messages, options, false)

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
          throw await this.readError(resp)
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
