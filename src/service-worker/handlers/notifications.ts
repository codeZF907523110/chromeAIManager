import type { ExecutionResult } from '../../types/execution'

/** 创建文本通知，限制内容长度避免滥用。 */
export async function create(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  const message = typeof payload.message === 'string' ? payload.message.trim() : ''
  if (!title || !message || title.length > 100 || message.length > 1000) {
    return { success: false, code: 'INVALID_PARAMS', message: 'title/message 不能为空且长度超限' }
  }
  const notificationId = await chrome.notifications.create({
    type: 'basic',
    iconUrl: payload.iconUrl || 'icons/icon-128.png',
    title,
    message,
  })
  return { success: true, notificationId }
}

/** 清除指定通知。 */
export async function clear(payload: Record<string, unknown>): Promise<ExecutionResult> {
  if (typeof payload.notificationId !== 'string' || !payload.notificationId) {
    return { success: false, code: 'INVALID_PARAMS', message: 'notificationId 必须是字符串' }
  }
  const cleared = await chrome.notifications.clear(payload.notificationId)
  return { success: true, notificationId: payload.notificationId, cleared }
}

/** 查询全部通知 ID，不返回通知正文。 */
export async function list(): Promise<ExecutionResult> {
  const notifications = await chrome.notifications.getAll()
  return {
    success: true,
    notificationIds: Object.keys(notifications),
    count: Object.keys(notifications).length,
  }
}
