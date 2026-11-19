/**
 * 命令执行器 — 解析 AI 响应并派发到 Chrome API
 */

import { swT } from '../shared/sw-i18n'
import { AGENT_CONFIRM_REQUIRED } from '../shared/commands'
import { applyDarkCss, removeDarkCss, rememberSite, getTabHostname } from './page-theme'

import type { ExecutionResult } from '../types/execution'

/**
 * 局部 Chrome API 类型补丁。
 * 项目的 chrome 类型唯一来源是手写的 src/env.d.ts（不再依赖 @types/chrome，
 * 见 docs/code-review-fixes.md F7）。env.d.ts 未覆盖到的
 * chrome.cookies.set / chrome.downloads / chrome.permissions.getAll /
 * chrome.storage.StorageArea 在此按实际用到的最小集补声明。
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

/**
 * 危险操作需人工确认的错误。Service Worker 中不可用 confirm()，
 * checkDangerousConfirm 抛出本错误，由 executeCommand 转为 NEEDS_CONFIRM
 * 结果交给前端确认卡处理。
 */
class NeedsConfirmError extends Error {
  readonly code = 'NEEDS_CONFIRM'
  readonly detail?: Record<string, unknown>

  /**
   * @param message 确认提示文案（展示在确认卡标题）
   * @param detail 确认详情（intent/payload/children 等，前端确认卡按字段渲染）
   */
  constructor(message: string, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'NeedsConfirmError'
    this.detail = detail
  }
}

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
      if (err instanceof NeedsConfirmError) {
        return {
          success: false,
          code: err.code,
          message: err.message || swT('sw.needConfirm'),
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
    case 'tabs_reorder':
      return await reorderTabs(payload)
    case 'tabs_remove':
      return await removeTabs(payload)
    case 'tabs_remove_by_url':
      return await removeTabsByUrl(payload)
    case 'tabs_observe_groups':
      return await observeGroups(payload)
    case 'tabs_group_move':
      // 整组移动（含跨窗口）走 clientExec 模式：chrome.tabGroups.* 在 MV3 SW
      // 非用户激活上下文会静默挂起（与 tabs_group_by_domain 同理），SW 只做校验
      return await prepareGroupMove(payload)
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
    // ──── CHROME API 兜底 ────
    case 'chrome_api':
      return await executeChromeApi(payload)
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
    // ──── PAGE THEME ────
    case 'page_theme_set':
      return await setPageTheme(payload)
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
    // ──── BROWSER DOM 操作（Playwright MCP 兼容）────
    case 'browser_snapshot':
      return await executeBrowserTool('browser_snapshot', payload)
    case 'browser_find':
      return await executeBrowserTool('browser_find', payload)
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
      return {
        success: false,
        code: 'UNKNOWN_INTENT',
        message: swT('sw.unknownIntent', { intent }),
      }
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
  throw new NeedsConfirmError(
    swT('sw.confirmIntent', { intent }),
    // 填充 children 字段，让前端确认卡可以展示可勾选的子项列表。
    // 各 intent 的子项计算逻辑不同：
    //   - bookmarks_remove_node: 文件夹下的直接子节点（书签 + 子文件夹）
    //   - tabs_remove: 用户传入的 tabIds 对应的标签列表（前端已计算）
    {
      intent,
      payload,
      nodeId: payload.nodeId,
      title: payload.title,
      children: await buildConfirmChildren(intent, payload),
    }
  )
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
  if (payload.currentWindow) {
    // MV3 SW 上下文下 `currentWindow: true` 经常返回 0 个标签（因为 SW 不属于
    // 任何普通窗口，sidepanel 窗口也没有普通标签页）。fallback 到最近聚焦的
    // 窗口，确保用户能看到浏览器主窗口的标签列表。
    // fallback 为 -1（WINDOW_ID_NONE，找不到普通窗口）时不设置 windowId——
    // tabs.query({windowId:-1}) 返回空列表，保持空 query 才能查到所有窗口的标签。
    const fallbackId = await getFallbackWindowId()
    if (fallbackId > 0) query.windowId = fallbackId
  }
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
    const windowId = await getFallbackWindowId()
    const [active] = await chrome.tabs.query({ active: true, windowId })
    if (!active?.id)
      return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noActiveTab') }
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

/**
 * 移动标签页（窗口内调整位置 / 跨窗口移动）。
 *
 * 参数与语义：
 * - tabIds：要移动的标签 id 数组；缺省时移动当前活动标签
 * - index：目标位置（0-based）；-1 或缺省 = 追加到末尾
 * - windowId：目标窗口 id（来自 windows_observe）；缺省 = 窗口内移动；
 *   与源窗口相同时按窗口内移动处理
 *
 * 顺序保证（多标签输入顺序 = 最终排列顺序）：
 * - 窗口内 index>=0：倒序逐个 move 到同一 index（既有技巧，输入顺序落在 index 处）
 * - 窗口内 index=-1 / 跨窗口：正序逐个 move（append 语义下正序才保持输入顺序，
 *   倒序 append 会得到逆序——旧实现在此场景有顺序反转 bug）
 * - 跨窗口显式 index：正序逐个以 index+i 递增插入
 *
 * pinned 保护：pinned 与非 pinned 混合时报 PINNED_MIXED（建议先取消固定）；
 * 全 pinned 时忽略 index 一律移到目标窗口最前（pinned 区，Chrome 自动保持固定状态）
 *
 * @returns 成功返回 { moved, tabIds, windowId?, newIndex }；失败返回
 *          NO_TABS_FOUND / WINDOW_NOT_FOUND / WINDOW_INCOGNITO / PINNED_MIXED / MOVE_FAILED
 */
async function moveTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 统一处理 tabIds，支持字符串数组或数字数组
  const tabIds = (payload.tabIds as unknown[])
    ? (payload.tabIds as unknown[])
        .map((id: unknown) => Number(id))
        .filter((id: number) => !isNaN(id))
    : undefined
  // index 归一化：缺省 -1（末尾）。模型可能输出字符串数字，NaN 视为未传
  const rawIndex = payload.index !== undefined ? Number(payload.index) : -1
  const index = Number.isFinite(rawIndex) ? rawIndex : -1
  // windowId 归一化：缺省=窗口内移动；NaN 视为未传
  const rawWindowId = payload.windowId !== undefined ? Number(payload.windowId) : undefined
  const targetWindowId =
    rawWindowId !== undefined && Number.isFinite(rawWindowId) && rawWindowId > 0
      ? rawWindowId
      : undefined

  // 目标窗口存在性校验（跨窗口移动前拦截无效 windowId；隐身窗口拒绝——
  // 普通窗口的标签移入隐身窗口会被 Chrome 拒绝，提前拦截给出可读错误）
  if (targetWindowId !== undefined) {
    let win: chrome.windows.Window
    try {
      win = await chrome.windows.get(targetWindowId)
    } catch {
      return {
        success: false,
        code: 'WINDOW_NOT_FOUND',
        message: swT('sw.windowNotFound', { id: targetWindowId }),
        suggestion: swT('sw.observeWindowsFirst'),
      }
    }
    if (win.incognito) {
      return {
        success: false,
        code: 'WINDOW_INCOGNITO',
        message: swT('sw.windowIncognito', { id: targetWindowId }),
        suggestion: swT('sw.observeWindowsFirst'),
      }
    }
  }

  if (!tabIds?.length) {
    // 没有指定 tabIds，移动当前活动标签
    const windowId = await getFallbackWindowId()
    const [active] = await chrome.tabs.query({ active: true, windowId })
    if (!active?.id)
      return {
        success: false,
        code: 'NO_TABS_FOUND',
        message: swT('sw.noActiveTab'),
        suggestion: swT('sw.openTabFirst'),
      }
    // pinned 活动标签只能落在 pinned 区（最前），按 F9 同规则忽略 AI 传的 index
    const activeIndex = active.pinned ? 0 : index
    const moveProps: chrome.tabs.MoveProperties = { index: activeIndex }
    if (targetWindowId !== undefined) moveProps.windowId = targetWindowId
    await chrome.tabs.move([active.id], moveProps)
    return {
      success: true,
      moved: 1,
      tabId: active.id,
      ...(targetWindowId !== undefined ? { windowId: targetWindowId } : {}),
      newIndex: activeIndex,
    }
  }

  try {
    // pinned 保护（对齐 reorderTabs）：pinned 标签固定占窗口前部，与非 pinned
    // 混合移动/移到非 pinned 位置会被 Chrome 直接拒绝。全部读取后分三种情况处理。
    const allTabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id)))
    const pinnedCount = allTabs.filter((t) => t.pinned).length
    if (pinnedCount > 0 && pinnedCount < tabIds.length) {
      return {
        success: false,
        code: 'PINNED_MIXED',
        message: swT('sw.pinnedMixed'),
        suggestion: swT('sw.unpinFirst'),
      }
    }
    // 全 pinned：只能落在目标窗口的 pinned 区，忽略 AI 传的 index 一律移到最前
    //（index 0；Chrome 自动落入 pinned 区，跨窗口时同样保持 pinned 状态）
    const allPinned = pinnedCount === tabIds.length
    const effectiveIndex = allPinned ? 0 : index

    // 读取源窗口：以第一个标签的 windowId 为准（移动前所有 tabIds 应在同一窗口）
    const first = allTabs[0]
    const sourceWindowId = first.windowId
    const crossWindow = targetWindowId !== undefined && targetWindowId !== sourceWindowId

    if (crossWindow) {
      // 跨窗口：正序逐个插入目标窗口。index=-1 恒为追加末尾（每次 append，
      // 正序=保持输入顺序）；显式 index 时递增插入（每次插入把右侧标签推后一位，
      // 正序+递增=输入顺序落在 index 处）
      for (let i = 0; i < tabIds.length; i++) {
        const insertIndex = effectiveIndex === -1 ? -1 : effectiveIndex + i
        await chrome.tabs.move([tabIds[i]], { windowId: targetWindowId, index: insertIndex })
      }
      return {
        success: true,
        moved: tabIds.length,
        tabIds,
        windowId: targetWindowId,
        newIndex: effectiveIndex,
      }
    }

    // 窗口内移动
    if (effectiveIndex === -1) {
      // 追加到末尾：正序逐个 move 到 -1（append 语义下正序才保持输入顺序）
      for (const id of tabIds) {
        await chrome.tabs.move([id], { index: -1 })
      }
    } else {
      // 指定位置：倒序逐个 move 到同一 index，最终正好按输入顺序落在 index 处。
      //   期望 [D1, D2, D3] 落在 index p：
      //   move D3→p: [.., D3, ..]
      //   move D2→p: [.., D2, D3, ..]
      //   move D1→p: [.., D1, D2, D3, ..] ✓
      const reversed = [...tabIds].reverse()
      for (const id of reversed) {
        await chrome.tabs.move([id], { index: effectiveIndex })
      }
    }
    return { success: true, moved: tabIds.length, tabIds, newIndex: effectiveIndex }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return {
      success: false,
      code: 'MOVE_FAILED',
      message: e?.message || swT('sw.moveTabFailed'),
      suggestion: swT('sw.checkTabIds'),
    }
  }
}

