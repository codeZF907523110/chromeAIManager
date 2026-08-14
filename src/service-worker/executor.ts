/**
 * 命令执行器 — 解析 AI 响应并派发到 Chrome API
 */
// @ts-nocheck

import { execPlan } from './task-planner'

import type { ExecutionResult } from '../types/execution'

const DANGEROUS_INTENTS = new Set([
  'tabs_remove',
  'bookmarks_remove_node',
  'history_remove',
  'cookies_remove',
  'extensions_remove',
])

// ──── 执行入口 ────

export async function executeCommand(
  intent: string,
  payload: Record<string, unknown> = {}
): Promise<ExecutionResult> {
  // 危险操作二次确认
  if (DANGEROUS_INTENTS.has(intent)) {
    try {
      await checkDangerousConfirm(intent, payload)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e?.code === 'NEEDS_CONFIRM') {
        return {
          success: false,
          code: 'NEEDS_CONFIRM',
          message: err.message || '需要确认',
          detail: err.detail,
        }
      }
      throw err
    }
  }

  switch (intent) {
    // ──── TABS ────
    case 'tabs_observe':
      return await observeTabs(payload)
    case 'tabs_create':
      return await createTab(payload)
    case 'tabs_update':
      return await updateTab(payload)
    case 'tabs_move':
      return await moveTabs(payload)
    case 'tabs_remove':
      return await removeTabs(payload)
    case 'tabs_group':
      return await groupTabs(payload)
    case 'tabs_ungroup':
      return await ungroupTabs(payload)
    case 'tabs_observe_groups':
      return await observeGroups()
    case 'tabs_group_by_domain':
      return await groupByDomain()
    // ──── BOOKMARKS ────
    case 'bookmarks_observe_tree':
      return await observeBookmarks(payload)
    case 'bookmarks_move_node':
      return await moveBookmark(payload)
    case 'bookmarks_create_node':
      return await createBookmark(payload)
    case 'bookmarks_update_node':
      return await updateBookmark(payload)
    case 'bookmarks_open_node':
      return await openBookmark(payload)
    case 'bookmarks_remove_node':
      return await removeBookmark(payload)
    case 'bookmarks_add_current_page':
      return await addCurrentPageBookmark(payload)
    // ──── WINDOWS ────
    case 'windows_observe':
      return await observeWindows(payload)
    case 'windows_create':
      return await createWindow(payload)
    case 'windows_update':
      return await updateWindow(payload)
    // ──── HISTORY ────
    case 'history_search':
      return await searchHistory(payload)
    case 'history_remove':
      return await removeHistory(payload)
    // ──── NAVIGATION ────
    case 'navigate':
      return await navigateTo(payload)
    case 'screenshot':
      return await takeScreenshot(payload)
    // ──── PAGE ────
    case 'zoom':
      return await setZoom(payload)
    case 'downloads_open':
      return { success: true, navigated: 'chrome://downloads' }
    // ──── THEME ────
    case 'theme_observe':
      return await observeTheme()
    case 'theme_update':
      return await updateTheme(payload)
    // ──── FONT ────
    case 'font_size_observe':
      return await observeFontSize()
    case 'font_size_update':
      return await updateFontSize(payload)
    case 'font_family_observe':
      return await observeFontFamily(payload)
    case 'font_family_update':
      return await updateFontFamily(payload)
    // ──── COOKIES ────
    case 'cookies_observe':
      return await observeCookies(payload)
    case 'cookies_remove':
      return await removeCookies(payload)
    // ──── TOP_SITES ────
    case 'top_sites_observe':
      return await observeTopSites()
    // ──── EXTENSIONS ────
    case 'extensions_observe':
      return await observeExtensions(payload)
    case 'extensions_update':
      return await updateExtension(payload)
    case 'extensions_remove':
      return await removeExtension(payload)
    // ──── PERMISSIONS ────
    case 'permissions_observe':
      return await observePermissions(payload)
    case 'permissions_update':
      return await updatePermissions(payload)
    // ──── STORAGE ────
    case 'storage_get':
      return await getStorage(payload)
    case 'storage_set':
      return await setStorage(payload)
    case 'storage_remove':
      return await removeStorage(payload)
    // ──── SESSIONS ────
    case 'sessions_restore':
      return await restoreSession(payload)
    // ──── DOM ────
    case 'dom_manipulate':
      return await domManipulate(payload)
    // ──── BATCH ────
    case 'batch':
      return await batchExecute(payload)
    // ──── TASK_PLAN ────
    case 'task_plan':
      return await execPlan(payload)
    default:
      return { success: false, code: 'UNKNOWN_INTENT', message: `未知命令: ${intent}` }
  }
}

