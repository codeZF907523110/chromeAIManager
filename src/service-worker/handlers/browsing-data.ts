import type { ExecutionResult } from '../../types/execution'

// 注：cookies / history 也属于敏感数据 — 清空后影响登录态与浏览轨迹。
const SENSITIVE_TYPES = new Set(['passwords', 'downloads', 'cookies', 'history'])
const ALLOWED_TYPES = new Set([
  'cache',
  'cookies',
  'downloads',
  'fileSystems',
  'formData',
  'history',
  'localStorage',
  'passwords',
  'serviceWorkers',
  'webSQL',
])

/** 返回浏览数据清理能力支持的数据类型。 */
export async function settings(): Promise<ExecutionResult> {
  const result = await chrome.browsingData.settings()
  return { success: true, settings: result }
}

/** 判断值是否为普通对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export async function removeCache(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return remove({ ...payload, dataToRemove: { cache: true } })
}

/** 仅清理 Cookie，复用统一参数校验和确认策略。 */
export async function removeCookies(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return remove({ ...payload, dataToRemove: { cookies: true } })
}

export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const dataToRemove = payload.dataToRemove
  if (!dataToRemove || typeof dataToRemove !== 'object' || Array.isArray(dataToRemove)) {
    return { success: false, code: 'INVALID_PARAMS', message: 'dataToRemove 必须是对象' }
  }
  const typeEntries = Object.entries(dataToRemove as Record<string, unknown>)
  if (typeEntries.length === 0 || typeEntries.some(([, value]) => value !== true)) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '至少指定一种有效的数据类型并设为 true',
    }
  }
  const invalid = typeEntries.map(([key]) => key).filter((key) => !ALLOWED_TYPES.has(key))
  if (invalid.length > 0) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: `不支持的数据类型: ${invalid.join(', ')}`,
    }
  }
  if (
    typeEntries.some(([key]) => SENSITIVE_TYPES.has(key)) &&
    (payload as Record<string, unknown>).force !== true
  ) {
    return {
      success: false,
      code: 'NEEDS_CONFIRM',
      message: `清理 ${typeEntries.map(([k]) => k).join(',')} 需要再次确认`,
    }
  }
  const options: chrome.browsingData.RemovalOptions = {}
  if (payload.since !== undefined) {
    const since = Number(payload.since)
    if (!Number.isFinite(since) || since < 0)
      return { success: false, code: 'INVALID_PARAMS', message: 'since 必须是非负时间戳' }
    options.since = since
  }
  if (payload.originTypes !== undefined) {
    if (!isPlainObject(payload.originTypes)) {
      return { success: false, code: 'INVALID_PARAMS', message: 'originTypes 必须是对象' }
    }
    const allowedOriginTypes = new Set(['unprotectedWeb', 'protectedWeb', 'extension'])
    const originTypes = payload.originTypes as Record<string, unknown>
    const originKeys = Object.keys(originTypes)
    if (originKeys.some((key) => !allowedOriginTypes.has(key) || originTypes[key] !== true)) {
      return { success: false, code: 'INVALID_PARAMS', message: 'originTypes 包含无效值' }
    }
    options.originTypes = payload.originTypes as chrome.browsingData.OriginTypes
  }
  await chrome.browsingData.remove(options, dataToRemove as chrome.browsingData.DataTypeSet)
  return { success: true, removed: Object.keys(dataToRemove as Record<string, unknown>) }
}