/**
 * 按期望顺序一次性重排窗口内标签页（批量排序原语）。
 *
 * 解决"排序任务被 AI 拆成逐个 tabs_move"的低效模式：每个 tabs_move 都是一轮
 * 完整 LLM 调用，且每次移动后 index 变化，AI 只能反复 observe 再移动下一个。
 * 本原语一次提交目标终态，一次 LLM 步骤完成整个排序。
 *
 * @param payload.order 期望顺序的 tabId 数组（可只给部分标签）；未列出的标签
 *                      保持当前相对顺序排在最后；无效 id 显式报错不静默忽略
 * @param payload.windowId 目标窗口 ID，缺省为最近聚焦的普通窗口
 * @returns 成功返回 sorted（id+title 终态列表）供 AI 免 observe 直接验证；
 *          失败返回 MISSING_ORDER / INVALID_TAB_IDS / REORDER_FAILED
 */
async function reorderTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const order = Array.isArray(payload.order)
    ? [...new Set((payload.order as unknown[]).map(Number).filter((n) => !isNaN(n)))]
    : []
  if (!order.length) {
    return {
      success: false,
      code: 'MISSING_ORDER',
      message: swT('sw.orderRequired'),
    }
  }
  // windowId 归一化：模型可能把数字输出成字符串（tabs_update 的描述里已证实这点），
  // 直接透传非数字会给 chrome.tabs.query 传非法类型；NaN/0 回退到最近聚焦窗口
  const requestedWindowId = Number(payload.windowId)
  const windowId =
    Number.isFinite(requestedWindowId) && requestedWindowId > 0
      ? requestedWindowId
      : await getFallbackWindowId()
  const tabs = await chrome.tabs.query({ windowId })
  const byId = new Map(tabs.map((t) => [t.id, t]))
  const invalid = order.filter((id) => !byId.has(id))
  if (invalid.length) {
    return {
      success: false,
      code: 'INVALID_TAB_IDS',
      message: swT('sw.tabIdsNotInWindow', { ids: invalid.join(', ') }),
      suggestion: swT('sw.observeFirst'),
    }
  }

  // pinned 标签固定占窗口前部且不可移到非 pinned 位，不参与重排：
  // 从 order 中过滤掉（Chrome 对 pinned→非 pinned 位置直接报错），它们保持在最前
  const pinnedIds = tabs.filter((t) => t.pinned).map((t) => t.id!)
  const orderIds = order.filter((id) => !byId.get(id)!.pinned)
  const orderSet = new Set(orderIds)
  const restIds = tabs
    .filter((t) => !t.pinned)
    .map((t) => t.id!)
    .filter((id) => !orderSet.has(id))
  const finalOrder = [...pinnedIds, ...orderIds, ...restIds]

  try {
    // move-to-index 收敛：处理到 i 时位置 0..i-1 已是终态，把 finalOrder[i] 挪到 i 即固定，
    // 它当前位置必然 ≥ i（前面都是已固定的其它标签），全程无中间态依赖
    for (let i = 0; i < finalOrder.length; i++) {
      await chrome.tabs.move([finalOrder[i]], { index: i })
    }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return {
      success: false,
      code: 'REORDER_FAILED',
      message: e?.message || swT('sw.reorderFailed'),
      suggestion: swT('sw.reorderSuggestion'),
    }
  }
  const sorted = finalOrder.map((id) => byId.get(id)!).map((t) => ({ id: t.id, title: t.title }))
  return { success: true, moved: finalOrder.length, sorted }
}

