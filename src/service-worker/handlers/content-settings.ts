import type { ExecutionResult } from '../../types/execution'

const RESOURCE_TYPES = new Set([
  'cookies',
  'javascript',
  'popups',
  'notifications',
  'images',
  'microphone',
  'camera',
  'location',
])
const SETTINGS = new Set(['allow', 'block', 'ask', 'default'])

/** 校验 Chrome contentSettings primaryPattern。 */
function validatePattern(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https?:\/\/[a-z0-9.-]+\/\*$/i.test(value.trim())) return null
  return value.trim()
}

/** 校验 contentSettings 资源类型。 */
function validateResource(value: unknown): string | null {
  return typeof value === 'string' && RESOURCE_TYPES.has(value) ? value : null
}

/** 查询指定网站设置。 */
export async function get(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const primaryPattern = validatePattern(payload.primaryPattern)
  const resourceId = validateResource(payload.resourceId)
  if (!primaryPattern || !resourceId)
    return { success: false, code: 'INVALID_PARAMS', message: 'primaryPattern 或 resourceId 无效' }
  const result = await chrome.contentSettings.get({
    primaryPattern,
    resourceIdentifier: { id: resourceId },
  })
  return { success: true, primaryPattern, resourceId, setting: result?.setting ?? 'default' }
}

/** 设置网站内容权限并回读实际设置。 */
export async function set(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const primaryPattern = validatePattern(payload.primaryPattern)
  const resourceId = validateResource(payload.resourceId)
  if (
    !primaryPattern ||
    !resourceId ||
    typeof payload.setting !== 'string' ||
    !SETTINGS.has(payload.setting)
  ) {
    return { success: false, code: 'INVALID_PARAMS', message: '网站设置参数无效' }
  }
  await chrome.contentSettings.set({
    primaryPattern,
    resourceIdentifier: { id: resourceId },
    setting: payload.setting,
  })
  return get({ primaryPattern, resourceId })
}

/** 清除网站设置并回读默认状态。 */
export async function clear(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const primaryPattern = validatePattern(payload.primaryPattern)
  const resourceId = payload.resourceId === undefined ? null : validateResource(payload.resourceId)
  if (!primaryPattern || (payload.resourceId !== undefined && !resourceId)) {
    return { success: false, code: 'INVALID_PARAMS', message: '网站清除参数无效' }
  }
  await chrome.contentSettings.clear({
    primaryPattern,
    ...(resourceId ? { resourceIdentifier: { id: resourceId } } : {}),
  })
  return { success: true, primaryPattern, resourceId, cleared: true }
}
