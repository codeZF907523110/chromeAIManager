/**
 * 消息日志 Composable
 * 管理消息日志的增删、sessionStorage 持久化
 */

import { ref, readonly } from 'vue'
import type { MessageLog } from '../types'

const SESSION_KEY = 'ai_message_log'
const MAX_MESSAGES = 100
const STORAGE_MESSAGES = 50

export function useMessageLog() {
  const messageLog = ref<MessageLog[]>([])

  /**
   * 添加消息
   */
  function addMessage(type: MessageLog['type'], text: string): void {
    messageLog.value.push({ type, text })

    // 限制消息数量
    if (messageLog.value.length > MAX_MESSAGES) {
      messageLog.value.shift()
    }

    // 持久化到 sessionStorage
    persistToStorage()
  }

  /**
   * 清空消息
   */
  function clearMessages(): void {
    messageLog.value = []
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
  }

  /**
   * 持久化到 sessionStorage
   */
  function persistToStorage(): void {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(messageLog.value.slice(-STORAGE_MESSAGES)))
    } catch {
      // ignore
    }
  }

  /**
   * 从 sessionStorage 恢复消息
   */
  function restoreFromStorage(): void {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as MessageLog[]
        messageLog.value = parsed
      }
    } catch {
      // ignore
    }
  }

  return {
    messageLog: readonly(messageLog),
    addMessage,
    clearMessages,
    restoreFromStorage,
  }
}
