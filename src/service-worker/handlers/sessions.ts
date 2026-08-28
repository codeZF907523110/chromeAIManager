import type { ExecutionResult } from '../../types/execution'

/** 查询最近关闭的标签页和窗口，返回可安全展示的摘要。 */
export async function observe(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const maxResults = payload.maxResults === undefined ? 20 : Number(payload.maxResults)
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) {
    return { success: false, code: 'INVALID_PARAMS', message: 'maxResults 必须是 1 到 100 的整数' }
  }
  const sessions = await chrome.sessions.getRecentlyClosed({ maxResults })
  return {
    success: true,
    sessions: sessions.map((session) => ({
      sessionId: session.tab?.sessionId,
      type: session.tab ? 'tab' : 'window',
      title: session.tab?.title,
      url: session.tab?.url,
      windowId: session.tab?.windowId,
      tabCount: session.window?.tabs?.length,
    })),
    found: sessions.length,
  }
}

/** 恢复指定或最近关闭的会话。 */
export async function restore(payload: Record<string, unknown>): Promise<ExecutionResult> {
  if (typeof payload.sessionId !== 'string' || !payload.sessionId.trim()) {
    return { success: false, code: 'INVALID_PARAMS', message: 'sessionId 必须是非空字符串' }
  }
  const restored = await chrome.sessions.restore(payload.sessionId)
  return { success: true, restored }
}