async function removeTabs(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabIds = payload.tabIds as number[] | undefined
  if (!tabIds?.length) {
    const windowId = await getFallbackWindowId()
    const [active] = await chrome.tabs.query({ active: true, windowId })
    if (!active?.id)
      return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noActiveTab') }
    await chrome.tabs.remove(active.id)
    return { success: true, removed: 1 }
  }
  await chrome.tabs.remove(tabIds)
  return { success: true, removed: tabIds.length }
}

async function removeTabsByUrl(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 纯 url/title 子串模糊匹配。已删除 hostname 匹配，与前端 close_tabs_by_url 一致。
  const q = ((payload.query as string) || '').toLowerCase().trim()
  if (!q) return { success: false, code: 'INVALID_PARAMS', message: swT('sw.keywordRequired') }

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
    return { success: true, removed: 0, message: swT('sw.noTabMatch') }
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
 * @param payload - { maxResults? } 返回分组数上限（缺省不截断）
 * @returns { success, groups: Array<{ id, title, color, windowId, collapsed, tabIds, tabs }>, observed }
 */
async function observeGroups(payload: Record<string, unknown>): Promise<ExecutionResult> {
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
  // maxResults：截断返回的分组数（registry 声明的 slot，防止分组过多撑爆上下文）
  const maxResults = (payload.maxResults as number) || groups.length
  const limited = groups.slice(0, maxResults)
  return { success: true, groups: limited, observed: limited.length }
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
      return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noWindow') }
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
      message: swT('sw.noGroups'),
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
      message: swT('sw.groupsNotFound', { ids: filterIds.join(', ') }),
      suggestion: swT('sw.observeGroupsFirst'),
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
      return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noWindow') }
    }
    tabs = await chrome.tabs.query({ windowId: lastFocused.id })
  }

  if (!tabs.length) {
    return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noGroupableTabs') }
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
 * 校验并准备「整组移动分组」的数据（clientExec 模式，真正执行在 side panel）。
 *
 * chrome.tabGroups.move 支持把分组连同全部标签移动到另一个窗口，且只允许
 * normal 类型窗口之间移动（官方约束）。SW 端负责：
 * 1. 校验 groupId 存在（chrome.tabGroups.get）
 * 2. 校验目标窗口存在且为 normal 类型
 * 3. 组装 side panel 直接可用的执行数据
 *
 * @param payload.groupId 分组 id（来自 tabs_observe_groups）
 * @param payload.windowId 目标窗口 id（来自 windows_observe）；缺省=窗口内移动
 * @param payload.index 目标位置；-1 或缺省=末尾
 * @returns 成功返回 { clientExec: 'tabs_group_move', groups: [{groupId, index, windowId?, title}] }；
 *          失败返回 GROUP_NOT_FOUND / WINDOW_NOT_FOUND / WINDOW_INCOGNITO / WINDOW_NOT_NORMAL
 */
async function prepareGroupMove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const groupId = Number(payload.groupId)
  if (!Number.isFinite(groupId)) {
    return {
      success: false,
      code: 'GROUP_NOT_FOUND',
      message: swT('sw.groupsNotFound', { ids: String(payload.groupId) }),
      suggestion: swT('sw.observeGroupsFirst'),
    }
  }

  // 分组存在性校验（id 无效/已解散时 chrome.tabGroups.get 抛错）
  let title = ''
  try {
    const group = await chrome.tabGroups.get(groupId)
    title = group.title || ''
  } catch {
    return {
      success: false,
      code: 'GROUP_NOT_FOUND',
      message: swT('sw.groupsNotFound', { ids: groupId }),
      suggestion: swT('sw.observeGroupsFirst'),
    }
  }

  // index / windowId 归一化（模型可能输出字符串数字）
  const rawIndex = payload.index !== undefined ? Number(payload.index) : -1
  const index = Number.isFinite(rawIndex) ? rawIndex : -1
  const rawWindowId = payload.windowId !== undefined ? Number(payload.windowId) : undefined
  const windowId =
    rawWindowId !== undefined && Number.isFinite(rawWindowId) && rawWindowId > 0
      ? rawWindowId
      : undefined

  // 目标窗口校验：必须存在且为普通（非隐身）normal 窗口
  //（tabGroups.move 官方只支持 normal 窗口间移动；隐身窗口 type 也是 normal，
  // 需单独检查 incognito，否则到 side panel 执行时才静默失败）
  if (windowId !== undefined) {
    let win: chrome.windows.Window
    try {
      win = await chrome.windows.get(windowId)
    } catch {
      return {
        success: false,
        code: 'WINDOW_NOT_FOUND',
        message: swT('sw.windowNotFound', { id: windowId }),
        suggestion: swT('sw.observeWindowsFirst'),
      }
    }
    if (win.incognito) {
      return {
        success: false,
        code: 'WINDOW_INCOGNITO',
        message: swT('sw.windowIncognito', { id: windowId }),
        suggestion: swT('sw.observeWindowsFirst'),
      }
    }
    if (win.type !== 'normal') {
      return {
        success: false,
        code: 'WINDOW_NOT_NORMAL',
        message: swT('sw.windowNotNormal'),
        suggestion: swT('sw.observeWindowsFirst'),
      }
    }
  }

  return {
    success: true,
    clientExec: 'tabs_group_move',
    groups: [{ groupId, index, ...(windowId !== undefined ? { windowId } : {}), title }],
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
      const curTitlePath = [...titlePath, node.title || swT('sw.rootNode')]
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
    ? [...parentTitlePath, node.title || swT('sw.rootNode')]
    : [node.title || swT('sw.rootNode')]
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
      message: swT('sw.nodeIdRequired'),
      suggestion: swT('sw.observeBookmarksFirst'),
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
      message: e?.message || swT('sw.moveBookmarkFailed'),
      suggestion: swT('sw.checkNodeId'),
    }
  }
}

