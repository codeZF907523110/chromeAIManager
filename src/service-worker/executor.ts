/**
 * 命令执行器 — 解析 AI 响应并派发到 Chrome API
 */

import { execPlan } from './task-planner'

import type { ExecutionResult } from '../types/execution'

const DANGEROUS_INTENTS = new Set([
  'tabs_remove',
  'tabs_remove_by_url',
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
    case 'tabs_remove_by_url':
      return await removeTabsByUrl(payload)
    case 'tabs_observe_groups':
      return await observeGroups()
    case 'tabs_group_by_domain':
      // 这个命令由 side panel 自己执行（chrome.tabs.group 需要用户激活的上下文），
      // SW 只负责计算 tabIds + windowId 映射，返回给 side panel 让它直接调 API
      return await prepareGroupByDomain(payload)
    case 'tabs_ungroup_all':
      return await ungroupAllTabs(payload)
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
    // 填充 children 字段，让前端确认卡可以展示可勾选的子项列表。
    // 各 intent 的子项计算逻辑不同：
    //   - bookmarks_remove_node: 文件夹下的直接子节点（书签 + 子文件夹）
    //   - tabs_remove: 用户传入的 tabIds 对应的标签列表（前端已计算）
    detail: {
      intent,
      payload,
      nodeId: payload.nodeId,
      title: payload.title,
      children: await buildConfirmChildren(intent, payload),
    },
  }
}

/**
 * 为二次确认卡构建 children 列表。每条形如 { id, title, url }，
 * 前端会映射为带 checkbox 的可勾选项。
 * 不支持的 intent 返回 undefined，前端按"无 children"处理。
 */
async function buildConfirmChildren(
  intent: string,
  payload: Record<string, unknown>
): Promise<Array<{ id: string | number; title?: string; url?: string }> | undefined> {
  try {
    if (intent === 'bookmarks_remove_node') {
      // 文件夹删除场景：列出直接子项让用户勾选
      const nodeId = payload.nodeId as string | undefined
      if (!nodeId) return undefined
      try {
        // 先校验节点存在且是文件夹（getChildren 对非文件夹 id 也会抛 NotFoundError）
        const nodes = await chrome.bookmarks.get(nodeId)
        const node = nodes[0]
        if (!node || !node.children) {
          // 节点不是文件夹（叶子书签），没有"子项"可勾选
          return undefined
        }
        const children = await chrome.bookmarks.getChildren(nodeId)
        return children.map((c) => ({
          id: c.id,
          title: c.title,
          url: c.url,
        }))
      } catch (e: unknown) {
        // 节点不存在或 chrome.bookmarks 抛错时返回 undefined，
        // 让前端走"无 children"路径——避免错误冒泡阻塞二次确认流程。
        console.warn('[buildConfirmChildren] 读取书签节点失败:', nodeId, e)
        return undefined
      }
    }
    if (intent === 'tabs_remove') {
      // 批量删除标签：列出入参 tabIds 对应的标签信息
      const tabIds = Array.isArray(payload.tabIds) ? (payload.tabIds as number[]) : []
      if (!tabIds.length) return undefined
      const tabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null)))
      return tabs
        .filter((t): t is chrome.tabs.Tab => !!t && t.id !== undefined)
        .map((t) => ({
          id: t.id as number,
          title: t.title,
          url: t.url,
        }))
    }
    if (intent === 'history_remove' && payload.query) {
      // 历史删除场景：按 query 搜索得到候选 URL 列表
      const items = await chrome.history.search({
        text: payload.query as string,
        maxResults: 20,
      })
      return items
        .filter((it) => !!it.url)
        .map((it) => ({
          id: it.url as string,
          title: it.title,
          url: it.url,
        }))
    }
  } catch (e) {
    console.warn('[buildConfirmChildren] 获取 children 失败:', e)
  }
  return undefined
}

// ──── TABS 实现 ────

