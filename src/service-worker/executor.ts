/**
 * 命令执行器 — 解析 AI 响应并派发到 Chrome API
 */

import { execPlan } from './task-planner'

import type { ExecutionResult } from '../types/execution'

/**
 * 局部 Chrome API 类型补丁。
 * 项目依赖的 @types/chrome@0.2.7 较老，缺少 chrome.cookies.set / chrome.downloads /
 * chrome.permissions.getAll / chrome.storage.StorageArea 命名空间导出。
 * 这里按实际用到的最小集补声明，避免升级 @types/chrome 引入连锁破坏。
 * 运行时 chrome.* 对象由 Chrome 提供，声明仅用于类型检查。
 */
type ChromeSameSiteStatus = 'no_restriction' | 'lax' | 'strict'
interface ChromeCookieSetDetails {
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: ChromeSameSiteStatus
  expirationDate?: number
}
interface ChromeCookie {
  name: string
  value: string
  domain: string
}
interface ChromeCookiesSetApi {
  set(details: ChromeCookieSetDetails): Promise<ChromeCookie | null>
}
interface ChromeDownloadItem {
  id: number
  filename?: string
  url?: string
  state?: string
  totalBytes?: number
  startTime?: string
}
type ChromeDownloadState = 'in_progress' | 'interrupted' | 'complete'
interface ChromeDownloadQuery {
  query?: string[]
  state?: ChromeDownloadState
}
type ChromeFilenameConflictAction = 'uniquify' | 'overwrite' | 'prompt'
interface ChromeDownloadOptions {
  url: string
  filename?: string
  conflictAction?: ChromeFilenameConflictAction
}
interface ChromeDownloadsApi {
  download(options: ChromeDownloadOptions): Promise<number>
  search(query: ChromeDownloadQuery): Promise<ChromeDownloadItem[]>
}
interface ChromePermissionsApi {
  getAll(): Promise<{ origins?: string[]; permissions?: string[] }>
}
interface ChromeStorageAreaApi {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

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
    case 'tabs_ungroup':
      // tabs_ungroup（AI 取消指定分组）与 tabs_ungroup_all（斜杠命令取消所有/勾选）
      // 共用 ungroupAllTabs：前者读 groupIds 过滤，后者读 selectedGroupIds 过滤，逻辑统一。
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
    // ──── DOWNLOADS ────
    case 'downloads_download':
      return await downloadFile(payload)
    case 'downloads_search':
      return await searchDownloads(payload)
    case 'downloads_open':
      return await openDownloadsPage()
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
    case 'cookies_set':
      return await setCookie(payload)
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
    case 'extensions_permissions_observe':
      return await observeExtensionPermissions()
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
  // chrome.tabs.query 的 QueryInfo 只支持 currentWindow/pinned/muted 等字段，
  // 不支持 maxResults（应用层截断）和 discarded（Tab 属性，非 query 条件）。
  // 把这两类放到结果上处理，避免传给 Chrome API 触发 "Unexpected property" 报错。
  const query: chrome.tabs.QueryOptions = {} as chrome.tabs.QueryOptions
  if (payload.currentWindow) query.currentWindow = true
  if (payload.pinned !== undefined) query.pinned = payload.pinned as boolean
  if (payload.muted !== undefined) query.muted = payload.muted as boolean

  const tabs = await chrome.tabs.query(query)
  let filtered = tabs