async function createBookmark(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // nodeType 是一致性校验而非创建参数（chrome.bookmarks.create 按「有无 url」决定类型）：
  // schema 宣告了 nodeType 就必须兑现——bookmark 不带 url 会被静默建成文件夹，这里显式拦截
  const nodeType = payload.nodeType as string | undefined
  const url = payload.url as string | undefined
  if (nodeType === 'bookmark' && !url) {
    return { success: false, code: 'INVALID_PARAMS', message: swT('sw.urlRequired') }
  }
  const opts: chrome.bookmarks.CreateDetails = {
    title: payload.title as string,
    parentId: payload.parentId as string,
  }
  if (url !== undefined) opts.url = url
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
    return { success: false, code: 'INVALID_PARAMS', message: swT('sw.nodeIdRequired') }
  }
  const windowId = await getFallbackWindowId()
  const [tab] = await chrome.tabs.query({ active: true, windowId })
  if (!tab?.id) return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noActiveTab') }
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
        message: swT('sw.noValidIds'),
      }
    }
    return { success: true, removed: idsToRemove.length }
  }

  if (!nodeId) {
    return { success: false, code: 'INVALID_PARAMS', message: swT('sw.nodeIdRequired') }
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
      return { success: false, code: 'PAGE_BLOCKED', message: swT('sw.bookmarkPageBlocked') }
    }
    try {
      new URL(url)
    } catch {
      return { success: false, code: 'INVALID_PARAMS', message: swT('sw.invalidUrl') }
    }
    targetUrl = url
    targetTitle = title || url
  } else {
    // 未指定 url：使用当前活动标签
    const windowId = await getFallbackWindowId()
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (!tab?.url || tab.url.startsWith('chrome://')) {
      return { success: false, code: 'PAGE_BLOCKED', message: swT('sw.bookmarkPageBlocked') }
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

/**
 * 观察窗口列表。
 * 每个窗口附加 index（第几个窗口，1-based）和 tabCount（标签数），让 AI 能把
 * 用户口语"第二个窗口"映射到 windowId（chrome.windows.Window 原生无序号）。
 * @param payload.includeTabs 是否附带完整标签列表（populate）
 * @returns { success, windows, observed }
 */
async function observeWindows(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const opts: chrome.windows.QueryOptions = { windowTypes: ['normal', 'popup', 'app'] }
  if (payload.includeTabs) opts.populate = true
  const wins = await chrome.windows.getAll(opts)
  // 各窗口标签计数（一次全量查询按 windowId 分桶，比逐窗口 query 省往返）
  const allTabs = await chrome.tabs.query({})
  const tabCountMap = new Map<number, number>()
  for (const t of allTabs) {
    if (t.windowId === undefined) continue
    tabCountMap.set(t.windowId, (tabCountMap.get(t.windowId) || 0) + 1)
  }
  const windows = wins.map((w, i) => ({
    ...w,
    index: i + 1,
    tabCount: w.id !== undefined ? tabCountMap.get(w.id) || 0 : 0,
  }))
  return { success: true, windows, observed: windows.length }
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
  // updated 标记供步骤摘要区分「更新窗口」与 createWindow 同形的「创建窗口」
  // （两者都返回 window 字段，无标记会把 /update-window 渲染成"已创建窗口"）
  return { success: true, window: win, updated: true }
}

// ──── HISTORY 实现 ────

/** history_search 各时间范围的标签词条 key（与 slots.timeRange 枚举一一对应，供 swT 按范围取词） */
const HISTORY_RANGE_LABEL_KEYS = {
  today: 'sw.today',
  yesterday: 'sw.yesterday',
  week: 'sw.week',
  month: 'sw.month',
  all: 'sw.all',
} as const

/** timeRange 非法时的统一拒绝结果（message 提示合法枚举，suggestion 给替代方案，模型据此改参或如实告知用户） */
function invalidTimeRangeResult(): ExecutionResult {
  return {
    success: false,
    code: 'INVALID_PARAMS',
    message: swT('sw.invalidTimeRange'),
    suggestion: swT('sw.invalidTimeRangeHint'),
  }
}

/**
 * 校验 payload.timeRange 是否为合法枚举（today | yesterday | week | month | all，忽略大小写）。
 * 缺省/null 视为未传（由调用方决定默认行为）；显式传了非法值（日期字符串/对象等）返回 false。
 * @param payload - 命令 payload
 * @returns 是否通过校验
 */
function isValidHistoryRange(payload: Record<string, unknown>): boolean {
  const raw: unknown = payload.timeRange
  if (raw === undefined || raw === null) return true
  if (typeof raw !== 'string') return false
  const range = raw.trim().toLowerCase()
  return range !== '' && range in HISTORY_RANGE_LABEL_KEYS
}

/** history_search 日期参数（startDate/endDate）的合法格式：YYYY-MM-DD */
const HISTORY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 解析 YYYY-MM-DD 日期串为本地时区当天 0 点的毫秒时间戳
 * @param value 日期串（如 '2026-11-09'）
 * @returns 当天 0 点时间戳；日期不存在（如 2026-02-30，ISO 扩展格式自带范围校验）返回 null
 */
function parseLocalDayStart(value: string): number | null {
  const date = new Date(value + 'T00:00:00')
  return Number.isNaN(date.getTime()) ? null : date.setHours(0, 0, 0, 0)
}

/**
 * 把某天 0 点时间戳转为「含当天」的搜索窗口右端（次日 0 点）
 * @param dayStart 当天 0 点的毫秒时间戳（本地时区）
 * @returns 次日 0 点时间戳——setDate 走本地日历运算，跨 DST 不会丢当天尾部的记录
 */
function endOfDayExclusive(dayStart: number): number {
  const next = new Date(dayStart)
  next.setDate(next.getDate() + 1)
  return next.setHours(0, 0, 0, 0)
}

/**
 * 解析 history_search 的日期窗参数（startDate/endDate，YYYY-MM-DD，本地时区）
 * @param payload 命令 payload
 * @returns 未传任何日期参数返回 null；格式/日期非法返回 { error }（带原值插值提示）；
 *          合法返回 { startTime, endTime, label }——仅 startDate = 从当天到现在，
 *          仅 endDate = 全部历史到当天末尾，endDate 含当天
 */
function resolveDateWindow(
  payload: Record<string, unknown>
): { startTime: number; endTime: number; label: string } | { error: string } | null {
  const given = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
  const rawStart = given(payload.startDate) ? payload.startDate.trim() : ''
  const rawEnd = given(payload.endDate) ? payload.endDate.trim() : ''

  // 显式传了 startDate/endDate 但不是非空字符串（数字时间戳/对象等）→ 拒绝：
  // 静默忽略会让模型以为日期过滤已生效，拿到假成功结果（v2 教训）
  const wasGiven = (v: unknown): boolean => v !== undefined && v !== null && v !== ''
  if ((!rawStart && wasGiven(payload.startDate)) || (!rawEnd && wasGiven(payload.endDate))) {
    const bad = !rawStart && wasGiven(payload.startDate) ? payload.startDate : payload.endDate
    return { error: swT('sw.invalidDateParam', { value: String(bad) }) }
  }

  if (!rawStart && !rawEnd) return null

  for (const d of [rawStart, rawEnd]) {
    if (d && (!HISTORY_DATE_RE.test(d) || parseLocalDayStart(d) === null)) {
      return { error: swT('sw.invalidDateParam', { value: d }) }
    }
  }

  const startTs = rawStart ? (parseLocalDayStart(rawStart) as number) : 0
  const endTs = rawEnd ? (parseLocalDayStart(rawEnd) as number) : null
  return {
    startTime: startTs,
    endTime: endTs === null ? Date.now() : endOfDayExclusive(endTs),
    // label 直接回显日期串（日期本身无本地化需求），前端反馈卡片可直接用作标题
    label: [rawStart, rawEnd].filter(Boolean).join(' ~ '),
  }
}

async function searchHistory(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // /history 默认展示今天全部；query 留空 = 列出该时间窗所有历史，非空 = 按关键词过滤
  // （chrome.history.search 自带 title/url 匹配）。
  // 时间窗两套参数，日期窗（startDate/endDate，YYYY-MM-DD 本地时区，endDate 含当天）
  // **优先于** timeRange 枚举（today | yesterday | week | month | all，缺省 = 今天，
  // /history 现状不变）——模型传了具体日期就按日期查，无需再校验枚举（结果真实反映
  // 日期窗，无假成功风险）。
  // 显式传非法值（模型编造的日期串、对象等）**直接拒绝**并提示合法值——静默回落 today
  // 会让模型拿到假成功结果无限重试（真机复现：AI 三次换格式传日期全被当 today，
  // 浪费 3 步还没告知用户能力边界）。
  const query = ((payload.query as string) || '').trim()
  const maxResults = (payload.maxResults as number) || 50
  const now = Date.now()
  const todayStart = new Date().setHours(0, 0, 0, 0)

  let startTime = todayStart
  let endTime = now
  let label = swT(HISTORY_RANGE_LABEL_KEYS.today)

  const dateWindow = resolveDateWindow(payload)
  if (dateWindow) {
    if ('error' in dateWindow) {
      return { success: false, code: 'INVALID_PARAMS', message: dateWindow.error }
    }
    startTime = dateWindow.startTime
    endTime = dateWindow.endTime
    label = dateWindow.label
  } else {
    // 无日期参数：走相对枚举窗（缺省默认今天；显式非法值拒绝）
    if (!isValidHistoryRange(payload)) return invalidTimeRangeResult()
    const range =
      typeof payload.timeRange === 'string' ? payload.timeRange.trim().toLowerCase() : ''
    let labelKey: keyof typeof HISTORY_RANGE_LABEL_KEYS = 'today'
    switch (range) {
      case 'yesterday': {
        // 昨日窗口 = 昨日 0 点 → 今日 0 点；先 setDate(-1) 再 setHours 归零，DST 安全
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        startTime = yesterday.setHours(0, 0, 0, 0)
        endTime = todayStart
        labelKey = 'yesterday'
        break
      }
      case 'week':
        startTime = now - 7 * 86400000
        labelKey = 'week'
        break
      case 'month':
        startTime = now - 30 * 86400000
        labelKey = 'month'
        break
      case 'all':
        // startTime 0 = epoch，覆盖全部历史
        startTime = 0
        labelKey = 'all'
        break
      // '' / 'today' / 未知值 → 默认今天（/history 现状不变）
    }
    label = swT(HISTORY_RANGE_LABEL_KEYS[labelKey])
  }

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
    // 时间窗 meta：label 按实际范围返回（日期窗回显日期串 / 枚举窗取词条），前端可直接用作标题
    timeRange: { start: startTime, end: endTime, label },
  }
}

async function removeHistory(payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 支持两种粒度：
  // 1) 单次删除：payload.timeRange（如 'today' / 'week' / 'all'）+ 可选 payload.query
  // 2) 子集删除：payload.selectedUrls 是从 NEEDS_CONFIRM 二次确认回传的 url 列表，
  //    用于"只删除搜索结果中我勾选的那几个"。
  // 归一化小写：校验忽略大小写，下方窗口三元链是精确比较，不归一会漏进默认分支（startTime=0）
  const range = typeof payload.timeRange === 'string' ? payload.timeRange.trim().toLowerCase() : ''
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

  // timeRange 是必填参数且必须是合法枚举：缺失/非法直接拒绝。绝不能落到下面三元链的
  // 默认分支——那会得到 startTime=0（全部历史），用户确认"删某天"实际被删掉所有记录
  if (!(range in HISTORY_RANGE_LABEL_KEYS)) return invalidTimeRangeResult()

  if (range === 'all') {
    await chrome.history.deleteAll()
    // deleteAll 无返回数量，message 供步骤摘要直接展示（裸 {success:true} 会落进 JSON 兜底）
    return { success: true, message: swT('sw.historyAllCleared') }
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

// ──── CHROME API 兜底实现 ────

/**
 * chrome_api 兜底通道：专用命令参数表达不了需求时（如任意毫秒时间窗查历史、
 * 最近关闭列表——downloads/bookmarks/tabs 等已有专用 intent），按只读白名单
 * 直调 Chrome 扩展 API，把原始结果回给模型。
 * 白名单外 / 参数类型不符一律快速失败（INVALID_PARAMS + suggestion 引导回专用
 * 命令），绝不静默兜底——与 timeRange 的 v2 结论一致：假成功比失败更糟。
 * @param payload - 命令 payload（api: API 全名；args: API 原生参数对象，时间为毫秒时间戳）
 * @returns history.search → items/found；sessions.getRecentlyClosed → sessions/found
 */
async function executeChromeApi(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const api = typeof payload.api === 'string' ? payload.api.trim() : ''
  if (!api || !CHROME_API_ALLOWLIST.has(api)) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: swT('sw.chromeApiNotAllowed', { api: api || '(未传)' }),
      suggestion: swT('sw.chromeApiNotAllowedHint'),
    }
  }

  // args 必须是普通对象（数组/null 误传视为未传，缺省参数走 Chrome 各自的文档默认值）
  const args =
    payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args)
      ? (payload.args as Record<string, unknown>)
      : {}

  if (api === 'history.search') return await chromeApiHistorySearch(args)
  return await chromeApiRecentlyClosed(args)
}

