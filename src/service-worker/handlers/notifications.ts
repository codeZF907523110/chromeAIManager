import type { ExecutionResult } from '../../types/execution'

const MAX_NOTIFICATIONS_PER_MINUTE = 5
const MAX_TITLE_LENGTH = 100
const MAX_MESSAGE_LENGTH = 1000
const notificationTimestamps: number[] = []
const ALLOWED_ICON_PATHS = new Set([
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
])
const SENSITIVE_PATTERN = /cookie|password|token|secret|api[_-]?key/i

function sanitizeNotificationText(value: string): string {
  return SENSITIVE_PATTERN.test(value) ? value.replace(/./g, '*') : value
}

function pickIcon(value: unknown): string {
  if (typeof value !== 'string' || !ALLOWED_ICON_PATHS.has(value)) return 'icons/icon-128.png'
  return value
}

function validateText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

/** 检查通知发送频率，避免模型批量滥发通知。 */
function allowNotification(): boolean {
  const threshold = Date.now() - 60_000
  while (notificationTimestamps[0] !== undefined && notificationTimestamps[0] < threshold) {
    notificationTimestamps.shift()
  }
  if (notificationTimestamps.length >= MAX_NOTIFICATIONS_PER_MINUTE) return false
  notificationTimestamps.push(Date.now())
  return true
}

export async function create(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const title = validateText(payload.title, MAX_TITLE_LENGTH)
  const message = validateText(payload.message, MAX_MESSAGE_LENGTH)
  if (!title || !message) {
    return { success: false, code: 'INVALID_PARAMS', message: 'title/message 不能为空且长度超限' }
  }
  if (payload.iconUrl !== undefined && typeof payload.iconUrl !== 'string') {
    return { success: false, code: 'INVALID_PARAMS', message: 'iconUrl 必须是字符串' }
  }
  if (!allowNotification()) {
    return { success: false, code: 'RATE_LIMITED', message: '通知发送过于频繁，请稍后再试' }
  }
  const notificationId = await chrome.notifications.create({
    type: 'basic',
    iconUrl: pickIcon(payload.iconUrl),
    title: sanitizeNotificationText(title),
    message: sanitizeNotificationText(message),
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
export async function getAll(): Promise<ExecutionResult> {
  const notifications = await chrome.notifications.getAll()
  return {
    success: true,
    notificationIds: Object.keys(notifications),
    count: Object.keys(notifications).length,
  }
}

/** 兼容旧命令，转发到 canonical getAll。 */
export async function list(): Promise<ExecutionResult> {
  return getAll()
}

/** 更新已有通知的标题和正文。 */
export async function update(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const notificationId =
    typeof payload.notificationId === 'string' ? payload.notificationId.trim() : ''
  const title = validateText(payload.title, MAX_TITLE_LENGTH)
  const message = validateText(payload.message, MAX_MESSAGE_LENGTH)
  if (!notificationId || !title || !message) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: 'notificationId/title/message 参数无效',
    }
  }
  const updated = await chrome.notifications.update(notificationId, {
    type: 'basic',
    title: sanitizeNotificationText(title),
    message: sanitizeNotificationText(message),
    iconUrl: 'icons/icon-128.png',
  })
  return { success: true, notificationId, updated }
}