// ──── 危险操作确认 ────
// 注意：Service Worker 中不可用 confirm()，改为返回 NEEDS_CONFIRM 让前端处理
async function checkDangerousConfirm(
  intent: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  // force=true 表示用户已在前端确认，跳过二次确认
  if (payload.force === true) return true
  throw {
    success: false,
    code: 'NEEDS_CONFIRM',
    message: `确认执行 "${intent}" 操作？此操作不可撤销。`,
    detail: { intent, payload },
  }
}

// ──── TABS 实现 ────

async function observeTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const query: chrome.tabs.QueryOptions = {}
  if (payload.currentWindow) query.currentWindow = true
  if (payload.pinned !== undefined) query.pinned = payload.pinned as boolean
  if (payload.muted !== undefined) query.muted = payload.muted as boolean
  if (payload.discarded !== undefined) query.discarded = payload.discarded as boolean
  if (payload.maxResults) query.maxResults = payload.maxResults as number

  const tabs = await chrome.tabs.query(query)
  let filtered = tabs

  if (payload.domain) {
    const d = (payload.domain as string).toLowerCase()
    filtered = filtered.filter((t) => {
      try {
        return new URL(t.url!).hostname.includes(d)
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

async function createTab(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const opts: chrome.tabs.CreateProperties = {}
  if (payload.url) opts.url = payload.url as string
  if (payload.active !== undefined) opts.active = payload.active as boolean
  if (payload.windowId) opts.windowId = payload.windowId as number
  if (payload.index !== undefined) opts.index = payload.index as number
  const tab = await chrome.tabs.create(opts)
  return { success: true, tab }
}

async function updateTab(payload: Record<string, unknown>): Promise<ExecutionResult> {
  let tabId = payload.tabId as number | undefined
  if (!tabId) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!active?.id) return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
    tabId = active.id
  }
  const updateProps: chrome.tabs.UpdateProperties = {}
  if (payload.url !== undefined) updateProps.url = payload.url as string
  if (payload.active !== undefined) updateProps.active = payload.active as boolean
  if (payload.muted !== undefined) updateProps.muted = payload.muted as boolean
  if (payload.pinned !== undefined) updateProps.pinned = payload.pinned as boolean
  if (payload.discarded !== undefined) updateProps.discarded = payload.discarded as boolean
  const tab = await chrome.tabs.update(tabId, updateProps)
  return { success: true, tab, reloaded: payload.reload ? true : undefined }
}

async function moveTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = payload.tabIds as number[] | undefined
  const index = payload.index as number
  if (!tabIds?.length) {
    return { success: false, code: 'INVALID_PARAMS', message: '缺少 tabIds 参数' }
  }
  const tabs = await chrome.tabs.move(tabIds, { index })
  return { success: true, moved: Array.isArray(tabs) ? tabs.length : 1 }
}

async function removeTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = payload.tabIds as number[] | undefined
  if (!tabIds?.length) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!active?.id) return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
    await chrome.tabs.remove(active.id)
    return { success: true, removed: 1 }
  }
  await chrome.tabs.remove(tabIds)
  return { success: true, removed: tabIds.length }
}

async function groupTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = payload.tabIds as number[]
  const groupProps: chrome.tabs.GroupProperties = { tabIds }
  if (payload.groupId !== undefined) groupProps.groupId = payload.groupId as number
  if (payload.title) groupProps.title = payload.title as string
  if (payload.color) groupProps.color = payload.color as chrome.tabs.TabGroupColor
  const groupId = await chrome.tabs.group(groupProps)
  return { success: true, groupedTabs: tabIds.length, groupId, title: payload.title }
}

async function ungroupTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = payload.tabIds as number[] | undefined
  if (tabIds?.length) {
    await chrome.tabs.ungroup(tabIds)
    return { success: true }
  }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!active?.id) return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
  if (active.groupId !== -1) {
    await chrome.tabs.ungroup([active.id])
  }
  return { success: true }
}

async function observeGroups(): Promise<ExecutionResult> {
  const tabs = await chrome.tabs.query({})
  const groupMap = new Map<number, { color: string; title?: string; tabs: string[] }>()
  for (const tab of tabs) {
    if (tab.groupId !== -1) {
      if (!groupMap.has(tab.groupId)) {
        groupMap.set(tab.groupId, {
          color: tab.groupId !== -1 ? 'gray' : 'gray',
          title: tab.title,
          tabs: [],
        })
      }
      groupMap.get(tab.groupId)!.tabs.push(tab.title || '')
    }
  }
  return { success: true, groups: Array.from(groupMap.entries()).map(([id, g]) => ({ id, ...g })) }
}

async function groupByDomain(): Promise<ExecutionResult> {
  const tabs = await chrome.tabs.query({ currentWindow: true })
  if (!tabs.length) return { success: false, code: 'NO_TABS_FOUND', message: '当前窗口没有标签' }
  const domainMap = new Map<string, number[]>()
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || !tab.id) continue
    try {
      const d = new URL(tab.url).hostname
      if (!domainMap.has(d)) domainMap.set(d, [])
      domainMap.get(d)!.push(tab.id)
    } catch {
      /* ignore */
    }
  }
  for (const [, ids] of domainMap) {
    if (ids.length > 1) {
      await chrome.tabs.group({ tabIds: ids, createProperties: { windowId: tabs[0].windowId } })
    }
  }
  return { success: true }
}