/** chrome_api 只读白名单：显式枚举集合，新增 API 只需在此登记 + 补对应 dispatch 分支；
 * 不提供任意 namespace.method 反射调用（写操作、cookies 等敏感读进不来） */
const CHROME_API_ALLOWLIST = new Set(['history.search', 'sessions.getRecentlyClosed'])

/** chrome.sessions.getRecentlyClosed 的单次返回上限（Chrome MAX_SESSION_RESULTS） */
const SESSIONS_MAX_RESULTS = 25

/**
 * chrome_api::history.search：按毫秒时间窗直查浏览历史（history_search 只支持相对
 * 枚举/日期粒度，需要小时级自定义窗口时由本通道兜底）。startTime/endTime 缺省时
 * 走 Chrome 文档默认（近 24h），不发明自己的默认值。
 * @param args - { text?, startTime?, endTime?, maxResults? }（时间为毫秒时间戳）
 * @returns 执行结果；时间参数非有限数字返回 INVALID_PARAMS（chrome 收到错类型只会抛
 *          英文异常，模型难自查——先校验并回中文提示）
 */
async function chromeApiHistorySearch(args: Record<string, unknown>): Promise<ExecutionResult> {
  for (const key of ['startTime', 'endTime', 'maxResults'] as const) {
    const v = args[key]
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        message: swT('sw.chromeApiArgsInvalid', { arg: key }),
      }
    }
  }

  // text 是 chrome.history.search 的必填参数：'' = 不限关键词
  const query: { text: string; startTime?: number; endTime?: number; maxResults?: number } = {
    text: typeof args.text === 'string' ? args.text : '',
  }
  if (typeof args.startTime === 'number') query.startTime = args.startTime
  if (typeof args.endTime === 'number') query.endTime = args.endTime
  if (typeof args.maxResults === 'number' && args.maxResults > 0) query.maxResults = args.maxResults

  // chrome.* 原生抛错（SW 消息监听器没有 try/catch，异常会让发送端拿到误导性的
  // COM_DISCONNECTED）——在这里兜底转成结构化失败结果，模型能读到真实原因
  try {
    const items = await chrome.history.search(query)
    return {
      success: true,
      api: 'history.search',
      found: items.length,
      items: items.map((i) => ({
        title: i.title,
        url: i.url,
        lastVisitTime: i.lastVisitTime,
        visitCount: i.visitCount,
      })),
    }
  } catch (e: unknown) {
    return chromeApiErrorResult('history.search', e)
  }
}

