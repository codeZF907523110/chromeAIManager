/**
 * 输入历史 Composable
 *
 * 直接从 `messageLog` 里 type 为 `user` 的消息中按时间倒序提取作为上键历史。
 * 不维护独立历史数组：用户真实发过的内容已经全部持久化在 messageLog 里，
 * 关闭/打开侧边栏、刷新扩展后依然存在，避免双源数据不一致。
 *
 * 模块级单例：导航状态（index / draft）在整个扩展生命周期内共享，
 * 这样跨任务调用也能正确衔接上一段历史导航位置。
 */

import { ref, type ComputedRef } from 'vue'
import type { MessageLog } from '../types'

const historyIndex = ref(-1)
/** 进入历史导航前的原始输入，用于下键回到原本正在编辑的内容 */
const historyDraft = ref('')

/**
 * 从 messageLog 中按时间倒序提取所有 user 输入（去重、过滤空字符串）。
 *
 * @param messages 消息日志（只读）
 * @returns 历史命令列表（最近的在末尾）
 */
function extractUserCommands(messages: readonly MessageLog[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  // 倒序遍历，最新的用户消息排到末尾，方便「按上键取上一条」
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.type !== 'user') continue
    const text = msg.text.markdown.trim()
    if (!text) continue
    if (seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out.reverse()
}

/**
 * 上下键导航历史。
 *
 * @param direction -1 表示上一条（更早），1 表示下一条（更近）
 * @param currentValue 当前输入框的值（首次上键时记录为 draft）
 * @param messagesRef 消息日志的 computed ref
 * @returns 历史命令；到达边界或无历史时返回 null
 */
function navigateHistory(
  direction: -1 | 1,
  currentValue: string,
  messagesRef: ComputedRef<readonly MessageLog[]>
): string | null {
  const history = extractUserCommands(messagesRef.value)
  const len = history.length
  if (len === 0) return null

  if (direction === -1) {
    // 上键：取更早的一条
    if (historyIndex.value === -1) {
      historyDraft.value = currentValue
      historyIndex.value = 0
    } else if (historyIndex.value < len - 1) {
      historyIndex.value++
    } else {
      // 已经在最早一条，不响应
      return null
    }
  } else {
    // 下键：取更近的一条；越过最新一条时恢复 draft
    if (historyIndex.value <= 0) {
      historyIndex.value = -1
      const draft = historyDraft.value
      historyDraft.value = ''
      return draft
    }
    historyIndex.value--
  }

  return history[len - 1 - historyIndex.value] || ''
}

/**
 * 发送命令后重置导航状态。下次上键从最新一条开始。
 */
function resetHistoryNav(): void {
  historyIndex.value = -1
  historyDraft.value = ''
}

/**
 * 清空内部导航状态（不删 messageLog）。
 */
function clearHistory(): void {
  historyIndex.value = -1
  historyDraft.value = ''
}

export function useMessageHistory() {
  return {
    navigateHistory,
    resetHistoryNav,
    clearHistory,
  }
}
