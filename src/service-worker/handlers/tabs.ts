/**
 * 标签页相关 SW 命令实现
 * 对应 swIntent: tabs_*
 */

import { findDuplicateGroups } from '../utils/tab-matcher'
import type { ExecutionResult } from '../../types/execution'

/** 查询标签列表（按 query / domain / currentWindow / pinned / muted / discarded 过滤） */
export async function observe(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const query: chrome.tabs.QueryOptions = {} as chrome.tabs.QueryOptions
  if (payload.currentWindow === true) query.currentWindow = true
  if (payload.pinned !== undefined) query.pinned = payload.pinned as boolean
  if (payload.muted !== undefined) query.muted = payload.muted as boolean
  if (payload.discarded !== undefined) query.discarded = payload.discarded as boolean
  if (payload.maxResults !== undefined) {
    const maxResults = Number(payload.maxResults)
    if (!Number.isInteger(maxResults) || maxResults < 0) {
      return { success: false, code: 'INVALID_PARAMS', message: 'maxResults 必须是非负整数' }
    }
    query.maxResults = maxResults
  }

  const tabs = await chrome.tabs.query(query)
  let filtered = tabs

  if (payload.domain) {
    const d = String(payload.domain)
      .toLowerCase()
      .replace(/^www\./, '')
    filtered = filtered.filter((t) => {
      try {
        const hostname = new URL(t.url || '').hostname.toLowerCase().replace(/^www\./, '')
        return hostname === d || hostname.endsWith(`.${d}`)
      } catch {
        return false
      }
    })
  }
  if (payload.query) {
    const q = (payload.query as string).toLowerCase()
    filtered = filtered.filter(
      (t) => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q)
    )
  }

  return { success: true, tabs: filtered, observed: filtered.length }
}

/** 创建新标签 */
export async function create(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const opts: chrome.tabs.CreateProperties = {}
  if (payload.url) opts.url = payload.url as string
  if (payload.active !== undefined) opts.active = payload.active as boolean
  if (payload.windowId) opts.windowId = payload.windowId as number
  if (payload.index !== undefined) opts.index = payload.index as number
  const tab = await chrome.tabs.create(opts)
  return { success: true, tab }
}

/** 重新加载指定或当前活动标签页。 */
export async function reload(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = await resolveTabId(payload.tabId)
  if (tabId === null) return { success: false, code: 'NO_TABS_FOUND', message: '未找到目标标签' }
  await chrome.tabs.reload(tabId)
  const tab = await chrome.tabs.get(tabId)
  return { success: true, tab, reloaded: true }
}

/** 复制指定或当前活动标签页。 */
export async function duplicate(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = await resolveTabId(payload.tabId)
  if (tabId === null) return { success: false, code: 'NO_TABS_FOUND', message: '未找到目标标签' }
  const tab = await chrome.tabs.duplicate(tabId)
  return { success: true, tab, duplicated: true }
}

/** 休眠指定标签页；默认仅休眠非活动标签，避免误操作当前页面。 */
export async function discard(payload: Record<string, unknown>): Promise<ExecutionResult> {
  let tabs = await chrome.tabs.query({})
  if (Array.isArray(payload.tabIds)) {
    const ids = new Set(payload.tabIds.map(Number).filter((id) => Number.isInteger(id)))
    tabs = tabs.filter((tab) => tab.id !== undefined && ids.has(tab.id))
  } else if (payload.domain) {
    const domain = String(payload.domain).toLowerCase()
    tabs = tabs.filter((tab) => {
      try {
        const hostname = new URL(tab.url || '').hostname.toLowerCase()
        return hostname === domain || hostname.endsWith(`.${domain}`)
      } catch {
        return false
      }
    })
  } else if (payload.all !== true) {
    tabs = tabs.filter((tab) => tab.active !== true)
  }

  let discarded = 0
  for (const tab of tabs) {
    if (tab.id === undefined || tab.active || tab.discarded) continue
    try {
      await chrome.tabs.discard(tab.id)
      discarded++
    } catch (e: unknown) {
      return {
        success: false,
        code: 'DISCARD_FAILED',
        message: e instanceof Error ? e.message : String(e),
        suggestion: '活动标签或当前页面不能休眠，请缩小 tabIds 范围',
      }
    }
  }
  return { success: true, discarded }
}

