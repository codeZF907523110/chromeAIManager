/**
 * 命令历史 Composable
 * 管理命令历史记录和上下键导航
 */

import { ref, readonly } from 'vue'

export function useCommandHistory() {
  const commandHistory = ref<string[]>([])
  const historyIndex = ref(-1)
  const historyDraft = ref('')

  /**
   * 添加命令到历史
   */
  function addToHistory(command: string): void {
    if (!command.trim()) return

    // 避免重复
    if (!commandHistory.value.includes(command)) {
      commandHistory.value.push(command)
    }

    // 重置导航状态
    historyIndex.value = -1
    historyDraft.value = ''
  }

  /**
   * 上下键导航历史
   * @param direction -1 表示上一条，1 表示下一条
   * @param currentValue - 当前输入框的值
   * @returns 历史命令或 null
   */
  function navigateHistory(direction: -1 | 1, currentValue: string): string | null {
    const len = commandHistory.value.length
    if (len === 0) return null

    if (direction === -1) {
      // 向上键：获取更早的命令
      if (historyIndex.value === -1) {
        historyDraft.value = currentValue
        historyIndex.value = 0
      } else if (historyIndex.value < len - 1) {
        historyIndex.value++
      } else {
        return null
      }
    } else {
      // 向下键：获取更近的命令
      if (historyIndex.value <= 0) {
        historyIndex.value = -1
        const draft = historyDraft.value
        historyDraft.value = ''
        return draft
      }
      historyIndex.value--
    }

    return commandHistory.value[len - 1 - historyIndex.value] || ''
  }

  /**
   * 清空历史
   */
  function clearHistory(): void {
    commandHistory.value = []
    historyIndex.value = -1
    historyDraft.value = ''
  }

  return {
    commandHistory: readonly(commandHistory),
    addToHistory,
    navigateHistory,
    clearHistory,
  }
}
