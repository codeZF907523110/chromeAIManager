/**
 * Anthropic Messages API 兼容适配器
 * 支持 Anthropic 官方及兼容端点（如智谱 GLM Coding Plan 的 /api/anthropic）
 *
 * 与 OpenAIAdapter 保持一致的调用语义：
 * - 非流式 call（重试 1 次）+ 流式 chatWithMessagesStream（首块/空闲超时、
 *   PROTOCOL_STATUS 协议降级、已收首块后不重试）
 * - 思考模型（如 glm-5.3-flash）返回的 thinking 块静默忽略，只拼接 text 块
 */

import type { AIAdapter, AIOptions, ChatMessage, StreamDeltaHandler } from '../../types'
import { ensureEndpointPermission } from './permission'

export interface AnthropicAdapterConfig {
  apiKey: string
  endpoint: string
  model: string
}

/**
 * 流式请求被端点以 HTTP 状态拒绝的错误：携带状态码，
 * 供 chatWithMessagesStream 判定「协议不兼容」并降级非流式（与 OpenAIAdapter 同一约定）
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

export class AnthropicAdapter implements AIAdapter {
  private apiKey: string
  private endpoint: string
  private model: string
  /** 会话级降级标记：端点已确认不支持 stream:true，后续调用直接走非流式 */
  private streamUnsupported = false

  constructor(config: AnthropicAdapterConfig) {
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
   * 流式对话：请求 stream:true，手动解析 Anthropic SSE 并逐段回调原始文本增量
   *
   * 超时/重试/降级语义与 OpenAIAdapter.chatWithMessagesStream 一致：
   * - 首块 + 块间空闲超时（任意字节到达即重置）；首块前失败重试 1 次，已收首块后不重试
   * - 端点以协议类状态（PROTOCOL_STATUS）拒绝时立即降级非流式并记入会话级标记
   *
   * @param messages 完整消息数组（含 system/历史）
   * @param options 调用选项（timeout 复用为首块/空闲阈值）
   * @param onDelta 原始文本增量回调（可缺省；降级路径在结束时一次性回调全量）
   * @returns 完整回复文本（不含 thinking 内容）
   * @throws 中止/权限/重试耗尽时抛出，与非流式语义一致
   */
  async chatWithMessagesStream(
    messages: ChatMessage[],
    options: AIOptions = {},
    onDelta?: StreamDeltaHandler
  ): Promise<string> {
    await ensureEndpointPermission(this.endpoint)

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

        // 协议类状态拒绝：重试流式必然同样失败，立即降级非流式
        if (e instanceof StreamProtocolError && PROTOCOL_STATUS.has(e.status)) {
          this.streamUnsupported = true
          console.warn(
            `[AI] 端点不支持流式 (HTTP ${e.status})，本次及后续调用降级为非流式: ${lastError.message}`
          )
          const full = await this.chatWithMessages(messages, options)
          onDelta?.(full)
          return full
        }
        await new Promise((r) => setTimeout(r, 1000))
      } finally {
        if (options.signal) options.signal.removeEventListener('abort', onAbort)
      }
    }
    throw lastError || new Error('API 调用失败')
  }

  /**
   * 执行一次流式请求并消费 Anthropic SSE 响应（重试/降级编排由 chatWithMessagesStream 承担）
   *
   * Anthropic SSE 事件流：message_start → content_block_start → content_block_delta*
   * → content_block_stop → … → message_delta(stop_reason) → message_stop；
   * delta 仅取 text_delta（正文），thinking_delta（思考过程）静默忽略。
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

    const resp = await fetch(`${this.endpoint}/v1/messages`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(this.buildBody(messages, options, true)),
      signal: controller.signal,
    })
    resetIdle()

    if (!resp.ok) throw await this.readError(resp)

    // 端点忽略 stream:true 返回普通 JSON：按非流式等效处理，不报错不重试
    const contentType = resp.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const full = this.extractText(await resp.json())
      if (full) onDelta?.(full)
      return full
    }

    // SSE 手动解析：按行缓冲，只消费 data: 行（Anthropic SSE 无 [DONE]，以 message_stop 结束）
    const reader = resp.body?.getReader()
    if (!reader) throw new Error('响应体不可读')
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    let stopReason: string | null = null
    /** 处理一条完整的 SSE 行：解析 text_delta 增量并回调，记录 stop_reason 与错误事件 */
    const handleLine = (line: string): void => {
      if (!line.startsWith('data:')) return
      const payload = line.slice(5).trim()
      if (!payload) return
      // 仅吞掉 JSON 解析失败（SSE 注释、心跳、半行残留）；解析成功后的
      // 业务处理（error 事件抛错）放在 try 外，确保服务端错误不被静默吞掉
      let evt: {
        type?: string
        delta?: { type?: string; text?: string; stop_reason?: string }
        error?: { message?: string }
      }
      try {
        evt = JSON.parse(payload)
      } catch {
        return
      }
      // 端点以 error 事件终止流（流已建连后的运行时错误）：抛真实消息供上层展示
      if (evt.type === 'error') {
        throw new Error(evt.error?.message || 'API 流式返回错误')
      }
      if (
        evt.type === 'content_block_delta' &&
        evt.delta?.type === 'text_delta' &&
        evt.delta.text
      ) {
        full += evt.delta.text
        onDelta?.(evt.delta.text)
      }
      if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
        stopReason = evt.delta.stop_reason
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
    if (stopReason === 'max_tokens') {
      console.warn('[AI] 流式输出被 max_tokens 截断 (stop_reason=max_tokens)，上层将尝试精简重试')
    }
    if (!full) throw new Error('AI 返回空响应')
    return full
  }

  /**
   * 构造请求头（流式/非流式共用）
   *
   * Anthropic 协议认证用 x-api-key（而非 Bearer），需携带协议版本号
   */
  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    }
  }

  /**
   * 构造 /v1/messages 请求体（流式/非流式共用）
   *
   * 与 OpenAI 协议的差异：system 是顶层字段而非消息角色；max_tokens 必填；
   * 无 response_format（JSON 输出由 agent loop 系统提示词约束）。
   * 温度上限取 1.0（Anthropic 协议范围 0-1，与智谱端点限制一致）。
   *
   * @param messages 完整消息数组（system 提取到顶层，其余转为协议消息）
   * @param options 调用选项
   * @param stream 是否流式（附加 stream: true）
   * @returns 请求体对象
   */
  private buildBody(
    messages: ChatMessage[],
    options: AIOptions,
    stream: boolean
  ): Record<string, unknown> {
    const defaultTemp = options.mode === 'chat' ? 1.0 : 0.1
    // 合并连续同角色消息（如任务暂停恢复时「暂停说明 + 用户新指令」两条 user）：
    // 官方 API 会自动合并，部分兼容端点（智谱）对连续同角色可能报错，防御性处理
    const merged: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (const m of messages) {
      if (m.role === 'system' || !m.content) continue
      const last = merged[merged.length - 1]
      if (last && last.role === m.role) {
        last.content += `\n\n${m.content}`
      } else {
        merged.push({ role: m.role, content: m.content })
      }
    }
    const body: Record<string, unknown> = {
      model: this.model,
      system: messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n'),
      messages: merged,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? defaultTemp,
    }
    if (stream) body.stream = true
    return body
  }

  /**
   * 从 Anthropic 响应 JSON 提取正文文本
   *
   * content 是块数组：只拼接 type=text 的 text 字段；
   * thinking 块（思考模型）与 tool_use 块忽略。顶层 error 块抛出真实错误。
   *
   * @param data 已解析的响应 JSON
   * @returns 正文文本（无 text 块时为空串）
   * @throws 响应为错误结构（type=error）时抛出携带服务端 message 的错误
   */
  private extractText(data: unknown): string {
    const obj = data as {
      type?: string
      error?: { message?: string }
      content?: Array<{ type?: string; text?: string }>
    }
    if (obj.type === 'error' || obj.error) {
      throw new Error(`API 返回错误: ${obj.error?.message || JSON.stringify(data).slice(0, 200)}`)
    }
    return (obj.content ?? [])
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('')
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

  /**
   * 非流式调用（chat/chatWithMessages 的公共实现）
   *
   * 重试语义与 OpenAIAdapter.call 一致：失败重试 1 次，中止/权限错误不重试。
   *
   * @param messages 完整消息数组
   * @param options 调用选项
   * @returns 正文文本（不含 thinking 内容）
   * @throws 中止/权限/重试耗尽时抛出
   */
  private async call(messages: ChatMessage[], options: AIOptions = {}): Promise<string> {
    const timeout = options.timeout || 60000
    const maxRetries = 1
    let lastError: Error | null = null

    await ensureEndpointPermission(this.endpoint)

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 合并：超时定时器 + 调用方传入的 AbortSignal，任一触发立即中断当前 fetch
      const controller = new AbortController()
      const onAbort = () => controller.abort(new Error('ABORTED'))
      if (options.signal) {
        if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
      const timer = setTimeout(() => controller.abort(new Error('请求超时')), timeout)

      try {
        const resp = await fetch(`${this.endpoint}/v1/messages`, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(this.buildBody(messages, options, false)),
          signal: controller.signal,
        })

        if (!resp.ok) throw await this.readError(resp)

        const data = await resp.json()
        const text = this.extractText(data)
        const content = (data as { content?: Array<{ type?: string }> }).content
        if ((data as { stop_reason?: string }).stop_reason === 'max_tokens') {
          console.warn('[AI] 输出被 max_tokens 截断 (stop_reason=max_tokens)，上层将尝试精简重试')
        }
        // 思考模型可能只有 thinking 块（正文被截断/未生成）：按空响应交由上层提示
        if (!text && content?.length) {
          console.warn('[AI] 响应无 text 块（可能仅含 thinking），按空响应处理', {
            blockTypes: content.map((b) => b.type),
          })
        }
        return text
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        const isAbort = e instanceof DOMException && e.name === 'AbortError'
        // 超时或权限错误不重试；最后一次尝试不再重试
        if (isAbort || lastError.message.includes('权限') || attempt >= maxRetries) throw lastError
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
}
