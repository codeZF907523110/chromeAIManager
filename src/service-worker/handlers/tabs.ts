/**
 * 标签页相关 SW 命令实现
 * 对应 swIntent: tabs_*
 */

import { findDuplicateGroups } from '../utils/tab-matcher'
import { query as queryTabGroups } from './tab-groups'
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

/** 获取单个标签页的真实状态。 */
export async function get(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = payload.tabId
  if (typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId < 0) {
    return { success: false, code: 'INVALID_PARAMS', message: 'tabId 必须是非负整数' }
  }
  const tab = await chrome.tabs.get(tabId)
  return { success: true, tab }
}

/** 创建新标签 */
export async function create(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const opts: chrome.tabs.CreateProperties = {}
  if (payload.url !== undefined) {
    if (typeof payload.url !== 'string' || !isWebUrl(payload.url)) {
      return { success: false, code: 'INVALID_PARAMS', message: 'url 必须是合法的 http/https URL' }
    }
    opts.url = payload.url
  }
  if (payload.active !== undefined && typeof payload.active !== 'boolean') {
    return { success: false, code: 'INVALID_PARAMS', message: 'active 必须是 boolean' }
  }
  if (payload.active !== undefined) opts.active = payload.active
  if (payload.windowId !== undefined) {
    if (
      typeof payload.windowId !== 'number' ||
      !Number.isInteger(payload.windowId) ||
      payload.windowId < 0
    ) {
      return { success: false, code: 'INVALID_PARAMS', message: 'windowId 必须是非负整数' }
    }
    opts.windowId = payload.windowId
  }
  if (payload.index !== undefined) {
    if (
      typeof payload.index !== 'number' ||
      !Number.isInteger(payload.index) ||
      payload.index < 0
    ) {
      return { success: false, code: 'INVALID_PARAMS', message: 'index 必须是非负整数' }
    }
    opts.index = payload.index
  }
  const created = await chrome.tabs.create(opts)
  const tab = created.id === undefined ? created : await chrome.tabs.get(created.id)
  return { success: true, tab }
}

/** 校验可导航的网页 URL。 */
function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname
  } catch {
    return false
  }
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

/** 高亮指定标签页。 */
export async function highlight(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = normalizeTabIds(payload.tabIds)
  if (!tabIds.length)
    return { success: false, code: 'INVALID_PARAMS', message: 'tabIds 必须是非空数字数组' }
  const windowId = payload.windowId
  if (
    windowId !== undefined &&
    (typeof windowId !== 'number' || !Number.isInteger(windowId) || windowId < 0)
  ) {
    return { success: false, code: 'INVALID_PARAMS', message: 'windowId 必须是非负整数' }
  }
  const window = await chrome.tabs.highlight({
    tabs: tabIds,
    windowId: windowId as number | undefined,
  })
  return { success: true, window }
}

/** 后退到指定标签页的上一页，并回读标签状态。 */
export async function goBack(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return navigateHistory(payload, 'back')
}

/** 前进到指定标签页的下一页，并回读标签状态。 */
export async function goForward(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return navigateHistory(payload, 'forward')
}

/** 执行历史导航并返回最新标签页。 */
async function navigateHistory(
  payload: Record<string, unknown>,
  direction: 'back' | 'forward'
): Promise<ExecutionResult> {
  const tabId = await resolveTabId(payload.tabId)
  if (tabId === null)
    return { success: false, code: 'INVALID_PARAMS', message: 'tabId 无效或未找到活动标签' }
  await chrome.tabs[direction === 'back' ? 'goBack' : 'goForward'](tabId)
  return { success: true, direction, tab: await chrome.tabs.get(tabId) }
}

/** 截取目标窗口当前可见标签页。 */
export async function captureVisibleTab(
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const windowId = payload.windowId
  if (
    windowId !== undefined &&
    (typeof windowId !== 'number' || !Number.isInteger(windowId) || windowId < 0)
  ) {
    return { success: false, code: 'INVALID_PARAMS', message: 'windowId 必须是非负整数' }
  }
  const image = await chrome.tabs.captureVisibleTab(windowId as number | undefined, {
    format: 'png',
  })
  return { success: true, image, windowId }
}

/** 获取指定标签页的缩放比例。 */
export async function getZoom(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = parseExplicitTabId(payload.tabId)
  if (tabId === null)
    return { success: false, code: 'INVALID_PARAMS', message: 'tabId 必须是非负整数' }
  return { success: true, tabId, zoomFactor: await chrome.tabs.getZoom(tabId) }
}

/** 设置标签页缩放比例并回读。 */
export async function setZoom(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = parseExplicitTabId(payload.tabId)
  const zoomFactor = payload.zoomFactor
  if (
    tabId === null ||
    typeof zoomFactor !== 'number' ||
    !Number.isFinite(zoomFactor) ||
    zoomFactor <= 0
  ) {
    return { success: false, code: 'INVALID_PARAMS', message: 'tabId 或 zoomFactor 无效' }
  }
  await chrome.tabs.setZoom(tabId, zoomFactor)
  return { success: true, tabId, zoomFactor: await chrome.tabs.getZoom(tabId) }
}

/** 获取标签页缩放设置。 */
export async function getZoomSettings(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = parseExplicitTabId(payload.tabId)
  if (tabId === null)
    return { success: false, code: 'INVALID_PARAMS', message: 'tabId 必须是非负整数' }
  return { success: true, tabId, settings: await chrome.tabs.getZoomSettings(tabId) }
}