  // discarded / domain / query 都是应用层过滤（chrome.tabs.query 不支持这些条件）
  if (payload.discarded !== undefined) {
    filtered = filtered.filter((t) => t.discarded === (payload.discarded as boolean))
  }
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
  // maxResults：先过滤再截断，避免截断后丢掉匹配项
  if (payload.maxResults) {
    filtered = filtered.slice(0, payload.maxResults as number)
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

/**
 * 观察标签分组
 * 用 chrome.tabGroups.query 取真实分组元数据（title/color/windowId/collapsed），
 * 再用 chrome.tabs.query 聚合每个分组包含的 tab（id/title/url），让 AI 能直接
 * 识别目标分组（按标题或内容）并拿到 tabIds 用于取消分组。
 * 旧实现用第一个 tab 的 title 当分组标题、color 硬编码 grey、tabs 只存标题字符串，
 * 导致 AI 无法识别目标分组（如"wzyp"分组标题被误报成首个 tab 标题）。
 * @returns { success, groups: Array<{ id, title, color, windowId, collapsed, tabIds, tabs }>, observed }
 */
async function observeGroups(): Promise<ExecutionResult> {
  const tabs = await chrome.tabs.query({})
  // tabId → tab，补全每个分组内 tab 的详情
  const tabById = new Map<number, chrome.tabs.Tab>(tabs.map((t) => [t.id as number, t]))
  // 按 groupId 聚合 tabIds
  const groupTabsMap = new Map<number, number[]>()
  for (const tab of tabs) {
    if (tab.id === undefined || tab.groupId === undefined || tab.groupId === -1) continue
    if (!groupTabsMap.has(tab.groupId)) groupTabsMap.set(tab.groupId, [])
    groupTabsMap.get(tab.groupId)!.push(tab.id)
  }
  // 取真实分组元数据（title/color/windowId/collapsed）
  const groupsMeta = await chrome.tabGroups.query({})
  const groups = groupsMeta.map((g) => {
    const tabIds = groupTabsMap.get(g.id) || []
    return {
      id: g.id,
      title: g.title || '',
      color: g.color || 'grey',
      windowId: g.windowId,
      collapsed: g.collapsed,
      tabIds,
      // tabs 详情：含 id+title+url，AI 可直接判断分组内容、直接拿 tabIds 取消分组
      tabs: tabIds.map((id) => {
        const t = tabById.get(id)
        return { id, title: t?.title || '', url: t?.url || '' }
      }),
    }
  })
  return { success: true, groups, observed: groups.length }
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

  // 分组过滤：支持两种来源——AI 直传的 groupIds（取消指定分组）或 confirm 卡回传的
  // selectedGroupIds（斜杠命令勾选子集）。两者都按 groupId 过滤，不传则取消全部分组。
  const filterIds = Array.isArray(payload.groupIds)
    ? (payload.groupIds as unknown[]).map((g) => Number(g)).filter((g) => Number.isFinite(g))
    : Array.isArray(payload.selectedGroupIds)
      ? (payload.selectedGroupIds as unknown[])
          .map((g) => Number(g))
          .filter((g) => Number.isFinite(g))
      : null

  // 过滤后无分组（如 AI 传了不存在的 groupIds）时给出明确提示
  const filtered = filterIds ? groups.filter((g) => filterIds.includes(g.groupId)) : groups
  if (filterIds && filtered.length === 0) {
    return {
      success: false,
      code: 'GROUP_NOT_FOUND',
      message: `未找到 id 为 ${filterIds.join(', ')} 的分组`,
      suggestion: '请先调用 tabs_observe_groups 获取真实分组 id',
    }
  }

  return {
    success: true,
    clientExec: 'tabs_ungroup_all',
    groups: filtered,
    count: filtered.length,
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

/**
 * 观察书签树
 * 支持三种取数模式：
 * 1. parentId：只取指定文件夹的直接子项（用 chrome.bookmarks.getChildren，局部视图，AI 整理某文件夹时用）
 * 2. 完整树：从根遍历，支持 nodeType/query/maxDepth/maxResults 过滤
 * path 字段为从根到当前节点的标题路径（如 "书签栏/开发工具/xxx"），便于 AI 判断归属。
 * @param payload - { parentId?, query?, nodeType?, maxDepth?, maxResults? }
 * @returns { success, nodes, observed, scope? }
 */
async function observeBookmarks(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 局部模式：取指定文件夹的直接子项
  const parentId = (payload.parentId as string | undefined)?.trim()
  if (parentId) {
    const children = await chrome.bookmarks.getChildren(parentId)
    const nodes = children.map((c) => toBookmarkNode(c))
    return { success: true, nodes, observed: nodes.length, scope: 'children:' + parentId }
  }

  // 完整树模式
  const tree = await chrome.bookmarks.getTree()
  const results: Array<Record<string, unknown>> = []
  // 默认上限放宽：maxDepth 3→6、maxResults 100→500，确保 AI 拿到完整书签树，
  // 避免深层节点被截断导致"找不到 nodeId"。
  const maxDepth = (payload.maxDepth as number) || 6
  const maxResults = (payload.maxResults as number) || 500
  const nodeType = payload.nodeType as string | undefined
  const query = (payload.query as string | undefined)?.toLowerCase()

  /**
   * 递归遍历书签树
   * @param nodes - 当前层节点
   * @param depth - 当前深度
   * @param titlePath - 从根到父级的标题路径（用于构建可读 path）
   */
  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[], depth: number, titlePath: string[]) {
    if (results.length >= maxResults) return
    if (depth > maxDepth) return
    for (const node of nodes) {
      if (results.length >= maxResults) break
      // 文件夹判定统一用"无 url"：getTree 填充 children 时与 !!node.children 等价，
      // 但 parentId 模式（getChildren）返回的文件夹节点不含 children 字段，
      // !!node.children 会误判成书签。书签必有 url、文件夹必无 url，这是 API 权威判定依据。
      const isFolder = !node.url
      const isBookmark = !!node.url
      // nodeType/query 过滤只决定"是否 push"，不决定"是否递归子树"。
      // 否则 nodeType=bookmark 时文件夹被 continue 跳过，其子书签永远访问不到（返回 0 的 bug）。
      const typeMatch = !nodeType || (nodeType === 'folder' ? isFolder : isBookmark)
      const queryMatch =
        !query ||
        (node.title || '').toLowerCase().includes(query) ||
        (node.url || '').toLowerCase().includes(query)
      if (typeMatch && queryMatch) {
        results.push(toBookmarkNode(node, titlePath))
      }
      // 无论是否命中过滤，只要有子树就继续递归（修复遍历 bug 的关键）
      const curTitlePath = [...titlePath, node.title || '(根)']
      if (node.children) walk(node.children, depth + 1, curTitlePath)
    }
  }

  walk(tree, 0, [])
  return { success: true, nodes: results, observed: results.length }
}

/**
 * 把 chrome.bookmarks 节点转为前端可用的书签节点对象
 * @param node - chrome 书签节点
 * @param parentTitlePath - 从根到父级的标题路径（可选，用于构建可读 path）
 * @returns 包含 id/title/type/url/parentId/index/path/childCount 等字段的对象
 */
function toBookmarkNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  parentTitlePath?: string[]
): Record<string, unknown> {
  // 文件夹判定统一用"无 url"：chrome.bookmarks.getChildren/get/move/create 返回的文件夹节点
  // 可能不含 children 字段，!!node.children 在 parentId 模式下会把文件夹误判成书签。
  // 书签必有 url、文件夹必无 url，这是 Chrome bookmarks API 的权威判定依据。
  const isFolder = !node.url
  const titlePath = parentTitlePath
    ? [...parentTitlePath, node.title || '(根)']
    : [node.title || '(根)']
  return {
    id: node.id,
    title: node.title || '',
    type: isFolder ? 'folder' : 'bookmark',
    url: node.url || '',
    parentId: node.parentId || '',
    index: node.index,
    // 可读标题路径：书签栏/开发工具/xxx（AI 可直接看出归属）
    path: titlePath.join('/'),
    // childCount：有 children 时取其长度（完整树模式 getTree 会填充）；
    // parentId 模式（getChildren）不填充 children，文件夹 childCount 显示 0，
    // 但 type 已正确判定为 folder，AI 不会误解（prompt 已说明此情况）。
    childCount: node.children?.length || 0,
    dateAdded: node.dateAdded,
    dateGroupCreated: node.dateGroupCreated,
  }
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

  // 仅设置调用方显式传入的字段；不传 index 时不强制位置 0，
  // 由 Chrome API 决定默认位置（追加到目标父级末尾），符合"移动到某文件夹"的直觉。
  const moveProps: chrome.bookmarks.MoveProperties = {}
  if (payload.parentId !== undefined) {
    moveProps.parentId = String(payload.parentId)
  }
  if (payload.index !== undefined) {
    moveProps.index = payload.index as number
  }

  try {
    const node = await chrome.bookmarks.move(nodeId, moveProps)
    // 返回 movedNode（带 nodeType/title）让前端能准确反馈"移动文件夹/书签 *xxx*"
    return { success: true, movedNode: node, newIndex: node.index }
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
  // 返回 createdNode 让前端区分"创建文件夹"vs"创建书签"
  return { success: true, createdNode: node }
}

async function updateBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const changes: chrome.bookmarks.BookmarkChangeInfo = {}
  if (payload.title !== undefined) changes.title = payload.title as string
  if (payload.url !== undefined) changes.url = payload.url as string
  const node = await chrome.bookmarks.update(payload.nodeId as string, changes)
  // 返回 updatedNode 让前端反馈"更新文件夹/书签 *xxx*"，而非误判成"添加书签"
  return { success: true, updatedNode: node }
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
  // 返回 openedNode 让前端反馈"打开书签 *xxx*"
  return { success: true, openedNode: node[0], navigated: node[0]?.url }
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
  // 删除前先拿到节点信息，回传 removedNode 让前端能反馈"删了哪个书签"；
  // 如果是文件夹，统计子项数，让用户看到真实影响范围。
  let removedNode: chrome.bookmarks.BookmarkTreeNode | undefined
  let totalRemoved = 1
  try {
    const nodes = await chrome.bookmarks.get(nodeId)
    removedNode = nodes[0]
    // 文件夹判定：无 url 即文件夹（chrome.bookmarks.get 返回的节点可能不含 children 字段，
    // 不能靠 Array.isArray(children) 判定）。有 children 时统计子项数。
    if (removedNode && !removedNode.url) {
      const childCount = Array.isArray(removedNode.children) ? removedNode.children.length : 0
      totalRemoved = 1 + childCount
    }
  } catch {
    // 拿不到节点信息不影响删除，继续
  }
  await chrome.bookmarks.remove(nodeId)
  return { success: true, removedNode, removed: totalRemoved }
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

/**
 * 截图命令：按 mode 分流到三种模式。
 * - visible（默认）：SW 直接 captureVisibleTab 截可视区域。
 * - full / area：转发到 content script（content script 负责滚动拼接/框选裁剪），
 *   captureVisibleTab 仅 SW 可用，content script 通过 MSG_CAPTURE_VISIBLE 请求 SW 截单屏。
 * @param payload - { mode?, tabId? }
 * @returns ExecutionResult.screenshot 为 data URL
 */
async function takeScreenshot(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 兼容旧 fullPage:true（已废弃，统一为 mode）
  const mode = payload.mode ? (payload.mode as string) : payload.fullPage ? 'full' : 'visible'
  const tabId = payload.tabId as number | undefined

  // full / area 需要滚动/框选，转发到 content script
  if (mode === 'full' || mode === 'area') {
    return await forwardScreenshotToContent(tabId, mode)
  }

  // visible：SW 直接截可视区域
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
    return { success: true, screenshot: dataUrl, mode: 'visible' }
  } catch {
    return { success: false, code: 'ACT_BLOCKED', message: '截图被拒绝' }
  }
}

/**
 * 把截图请求转发到 content script（整页/选区模式）。
 * takeScreenshot 内部自己调 chrome.tabs.sendMessage，因为 executeBrowserTool 对
 * browser_take_screenshot 做了特例 return，不走通用 sendMessage 路径。
 * 若 content script 未注入（扩展重载后已打开的标签页不会自动注入），
 * 用 chrome.scripting.executeScript 动态注入 content.js 后重试一次。
 * @param tabId - 目标标签 ID（缺省取活动标签）
 * @param mode - 'full' | 'area'
 * @returns ExecutionResult.screenshot 为 data URL
 */
async function forwardScreenshotToContent(
  tabId: number | undefined,
  mode: 'full' | 'area'
): Promise<ExecutionResult> {
  let targetTabId = tabId
  if (!targetTabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    targetTabId = tab?.id
  }
  if (!targetTabId) {
    return { success: false, code: 'ELE_NOT_FOUND', message: '未找到活动标签' }
  }

  let response: unknown
  try {
    response = await chrome.tabs.sendMessage(targetTabId, {
      type: 'SCREENSHOT',
      mode,
      timestamp: Date.now(),
    })
  } catch {
    // content script 未注入（扩展重载后已打开页面不会自动注入）→ 动态注入后重试一次
    const injected = await injectContentScript(targetTabId)
    if (!injected) {
      return {
        success: false,
        code: 'CONTENT_SCRIPT_ERROR',
        message: '无法在此页面截图，请刷新页面后重试',
        suggestion: 'RELOAD_PAGE',
      }
    }
    try {
      response = await chrome.tabs.sendMessage(targetTabId, {
        type: 'SCREENSHOT',
        mode,
        timestamp: Date.now(),
      })
    } catch {
      return {
        success: false,
        code: 'CONTENT_SCRIPT_ERROR',
        message: 'Content Script 未响应，请刷新页面后重试',
        suggestion: 'RELOAD_PAGE',
      }
    }
  }

  // content script 回传的 data 是 data URL 字符串；message 是截断提示（整页超长时）
  const r = (response || {}) as {
    success?: boolean
    data?: unknown
    error?: string
    message?: string
    suggestion?: string
  }
  if (r.success && typeof r.data === 'string') {
    return { success: true, screenshot: r.data, message: r.message, mode }
  }
  if (r.success) {
    return { success: false, code: 'SCREENSHOT_EMPTY', message: '截图结果为空' }
  }
  return {
    success: false,
    code: r.error || 'UNKNOWN_ERROR',
    message: r.message || r.error,
    suggestion: r.suggestion,
  }
}

/**
 * 动态注入 content script 到指定标签页。
 * 用于扩展重载后已打开页面未自动注入 content script 的场景（sendMessage 失败时兜底）。
 * chrome:// 等浏览器内部页面无法注入，会返回 false。
 * @param tabId - 目标标签 ID
 * @returns 是否注入成功
 */
async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })
    return true
  } catch {
    // chrome:// 等受限页面无法注入，返回 false
    return false
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
  // 优先 url 过滤（chrome.cookies.getAll 按 URL 取该 URL 关联的所有 cookie），
  // 其次 domain 过滤，两者都不传则取当前活动标签的域名
  const url = (payload.url as string | undefined)?.trim()
  if (url) {
    const cookies = await chrome.cookies.getAll({ url })
    return { success: true, cookies, found: cookies.length, url }
  }
  let domain = (payload.domain as string | undefined)?.trim()
  if (!domain) {
    // /cookies 无参 → 取当前活动 tab 的 url → 域名
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) {
      return { success: false, code: 'NO_TABS_FOUND', message: '未找到当前标签' }
    }
    try {
      domain = new URL(tab.url).hostname
    } catch {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        message: '当前页面不是合法 URL',
      }
    }
  }
  const cookies = await chrome.cookies.getAll({ domain })
  return { success: true, cookies, found: cookies.length, domain }
}