// ──── BOOKMARKS 实现 ────

async function observeBookmarks(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tree = await chrome.bookmarks.getTree()
  const results: chrome.bookmarks.BookmarkTreeNode[] = []
  const maxDepth = (payload.maxDepth as number) || 3
  const maxResults = (payload.maxResults as number) || 100
  const nodeType = payload.nodeType as string | undefined
  const query = payload.query as string | undefined

  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[], depth: number) {
    if (results.length >= maxResults) return
    if (depth > maxDepth) return
    for (const node of nodes) {
      if (results.length >= maxResults) break
      const isFolder = !!node.children
      const isBookmark = !!node.url
      if (nodeType === 'folder' && !isFolder) continue
      if (nodeType === 'bookmark' && !isBookmark) continue
      if (query) {
        const match = (node.title || '').includes(query) || (node.url || '').includes(query)
        if (!match) {
          if (node.children) walk(node.children, depth + 1)
          continue
        }
      }
      results.push({
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId,
        index: node.index,
        dateAdded: node.dateAdded,
        dateGroupCreated: node.dateGroupCreated,
      })
      if (node.children) walk(node.children, depth + 1)
    }
  }

  walk(tree, 0)
  return { success: true, nodes: results, observed: results.length }
}

async function moveBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const moveProps: chrome.bookmarks.MoveProperties = {}
  if (payload.parentId !== undefined) moveProps.parentId = payload.parentId as string
  if (payload.index !== undefined) moveProps.index = payload.index as number
  const node = await chrome.bookmarks.move(payload.nodeId as string, moveProps)
  return { success: true, node }
}

async function createBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const opts: chrome.bookmarks.CreateDetails = {
    title: payload.title as string,
    parentId: payload.parentId as string,
  }
  if (payload.url !== undefined) opts.url = payload.url as string
  if (payload.index !== undefined) opts.index = payload.index as number
  const node = await chrome.bookmarks.create(opts)
  return { success: true, bookmark: node }
}

async function updateBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const changes: chrome.bookmarks.BookmarkChangeInfo = {}
  if (payload.title !== undefined) changes.title = payload.title as string
  if (payload.url !== undefined) changes.url = payload.url as string
  const node = await chrome.bookmarks.update(payload.nodeId as string, changes)
  return { success: true, bookmark: node }
}

async function openBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
  if (!payload.nodeId) {
    return { success: false, code: 'INVALID_PARAMS', message: '缺少 nodeId' }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
  const node = await chrome.bookmarks.get(payload.nodeId as string)
  if (node[0]?.url) {
    await chrome.tabs.update(tab.id, { url: node[0].url })
  }
  return { success: true, navigated: node[0]?.url }
}

async function removeBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
  if (!payload.nodeId) {
    return { success: false, code: 'INVALID_PARAMS', message: '缺少 nodeId' }
  }
  await chrome.bookmarks.remove(payload.nodeId as string)
  return { success: true }
}

async function addCurrentPageBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url || tab.url.startsWith('chrome://')) {
    return { success: false, code: 'PAGE_BLOCKED', message: '无法为特殊页面添加书签' }
  }
  const bookmark = await chrome.bookmarks.create({
    title: (payload.title as string) || tab.title,
    url: tab.url,
  })
  return { success: true, bookmark }
}

// ──── WINDOWS 实现 ────

async function observeWindows(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const opts: chrome.windows.QueryOptions = { windowTypes: ['normal', 'popup', 'app'] }
  if (payload.includeTabs) opts.populate = true
  const wins = await chrome.windows.getAll(opts)
  return { success: true, windows: wins, observed: wins.length }
}

async function createWindow(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const opts: chrome.windows.CreateData = {}
  if (payload.url) opts.url = payload.url as string
  if (payload.incognito) opts.incognito = true
  const win = await chrome.windows.create(opts)
  return { success: true, window: win }
}

async function updateWindow(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const changes: chrome.windows.UpdateInfo = {}
  if (payload.focused !== undefined) changes.focused = payload.focused as boolean
  if (payload.state) changes.state = payload.state as chrome.windows.WindowState
  const win = await chrome.windows.update(payload.windowId as number, changes)
  return { success: true, window: win }
}

// ──── HISTORY 实现 ────