async function observeTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const query: chrome.tabs.QueryOptions = {} as chrome.tabs.QueryOptions
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
  // 统一处理 tabIds，支持字符串数组或数字数组
  const tabIds = (payload.tabIds as unknown[])
    ? (payload.tabIds as unknown[])
        .map((id: unknown) => Number(id))
        .filter((id: number) => !isNaN(id))
    : undefined
  const index = payload.index as number

  if (!tabIds?.length) {
    // 没有指定 tabIds，移动当前活动标签
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
    // chrome.tabs.move 支持单 tab 移动和批量移动两种形式。
    // 这里要做"全局重排"：批量 move 会按 tabIds 顺序依次放到 index 起点，
    // 与"按当前期望顺序整体替换"的语义不一致——批量后顺序是输入顺序的反向 / 错位，
    // 并且同域名的相邻 tab 会被前面的非相邻插入分隔开。
    // 正确做法：把期望顺序倒序逐个 move 到 0，最终结果正好等于期望顺序。
    //   期望 [D1, D2, D3]
    //   move D3→0: [D3, ...]
    //   move D2→0: [D2, D3, ...]
    //   move D1→0: [D1, D2, D3, ...] ✓
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

async function removeTabsByUrl(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 纯 url/title 子串模糊匹配。已删除 hostname 匹配，与前端 close_tabs_by_url 一致。
  const q = ((payload.query as string) || '').toLowerCase().trim()
  if (!q) return { success: false, code: 'INVALID_PARAMS', message: '缺少匹配关键词' }

  // 优先用前端勾选过的 tabIds；勾选列表为空再回退到自动匹配
  const explicitTabIds = Array.isArray(payload.tabIds) ? (payload.tabIds as number[]) : []
  let tabIds: number[]
  if (explicitTabIds.length > 0) {
    tabIds = explicitTabIds.filter((id) => typeof id === 'number')
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

/**
 * 一键取消所有标签分组
 * 与 group_by_domain 类似，需要从用户激活的上下文（side panel）执行，
 * SW 只负责计算每个分组包含的 tabIds。
 */
async function ungroupAllTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
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

  // 收集所有分组（同时返回每个分组的 tabIds，方便预览/勾选）
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

  // 序列化成 side panel 直接使用的格式
  const groups: Array<{ groupId: number; tabIds: number[] }> = []
  for (const [groupId, tabIds] of groupMap) {
    groups.push({ groupId, tabIds })
  }

  // 如果用户已经勾选了子集（前端 confirm 卡勾选后回传），只把这些分组给客户端
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

async function prepareGroupByDomain(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // MV3 Service Worker 不是用户激活的上下文，chrome.tabs.group 在这里会被静默挂起。
  // 解决方案：SW 端只计算"按窗口分桶的 tabIds"，返回给 side panel 让它在用户激活上下文中调 API。
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

  // 收集每个标签的 hostname
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

  // 按 hostname 分组，每个 (hostname, windowId) 一组
  const groupMap = new Map<string, number[]>()
  for (const { id, hostname, windowId } of eligible) {
    const key = `${hostname}\0${windowId}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(id)
  }

  // 序列化成可被 side panel 直接使用的格式
  const groups: Array<{ title: string; tabIds: number[]; windowId: number }> = []
  for (const [key, tabIds] of groupMap) {
    if (tabIds.length < 2) continue // 跨窗口后单标签不分组
    const sepIdx = key.indexOf('\0')
    const hostname = key.slice(0, sepIdx)
    const windowId = Number(key.slice(sepIdx + 1))
    groups.push({ title: hostname, tabIds, windowId })
  }

  return {
    success: true,
    // 自定义字段，side panel 通过此标志决定走客户端执行路径
    clientExec: 'tabs_group_by_domain',
    groups,
    count: groups.length,
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

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
  const nodeId = String(payload.nodeId || '')
  if (!nodeId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '缺少 nodeId 参数',
      suggestion: '请先调用 bookmarks_observe_tree 获取书签列表，从返回结果中获取 nodeId',
    }
  }

  const moveProps: chrome.bookmarks.MoveProperties = { index: 0 }
  if (payload.parentId !== undefined) {
    moveProps.parentId = String(payload.parentId)
  }
  moveProps.index = (payload.index as number) ?? 0

  try {
    const node = await chrome.bookmarks.move(nodeId, moveProps)
    return { success: true, node, moved: true, newIndex: node.index }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return {
      success: false,
      code: 'BOOKMARK_MOVE_FAILED',
      message: e?.message || '移动书签失败',
      suggestion: '请检查 nodeId 是否正确，或尝试先获取书签列表确认节点存在',
    }
  }
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
  // 支持两种粒度：
  // 1) 单节点删除：payload.nodeId 为字符串（文件夹或书签 id）
  // 2) 子集删除：payload.selectedIds 是从 NEEDS_CONFIRM 二次确认回传的 id 数组，
  //    用于"只删除文件夹下我勾选的那几个子项"。注意：selectedIds 中的字符串会保留原始字符串 id（书签 API 是 string）。
  const nodeId = payload.nodeId as string | undefined
  const selectedIds = Array.isArray(payload.selectedIds) ? (payload.selectedIds as unknown[]) : []

  if (selectedIds.length > 0) {
    // 子集删除：忽略 nodeId，按勾选列表逐个删除
    // 兼容前端传来的 number（如 Number('100')=100）和 string 两种 id 形态，
    // 转字符串时过滤掉 NaN / 0 / 空字符串等无效值，避免传给 chrome.bookmarks.remove('NaN')
    const idsToRemove = selectedIds
      .map((id) => (typeof id === 'number' ? id : Number(id)))
      .filter((id): id is number => Number.isFinite(id) && id > 0)
      .map((id) => String(id))
    for (const id of idsToRemove) {
      try {
        await chrome.bookmarks.remove(id)
      } catch (e: unknown) {
        // 单个失败不影响其他；记录但继续
        console.warn('[removeBookmark] 删除失败:', id, e)
      }
    }
    if (!idsToRemove.length) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        message: '所选项目没有有效的 id',
      }
    }
    return { success: true, removed: idsToRemove.length }
  }

  if (!nodeId) {
    return { success: false, code: 'INVALID_PARAMS', message: '缺少 nodeId' }
  }
  await chrome.bookmarks.remove(nodeId)
  return { success: true }
}

async function addCurrentPageBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const url = payload.url as string | undefined
  const title = payload.title as string | undefined
  let targetUrl: string
  let targetTitle: string

  if (url) {
    // 显式指定 url：以 payload 为主
    if (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('javascript:')
    ) {
      return { success: false, code: 'PAGE_BLOCKED', message: '无法为特殊页面添加书签' }
    }
    try {
      new URL(url)
    } catch {
      return { success: false, code: 'INVALID_PARAMS', message: 'URL 格式无效' }
    }
    targetUrl = url
    targetTitle = title || url
  } else {
    // 未指定 url：使用当前活动标签
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url || tab.url.startsWith('chrome://')) {
      return { success: false, code: 'PAGE_BLOCKED', message: '无法为特殊页面添加书签' }
    }
    targetUrl = tab.url
    targetTitle = title || tab.title || targetUrl
  }

  const bookmark = await chrome.bookmarks.create({
    title: targetTitle,
    url: targetUrl,
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
  // /history 默认展示今天全部；query 留空 = 列出当天所有历史，非空 = 按关键词过滤
  // （chrome.history.search 自带 title/url 匹配）。
  const query = ((payload.query as string) || '').trim()
  const maxResults = (payload.maxResults as number) || 50
  // 把"今天的 0 点"和"现在的时刻"一起回传给前端，便于反馈里直接显示"今天"时间窗。
  const startTime = new Date().setHours(0, 0, 0, 0)
  const endTime = Date.now()

  const items = await chrome.history.search({
    text: query,
    maxResults,
    startTime,
    endTime,
  })
  return {
    success: true,
    items: items.map((i) => ({
      title: i.title,
      url: i.url,
      lastVisitTime: i.lastVisitTime,
      visitCount: i.visitCount,
    })),
    found: items.length,
    // 时间窗 meta：让前端知道这是当天的结果，反馈卡片标题可以直接用 "今天" 标记
    timeRange: { start: startTime, end: endTime, label: '今天' },
  }
}

async function removeHistory(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 支持两种粒度：
  // 1) 单次删除：payload.timeRange（如 'today' / 'week' / 'all'）+ 可选 payload.query
  // 2) 子集删除：payload.selectedUrls 是从 NEEDS_CONFIRM 二次确认回传的 url 列表，
  //    用于"只删除搜索结果中我勾选的那几个"。
  const range = payload.timeRange as string
  const selectedUrls = Array.isArray(payload.selectedUrls)
    ? (payload.selectedUrls as unknown[]).map((u) => String(u)).filter(Boolean)
    : []

  if (selectedUrls.length > 0) {
    for (const url of selectedUrls) {
      try {
        await chrome.history.deleteUrl(url)
      } catch (e: unknown) {
        console.warn('[removeHistory] 删除失败:', url, e)
      }
    }
    return { success: true, deleted: selectedUrls.length }
  }

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
  if (!calls?.length)
    return {
      success: false,
      code: 'UNKNOWN_TYPE',
      message: 'batch calls 为空',
      suggestion: '请检查 calls 数组是否为空',
    }

  const results: ExecutionResult[] = []
  let succeeded = 0
  let failed = 0

  for (let i = 0; i < calls.length; i++) {
    try {
      const call = calls[i]
      const r = await executeCommand(call.tool, call.args)
      results.push(r)
      if (r.success) {
        succeeded++
      } else {
        failed++
        console.error(`[batch] Step ${i} failed:`, r.message || r.code)
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      results.push({
        success: false,
        code: 'BATCH_STEP_ERROR',
        message: e?.message || '步骤执行失败',
        index: i,
        tool: calls[i]?.tool,
        suggestion: '请检查工具名称和参数是否正确',
      })
      failed++
    }
  }

  if (failed > 0) {
    return {
      success: false,
      code: 'BATCH_PARTIAL_FAILURE',
      message: `${succeeded} 成功，${failed} 失败`,
      results,
      total: calls.length,
      succeeded,
      failed,
      suggestion:
        failed === calls.length
          ? '所有步骤都失败了，请检查参数或改用单步操作'
          : `部分步骤成功，失败步骤的错误信息已返回`,
    }
  }

  return { success: true, results, total: calls.length, succeeded }
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
  // 截图不走 content script（content script 未实现），直接调用 SW 能力
  if (toolName === 'browser_take_screenshot') {
    return await takeScreenshot(args)
  }

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