/**
 * 写入或修改一个 Cookie。
 * chrome.cookies.set 需要 url（由 domain + secure 推导），其余字段透传。
 * @param payload - { domain, name, value, path?, secure?, httpOnly?, sameSite?, expirationDate? }
 * @returns { success, cookie: { name, domain, value } }；失败返回 success:false + 错误信息
 */
async function setCookie(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const domain = (payload.domain as string | undefined)?.trim()
  const name = payload.name as string | undefined
  const value = payload.value as string | undefined
  if (!domain || !name || value === undefined) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '需要 domain、name、value 三个参数',
    }
  }
  const secure = payload.secure as boolean | undefined
  // domain 可能带前导 .（如 .example.com），构造 url 时去掉
  const host = domain.replace(/^\./, '')
  const url = `${secure ? 'https' : 'http'}://${host}${payload.path ? '' : '/'}`
  const setDetails: ChromeCookieSetDetails = {
    url,
    name,
    value,
    domain,
    path: (payload.path as string) || '/',
  }
  if (secure !== undefined) setDetails.secure = secure
  if (payload.httpOnly !== undefined) setDetails.httpOnly = payload.httpOnly as boolean
  if (payload.sameSite) setDetails.sameSite = payload.sameSite as ChromeSameSiteStatus
  if (payload.expirationDate !== undefined)
    setDetails.expirationDate = payload.expirationDate as number
  try {
    const cookie = await (chrome.cookies as unknown as ChromeCookiesSetApi).set(setDetails)
    if (!cookie) {
      return {
        success: false,
        code: 'COOKIE_SET_FAILED',
        message: 'Cookie 写入失败（可能域名无权限）',
      }
    }
    return {
      success: true,
      cookie: { name: cookie.name, domain: cookie.domain, value: cookie.value },
    }
  } catch (e) {
    return {
      success: false,
      code: 'COOKIE_SET_FAILED',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * 清除 Cookie
 * 支持两种模式：
 * 1. selectedCookies（前端勾选子集）：逐个按 {name, domain, path, secure} 构造 url 删除
 * 2. domain 全删（兜底）：清空该域名下所有 Cookie
 * @param payload - { domain?, selectedCookies? } selectedCookies 为前端勾选的 Cookie 最小字段集
 * @returns { success, removed, domain } removed=已删除数量
 */
async function removeCookies(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 前端勾选子集模式：Cookie 无稳定 id，前端传 {name, domain, path, secure} 最小字段集
  const selectedCookies = payload.selectedCookies as
    Array<{ name: string; domain: string; path: string; secure: boolean }> | undefined
  if (selectedCookies?.length) {
    for (const c of selectedCookies) {
      const url = `${c.secure ? 'https' : 'http'}://${c.domain}${c.path.startsWith('/') ? '' : '/'}${c.path}`
      await chrome.cookies.remove({ url, name: c.name })
    }
    return {
      success: true,
      removed: selectedCookies.length,
      domain: selectedCookies[0]?.domain,
    }
  }

  // 兜底：按域名全删（无 selectedCookies 时）
  let domain = (payload.domain as string | undefined)?.trim()
  if (!domain) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) {
      return { success: false, code: 'NO_TABS_FOUND', message: '未找到当前标签' }
    }
    try {
      domain = new URL(tab.url).hostname
    } catch {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        message: '当前页面不是合法 URL',
      }
    }
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

/**
 * 查看本扩展自身拥有的权限（manifest 声明 + optional 权限）。
 * chrome.permissions.getAll 返回 { origins, permissions }。
 * @returns { success, permissions: { origins, permissions }, found }
 */
async function observeExtensionPermissions(): Promise<ExecutionResult> {
  const all = await (chrome.permissions as unknown as ChromePermissionsApi).getAll()
  const origins = all.origins || []
  const perms = all.permissions || []
  return {
    success: true,
    permissions: { origins, permissions: perms },
    found: origins.length + perms.length,
  }
}

// ──── PERMISSIONS 实现 ────

/**
 * Chrome contentSettings 支持的权限类型子集。
 *
 * 这里列出常见可观察的设置项；不全则拿不到值，Markdown 工厂会显示空表格。
 * 字段顺序即表格列顺序。
 *
 * legalSettings：每个 resourceId 在 chrome.contentSettings.set 时合法的 setting 值。
 * 当用户传入 'default'（或任何不在白名单里的值），我们拒绝写入而不是直接传给 API 报错。
 */
const OBSERVABLE_PERMISSION_TYPES: Array<{
  key: string
  label: string
  /** contentSettings API 中的 resourceId */
  resourceId: string
  /** chrome.contentSettings.set 接受的合法 setting 值 */
  legalSettings: readonly string[]
}> = [
  { key: 'cookies', label: 'Cookie', resourceId: 'cookies', legalSettings: ['allow', 'block'] },
  {
    key: 'javascript',
    label: 'JavaScript',
    resourceId: 'javascript',
    legalSettings: ['allow', 'block'],
  },
  { key: 'popups', label: '弹窗', resourceId: 'popups', legalSettings: ['allow', 'block'] },
  {
    key: 'notifications',
    label: '通知',
    resourceId: 'notifications',
    legalSettings: ['allow', 'block', 'ask'],
  },
  { key: 'images', label: '图片', resourceId: 'images', legalSettings: ['allow', 'block'] },
  {
    key: 'microphone',
    label: '麦克风',
    resourceId: 'microphone',
    legalSettings: ['allow', 'block', 'ask'],
  },
  {
    key: 'camera',
    label: '摄像头',
    resourceId: 'camera',
    legalSettings: ['allow', 'block', 'ask'],
  },
  {
    key: 'location',
    label: '位置',
    resourceId: 'location',
    legalSettings: ['allow', 'block', 'ask'],
  },
]

/** chrome.contentSettings.get 的返回结构（只用到 setting 字段） */
interface ContentSettingResult {
  setting?: string
}

/**
 * 查询某个域名在主框架下的所有可观察权限。
 *
 * /site-perms 无参时取当前活动 tab 的 hostname；带域名直接用。
 * chrome.contentSettings.get 返回值以单域名 primaryPattern 匹配（不覆盖子域名），
 * 与"站点权限"概念一致。
 *
 * secondaryPattern 在权限类 resourceId（popups / camera / location 等）上
 * 表示"哪些第三方 subframe 能用这个权限"，对单域名查询无意义，省略以匹配更广义的设置。
 */
async function observePermissions(payload: Record<string, unknown>): Promise<ExecutionResult> {
  let domain = (payload.domain as string | undefined)?.trim()
  if (!domain) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) {
      return { success: false, code: 'NO_TABS_FOUND', message: '未找到当前标签' }
    }
    try {
      domain = new URL(tab.url).hostname
    } catch {
      return { success: false, code: 'INVALID_PARAMS', message: '当前页面不是合法 URL' }
    }
  }

  const entries: Array<Record<string, unknown>> = []
  for (const t of OBSERVABLE_PERMISSION_TYPES) {
    try {
      const result = (await chrome.contentSettings.get({
        primaryPattern: `https://${domain}/*`,
        resourceIdentifier: { id: t.resourceId },
      })) as ContentSettingResult
      entries.push({
        key: t.key,
        label: t.label,
        value: result?.setting || 'default',
      })
    } catch {
      // 单个权限查询失败时跳过该行；其它权限仍可观察
      entries.push({ key: t.key, label: t.label, value: 'default' })
    }
  }

  return { success: true, domain, permissions: entries, found: entries.length }
}

