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
      sessionId: session.sessionId,
      type: session.tab ? 'tab' : 'window',
      title: session.tab?.title,
      url: session.tab?.url,
      windowId: session.tab?.windowId,
      tabCount: session.window?.tabs?.length,
    })),
    found: sessions.length,
  }
}

/** 查询已同步设备的会话摘要，避免返回完整标签 URL。 */
export async function getDevices(): Promise<ExecutionResult> {
  const devices = await chrome.sessions.getDevices()
  return {
    success: true,
    devices: devices.map((device) => ({
      deviceName: device.deviceName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessions: device.sessions.map((session: any) => ({
        window: session.window
          ? { windowId: session.window.windowId, tabs: session.window.tabs?.length ?? 0 }
          : undefined,
        tabs: session.tab
          ? [{ title: session.tab.title, url: summarizeUrl(session.tab.url) }]
          : undefined,
      })),
    })),
  }
}

/** 将会话 URL 裁剪为不含 query/fragment 的安全摘要。 */
function summarizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return `${parsed.origin + parsed.pathname}`
  } catch {
    return undefined
  }
}

export async function restore(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // query 模式：从最近关闭的会话中查找匹配的标签恢复
  if (typeof payload.query === 'string' && payload.query.trim()) {
    const query = payload.query.trim().toLowerCase()
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 50 })
    const tabs = sessions.filter((s) => s.tab).map((s) => s.tab!)
    const matched = tabs.find(
      (t) =>
        (t.title || '').toLowerCase().includes(query) || (t.url || '').toLowerCase().includes(query)
    )
    if (!matched) {
      return { success: true, restored: 0, message: '没有找到匹配的最近关闭标签' }
    }
    await chrome.sessions.restore(matched.sessionId)
    return { success: true, restored: 1, sessionId: matched.sessionId }
  }
  // 无参数：恢复最近关闭的第一个标签
  const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 1 })
  const tab = sessions.find((s) => s.tab)?.tab
  if (!tab) {
    return { success: true, restored: 0, message: '没有最近关闭的标签' }
  }
  await chrome.sessions.restore(tab.sessionId)
  return { success: true, restored: 1, sessionId: tab.sessionId }
}