/**
 * chrome_api 各 API 抛错时的统一失败结果（模型可读的真实错误信息 + code: API_ERROR）
 * @param api - API 全名（history.search 等）
 * @param e - chrome.* 抛出的异常
 * @returns 结构化失败结果，message 带原始错误文案
 */
function chromeApiErrorResult(api: string, e: unknown): ExecutionResult {
  const reason = e instanceof Error ? e.message : String(e)
  return {
    success: false,
    code: 'API_ERROR',
    message: swT('sw.chromeApiFailed', { api, msg: reason }),
  }
}

/**
 * chrome_api::sessions.getRecentlyClosed：列出最近关闭的标签页/窗口。现有
 * sessions_restore 只能直接恢复、没有「先列出」的专用命令，属真实能力缺口。
 * @param args - { maxResults?: number }
 * @returns 执行结果：sessions 数组（tab/window 摘要，关闭单个标签得 tab、整窗得 window）
 */
async function chromeApiRecentlyClosed(args: Record<string, unknown>): Promise<ExecutionResult> {
  const maxResults = args.maxResults
  if (
    maxResults !== undefined &&
    (typeof maxResults !== 'number' || !Number.isFinite(maxResults))
  ) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: swT('sw.chromeApiArgsInvalid', { arg: 'maxResults' }),
    }
  }

  // chrome.sessions 单次上限 25（MAX_SESSION_RESULTS），请求更多会被 Chrome 拒绝——
  // 钳制到上限而不是报错，语义仍是「取最近 N 条」
  const capped =
    typeof maxResults === 'number' && maxResults > 0
      ? Math.min(Math.floor(maxResults), SESSIONS_MAX_RESULTS)
      : undefined

  // chrome.* 原生抛错统一兜底（同 history.search：SW 监听器无 try/catch）
  try {
    const sessions = await chrome.sessions.getRecentlyClosed(capped ? { maxResults: capped } : {})
    return {
      success: true,
      api: 'sessions.getRecentlyClosed',
      found: sessions.length,
      sessions: sessions.map((s) => ({
        tab: s.tab
          ? {
              sessionId: s.tab.sessionId,
              title: s.tab.title,
              url: s.tab.url,
              lastVisitTime: s.tab.lastVisitTime,
            }
          : undefined,
        window: s.window
          ? { sessionId: s.window.sessionId, tabCount: s.window.tabs?.length }
          : undefined,
      })),
    }
  } catch (e: unknown) {
    return chromeApiErrorResult('sessions.getRecentlyClosed', e)
  }
}

// ──── NAVIGATION 实现 ────

async function navigateTo(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const url = payload.url as string
  if (!url) return { success: false, code: 'INVALID_PARAMS', message: swT('sw.urlRequired') }
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('javascript:')
  ) {
    return { success: false, code: 'PAGE_BLOCKED', message: swT('sw.navBlocked') }
  }
  try {
    new URL(url)
  } catch {
    return { success: false, code: 'INVALID_PARAMS', message: swT('sw.invalidUrl') }
  }
  const windowId = await getFallbackWindowId()
  const [tab] = await chrome.tabs.query({ active: true, windowId })
  if (!tab?.id) return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noActiveTab') }
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
    const windowId = await getFallbackWindowId()
    ;[targetTab] = await chrome.tabs.query({ active: true, windowId })
  }
  if (!targetTab?.windowId)
    return { success: false, code: 'ELE_NOT_FOUND', message: swT('sw.noActiveTab') }
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'png' })
    return { success: true, screenshot: dataUrl, mode: 'visible' }
  } catch {
    return { success: false, code: 'ACT_BLOCKED', message: swT('sw.shotRejected') }
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
    const windowId = await getFallbackWindowId()
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    targetTabId = tab?.id
  }
  if (!targetTabId) {
    return { success: false, code: 'ELE_NOT_FOUND', message: swT('sw.noActiveTab') }
  }

  // 接收端不存在（扩展重载后已打开页面不会自动注入）时兜底注入并重试一次；
  // SCREENSHOT 分支不检查 enabled，无需等待就绪
  let response: unknown
  try {
    response = await sendToContentScriptWithInjection(targetTabId, {
      type: 'SCREENSHOT',
      mode,
      timestamp: Date.now(),
    })
  } catch (error) {
    const isRestricted = error instanceof Error && error.message === 'INJECTION_FAILED'
    return {
      success: false,
      code: 'CONTENT_SCRIPT_ERROR',
      message: isRestricted ? swT('sw.shotBlockedPage') : swT('sw.csNotResponding'),
      suggestion: 'RELOAD_PAGE',
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
    return { success: false, code: 'SCREENSHOT_EMPTY', message: swT('sw.shotEmpty') }
  }
  return {
    success: false,
    code: r.error || 'UNKNOWN_ERROR',
    message: r.message || r.error,
    suggestion: r.suggestion,
  }
}