/**
 * 设置指定域名的某个权限。
 *
 * 三道校验：
 *  1. domain 必须有值
 *  2. setting 必须是 OBSERVABLE_PERMISSION_TYPES 里注册的 resourceId
 *  3. value 必须在该 resourceId 的 legalSettings 范围内（'default' 不合法——
 *     想重置为默认应让用户不传或传 'allow'/'block' 之一，由 Chrome 自身管理）
 *
 * 校验失败返回 success:false 让 useAIEngine 走 ai-chat 错误提示通道。
 */
async function updatePermissions(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const domain = (payload.domain as string | undefined)?.trim()
  const setting = payload.setting as string | undefined
  const value = payload.value as string | undefined

  if (!domain) {
    return { success: false, code: 'INVALID_PARAMS', message: '缺少域名' }
  }
  const type = OBSERVABLE_PERMISSION_TYPES.find((t) => t.resourceId === setting)
  if (!type) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: `不支持的权限类型: ${setting}`,
      suggestion: `支持的类型: ${OBSERVABLE_PERMISSION_TYPES.map((t) => t.key).join(', ')}`,
    }
  }
  if (!value || !type.legalSettings.includes(value)) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: `${type.label} 的 value 必须是 ${type.legalSettings.join(' | ')}`,
      suggestion: '不支持 "default"（如需重置，请传 allow 或 block）',
    }
  }

  await chrome.contentSettings.set({
    primaryPattern: `https://${domain}/*`,
    resourceIdentifier: { id: type.resourceId },
    setting: value,
  })
  return { success: true, domain, setting: type.key, value }
}