/** 解析目标 tabId；未指定时返回当前窗口活动标签。 */
async function resolveTabId(value: unknown): Promise<number | null> {
  if (value !== undefined) {
    const id = Number(value)
    return Number.isInteger(id) && id >= 0 ? id : null
  }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  return active?.id === undefined ? null : active.id
}

/** 更新单个或多个标签属性（url / active / muted / pinned / discarded）。
 * 数组 payload 用于斜杠命令的批量操作，单 tab payload 保持原有兼容行为。
 */
export async function update(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = normalizeTabIds(payload.tabIds)
  if (Array.isArray(payload.tabIds)) {
    if (tabIds.length === 0) {
      return { success: false, code: 'INVALID_PARAMS', message: 'tabIds 必须是非空数字数组' }
    }
    const updateProps = buildUpdateProps(payload)
    const shouldReload = payload.reload === true
    if (Object.keys(updateProps).length === 0 && !shouldReload && payload.discarded !== true) {
      return { success: false, code: 'INVALID_PARAMS', message: '至少提供一个要更新的标签属性' }
    }
    const results = await Promise.allSettled(
      tabIds.map(async (id) => {
        if (shouldReload) await chrome.tabs.reload(id)
        if (payload.discarded === true && Object.keys(updateProps).length === 0) {
          await chrome.tabs.discard(id)
          return null
        }
        return Object.keys(updateProps).length > 0 ? chrome.tabs.update(id, updateProps) : null
      })
    )
    const updated = results.filter((result) => result.status === 'fulfilled').length
    return {
      success: updated === tabIds.length,
      code: updated === tabIds.length ? undefined : 'PARTIAL_SUCCESS',
      message: `已处理 ${updated} 个标签页`,
      updated,
      failed: tabIds.length - updated,
      reloaded: shouldReload,
    }
  }

  let tabId = payload.tabId as number | undefined
  if (tabId === undefined) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (active?.id === undefined)
      return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
    tabId = active.id
  }
  const tabIdValue = tabId!
  if (payload.reload === true) await chrome.tabs.reload(tabIdValue)
  const updateProps = buildUpdateProps(payload)
  if (Object.keys(updateProps).length === 0 && payload.reload !== true) {
    return { success: false, code: 'INVALID_PARAMS', message: '至少提供一个要更新的标签属性' }
  }
  const tab =
    Object.keys(updateProps).length > 0
      ? await chrome.tabs.update(tabIdValue, updateProps)
      : await chrome.tabs.get(tabIdValue)
  return { success: true, tab, reloaded: payload.reload === true }
}

/** 从兼容 payload 中提取 tabs.update 支持的字段。 */
function buildUpdateProps(payload: Record<string, unknown>): chrome.tabs.UpdateProperties {
  const updateProps: chrome.tabs.UpdateProperties = {}
  if (payload.url !== undefined) updateProps.url = payload.url as string
  if (payload.active !== undefined) updateProps.active = payload.active as boolean
  if (payload.muted !== undefined) updateProps.muted = payload.muted as boolean
  if (payload.pinned !== undefined) updateProps.pinned = payload.pinned as boolean
  if (payload.discarded !== undefined) updateProps.discarded = payload.discarded as boolean
  return updateProps
}

/** 仅保留合法、去重的数字 tabId。 */
function normalizeTabIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id >= 0)
    ),
  ]
}