/** 设置标签页缩放设置并回读。 */
export async function setZoomSettings(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = parseExplicitTabId(payload.tabId)
  if (tabId === null || !isPlainObject(payload.settings)) {
    return { success: false, code: 'INVALID_PARAMS', message: 'tabId 或 settings 无效' }
  }
  await chrome.tabs.setZoomSettings(tabId, payload.settings)
  return { success: true, tabId, settings: await chrome.tabs.getZoomSettings(tabId) }
}

/** 解析显式 tabId，拒绝字符串和非法数字。 */
function parseExplicitTabId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** 判断值是否为普通对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export async function update(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = normalizeTabIds(payload.tabIds)
  if (Array.isArray(payload.tabIds)) {
    if (!tabIds.length)
      return { success: false, code: 'INVALID_PARAMS', message: 'tabIds 必须是非空数字数组' }
    const updateProps = buildUpdateProps(payload)
    const results = await Promise.allSettled(
      tabIds.map((id) => chrome.tabs.update(id, updateProps))
    )
    return {
      success: results.every((result) => result.status === 'fulfilled'),
      updated: tabIds.length,
    }
  }
  const tabId = await resolveTabId(payload.tabId)
  if (tabId === null) return { success: false, code: 'NO_TABS_FOUND', message: '未找到目标标签' }
  const tab = await chrome.tabs.update(tabId, buildUpdateProps(payload))
  return { success: true, tab }
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
  const requestedIds = payload.tabIds
  if (requestedIds !== undefined && !Array.isArray(requestedIds)) {
    return { success: false, code: 'INVALID_PARAMS', message: 'tabIds 必须是数组' }
  }
  const tabIds = requestedIds === undefined ? undefined : normalizeTabIds(requestedIds)
  if (
    requestedIds !== undefined &&
    (!tabIds?.length || new Set(requestedIds).size !== requestedIds.length)
  ) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: 'tabIds 必须是非空且不重复的数字数组',
    }
  }
  const index = payload.index
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    return { success: false, code: 'INVALID_PARAMS', message: 'index 必须是非负整数' }
  }

  if (!tabIds?.length) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (active?.id === undefined)
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
    const reversed = [...(tabIds ?? [])].reverse()
    for (const id of reversed) {
      await chrome.tabs.move([id], { index })
    }
    return { success: true, moved: reversed.length, tabIds: tabIds ?? [], newIndex: index }
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

/** 解析 URL 的 hostname（去除 www. 前缀，小写）；URL 无效返回空串。 */
function normalizedHostname(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** 判断标签是否匹配指定 domain（域名完全相等或为子域名）。 */
function tabMatchesDomain(tab: chrome.tabs.Tab, domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, '')
  const hostname = normalizedHostname(tab.url)
  if (!d || !hostname) return false
  const matched = hostname === d || hostname.endsWith(`.${d}`)
  console.log(
    `[AI管家] tabMatchesDomain tab=${tab.id} url=${tab.url} hostname=${hostname} domain=${d} matched=${matched}`
  )
  return matched
}

/** 关闭标签（dangerous — 由 dispatchTool 统一拦截）。
 *
 * 支持两种入参模式：
 *   1) tabIds 数组 → 仅关闭指定标签（不做 domain 重新匹配）
 *   2) domain（可选 currentWindow，默认 true）→ 关闭当前窗口匹配域名的非固定标签
 *   3) tabIds + domain → 仍以 tabIds 为准（domain 仅作语义提示）
 *
 * 设计：传入 tabIds 时表示"用户已勾选/已确认"，必须严格按 tabIds 执行，
 * 不应再基于 domain 二次扩展，避免"只勾了一个却关了全部"。
 */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  console.log(`[AI管家] tabs.remove enter payload=${JSON.stringify(payload)}`)
  const explicitTabIds = normalizeTabIds(payload.tabIds)
  console.log(`[AI管家] tabs.remove explicit tabIds=${JSON.stringify(explicitTabIds)}`)

  let tabIds = explicitTabIds
  // 只有当调用方没有显式传 tabIds 时，才允许基于 domain 重新查询。
  if (tabIds.length === 0 && typeof payload.domain === 'string' && payload.domain.trim()) {
    const query: chrome.tabs.QueryOptions =
      payload.currentWindow === false ? {} : { currentWindow: true }
    console.log(
      `[AI管家] tabs.remove domain mode query=${JSON.stringify(query)} domain=${payload.domain}`
    )
    const tabs = await chrome.tabs.query(query)
    console.log(
      `[AI管家] tabs.remove queried tabs total=${tabs.length}`,
      `sample=${tabs.slice(0, 3).map((t) => `${t.id}:${(t.url || '').slice(0, 60)}`).join(',')}`
    )
    for (const t of tabs) {
      if (t.id === undefined || t.pinned) continue
      if (!tabMatchesDomain(t, payload.domain)) continue
      tabIds.push(t.id)
    }
    console.log(`[AI管家] tabs.remove after merge=${JSON.stringify(tabIds)}`)
  } else if (tabIds.length > 0 && typeof payload.domain === 'string' && payload.domain.trim()) {
    console.log(
      `[AI管家] tabs.remove explicit tabIds takes precedence, skip domain re-query (domain=${payload.domain})`
    )
  }

  const uniqueIds = [...new Set(tabIds)]
  console.log(`[AI管家] tabs.remove uniqueIds=${JSON.stringify(uniqueIds)}`)
  if (!uniqueIds.length) {
    console.log('[AI管家] tabs.remove no ids to close, return success with removed=0')
    return { success: true, removed: 0, message: '没有可关闭的标签' }
  }
  await chrome.tabs.remove(uniqueIds)
  console.log(`[AI管家] tabs.remove done removed=${uniqueIds.length}`)
  return { success: true, removed: uniqueIds.length, tabIds: uniqueIds }
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
  return queryTabGroups({})
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