// ──── STORAGE 实现 ────

/**
 * 按 area 参数选择 storage 区域对象。
 * - local：本机持久（默认，向后兼容）
 * - sync：跨设备同步（受配额限制，超限抛错由调用方兜底）
 * - session：MV3 新增，SW 生命周期内存级，SW 重启后失效
 * @param area - 存储区域名，缺省/非法值回落到 local
 */
function getStorageArea(area: unknown): ChromeStorageAreaApi {
  // 老 @types/chrome 的 chrome.storage 只有 local/session，缺 sync；运行时三者皆有，整体断言取用。
  const storage = chrome.storage as unknown as {
    sync: ChromeStorageAreaApi
    session: ChromeStorageAreaApi
    local: ChromeStorageAreaApi
  }
  if (area === 'sync') return storage.sync
  if (area === 'session') return storage.session
  return storage.local
}

async function getStorage(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = getStorageArea(payload.area)
  const areaName = (payload.area as string) || 'local'
  // 无 key → 返回该区域全量；带 key → 单值
  if (!payload.key) {
    const all = await area.get(null)
    return { success: true, value: all, area: areaName }
  }
  const result = await area.get(payload.key as string)
  return {
    success: true,
    key: payload.key,
    value: (result as Record<string, unknown>)[payload.key as string],
    area: areaName,
  }
}