/** 移动标签（按 index 位置）。空 tabIds 移动当前活动标签；倒序逐个 move 以实现"按目标顺序整体重排"。 */
export async function move(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = (payload.tabIds as unknown[])
    ? (payload.tabIds as unknown[])
        .map((id: unknown) => Number(id))
        .filter((id: number) => !isNaN(id))
    : undefined
  const index = Number(payload.index)
  if (!Number.isInteger(index) || index < 0) {
    return { success: false, code: 'INVALID_PARAMS', message: 'index 必须是非负整数' }
  }

  if (!tabIds?.length) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!active?.id)
      return {
        success: false,
        code: 'NO_TABS_FOUND',
        message: '未找到活动标签',
        suggestion: '请先打开一个标签页',
      }
    const tabs = await chrome.tabs.move([active.id], { index })
    return {
      success: true,
      moved: Array.isArray(tabs) ? tabs.length : 1,
      tabId: active.id,
      newIndex: index,
    }
  }

  try {
    const reversed = [...tabIds].reverse()
    for (const id of reversed) {
      await chrome.tabs.move([id], { index })
    }
    return { success: true, moved: reversed.length, tabIds, newIndex: index }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return {
      success: false,
      code: 'MOVE_FAILED',
      message: e?.message || '移动标签失败',
      suggestion: '请检查 tabIds 是否有效，标签页可能已被关闭',
    }
  }
}

/** 关闭标签（dangerous — 由 dispatchTool 统一拦截） */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = payload.tabIds as number[] | undefined
  if (!tabIds?.length) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (active?.id === undefined)
      return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
    await chrome.tabs.remove(active.id)
    return { success: true, removed: 1 }
  }
  await chrome.tabs.remove(tabIds)
  return { success: true, removed: tabIds.length }
}

/** 按 url/title 子串模糊匹配关闭标签（dangerous）。支持前端预勾选的 tabIds。 */
export async function removeByUrl(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const q = ((payload.query as string) || '').toLowerCase().trim()
  if (!q) return { success: false, code: 'INVALID_PARAMS', message: '缺少匹配关键词' }

  const explicitTabIds = Array.isArray(payload.tabIds) ? normalizeTabIds(payload.tabIds) : []
  let tabIds: number[]
  if (explicitTabIds.length > 0) {
    const allTabs = await chrome.tabs.query({})
    tabIds = allTabs
      .filter((tab) => explicitTabIds.includes(tab.id ?? -1))
      .filter((tab) => {
        const lowerUrl = (tab.url || '').toLowerCase()
        const title = (tab.title || '').toLowerCase()
        return lowerUrl.includes(q) || title.includes(q)
      })
      .flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))
  } else {
    const tabs = await chrome.tabs.query({})
    tabIds = tabs
      .filter((t) => {
        if (t.id === undefined || t.pinned) return false
        if (!t.url) return false
        const lowerUrl = t.url.toLowerCase()
        const title = (t.title || '').toLowerCase()
        return lowerUrl.includes(q) || title.includes(q)
      })
      .map((t) => t.id)
  }

  if (!tabIds.length) {
    return { success: true, removed: 0, message: '没有匹配该关键词的标签' }
  }
  await chrome.tabs.remove(tabIds)
  return { success: true, removed: tabIds.length }
}

/** 列出所有标签分组 */
export async function observeGroups(): Promise<ExecutionResult> {
  const tabs = await chrome.tabs.query({})
  const groupMap = new Map<number, { color: string; title?: string; tabs: string[] }>()
  for (const tab of tabs) {
    if (tab.groupId !== -1) {
      if (!groupMap.has(tab.groupId)) {
        groupMap.set(tab.groupId, {
          color: 'grey',
          title: tab.title,
          tabs: [],
        })
      }
      groupMap.get(tab.groupId)!.tabs.push(tab.title || '')
    }
  }
  return { success: true, groups: Array.from(groupMap.entries()).map(([id, g]) => ({ id, ...g })) }
}

/**
 * 按域名分组（clientExec 路径）
 * MV3 Service Worker 调用 chrome.tabs.group 会被静默挂起。
 * 返回分组数据，让 side panel 在用户激活上下文中调 API。
 */
