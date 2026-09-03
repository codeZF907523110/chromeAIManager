/**
 * 标签组相关 Chrome API handler。
 * Service Worker 负责查询和准备数据；需要用户界面上下文的 tabs.group/ungroup
 * 由 side panel 根据 clientExec 结果执行。
 */

import type { ExecutionResult } from '../../types/execution'

type TabGroupColor = 'blue' | 'cyan' | 'green' | 'grey' | 'orange' | 'pink' | 'purple' | 'red'

type GroupQuery = {
  windowId?: number
  collapsed?: boolean
  color?: TabGroupColor
  title?: string
}

/** 查询真实标签组及其成员 tabId。 */
export async function query(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const options: GroupQuery = {}
  if (payload.windowId !== undefined) {
    const windowId = Number(payload.windowId)
    if (!Number.isInteger(windowId) || windowId < 0) {
      return { success: false, code: 'INVALID_PARAMS', message: 'windowId 必须是非负整数' }
    }
    options.windowId = windowId
  }
  if (typeof payload.collapsed !== 'undefined' && typeof payload.collapsed !== 'boolean') {
    return { success: false, code: 'INVALID_PARAMS', message: 'collapsed 必须是 boolean' }
  }
  if (
    payload.title !== undefined &&
    (typeof payload.title !== 'string' || payload.title.length > 100)
  ) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: 'title 必须是长度不超过 100 的字符串',
    }
  }
  if (payload.collapsed !== undefined) options.collapsed = payload.collapsed as boolean
  if (payload.color !== undefined) {
    if (typeof payload.color !== 'string' || !COLORS.has(payload.color)) {
      return { success: false, code: 'INVALID_PARAMS', message: 'color 不是有效的标签组颜色' }
    }
    options.color = payload.color as TabGroupColor
  }
  const title = payload.title
  if (title !== undefined && typeof title !== 'string') {
    return { success: false, code: 'INVALID_PARAMS', message: 'title 必须是字符串' }
  }
  if (typeof title === 'string') options.title = title

  const groups = await chrome.tabGroups.query(options)
  const result = await Promise.all(
    groups.map(async (group) => {
      const tabs = await chrome.tabs.query({ groupId: group.id })
      return {
        ...group,
        tabIds: tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])),
        tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url, index: tab.index })),
      }
    })
  )
  return { success: true, groups: result, observed: result.length }
}

/** 查询单个真实标签组及其成员。 */
export async function get(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const groupId = payload.groupId
  if (typeof groupId !== 'number' || !Number.isInteger(groupId) || groupId < 0) {
    return { success: false, code: 'INVALID_PARAMS', message: 'groupId 必须是非负整数' }
  }
  try {
    const group = await chrome.tabGroups.get(groupId)
    const tabs = await chrome.tabs.query({ groupId })
    return {
      success: true,
      group: {
        ...group,
        tabIds: tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])),
        tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url, index: tab.index })),
      },
    }
  } catch (error: unknown) {
    return {
      success: false,
      code: 'GROUP_NOT_FOUND',
      message: error instanceof Error ? error.message : '标签组不存在',
    }
  }
}
/** 为指定标签组准备更新标题、颜色或折叠状态的请求。 */
export async function update(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const groupId = Number(payload.groupId)
  if (!Number.isInteger(groupId) || groupId < 0) {
    return { success: false, code: 'INVALID_PARAMS', message: 'groupId 必须是非负整数' }
  }
  const changes: Record<string, unknown> = {}
  if (payload.title !== undefined) {
    if (typeof payload.title !== 'string') {
      return { success: false, code: 'INVALID_PARAMS', message: 'title 必须是字符串' }
    }
    changes.title = payload.title
  }
  if (payload.color !== undefined) {
    if (typeof payload.color !== 'string' || !COLORS.has(payload.color)) {
      return { success: false, code: 'INVALID_PARAMS', message: 'color 不是有效的标签组颜色' }
    }
    changes.color = payload.color
  }
  if (payload.collapsed !== undefined) {
    if (typeof payload.collapsed !== 'boolean') {
      return { success: false, code: 'INVALID_PARAMS', message: 'collapsed 必须是 boolean' }
    }
    changes.collapsed = payload.collapsed
  }
  if (Object.keys(changes).length === 0) {
    return { success: false, code: 'INVALID_PARAMS', message: '至少提供 title、color 或 collapsed' }
  }
  return { success: true, clientExec: 'tab_groups_update', groupId, changes }
}

const COLORS = new Set(['blue', 'cyan', 'green', 'grey', 'orange', 'pink', 'purple', 'red'])