async function setStorage(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = getStorageArea(payload.area)
  const areaName = (payload.area as string) || 'local'
  await area.set({ [payload.key as string]: payload.value })
  return { success: true, key: payload.key, value: payload.value, area: areaName }
}

async function removeStorage(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const area = getStorageArea(payload.area)
  const areaName = (payload.area as string) || 'local'
  await area.remove(payload.key as string)
  return { success: true, key: payload.key, area: areaName }
}

// ──── DOWNLOADS 实现 ────

/**
 * 触发下载指定 URL 的文件。
 * @param payload - { url, filename?, conflictAction? }
 * @returns { success, downloadId, filename }；失败返回 success:false
 */
async function downloadFile(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const url = (payload.url as string | undefined)?.trim()
  if (!url) {
    return { success: false, code: 'INVALID_PARAMS', message: '需要 url 参数' }
  }
  const options: ChromeDownloadOptions = { url }
  if (payload.filename) options.filename = payload.filename as string
  if (payload.conflictAction)
    options.conflictAction = payload.conflictAction as ChromeFilenameConflictAction
  try {
    const downloadId = await (chrome.downloads as unknown as ChromeDownloadsApi).download(options)
    return {
      success: true,
      downloadId,
      filename: (payload.filename as string) || url.split('/').pop() || url,
    }
  } catch (e) {
    return {
      success: false,
      code: 'DOWNLOAD_FAILED',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * 查询下载记录。可按文件名关键词或下载状态过滤。
 * @param payload - { query?, state?, maxResults? }
 * @returns { success, downloads, found }；downloads 含 id/filename/url/state/totalBytes/startTime
 */
async function searchDownloads(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const query: ChromeDownloadQuery = {}
  const queryStr = (payload.query as string | undefined)?.trim()
  if (queryStr) query.query = [queryStr]
  if (payload.state) query.state = payload.state as ChromeDownloadState
  const maxResults = (payload.maxResults as number) || 20
  const items = await (chrome.downloads as unknown as ChromeDownloadsApi).search(query)
  // 应用层截断，避免下载记录过多撑爆回灌上下文
  const sliced = items.slice(0, maxResults)
  // 精简字段，去掉大对象（如 mime/estimates），只保留 AI/用户关心的关键字段
  const downloads = sliced.map((d) => ({
    id: d.id,
    filename: d.filename || '',
    url: d.url || '',
    state: d.state || 'unknown',
    totalBytes: d.totalBytes ?? 0,
    startTime: d.startTime,
  }))
  return { success: true, downloads, found: downloads.length }
}

/**
 * 打开 Chrome 下载管理页面（chrome://downloads/）。
 * @returns { success, opened: true }
 */
async function openDownloadsPage(): Promise<ExecutionResult> {
  await chrome.tabs.create({ url: 'chrome://downloads/' })
  return { success: true, opened: true }
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
      // batch 由 AI agent loop 或斜杠命令触发，子调用视为已授权，注入 force:true
      // 跳过危险命令的二次确认，否则 batch 内的 bookmarks_remove_node 等会返回 NEEDS_CONFIRM 导致整批失败
      const r = await executeCommand(call.tool, { ...call.args, force: true })
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
  // 截图：按 mode 分流，visible 走 SW 直接截，full/area 由 takeScreenshot 内部转发到 content script
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