async function searchHistory(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const query = payload.query as string
  const maxResults = (payload.maxResults as number) || 20
  const range = payload.timeRange as string | undefined
  const validRanges = ['today', 'yesterday', 'week', 'month']
  const endTime = range && validRanges.includes(range) ? Date.now() : undefined
  let startTime: number | undefined
  if (range === 'today') {
    startTime = new Date().setHours(0, 0, 0, 0)
  } else if (range === 'yesterday') {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    startTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  } else if (range === 'week') {
    startTime = Date.now() - 7 * 86400000
  } else if (range === 'month') {
    startTime = Date.now() - 30 * 86400000
  }

  const items = await chrome.history.search({
    text: query,
    maxResults,
    startTime,
    endTime,
  })
  return {
    success: true,
    items: items.map((i) => ({ title: i.title, url: i.url })),
    found: items.length,
  }
}

async function removeHistory(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const range = payload.timeRange as string
  if (range === 'all') {
    await chrome.history.deleteAll()
    return { success: true }
  }
  const endTime = Date.now()
  const startTime =
    range === 'today'
      ? new Date().setHours(0, 0, 0, 0)
      : range === 'yesterday'
        ? new Date().setDate(new Date().getDate() - 1)
        : range === 'week'
          ? Date.now() - 7 * 86400000
          : range === 'month'
            ? Date.now() - 30 * 86400000
            : 0

  if (payload.query) {
    const items = await chrome.history.search({
      text: payload.query as string,
      maxResults: 10000,
      startTime,
      endTime,
    })
    for (const item of items) {
      if (item.url) await chrome.history.deleteUrl(item.url)
    }
    return { success: true, deleted: items.length }
  }

  const deleted = await chrome.history.deleteRange({ startTime, endTime })
  return { success: true, deleted }
}

// ──── NAVIGATION 实现 ────

async function navigateTo(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const url = payload.url as string
  if (!url) return { success: false, code: 'INVALID_PARAMS', message: 'URL 为空' }
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('javascript:')
  ) {
    return { success: false, code: 'PAGE_BLOCKED', message: '无法导航到受保护页面' }
  }
  try {
    new URL(url)
  } catch {
    return { success: false, code: 'INVALID_PARAMS', message: 'URL 格式无效' }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
  if (payload.newTab) {
    await chrome.tabs.create({ url })
  } else {
    await chrome.tabs.update(tab.id, { url })
  }
  return { success: true, navigated: url }
}

async function takeScreenshot(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = payload.tabId as number | undefined
  let targetTab: chrome.tabs.Tab | undefined
  if (tabId) {
    try {
      targetTab = await chrome.tabs.get(tabId)
    } catch {
      /* ignore */
    }
  }
  if (!targetTab) {
    ;[targetTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  }
  if (!targetTab?.windowId)
    return { success: false, code: 'ELE_NOT_FOUND', message: '未找到活动标签' }
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'png' })
    return { success: true, screenshot: dataUrl }
  } catch {
    return { success: false, code: 'ACT_BLOCKED', message: '截图被拒绝' }
  }
}

// ──── PAGE 实现 ────

async function setZoom(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
  const currentZoom = await chrome.tabs.getZoom(tab.id)
  const direction = payload.direction as string
  let zoomFactor = currentZoom

  if (direction === 'in') zoomFactor = Math.min(currentZoom + 0.25, 3)
  else if (direction === 'out') zoomFactor = Math.max(currentZoom - 0.25, 0.25)
  else if (direction === 'reset') zoomFactor = 1

  await chrome.tabs.setZoom(tab.id, zoomFactor)
  return { success: true, zoomFactor }
}

// ──── THEME 实现 ────

async function observeTheme(): Promise<ExecutionResult> {
  try {
    const pref = await chrome.settings.private.get('theme.color_extension')
    return { success: true, themeMode: 'dark', themeColor: pref?.value }
  } catch {
    return { success: true, themeMode: 'dark', themeColor: undefined }
  }
}

async function updateTheme(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return { success: true, themeMode: payload.mode || 'device' }
}

// ──── FONT 实现 ────

async function observeFontSize(): Promise<ExecutionResult> {
  const level = await chrome.fontSettings.getFontSize()
  return { success: true, fontSize: level.pixelSize, fontSizeLabel: level.fontSize }
}

async function updateFontSize(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const sizeMap: Record<string, number> = {
    very_small: 11,
    small: 13,
    medium: 16,
    large: 20,
    very_large: 24,
  }
  const size = payload.size as string
  const pixelSize = sizeMap[size]
  if (pixelSize === undefined) {
    return { success: false, code: 'INVALID_PARAMS', message: `未知的字号: ${size}` }
  }
  await chrome.fontSettings.setFontSize({ pixelSize })
  return { success: true, fontSize: pixelSize, fontSizeLabel: size }
}

async function observeFontFamily(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const generic = (payload.genericFamily as chrome.fontSettings.GenericFamily) || 'standard'
  const level = await chrome.fontSettings.getFontFamily({ genericFamily: generic })
  return { success: true, font: level.fontId, genericFamily: generic }
}

async function updateFontFamily(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const generic = (payload.genericFamily as chrome.fontSettings.GenericFamily) || 'standard'
  const family = payload.family as string
  if (!family) {
    return { success: false, code: 'INVALID_PARAMS', message: '字体族不能为空' }
  }
  await chrome.fontSettings.setFontFamily({
    fontId: family,
    genericFamily: generic,
  })
  return { success: true, font: family }
}

