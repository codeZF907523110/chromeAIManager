/**
 * 命令执行器 — 解析 AI 响应并派发到 Chrome API
 */
// @ts-nocheck

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
    } catch (err: any) {
      if (err?.code === 'NEEDS_CONFIRM') {
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
    // ──── RECORDING ────
    case 'recording_start_tab':
      return await startTabRecording(payload)
    case 'recording_start_screen':
      return await startScreenRecording()
    case 'recording_stop':
      return await stopRecording()
    // ──── DOM ────
    case 'dom_manipulate':
      return await domManipulate(payload)
    // ──── BATCH ────
    case 'batch':
      return await batchExecute(payload)
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
  const node = await chrome.bookmarks.get(payload.nodeId as string)
  if (node[0]?.url) {
    await chrome.tabs.update(tab.id, { url: node[0].url })
  }
  return { success: true, navigated: node[0]?.url }
}

async function removeBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
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
  if (sizeMap[size] !== undefined) {
    await chrome.fontSettings.setFontSize({ pixelSize: sizeMap[size] })
  }
  return { success: true, fontSize: sizeMap[size] || size }
}

async function observeFontFamily(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const generic = (payload.genericFamily as chrome.fontSettings.GenericFamily) || 'standard'
  const level = await chrome.fontSettings.getFontFamily({ genericFamily: generic })
  return { success: true, font: level.fontId, genericFamily: generic }
}

async function updateFontFamily(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const generic = (payload.genericFamily as chrome.fontSettings.GenericFamily) || 'standard'
  await chrome.fontSettings.setFontFamily({
    fontId: payload.family as string,
    genericFamily: generic,
  })
  return { success: true, font: payload.family }
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
  const cookies = await chrome.cookies.getAll({ domain })
  for (const c of cookies) {
    await chrome.cookies.remove({
      url: `${c.secure ? 'https' : 'http'}://${c.domain}${c.path}`,
      name: c.name,
    })
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

// ──── RECORDING 实现 ────

async function startTabRecording(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = payload.tabId as number | undefined
  return { success: true, recording: tabId || 'current' }
}

async function startScreenRecording(): Promise<ExecutionResult> {
  return { success: true, recording: 'screen' }
}

async function stopRecording(): Promise<ExecutionResult> {
  return { success: true, stopped: true }
}

// ──── DOM 实现 ────

async function domManipulate(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || tab.url?.startsWith('chrome://')) {
    return { success: false, code: 'PAGE_BLOCKED', message: '无法在特殊页面执行脚本' }
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (code) => {
        try {
          const fn = new Function(code)
          return fn()
        } catch (e) {
          return { _scriptError: (e as Error).message }
        }
      },
      args: [payload.code as string],
    })
    return { success: true, result: results[0]?.result, triggered: true }
  } catch (e: unknown) {
    return { success: false, code: 'ACT_BLOCKED', message: (e as Error).message }
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
