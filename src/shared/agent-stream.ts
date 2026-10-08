/**
 * Agent 流式显示层（docs/streaming-output.md §4.3）
 *
 * 消费 OpenAI 适配器的原始文本增量（onDelta），做节流 partial JSON 解析，
 * 增量提取用户可见的 { thought, reply } 字段，供 UI 实时渲染。
 *
 * 安全边界：本模块只服务"显示"。决策层（useAIEngine 的 JSON.parse → repairJSON →
 * action 分发）始终消费完整 raw，本模块的任何输出都不参与任务执行。
 *
 * 字段提取优先级与决策层 resolveAIReply 的字符串分支保持一致：
 *   reply(string) → content(string) → args.reply → args.message → args.content
 * （rich 对象回复无法流式，不提取，由 finalize 按现有链路渲染。）
 */

import { shallowRef, type ShallowRef } from 'vue'
import { parse, disableErrorLogging } from 'best-effort-json-parser'
import { sanitizeThought } from './thought-summary'

// partial parse 的输入必然常处于"解析不完整"的中间态，关闭库的错误日志避免控制台刷屏
disableErrorLogging()

/** 节流间隔（毫秒）：partial parse 与 UI 更新的最小间隔（业界通行 80–120ms） */
const THROTTLE_MS = 100

/** 流式中的实时显示状态（不落库；finalize 后由正式消息取代，见方案 §4.4） */
export interface LiveStreamState {
  /** 是否已出现可流式显示的回复文本（LiveBubble 是否渲染） */
  replyActive: boolean
  /** 已流式显示的回复文本（单调增长的前缀） */
  replyText: string
  /** 已流式显示的思考文本（经 sanitizeThought 清洗；空串表示尚未出现） */
  thoughtText: string
}

/** Agent 流式格式化器：缓冲增量 → 节流 partial parse → 实时状态 */
export interface AgentStreamFormatter {
  /** 流式实时状态（浅响应式，整体替换触发更新） */
  readonly live: ShallowRef<LiveStreamState>
  /**
   * 追加一段原始文本增量
   * @param delta 本次新增的原始文本片段（来自适配器 onDelta）
   */
  push(delta: string): void
  /** 立即解析缓冲中尚未落进 live 的增量（跳过节流等待）；finalize 转正前调用，保证"转正的 = 已显示的" */
  flushNow(): void
  /** 重置为初始状态（每次 AI 调用开始前调用，防止上一次的残留混入） */
  reset(): void
  /**
   * 仅清除实时思考文本，保留回复气泡（finalize 收敛用，见方案 §4.4）：
   * thought 正式消息落库后调用，防止任务块思考行与正式消息重复显示；
   * reply 保持不变，等待 emitAIChat 的正式消息或 finalizePartialLive 转正。
   */
  clearThought(): void
}

/**
 * 创建 Agent 流式格式化器
 *
 * @returns 格式化器实例（live 为浅响应式状态，push/reset/clearThought 操作它）
 */
export function createAgentStreamFormatter(): AgentStreamFormatter {
  const live = shallowRef<LiveStreamState>({ replyActive: false, replyText: '', thoughtText: '' })

  let buffer = ''
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  // 单调守卫：partial parse 中间态理论上单调增长，若某次解析结果变短则保持较长值，
  // 防止解析抖动导致已显示文本回退
  let lastReply = ''
  let lastThought = ''

  /**
   * 对当前缓冲做一次 partial parse，提取 thought / reply 增量并更新 live 状态
   *
   * 解析失败（畸形中间态/代理对截断等）静默跳过本次 tick，缓冲不受影响。
   */
  function flush(): void {
    flushTimer = null
    let thought = lastThought
    let reply = lastReply
    try {
      const partial = parse(buffer) as {
        thought?: unknown
        reply?: unknown
        content?: unknown
        args?: Record<string, unknown>
      } | null
      if (partial && typeof partial === 'object') {
        thought = sanitizeThought(readString(partial.thought) ?? '')
        const args = partial.args ?? {}
        reply =
          readString(partial.reply) ??
          readString(partial.content) ??
          readString(args.reply) ??
          readString(args.message) ??
          readString(args.content) ??
          ''
      }
    } catch {
      return // 该 tick 跳过，下一 tick 继续
    }
    // 只前进不回退
    if (reply.length < lastReply.length) reply = lastReply
    if (thought.length < lastThought.length) thought = lastThought
    if (reply === lastReply && thought === lastThought) return
    lastReply = reply
    lastThought = thought
    live.value = { replyActive: reply.length > 0, replyText: reply, thoughtText: thought }
  }

  return {
    live,
    push(delta: string): void {
      if (!delta) return
      buffer += delta
      // 尾沿节流：间隔内多次 push 合并为一次 parse
      if (flushTimer) return
      flushTimer = setTimeout(flush, THROTTLE_MS)
    },
    flushNow(): void {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      flush()
    },
    reset(): void {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      buffer = ''
      lastReply = ''
      lastThought = ''
      live.value = { replyActive: false, replyText: '', thoughtText: '' }
    },
    clearThought(): void {
      // 只清思考显示：缓冲不动（流已结束不会再 flush），reply 基线保留防显示回退
      lastThought = ''
      live.value = {
        replyActive: live.value.replyActive,
        replyText: live.value.replyText,
        thoughtText: '',
      }
    },
  }
}

/**
 * 读取字段中的字符串值（非字符串一律视为缺失，如 rich 对象回复）
 *
 * @param value 任意 JSON 字段值
 * @returns 字符串值；非字符串返回 undefined
 */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