// ──── COOKIES 实现 ────

async function observeCookies(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const domain = payload.domain as string
  if (!domain) {
    return { success: false, code: 'INVALID_PARAMS', message: '域名不能为空' }
  }
  const cookies = await chrome.cookies.getAll({ domain })
  return { success: true, cookies, found: cookies.length, domain }
}

async function removeCookies(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const domain = payload.domain as string
  if (!domain) {
    return { success: false, code: 'INVALID_PARAMS', message: '域名不能为空' }
  }
  const cookies = await chrome.cookies.getAll({ domain })
  for (const c of cookies) {
    const url = `${c.secure ? 'https' : 'http'}://${c.domain}${c.path.startsWith('/') ? '' : '/'}${c.path}`
    await chrome.cookies.remove({ url, name: c.name })
  }
  return { success: true, removed: cookies.length, domain }
}

// ──── TOP_SITES 实现 ────

async function observeTopSites(): Promise<ExecutionResult> {
  const sites = await chrome.topSites.get()
  return { success: true, sites, found: sites.length }
}

// ──── EXTENSIONS 实现 ────

async function observeExtensions(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const all = await chrome.management.getAll()
  let filtered = all.filter((e) => !e.isApp && !e.isComponent)
  if (payload.query) {
    const q = (payload.query as string).toLowerCase()
    filtered = filtered.filter((e) => e.name.toLowerCase().includes(q) || e.id.includes(q))
  }
  return { success: true, extensions: filtered, found: filtered.length }
}

async function updateExtension(payload: Record<string, unknown>): Promise<ExecutionResult> {
  await chrome.management.setEnabled(payload.id as string, payload.enabled as boolean)
  return { success: true }
}

async function removeExtension(payload: Record<string, unknown>): Promise<ExecutionResult> {
  await chrome.management.uninstall(payload.id as string)
  return { success: true }
}

// ──── PERMISSIONS 实现 ────

async function observePermissions(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return { success: true, domain: payload.domain || '' }
}

async function updatePermissions(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return { success: true, domain: payload.domain, setting: payload.setting, value: payload.value }
}

// ──── STORAGE 实现 ────

async function getStorage(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const result = await chrome.storage.local.get(payload.key as string)
  return { success: true, key: payload.key, value: result[payload.key as string] }
}

async function setStorage(payload: Record<string, unknown>): Promise<ExecutionResult> {
  await chrome.storage.local.set({ [payload.key as string]: payload.value })
  return { success: true, key: payload.key, value: payload.value }
}

async function removeStorage(payload: Record<string, unknown>): Promise<ExecutionResult> {
  await chrome.storage.local.remove(payload.key as string)
  return { success: true, key: payload.key }
}

// ──── SESSIONS 实现 ────

async function restoreSession(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 20 })
  const query = (payload.query as string)?.toLowerCase()

  if (!sessions.length)
    return { success: false, code: 'NO_TABS_FOUND', message: '没有可恢复的标签' }

  if (query) {
    for (const s of sessions) {
      if (s.tab?.sessionId) {
        const match =
          (s.tab.title || '').toLowerCase().includes(query) ||
          (s.tab.url || '').toLowerCase().includes(query)
        if (match) {
          await chrome.sessions.restore(s.tab.sessionId)
          return { success: true, restored: s.tab.title }
        }
      }
    }
  }

  const first = sessions.find((s) => s.tab?.sessionId) || sessions[0]
  if (first.tab?.sessionId) {
    await chrome.sessions.restore(first.tab.sessionId)
    return { success: true, restored: first.tab.title }
  }
  return { success: false, error: 'NO_RECOVERABLE_TABS' }
}

// ──── RECORDING 实现（已废弃：录制由前端 MediaRecorder 处理） ────
// 保留占位，避免遗留调用导致 ReferenceError

// ──── DOM 错误分类 ────

type ErrorCategory =
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_NOT_VISIBLE'
  | 'ELEMENT_DISABLED'
  | 'ELEMENT_STALE'
  | 'CSP_BLOCKED'
  | 'TIMEOUT'
  | 'PAGE_ERROR'
  | 'PERMISSION_DENIED'
  | 'EXECUTION_ERROR'
  | 'UNKNOWN_ERROR'

type PageRestrictionLevel = 'none' | 'csp' | 'protected' | 'blocked'

interface PageContext {
  url: string
  domain: string
  restrictionLevel: PageRestrictionLevel
}

// 环境检测配置（可配置化）
const ENV_CONFIG = {
  protectedDomains: [] as string[], // 由外部配置注入
}

// 设置环境配置（供外部调用）
export function setDOMEnvConfig(config: { protectedDomains?: string[] }) {
  if (config.protectedDomains) ENV_CONFIG.protectedDomains = config.protectedDomains
}

