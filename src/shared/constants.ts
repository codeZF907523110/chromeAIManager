/**
 * 消息类型常量（Side Panel ↔ Service Worker）
 */

// Side Panel → Service Worker
export const MSG_GET_CONTEXT = 'GET_CONTEXT'
export const MSG_GET_BOOKMARKS = 'GET_BOOKMARKS'
export const MSG_EXECUTE = 'EXECUTE'
export const MSG_SET_DISPLAY_MODE = 'SET_DISPLAY_MODE'
export const MSG_GET_DISPLAY_MODE = 'GET_DISPLAY_MODE'

// Service Worker → Side Panel
export const MSG_EXECUTE_RESULT = 'EXECUTE_RESULT'

// ──── 错误码类型 ────

export type ErrorCode =
  | 'ELE_NOT_FOUND'
  | 'ELE_NOT_VISIBLE'
  | 'ELE_DISABLED'
  | 'ELE_STALE'
  | 'ELE_OBSCURED'
  | 'ACT_TIMEOUT'
  | 'ACT_BLOCKED'
  | 'ACT_NO_EFFECT'
  | 'ACT_PARTIAL'
  | 'PAGE_BLOCKED'
  | 'PAGE_LOADING'
  | 'PAGE_CRASHED'
  | 'PAGE_REDIRECT'
  | 'COM_DISCONNECTED'
  | 'COM_TIMEOUT'
  | 'LIM_TOO_MANY_ELEMENTS'
  | 'LIM_STEP_MAX'
  | 'LIM_CONTEXT_OVERFLOW'

// ──── 错误码常量 ────

// 元素相关（ELE_xxx）
export const ERR_ELE_NOT_FOUND = 'ELE_NOT_FOUND'
export const ERR_ELE_NOT_VISIBLE = 'ELE_NOT_VISIBLE'
export const ERR_ELE_DISABLED = 'ELE_DISABLED'
export const ERR_ELE_OBSCURED = 'ELE_OBSCURED'
export const ERR_ELE_STALE = 'ELE_STALE'

// 操作相关（ACT_xxx）
export const ERR_ACT_TIMEOUT = 'ACT_TIMEOUT'
export const ERR_ACT_BLOCKED = 'ACT_BLOCKED'
export const ERR_ACT_NO_EFFECT = 'ACT_NO_EFFECT'
export const ERR_ACT_PARTIAL = 'ACT_PARTIAL'

// 页面相关（PAGE_xxx）
export const ERR_PAGE_BLOCKED = 'PAGE_BLOCKED'
export const ERR_PAGE_LOADING = 'PAGE_LOADING'
export const ERR_PAGE_CRASHED = 'PAGE_CRASHED'
export const ERR_PAGE_REDIRECT = 'PAGE_REDIRECT'

// 通信相关（COM_xxx）
export const ERR_COM_DISCONNECTED = 'COM_DISCONNECTED'
export const ERR_COM_TIMEOUT = 'COM_TIMEOUT'

// 限制相关（LIM_xxx）
export const ERR_LIM_TOO_MANY_ELEMENTS = 'LIM_TOO_MANY_ELEMENTS'
export const ERR_LIM_STEP_MAX = 'LIM_STEP_MAX'
export const ERR_LIM_CONTEXT_OVERFLOW = 'LIM_CONTEXT_OVERFLOW'

// ──── 兼容旧代码的错误码 ────

export const LEGACY_ERRORS = {
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  EMPTY_INPUT: 'EMPTY_INPUT',
  NO_AI_BACKEND: 'NO_AI_BACKEND',
  AI_PARSE_FAILED: 'AI_PARSE_FAILED',
  UNKNOWN_INTENT: 'UNKNOWN_INTENT',
  UNKNOWN_SLASH: 'UNKNOWN_SLASH',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  NO_TABS_FOUND: 'NO_TABS_FOUND',
  HOST_PERMISSION_DENIED: 'HOST_PERMISSION_DENIED',
} as const

export type LegacyErrorCode = (typeof LEGACY_ERRORS)[keyof typeof LEGACY_ERRORS]

// ──── 系统常量 ────

export const MAX_ELEMENTS_COUNT = 80
export const MAX_ELEMENT_TEXT_LENGTH = 200
export const MAX_AGENT_STEPS = 12
export const STEP_TIMEOUT_MS = 10000
export const TOTAL_TASK_TIMEOUT_MS = 120000
export const MAX_CONSECUTIVE_FAILURES = 3
export const MAX_MESSAGES_COUNT = 30

// ──── 受保护页面配置 ────

export const BLOCKED_URL_PREFIXES = ['chrome://', 'chrome-extension://'] as const
export const BLOCKED_HOSTS = ['chrome.google.com'] as const

/**
 * 检查 URL 是否为受保护页面（不可操作）
 */
export function isBlockedURL(url: string | null | undefined): boolean {
  if (!url) return true
  for (const prefix of BLOCKED_URL_PREFIXES) {
    if (url.startsWith(prefix)) return true
  }
  try {
    const host = new URL(url).hostname
    for (const blocked of BLOCKED_HOSTS) {
      if (host === blocked || host.endsWith('.' + blocked)) return true
    }
  } catch {
    return true
  }
  return false
}
