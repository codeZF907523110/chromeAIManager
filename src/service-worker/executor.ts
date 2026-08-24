/**
 * 命令执行器 — 解析 AI 响应并派发到 Chrome API
 */

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
          message: (e as { message?: string }).message || '需要确认',
          detail: (e as { detail?: Record<string, unknown> }).detail,
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
    // ──── BATCH ────
    case 'batch':
      return await batchExecute(payload)
    // ──── TASK_PLAN ────
    case 'task_plan':
      return (await execPlan(
        payload as unknown as import('./task-planner').ExecPlanPayload
      )) as unknown as ExecutionResult
    // ──── BROWSER DOM 操作（Playwright MCP 兼容）────
    case 'browser_snapshot':
      return await executeBrowserTool('browser_snapshot', payload)
    case 'browser_click':
      return await executeBrowserTool('browser_click', payload)
    case 'browser_type':
      return await executeBrowserTool('browser_type', payload)
    case 'browser_select_option':
      return await executeBrowserTool('browser_select_option', payload)
    case 'browser_hover':
      return await executeBrowserTool('browser_hover', payload)
    case 'browser_press_key':
      return await executeBrowserTool('browser_press_key', payload)
    case 'browser_check':
      return await executeBrowserTool('browser_check', payload)
    case 'browser_uncheck':
      return await executeBrowserTool('browser_uncheck', payload)
    case 'browser_fill_form':
      return await executeBrowserTool('browser_fill_form', payload)
    case 'browser_wait_for':
      return await executeBrowserTool('browser_wait_for', payload)
    case 'browser_take_screenshot':
      return await executeBrowserTool('browser_take_screenshot', payload)
    case 'browser_navigate':
      return await executeBrowserTool('browser_navigate', payload)
    case 'browser_navigate_back':
      return await executeBrowserTool('browser_navigate_back', payload)
    case 'browser_navigate_forward':
      return await executeBrowserTool('browser_navigate_forward', payload)
    case 'browser_reload':
      return await executeBrowserTool('browser_reload', payload)
    // 标签页别名映射到旧体系
    case 'browser_tab_list':
      return await observeTabs(payload)
    case 'browser_tab_new':
      return await createTab(payload)
    case 'browser_tab_select':
      return await updateTab({ ...payload, updateType: 'select' })
    case 'browser_tab_close':
      return await removeTabs(payload)
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
    detail: { intent, payload, nodeId: payload.nodeId, title: payload.title },
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
  const tab = await chrome.tabs.update(tabId!, updateProps)
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
  const results: Array<chrome.bookmarks.BookmarkTreeNode & { path?: string; childCount?: number }> =
    []
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
      // 构建节点路径
      const nodePath = node.parentId ? `.../${node.parentId}/${node.id}` : `/${node.id}`
      results.push({
        id: node.id,
        title: node.title,
        type: isFolder ? 'folder' : 'url',
        url: node.url,
        parentId: node.parentId,
        index: node.index,
        path: nodePath,
        childCount: node.children?.length || 0,
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
  const moveProps: chrome.bookmarks.MoveProperties = { index: 0 }
  if (payload.parentId !== undefined) moveProps.parentId = payload.parentId as string
  moveProps.index = (payload.index as number) ?? 0
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
  return {
    success: true,
    key: payload.key,
    value: (result as Record<string, unknown>)[payload.key as string],
  }
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

// ──── BROWSER DOM 操作（Playwright MCP 兼容）────

const BROWSER_TOOL_TO_MESSAGE: Record<string, string> = {
  browser_snapshot: 'SNAPSHOT',
  browser_click: 'CLICK',
  browser_type: 'TYPE',
  browser_select_option: 'SELECT',
  browser_hover: 'HOVER',
  browser_press_key: 'PRESS_KEY',
  browser_navigate: 'NAVIGATE',
  browser_take_screenshot: 'SCREENSHOT',
  browser_check: 'CHECK',
  browser_uncheck: 'UNCHECK',
  browser_fill_form: 'FILL_FORM',
  browser_wait_for: 'WAIT_FOR',
  browser_navigate_back: 'NAVIGATE_BACK',
  browser_navigate_forward: 'NAVIGATE_FORWARD',
  browser_reload: 'RELOAD',
}

async function executeBrowserTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ExecutionResult> {
  const message = BROWSER_TOOL_TO_MESSAGE[toolName]
  if (!message) {
    return { success: false, code: 'UNKNOWN_TOOL', message: `未知工具: ${toolName}` }
  }

  const tabInfo = await getCurrentTab()
  if (!tabInfo) {
    return { success: false, code: 'TAB_NOT_FOUND', message: '未找到活动标签页' }
  }

  try {
    const response = await chrome.tabs.sendMessage(tabInfo.tabId, {
      type: message,
      ...args,
      timestamp: Date.now(),
    })
    return mapContentScriptResponse(response)
  } catch {
    // chrome.tabs.sendMessage 失败（如 content script 未加载）
    return {
      success: false,
      code: 'CONTENT_SCRIPT_ERROR',
      message: 'Content Script 未响应，请确认页面已加载扩展',
      suggestion: 'RELOAD_PAGE',
    }
  }
}

function mapContentScriptResponse(response: unknown): ExecutionResult {
  if (!response || typeof response !== 'object') {
    return { success: false, code: 'INVALID_RESPONSE', message: '无效响应' }
  }
  const r = response as {
    success: boolean
    data?: unknown
    error?: string
    message?: string
    suggestion?: string
  }
  if (r.success) {
    return { success: true, result: r.data }
  }
  return {
    success: false,
    code: r.error || 'UNKNOWN_ERROR',
    message: r.message || r.error,
    suggestion: r.suggestion,
  }
}

async function getCurrentTab(): Promise<{ tabId: number } | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || tab.id === undefined) return null
    return { tabId: tab.id }
  } catch {
    return null
  }
}