/**
 * 检测页面限制级别
 */
function detectPageRestriction(tabUrl: string | undefined): PageContext {
  if (!tabUrl) {
    return { url: '', domain: '', restrictionLevel: 'blocked' }
  }

  let domain = ''
  try {
    domain = new URL(tabUrl).hostname
  } catch {
    return { url: tabUrl, domain: '', restrictionLevel: 'blocked' }
  }

  // 检查保护域名列表
  for (const pattern of ENV_CONFIG.protectedDomains) {
    if (domain.includes(pattern)) {
      return { url: tabUrl, domain, restrictionLevel: 'protected' }
    }
  }

  return { url: tabUrl, domain, restrictionLevel: 'none' }
}

/**
 * 分类错误类型
 */
function categorizeError(errorMsg: string): {
  category: ErrorCategory
  retryable: boolean
  suggestion: string
} {
  const msg = (errorMsg || '').toLowerCase()

  // 不可恢复错误
  if (msg.includes('not defined') || msg.includes('is not defined')) {
    return {
      category: 'EXECUTION_ERROR',
      retryable: false,
      suggestion: '代码中存在未定义的变量，请检查变量名是否正确',
    }
  }

  if (msg.includes('syntaxerror') || msg.includes('unexpected token')) {
    return {
      category: 'EXECUTION_ERROR',
      retryable: false,
      suggestion: '代码语法错误，请检查代码格式',
    }
  }

  if (msg.includes('securityerror') || msg.includes('csp') || msg.includes('content security')) {
    return {
      category: 'CSP_BLOCKED',
      retryable: false,
      suggestion: '页面安全策略阻止了脚本执行，建议降级到备选执行环境',
    }
  }

  if (msg.includes('not allowed') || msg.includes('permission')) {
    return {
      category: 'PERMISSION_DENIED',
      retryable: false,
      suggestion: '权限不足，无法执行该操作',
    }
  }

  if (msg.includes('timeout') || msg.includes('timed out')) {
    return {
      category: 'TIMEOUT',
      retryable: true,
      suggestion: '操作超时，可以尝试重试',
    }
  }

  // 可恢复错误
  if (msg.includes('stale') || msg.includes('detached')) {
    return {
      category: 'ELEMENT_STALE',
      retryable: true,
      suggestion: '目标元素已过期，可能需要重新获取',
    }
  }

  // 默认未知错误
  return {
    category: 'UNKNOWN_ERROR',
    retryable: true,
    suggestion: '发生未知错误，可尝试重试',
  }
}

/**
 * 在指定 world 中执行脚本
 * 支持更强大的 DOM 操作能力
 */