/**
 * 向 content script 发送消息；接收端不存在（扩展重载后已打开页面未注入新 script）时
 * 动态注入 content.js 并重试一次。Chrome 重载扩展不会给已打开标签页重新注入 content script，
 * 旧 script 成为孤儿收不到消息，此兜底让用户无需手动刷新页面。
 * @param tabId - 目标标签页 ID
 * @param message - 消息体（含 type 等）
 * @param retryDelayMs - 注入成功后、重试前的等待毫秒数（默认 0；DOM 工具传 1200 避开
 *   content script 的 enabled 1s 就绪延迟，否则重试只会得到"DOM感知未启用"）
 * @returns content script 的响应
 * @throws 注入失败（chrome:// 等受限页）抛 message 为 INJECTION_FAILED 的错误；
 *   重试仍失败时抛出原始 sendMessage 错误，由调用方映射文案
 */
async function sendToContentScriptWithInjection(
  tabId: number,
  message: unknown,
  retryDelayMs = 0
): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tabId, message)
  } catch {
    const injected = await injectContentScript(tabId)
    if (!injected) throw new Error('INJECTION_FAILED')
    if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    return await chrome.tabs.sendMessage(tabId, message)
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
  const windowId = await getFallbackWindowId()
  // 目标标签：tabId 缺省时作用于当前活动标签（与命令描述一致；schema 宣告了 tabId 就必须兑现）
  let targetTabId: number
  const payloadTabId = payload.tabId as number | undefined
  if (payloadTabId) {
    targetTabId = payloadTabId
  } else {
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (!tab?.id) return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noActiveTab') }
    targetTabId = tab.id
  }
  const currentZoom = await chrome.tabs.getZoom(targetTabId)
  const direction = payload.direction as string
  let zoomFactor = currentZoom

  if (direction === 'in') zoomFactor = Math.min(currentZoom + 0.25, 3)
  else if (direction === 'out') zoomFactor = Math.max(currentZoom - 0.25, 0.25)
  else if (direction === 'reset') zoomFactor = 1

  await chrome.tabs.setZoom(targetTabId, zoomFactor)
  return { success: true, zoomFactor }
}

// ──── PAGE THEME 实现 ────

/**
 * 切换当前网页的深色/浅色模式（executeScript 注入固定 id 的 <style>，方案见 docs/page-theme.md）。
 * dark 注入暗化样式并记住域名（后续该站页面由 SW 自动暗化）；light 先删除域名记忆
 * 再移除样式——记忆先撤，移除期间进来的 onUpdated 事件不会再自动暗化盖回。
 * @param payload - { mode?: 'dark' | 'light' }，mode 缺省视为 dark；始终作用于当前活动标签
 * @returns ExecutionResult：{ success, mode, domain }
 */
async function setPageTheme(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const mode = payload.mode === 'light' ? 'light' : 'dark'
  const windowId = await getFallbackWindowId()
  const [tab] = await chrome.tabs.query({ active: true, windowId })
  const targetTabId = tab?.id
  if (!targetTabId) {
    return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noActiveTab') }
  }

  const domain = await getTabHostname(targetTabId)

  if (mode === 'dark') {
    try {
      await applyDarkCss(targetTabId)
    } catch {
      // chrome:// 等受限页面 insertCSS 直接抛错
      return { success: false, code: 'CANNOT_INJECT', message: swT('sw.pageThemeBlocked') }
    }
    if (domain) {
      await rememberSite(domain, true)
    }
  } else {
    if (domain) {
      // 先撤记忆再移除：两步之间进来的 onUpdated 事件看到记忆已撤，不会自动暗化盖回
      await rememberSite(domain, false)
    }
    try {
      await removeDarkCss(targetTabId)
    } catch {
      // 受限页不可能有本扩展注入的 CSS（insertCSS 进不去），「恢复原样」天然已达成
      return { success: true, mode, domain: '' }
    }
  }
  return { success: true, mode, domain }
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
    return { success: false, code: 'INVALID_PARAMS', message: swT('sw.unknownFontSize', { size }) }
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
    return { success: false, code: 'INVALID_PARAMS', message: swT('sw.fontFamilyRequired') }
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
    const windowId = await getFallbackWindowId()
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (!tab?.url) {
      return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noActiveTab') }
    }
    try {
      domain = new URL(tab.url).hostname
    } catch {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        message: swT('sw.invalidPageUrl'),
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
      message: swT('sw.cookieSetParams'),
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
        message: swT('sw.cookieSetFailed'),
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
    const windowId = await getFallbackWindowId()
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (!tab?.url) {
      return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noActiveTab') }
    }
    try {
      domain = new URL(tab.url).hostname
    } catch {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        message: swT('sw.invalidPageUrl'),
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
  // 回传 id/enabled 供步骤摘要渲染「已启用/已停用」；裸 {success:true} 会落进 JSON 兜底显示原始串
  return { success: true, id: payload.id, enabled: payload.enabled }
}

async function removeExtension(payload: Record<string, unknown>): Promise<ExecutionResult> {
  await chrome.management.uninstall(payload.id as string)
  // uninstalled 供步骤摘要渲染「已卸载」（同上，避免落 JSON 兜底）
  return { success: true, uninstalled: payload.id }
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
  /** 词条 key（sw.* 域）：label 随当前语言在消费点经 swT 取词，保证语言切换后生效 */
  labelKey: string
  /** contentSettings API 中的 resourceId */
  resourceId: string
  /** chrome.contentSettings.set 接受的合法 setting 值 */
  legalSettings: readonly string[]
}> = [
  {
    key: 'cookies',
    labelKey: 'sw.permCookie',
    resourceId: 'cookies',
    legalSettings: ['allow', 'block'],
  },
  {
    key: 'javascript',
    labelKey: 'sw.permJavaScript',
    resourceId: 'javascript',
    legalSettings: ['allow', 'block'],
  },
  {
    key: 'popups',
    labelKey: 'sw.permPopups',
    resourceId: 'popups',
    legalSettings: ['allow', 'block'],
  },
  {
    key: 'notifications',
    labelKey: 'sw.permNotifications',
    resourceId: 'notifications',
    legalSettings: ['allow', 'block', 'ask'],
  },
  {
    key: 'images',
    labelKey: 'sw.permImages',
    resourceId: 'images',
    legalSettings: ['allow', 'block'],
  },
  {
    key: 'microphone',
    labelKey: 'sw.permMic',
    resourceId: 'microphone',
    legalSettings: ['allow', 'block', 'ask'],
  },
  {
    key: 'camera',
    labelKey: 'sw.permCamera',
    resourceId: 'camera',
    legalSettings: ['allow', 'block', 'ask'],
  },
  {
    key: 'location',
    labelKey: 'sw.permLocation',
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
    const windowId = await getFallbackWindowId()
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (!tab?.url) {
      return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noActiveTab') }
    }
    try {
      domain = new URL(tab.url).hostname
    } catch {
      return { success: false, code: 'INVALID_PARAMS', message: swT('sw.invalidPageUrl') }
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
        label: swT(t.labelKey),
        value: result?.setting || 'default',
      })
    } catch {
      // 单个权限查询失败时跳过该行；其它权限仍可观察
      entries.push({ key: t.key, label: swT(t.labelKey), value: 'default' })
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
    return { success: false, code: 'INVALID_PARAMS', message: swT('sw.domainRequired') }
  }
  const type = OBSERVABLE_PERMISSION_TYPES.find((t) => t.resourceId === setting)
  if (!type) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: swT('sw.permUnsupported', { setting: setting || '' }),
      suggestion: swT('sw.permSupportedTypes', {
        types: OBSERVABLE_PERMISSION_TYPES.map((t) => t.key).join(', '),
      }),
    }
  }
  if (!value || !type.legalSettings.includes(value)) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: swT('sw.permIllegalValue', {
        label: swT(type.labelKey),
        values: type.legalSettings.join(' | '),
      }),
      suggestion: swT('sw.permNoDefault'),
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
  // env.d.ts 的 chrome.storage 只声明了 local/session，缺 sync；运行时三者皆有，整体断言取用。
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
    return { success: false, code: 'INVALID_PARAMS', message: swT('sw.urlParamRequired') }
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
    return { success: false, code: 'NO_TABS_FOUND', message: swT('sw.noTabToReopen') }

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
      message: swT('sw.batchEmpty'),
      suggestion: swT('sw.checkCalls'),
    }

  const results: ExecutionResult[] = []
  let succeeded = 0
  let failed = 0

  for (let i = 0; i < calls.length; i++) {
    try {
      const call = calls[i]
      // 人工确认命令（删历史/删书签文件夹）不允许进 batch：batch 会给子调用
      // 整体注入 force:true，等于绕过 agent loop 的 NEEDS_CONFIRM 确认卡。
      // 拒绝并引导 AI 单独调用（单独调用会正常弹出确认卡）
      if (AGENT_CONFIRM_REQUIRED.has(call.tool)) {
        results.push({
          success: false,
          code: 'CONFIRM_REQUIRED_SOLO',
          message: swT('sw.batchConfirmRequired', { tool: call.tool }),
        })
        failed++
        continue
      }
      // batch 由 AI agent loop 触发，其余子调用视为已授权，注入 force:true
      // 跳过危险命令的二次确认，否则 batch 内的可逆危险命令会返回 NEEDS_CONFIRM 导致整批失败
      const r = await executeCommand(call.tool, { ...call.args, force: true })
      // clientExec 命令（tabs_group_move / tabs_group_by_domain / tabs_ungroup 等）
      // 的真正执行在 side panel（executeClientExec 只处理顶层结果），塞进 batch 会
      // 静默不执行——这里显式判失败，引导 AI 改为单独调用
      if ((r as Record<string, unknown>).clientExec) {
        results.push({
          success: false,
          code: 'CLIENT_EXEC_NOT_SUPPORTED_IN_BATCH',
          message: swT('sw.batchClientExecUnsupported', { tool: call.tool }),
          suggestion: swT('sw.batchClientExecSuggestion'),
        })
        failed++
        continue
      }
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
        message: e?.message || swT('sw.stepFailed'),
        index: i,
        tool: calls[i]?.tool,
        suggestion: swT('sw.checkTool'),
      })
      failed++
    }
  }

  if (failed > 0) {
    return {
      success: false,
      code: 'BATCH_PARTIAL_FAILURE',
      message: swT('sw.batchSummary', { succeeded, failed }),
      results,
      total: calls.length,
      succeeded,
      failed,
      suggestion: failed === calls.length ? swT('sw.batchAllFailed') : swT('sw.batchPartial'),
    }
  }

  return { success: true, results, total: calls.length, succeeded }
}

