import type { ExecutionResult } from '../../types/execution'

type StorageAreaName = 'local' | 'session' | 'sync' | 'managed'

/** 获取可用的 storage area；managed 只读。 */
function getArea(name: StorageAreaName): StorageArea {
  return chrome.storage[name] as StorageArea
}

/** 校验并返回 storage area 名称。 */
function parseArea(value: unknown): StorageAreaName | null {
  return typeof value === 'string' && ['local', 'session', 'sync', 'managed'].includes(value)
    ? (value as StorageAreaName)
    : null
}

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|secret|password|credential|session)/i
const MAX_KEY_LENGTH = 200
const MAX_VALUE_BYTES = 8 * 1024

function validateKey(key: unknown): string | null {
  if (typeof key !== 'string') return null
  const trimmed = key.trim()
  if (!trimmed || trimmed.length > MAX_KEY_LENGTH) return null
  return trimmed
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

export async function areaGet(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 默认 area 为 local（向后兼容旧命令）
  const area = parseArea(payload.area) ?? 'local'
  const key = payload.key === undefined ? undefined : validateKey(payload.key)
  if (payload.key !== undefined && key === null) {
    return { success: false, code: 'INVALID_PARAMS', message: 'key 必须是非空字符串' }
  }
  // 不允许读取敏感 key，但允许读取整个 area（列出全部键）
  if (key && isSensitiveKey(key)) {
    return { success: false, code: 'ACCESS_DENIED', message: '禁止读取敏感配置键' }
  }
  const all = (await getArea(area).get(null)) as Record<string, unknown>
  // 过滤掉敏感键
  const filteredAll: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(all)) {
    if (!isSensitiveKey(k)) filteredAll[k] = v
  }
  if (key === undefined || key === '') {
    return { success: true, area, key: undefined, value: filteredAll }
  }
  return { success: true, area, key, value: filteredAll[key as string] }
}

/** 写入 local/session/sync storage；managed area 不允许写入。 */
export async function areaSet(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = parseArea(payload.area)
  if (!area) return { success: false, code: 'INVALID_PARAMS', message: '必须明确指定 storage area' }
  if (area === 'managed') {
    return { success: false, code: 'READ_ONLY_AREA', message: 'managed storage 只读' }
  }
  const key = validateKey(payload.key)
  if (!key) return { success: false, code: 'INVALID_PARAMS', message: 'key 必须是非空字符串' }
  if (isSensitiveKey(key))
    return { success: false, code: 'ACCESS_DENIED', message: '禁止写入敏感配置键' }
  if (typeof payload.value === 'string' && payload.value.length > MAX_VALUE_BYTES) {
    return { success: false, code: 'INVALID_PARAMS', message: 'value 超过大小限制' }
  }
  await getArea(area).set({ [key]: payload.value })
  const verified = (await getArea(area).get(key)) as Record<string, unknown>
  return { success: verified[key] !== undefined, area, key, written: verified[key] !== undefined }
}

/** 删除 local/session/sync storage 中的 key；managed area 不允许删除。 */
export async function areaRemove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = parseArea(payload.area)
  if (!area) return { success: false, code: 'INVALID_PARAMS', message: '必须明确指定 storage area' }
  if (area === 'managed') {
    return { success: false, code: 'READ_ONLY_AREA', message: 'managed storage 只读' }
  }
  const key = validateKey(payload.key)
  if (!key) return { success: false, code: 'INVALID_PARAMS', message: 'key 必须是非空字符串' }
  if (isSensitiveKey(key))
    return { success: false, code: 'ACCESS_DENIED', message: '禁止删除敏感配置键' }
  await getArea(area).remove(key)
  const verified = (await getArea(area).get(key)) as Record<string, unknown>
  return { success: verified[key] === undefined, area, key, removed: verified[key] === undefined }
}

/** 清空 local/session/sync storage；managed area 不允许清空。 */
export async function areaClear(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = parseArea(payload.area)
  if (!area) return { success: false, code: 'INVALID_PARAMS', message: '必须明确指定 storage area' }
  if (area === 'managed') {
    return { success: false, code: 'READ_ONLY_AREA', message: 'managed storage 只读' }
  }
  await getArea(area).clear()
  return { success: true, area, cleared: true }
}

/** 保留原有 storage_get 行为，避免斜杠命令回归。 */
export async function get(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return areaGet({ ...payload, area: payload.area ?? 'local' })
}

/** 保留原有 storage_set 行为，避免斜杠命令回归。 */
export async function set(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return areaSet({ area: 'local', ...payload })
}

/** 保留原有 storage_remove 行为，避免斜杠命令回归。 */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return areaRemove({ area: 'local', ...payload })
}

export async function restoreSession(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 20 })
  const query = typeof payload.query === 'string' ? payload.query.toLowerCase() : undefined
  const match = query
    ? sessions.find((session) => {
        const tab = session.tab
        return (
          !!tab &&
          ((tab.title || '').toLowerCase().includes(query) ||
            (tab.url || '').toLowerCase().includes(query))
        )
      })
    : sessions.find((session) => !!session.tab?.sessionId)
  if (!match?.tab?.sessionId) {
    return { success: false, code: 'NO_TABS_FOUND', message: '没有可恢复的标签' }
  }
  await chrome.sessions.restore(match.tab.sessionId)
  return { success: true, restored: match.tab.title }
}
