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

/** 读取指定 storage area 的一个 key 或全部键值。 */
export async function areaGet(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = parseArea(payload.area) ?? 'local'
  const key = payload.key
  if (key !== undefined && typeof key !== 'string') {
    return { success: false, code: 'INVALID_PARAMS', message: 'key 必须是字符串' }
  }
  const value = await getArea(area).get(key === undefined || key === '' ? null : key)
  return { success: true, area, key: key || undefined, value }
}

/** 写入 local/session/sync storage；managed area 不允许写入。 */
export async function areaSet(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = parseArea(payload.area) ?? 'local'
  if (area === 'managed') {
    return { success: false, code: 'READ_ONLY_AREA', message: 'managed storage 只读' }
  }
  if (typeof payload.key !== 'string' || !payload.key.trim()) {
    return { success: false, code: 'INVALID_PARAMS', message: 'key 必须是非空字符串' }
  }
  await getArea(area).set({ [payload.key]: payload.value })
  return { success: true, area, key: payload.key, value: payload.value }
}

/** 删除 local/session/sync storage 中的 key；managed area 不允许删除。 */
export async function areaRemove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = parseArea(payload.area) ?? 'local'
  if (area === 'managed') {
    return { success: false, code: 'READ_ONLY_AREA', message: 'managed storage 只读' }
  }
  if (typeof payload.key !== 'string' || !payload.key.trim()) {
    return { success: false, code: 'INVALID_PARAMS', message: 'key 必须是非空字符串' }
  }
  await getArea(area).remove(payload.key)
  return { success: true, area, key: payload.key }
}

/** 清空 local/session/sync storage；managed area 不允许清空。 */
export async function areaClear(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = parseArea(payload.area) ?? 'local'
  if (area === 'managed') {
    return { success: false, code: 'READ_ONLY_AREA', message: 'managed storage 只读' }
  }
  await getArea(area).clear()
  return { success: true, area, cleared: true }
}

/** 保留原有 storage_get 行为，避免斜杠命令回归。 */
export async function get(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return areaGet({ area: 'local', ...payload })
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
