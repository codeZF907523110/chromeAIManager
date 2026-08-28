/**
 * 扩展存储 + 会话恢复 SW 命令实现
 * 对应 swIntent: storage_get / storage_set / storage_remove / sessions_restore
 */

import type { ExecutionResult } from '../../types/execution'

/** 读取扩展 storage.local（无 key 返回全量） */
export async function get(payload: Record<string, unknown>): Promise<ExecutionResult> {
  if (!payload.key) {
    const all = await chrome.storage.local.get(null)
    return { success: true, value: all }
  }
  const result = await chrome.storage.local.get(payload.key as string)
  return {
    success: true,
    key: payload.key,
    value: (result as Record<string, unknown>)[payload.key as string],
  }
}

/** 写入扩展存储键值对 */
export async function set(payload: Record<string, unknown>): Promise<ExecutionResult> {
  await chrome.storage.local.set({ [payload.key as string]: payload.value })
  return { success: true, key: payload.key, value: payload.value }
}

/** 删除扩展存储键 */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  await chrome.storage.local.remove(payload.key as string)
  return { success: true, key: payload.key }
}

/** 恢复最近关闭的标签（可选 query 过滤） */
export async function restoreSession(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 20 })
  const query = (payload.query as string)?.toLowerCase()

  if (!sessions.length)
    return { success: false, code: 'NO_TABS_FOUND', message: '没有可恢复的标签' }

  if (query) {
    for (const s of sessions) {
      if (s.tab?.sessionId) {
        const match =
          (s.tab.title || '').toLowerCase().includes(query) ||
          (s.tab.url || '').toLowerCase().includes(query)
        if (match) {
          await chrome.sessions.restore(s.tab.sessionId)
          return { success: true, restored: s.tab.title }
        }
      }
    }
  }

  const first = sessions.find((s) => s.tab?.sessionId) || sessions[0]
  if (first.tab?.sessionId) {
    await chrome.sessions.restore(first.tab.sessionId)
    return { success: true, restored: first.tab.title }
  }
  return { success: false, error: 'NO_RECOVERABLE_TABS' }
}