export async function groupByDomain(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const allWindows = payload.allWindows !== false
  let tabs: chrome.tabs.Tab[]
  if (allWindows) {
    tabs = await chrome.tabs.query({})
  } else {
    const lastFocused = await chrome.windows.getLastFocused({ windowTypes: ['normal'] })
    if (!lastFocused?.id) {
      return { success: false, code: 'NO_TABS_FOUND', message: '找不到当前窗口' }
    }
    tabs = await chrome.tabs.query({ windowId: lastFocused.id })
  }

  if (!tabs.length) {
    return { success: false, code: 'NO_TABS_FOUND', message: '没有可分组的标签' }
  }

  const eligible: Array<{ id: number; hostname: string; windowId: number }> = []
  for (const tab of tabs) {
    if (!tab.url || tab.id === undefined) continue
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue
    if (tab.pinned) continue
    if (tab.groupId !== undefined && tab.groupId !== -1) continue
    if (tab.windowId === undefined) continue
    const hostname = safeHostname(tab.url)
    if (!hostname) continue
    eligible.push({ id: tab.id, hostname, windowId: tab.windowId })
  }

  const groupMap = new Map<string, number[]>()
  for (const { id, hostname, windowId } of eligible) {
    const key = `${hostname}\0${windowId}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(id)
  }

  const groups: Array<{ title: string; tabIds: number[]; windowId: number }> = []
  for (const [key, tabIds] of groupMap) {
    if (tabIds.length < 2) continue
    const sepIdx = key.indexOf('\0')
    const hostname = key.slice(0, sepIdx)
    const windowId = Number(key.slice(sepIdx + 1))
    groups.push({ title: hostname, tabIds, windowId })
  }

  return {
    success: true,
    clientExec: 'tabs_group_by_domain',
    groups,
    count: groups.length,
  }
}

/**
 * 一键取消所有标签分组（clientExec 路径）。
 * 支持 selectedGroupIds 子集（前端 confirm 卡勾选后回传）。
 */
export async function ungroupAll(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const allWindows = payload.allWindows !== false
  let tabs: chrome.tabs.Tab[]
  if (allWindows) {
    tabs = await chrome.tabs.query({})
  } else {
    const lastFocused = await chrome.windows.getLastFocused({ windowTypes: ['normal'] })
    if (!lastFocused?.id) {
      return { success: false, code: 'NO_TABS_FOUND', message: '找不到当前窗口' }
    }
    tabs = await chrome.tabs.query({ windowId: lastFocused.id })
  }

  const groupMap = new Map<number, number[]>()
  for (const tab of tabs) {
    if (tab.id === undefined) continue
    if (tab.groupId === undefined || tab.groupId === -1) continue
    if (!groupMap.has(tab.groupId)) groupMap.set(tab.groupId, [])
    groupMap.get(tab.groupId)!.push(tab.id)
  }

  if (!groupMap.size) {
    return {
      success: true,
      groupsCleared: 0,
      message: '当前没有任何标签分组',
    }
  }

  const groups: Array<{ groupId: number; tabIds: number[] }> = []
  for (const [groupId, tabIds] of groupMap) {
    groups.push({ groupId, tabIds })
  }

  const selectedGroupIds = Array.isArray(payload.selectedGroupIds)
    ? (payload.selectedGroupIds as unknown[])
        .map((g) => Number(g))
        .filter((g) => Number.isFinite(g))
    : null

  return {
    success: true,
    clientExec: 'tabs_ungroup_all',
    groups: selectedGroupIds ? groups.filter((g) => selectedGroupIds.includes(g.groupId)) : groups,
    count: selectedGroupIds ? selectedGroupIds.length : groups.length,
  }
}

/** 查找重复 URL 标签组（保留导出，供旧代码路径使用；新 plan 路径不调） */
export function findDuplicates(
  tabs: Array<{ id: number; title: string; url: string; windowId: number; active: boolean }>,
  targetUrl?: string
) {
  // TabInfo 是完整类型（用于 contextCache）；此处只用到 5 个字段，传 narrow 的对象即可
  return findDuplicateGroups(tabs as unknown as import('../../types').TabInfo[], targetUrl)
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
