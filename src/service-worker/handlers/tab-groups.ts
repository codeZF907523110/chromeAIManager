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
  if (typeof payload.collapsed === 'boolean') options.collapsed = payload.collapsed
  if (typeof payload.color === 'string') {
    if (!COLORS.has(payload.color)) {
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
