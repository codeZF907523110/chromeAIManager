import type { ExecutionResult } from '../../types/execution'

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

/** 按时间范围和白名单数据类型清理浏览数据，调用前由危险工具确认。 */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const dataToRemove = payload.dataToRemove
  if (!dataToRemove || typeof dataToRemove !== 'object' || Array.isArray(dataToRemove)) {
    return { success: false, code: 'INVALID_PARAMS', message: 'dataToRemove 必须是对象' }
  }
  const invalid = Object.keys(dataToRemove as Record<string, unknown>).filter(
    (key) => !ALLOWED_TYPES.has(key)
  )
  if (invalid.length > 0) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: `不支持的数据类型: ${invalid.join(', ')}`,
    }
  }
  const options: chrome.browsingData.RemovalOptions = {}
  if (payload.since !== undefined) {
    const since = Number(payload.since)
    if (!Number.isFinite(since) || since < 0)
      return { success: false, code: 'INVALID_PARAMS', message: 'since 必须是非负时间戳' }
    options.since = since
  }
  if (payload.originTypes && typeof payload.originTypes === 'object')
    options.originTypes = payload.originTypes as chrome.browsingData.OriginTypes
  await chrome.browsingData.remove(options, dataToRemove as chrome.browsingData.DataTypeSet)
  return { success: true, removed: Object.keys(dataToRemove as Record<string, unknown>) }
}