// ──── BROWSER DOM 操作（Playwright MCP 兼容）────

const BROWSER_TOOL_TO_MESSAGE: Record<string, string> = {
  browser_snapshot: 'SNAPSHOT',
  browser_find: 'FIND',
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
    return {
      success: false,
      code: 'UNKNOWN_TOOL',
      message: swT('sw.unknownTool', { tool: toolName }),
    }
  }

  const tabInfo = await getCurrentTab()
  if (!tabInfo) {
    return { success: false, code: 'TAB_NOT_FOUND', message: swT('sw.noActiveTab') }
  }

  try {
    // 接收端不存在（扩展重载后旧页面）时兜底注入并重试；等 1200ms 让 content script 的 enabled 就绪
    const response = await sendToContentScriptWithInjection(
      tabInfo.tabId,
      {
        type: message,
        ...args,
        timestamp: Date.now(),
      },
      1200
    )
    return mapContentScriptResponse(response)
  } catch (error) {
    // 受限页（chrome:// 等）注入失败 vs 注入后仍无响应，提示不同动作
    const isRestricted = error instanceof Error && error.message === 'INJECTION_FAILED'
    return {
      success: false,
      code: 'CONTENT_SCRIPT_ERROR',
      message: isRestricted ? swT('sw.injectBlockedPage') : swT('sw.csNotResponding'),
      suggestion: isRestricted ? 'SWITCH_TAB' : 'RELOAD_PAGE',
    }
  }
}

function mapContentScriptResponse(response: unknown): ExecutionResult {
  if (!response || typeof response !== 'object') {
    return { success: false, code: 'INVALID_RESPONSE', message: swT('sw.invalidResponse') }
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
    // MV3 SW 上下文下 `chrome.tabs.query({ active: true, currentWindow: true })`
    // 经常返回 undefined（SW 不属于任何普通窗口，sidepanel 窗口也没有标签）。
    // 用 getFallbackWindowId() 选最近聚焦的普通窗口，再查活动 tab。
    const windowId = await getFallbackWindowId()
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (!tab || tab.id === undefined) return null
    return { tabId: tab.id }
  } catch {
    return null
  }
}

/**
 * 选一个合适的窗口 ID 用来查标签。
 *
 * 策略：
 *   1) 优先用 chrome.windows.getLastFocused() 拿最近聚焦的窗口（这是普通浏览器窗口，
 *      含标签页），跳过 type === 'panel'（sidepanel 窗口没有标签）。
 *   2) 如果没有最近聚焦窗口，回退到任意一个非 panel 窗口。
 *   3) 都拿不到则返回 chrome.windows.WINDOW_ID_NONE（-1）。注意：-1 不是
 *      "所有窗口"——tabs.query({windowId:-1}) 返回空列表，调用方需自行处理
 *      （如 observeTabs 在 -1 时不设置 windowId 以查询全部窗口）。
 */
async function getFallbackWindowId(): Promise<number> {
  try {
    const last = await chrome.windows.getLastFocused()
    if (last && last.id !== undefined && last.type !== 'panel') return last.id
  } catch {
    /* ignore */
  }
  try {
    const all = await chrome.windows.getAll({ windowTypes: ['normal', 'popup'] })
    const fallback = all.find((w) => w.id !== undefined)
    if (fallback?.id !== undefined) return fallback.id
  } catch {
    /* ignore */
  }
  return -1
}