async function executeInWorld(
  tabId: number,
  world: 'MAIN' | 'ISOLATED',
  code: string
): Promise<{
  success: boolean
  result?: unknown
  error?: string
  errorType?: string
  cspBlocked?: boolean
}> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world,
      func: (scriptCode: string, worldName: string) => {
        // ─── 序列化函数（定义在 func 内部，会被一起序列化注入页面）───
        function serializeValue(val: unknown): unknown {
          if (val === null || val === undefined) return val
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
            return val
          if (typeof val === 'function') {
            return { _type: 'function', name: val.name || 'anonymous' }
          }

          // DOM 元素 → 提取关键属性
          if (typeof Element !== 'undefined' && val instanceof Element) {
            var el = val
            var attrs: Record<string, string> = {}
            try {
              for (var i = 0; i < el.attributes.length; i++) {
                var a = el.attributes[i]
                attrs[a.name] = a.value
              }
            } catch {
              // 忽略属性提取错误
            }
            return {
              _type: 'element',
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              className: el.className || null,
              textContent: (el.textContent || '').trim().slice(0, 200) || null,
              attributes: attrs,
            }
          }

          // NodeList / HTMLCollection / 数组 → 展开
          if (typeof NodeList !== 'undefined' && val instanceof NodeList) {
            var items = Array.from(val)
            return {
              _type: 'collection',
              length: items.length,
              items: items.map(serializeValue).slice(0, 20),
            }
          }
          if (Array.isArray(val)) {
            return {
              _type: 'collection',
              length: val.length,
              items: val.map(serializeValue).slice(0, 20),
            }
          }

          // 普通对象 → JSON 序列化（防循环）
          if (typeof val === 'object') {
            var seen = new WeakSet()
            try {
              return JSON.parse(
                JSON.stringify(val, function (_k, v) {
                  if (typeof v === 'object' && v !== null) {
                    if (seen.has(v)) return '[Circular]'
                    seen.add(v)
                  }
                  return v
                })
              )
            } catch {
              try {
                return { _error: 'serialization failed', _keys: Object.keys(val) }
              } catch {
                return { _error: 'serialization failed' }
              }
            }
          }

          return val
        }

        try {
          // ─── 辅助函数（字符串形式，与用户代码在同一作用域执行）───
          // 注意：不能用模板字符串拼接，否则用户代码中的 ${} 会被误解析
          var helpers = [
            'var $ = function(s){ return document.querySelector(s); };',
            'var $$ = function(s){ return Array.from(document.querySelectorAll(s)); };',
            'var sleep = function(ms){ return new Promise(function(res){ setTimeout(res, ms); }); };',
            'var typeText = function(el, text){',
            '  el.focus(); el.value = text;',
            '  el.dispatchEvent(new Event("input", { bubbles: true }));',
            '  el.dispatchEvent(new Event("change", { bubbles: true }));',
            '};',
            'var scrollToEl = function(s){',
            '  var el = document.querySelector(s);',
            '  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });',
            '};',
            'var waitFor = function(s, t){',
            '  return new Promise(function(resolve, reject){',
            '    var el = document.querySelector(s);',
            '    if (el) { resolve(el); return; }',
            '    var obs = new MutationObserver(function(){',
            '      var el2 = document.querySelector(s);',
            '      if (el2) { obs.disconnect(); resolve(el2); }',
            '    });',
            '    obs.observe(document.body, { childList: true, subtree: true });',
            '    setTimeout(function(){',
            '      obs.disconnect();',
            '      reject(new Error("Timeout waiting for: " + s));',
            '    }, t || 5000);',
            '  });',
            '};',
            'var findByText = function(text, opt){',
            '  var searchText = text.trim().replace(/\\s+/g, " ");',
            '  var selectors = opt && opt.tag ? [opt.tag] : ["button","span","div","label","a","li"];',
            '  for (var i = 0; i < selectors.length; i++) {',
            '    var els = document.querySelectorAll(selectors[i]);',
            '    for (var j = 0; j < els.length; j++) {',
            '      var el = els[j];',
            '      var elText = (el.textContent || "").trim().replace(/\\s+/g, " ");',
            '      var matched = opt && opt.exact ? elText === searchText : elText.indexOf(searchText) !== -1;',
            '      if (matched) return el;',
            '    }',
            '  }',
            '  return null;',
            '};',
            'var clickByText = function(text, opt){',
            '  var el = findByText(text, opt);',
            '  if (!el) return null;',
            '  el.scrollIntoView({ block: "center" });',
            '  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));',
            '  return el;',
            '};',
          ].join('\n')

          // 合并辅助函数与用户代码，在同一个 new Function 作用域中执行
          // 用户代码包裹在 async 函数中，支持 await 语法
          var fullCode = helpers + '\nreturn (async function(){\n' + scriptCode + '\n})();'
          var fn = new Function(fullCode)
          var result = fn()

          // 如果返回 Promise，等待其解决
          if (result && typeof result === 'object' && typeof result.then === 'function') {
            return result.then(
              function (resolved) {
                return { success: true, result: serializeValue(resolved) }
              },
              function (err) {
                var errorMsg =
                  err && err.stack
                    ? err.stack.split('\n').slice(0, 3).join(' | ')
                    : String(err && err.message ? err.message : err)
                var errName = err && err.name ? err.name : 'Error'
                var isCsp =
                  errName === 'SecurityError' ||
                  errorMsg.toLowerCase().includes('csp') ||
                  errorMsg.toLowerCase().includes('content security') ||
                  errorMsg.toLowerCase().includes('unsafe')
                return {
                  success: false,
                  error: errorMsg,
                  errorType: errName,
                  cspBlocked: isCsp || undefined,
                  world: worldName,
                }
              }
            )
          }

          return { success: true, result: serializeValue(result) }
        } catch (e) {
          var err = e
          var errorMsg =
            err && err.stack
              ? err.stack.split('\n').slice(0, 4).join(' | ')
              : String(err && err.message ? err.message : err)

          // 检测 CSP 拦截
          if (
            (err && err.name === 'SecurityError') ||
            errorMsg.toLowerCase().includes('csp') ||
            errorMsg.toLowerCase().includes('content security') ||
            errorMsg.toLowerCase().includes('unsafe')
          ) {
            return {
              success: false,
              error: errorMsg,
              errorType: err ? err.name : 'SecurityError',
              cspBlocked: true,
              world: worldName,
            }
          }

          return {
            success: false,
            error: errorMsg,
            errorType: err ? err.name : 'Error',
            world: worldName,
          }
        }
      },
      args: [code, world],
    })

    const result = results[0]?.result
    if (result && typeof result === 'object' && 'success' in result) {
      return result as {
        success: boolean
        result?: unknown
        error?: string
        errorType?: string
        cspBlocked?: boolean
      }
    }

    return { success: false, error: '未知结果' }
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e)
    const isCsp =
      (e as Error)?.name === 'SecurityError' ||
      msg.toLowerCase().includes('csp') ||
      msg.toLowerCase().includes('content security') ||
      msg.toLowerCase().includes('unsafe')
    return {
      success: false,
      error: msg,
      errorType: isCsp ? 'SecurityError' : 'RuntimeError',
      cspBlocked: isCsp || undefined,
    }
  }
}