export async function create(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = normalizeIds(payload.tabIds)
  if (tabIds.length === 0) {
    return { success: false, code: 'INVALID_PARAMS', message: '创建标签组至少需要一个有效 tabId' }
  }

  let windowId: number | undefined
  if (payload.windowId !== undefined) {
    windowId = Number(payload.windowId)
    if (!Number.isInteger(windowId) || windowId < 0) {
      return { success: false, code: 'INVALID_PARAMS', message: 'windowId 必须是非负整数' }
    }
  }

  let color: string | undefined
  if (payload.color !== undefined) {
    if (typeof payload.color !== 'string' || !COLORS.has(payload.color)) {
      return { success: false, code: 'INVALID_PARAMS', message: 'color 不是有效的标签组颜色' }
    }
    color = payload.color
  }
  if (payload.title !== undefined && typeof payload.title !== 'string') {
    return { success: false, code: 'INVALID_PARAMS', message: 'title 必须是字符串' }
  }

  return {
    success: true,
    clientExec: 'tabs_group_create',
    tabIds,
    windowId,
    title: payload.title as string | undefined,
    color,
  }
}

/** 为指定 groupId 准备加入标签组的 clientExec 请求。 */
export async function moveTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const value = payload.groupId
  const groupId =
    typeof value === 'number' && Number.isInteger(value)
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : NaN
  const tabIds = normalizeIds(payload.tabIds)
  if (!Number.isInteger(groupId) || groupId < 0 || tabIds.length === 0) {
    return { success: false, code: 'INVALID_PARAMS', message: '需要有效的 groupId 和 tabIds' }
  }
  return { success: true, clientExec: 'tabs_group_move', groupId, tabIds }
}

/** 为指定 tabId 准备移出标签组的 clientExec 请求。 */
export async function ungroupTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = normalizeIds(payload.tabIds)
  if (tabIds.length === 0) {
    return { success: false, code: 'INVALID_PARAMS', message: '需要至少一个有效 tabId' }
  }
  return { success: true, clientExec: 'tabs_ungroup', tabIds }
}

function normalizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id >= 0))]
}

/** 解析目标窗口 ID。 */
function parseWindowId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

/** 校验指定名称的标签组是否已存在，避免重复创建。 */
async function findGroupByTitle(
  title: string,
  windowId: number | undefined,
  tabGroups: {
    query: (q: {
      title?: string
      windowId?: number
    }) => Promise<Array<{ id: number; title?: string }>>
  } | null
): Promise<chrome.tabGroups.TabGroup | null> {
  if (!title || !tabGroups) return null
  const groups = await tabGroups.query({ title, ...(windowId !== undefined ? { windowId } : {}) })
  return (groups[0] as unknown as chrome.tabGroups.TabGroup | undefined) ?? null
}

/** 按指定名称创建或复用标签组，并把目标标签加入其中；统一在 SW 内完成并回读成员。 */
export async function findOrCreateByTitle(
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const tabIds = normalizeIds(payload.tabIds)
  if (tabIds.length === 0) {
    return { success: false, code: 'INVALID_PARAMS', message: '需要至少一个有效 tabId' }
  }
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  if (!title || title.length > 100) {
    return { success: false, code: 'INVALID_PARAMS', message: 'title 必须是非空字符串' }
  }
  const windowId = parseWindowId(payload.windowId)
  if (
    payload.color !== undefined &&
    (typeof payload.color !== 'string' || !COLORS.has(payload.color))
  ) {
    return { success: false, code: 'INVALID_PARAMS', message: 'color 不合法' }
  }
  const tabGroupsApi = (
    globalThis as unknown as {
      chrome?: {
        tabGroups?: {
          query: (q: {
            title?: string
            windowId?: number
          }) => Promise<Array<{ id: number; title?: string }>>
          get: (id: number) => Promise<{ id: number; title?: string }>
          update: (
            id: number,
            props: { title?: string; color?: string }
          ) => Promise<{ id: number; title?: string }>
        }
      }
    }
  ).chrome?.tabGroups
  const tabsApi = (
    globalThis as unknown as {
      chrome?: {
        tabs?: {
          get: (id: number) => Promise<unknown>
          group: (o: unknown) => Promise<number>
          query: (q: { groupId?: number }) => Promise<Array<{ id?: number }>>
        }
      }
    }
  ).chrome?.tabs
  if (!tabGroupsApi || !tabsApi) {
    return { success: false, code: 'API_UNAVAILABLE', message: 'tabGroups API 不可用' }
  }
  const color = payload.color as chrome.tabGroups.ColorEnum | undefined
  for (const tabId of tabIds) {
    try {
      await tabsApi.get(tabId)
    } catch {
      return { success: false, code: 'TARGET_NOT_FOUND', message: `目标标签 ${tabId} 不存在` }
    }
  }
  let group = await findGroupByTitle(title, windowId, tabGroupsApi)
  let reused = Boolean(group)
  if (!group) {
    const groupId = await tabsApi.group({
      tabIds,
      createProperties: windowId === undefined ? undefined : { windowId },
    })
    await tabGroupsApi.update(groupId, { title, ...(color ? { color } : {}) })
    group = await tabGroupsApi.get(groupId)
  } else {
    await tabsApi.group({ groupId: group.id, tabIds })
    if (color) await tabGroupsApi.update(group.id, { color })
    group = await tabGroupsApi.get(group.id)
  }
  const members = await tabsApi.query({ groupId: group!.id })
  return {
    success: true,
    reused,
    group,
    tabIds: members.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])),
  }
}