/**
 * 验证 DOM 操作结果
 */
async function verifyDOMResult(
  tabId: number,
  world: 'MAIN' | 'ISOLATED',
  verificationCode: string
): Promise<{ verified: boolean; result?: unknown; error?: string; verifyValue?: unknown }> {
  if (!verificationCode) {
    return { verified: true }
  }

  const result = await executeInWorld(tabId, world, verificationCode)
  if (result.success) {
    // verify 代码应返回布尔值：true 表示验证通过，false/null/undefined 表示验证失败
    const value = result.result
    if (value === false || value === null || value === undefined) {
      return { verified: false, error: `验证未通过`, verifyValue: value }
    }
    return { verified: true, result: value, verifyValue: value }
  }

  return { verified: false, error: result.error }
}

// ──── DOM 实现 ────

export async function domManipulate(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || tab.url?.startsWith('chrome://')) {
    return { success: false, code: 'PAGE_BLOCKED', message: '无法在特殊页面执行脚本' }
  }

  const code = payload.code as string
  const verifyCode = payload.verify as string | undefined

  // 事前：检测页面环境
  const pageContext = detectPageRestriction(tab.url)

  // 如果页面被保护，直接提示使用替代方案
  if (pageContext.restrictionLevel === 'protected') {
    return {
      success: false,
      code: 'PAGE_PROTECTED',
      message: `当前页面（${pageContext.domain}）可能存在访问限制，直接 DOM 操作可能失败`,
      detail: {
        domain: pageContext.domain,
        restrictionLevel: pageContext.restrictionLevel,
        suggestion: '建议使用 navigate 工具直接导航到目标 URL，或描述具体需求让我给出替代方案',
      },
    }
  }

  // 层级 1：MAIN world（完整页面 API）
  const mainResult = await executeInWorld(tab.id, 'MAIN', code)

  // MAIN world 成功
  if (mainResult.success) {
    // 事后：验证操作结果（如果有验证代码）
    if (verifyCode) {
      const verifyResult = await verifyDOMResult(tab.id, 'MAIN', verifyCode)
      if (!verifyResult.verified) {
        return {
          success: false,
          code: 'VERIFICATION_FAILED',
          message: '操作执行成功，但验证失败',
          detail: {
            executionResult: mainResult.result,
            verificationError: verifyResult.error,
            verifyValue: verifyResult.verifyValue,
          },
        }
      }
    }
    return { success: true, result: mainResult.result, triggered: true, world: 'MAIN' }
  }

  // MAIN world 失败，检查是否是 CSP 错误
  if (mainResult.cspBlocked) {
    // 层级 2：降级到 ISOLATED world
    const isolatedResult = await executeInWorld(tab.id, 'ISOLATED', code)

    if (isolatedResult.success) {
      // ISOLATED world 成功
      if (verifyCode) {
        const verifyResult = await verifyDOMResult(tab.id, 'ISOLATED', verifyCode)
        if (!verifyResult.verified) {
          return {
            success: false,
            code: 'VERIFICATION_FAILED',
            message: '操作执行成功，但验证失败',
            detail: {
              executionResult: isolatedResult.result,
              verificationError: verifyResult.error,
              verifyValue: verifyResult.verifyValue,
              world: 'ISOLATED',
            },
          }
        }
      }
      return { success: true, result: isolatedResult.result, triggered: true, world: 'ISOLATED' }
    }

    // 两个 world 都失败，优先展示 ISOLATED world 的错误（更接近用户代码的真实问题）
    const isolatedError = categorizeError(isolatedResult.error || '')

    return {
      success: false,
      code: isolatedError.category,
      message: isolatedResult.error || mainResult.error || '脚本执行失败',
      detail: {
        mainWorldError: mainResult.error,
        isolatedWorldError: isolatedResult.error,
        suggestion: isolatedError.suggestion,
        category: isolatedError.category,
        retryable: isolatedError.retryable,
        pageContext: pageContext,
      },
    }
  }

  // 非 CSP 错误
  const errorInfo = categorizeError(mainResult.error || '')
  return {
    success: false,
    code: errorInfo.category,
    message: mainResult.error || '脚本执行失败',
    detail: {
      errorType: mainResult.errorType,
      suggestion: errorInfo.suggestion,
      retryable: errorInfo.retryable,
      pageContext: pageContext,
    },
  }
}

// ──── BATCH 实现 ────

async function batchExecute(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const calls = payload.calls as Array<{ tool: string; args: Record<string, unknown> }>
  if (!calls?.length) return { success: false, code: 'UNKNOWN_TYPE', message: 'batch calls 为空' }

  const results: unknown[] = []
  for (const call of calls) {
    const r = await executeCommand(call.tool, call.args)
    results.push(r)
  }
  return { success: true, results, total: calls.length }
}
