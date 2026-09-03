/**
 * SW 工具注册表 + 危险工具拦截
 *
 * 替代旧的 executor.ts 单一 dispatch。
 * 每个 handler 文件按"领域"（tabs / bookmarks / history / ...）独立导出函数，
 * 这里集中注册并提供 dispatchTool 入口（含危险操作二次确认 + force:true 跳过）。
 */

import type { ExecutionResult } from '../../types/execution'
import { getToolPolicy, validateToolArgs } from '../../shared/tool-contracts'
import { issueConfirmation } from '../confirmation'
import { recordAudit, summarizeArgsKeys } from '../audit'
import { getUnsupportedReason } from '../../shared/unsupported'

import * as tabs from './tabs'
import * as bookmarks from './bookmarks'
import * as history from './history'
import * as windows from './windows'
import * as navigation from './navigation'
import * as storage from './storage'
import * as themeFont from './theme-font'
import * as cookies from './cookies'
import * as topSites from './top-sites'
import * as extensions from './extensions'
import * as permissions from './permissions'
import * as contentSettings from './content-settings'
import * as tabGroups from './tab-groups'
import * as downloads from './downloads'
import * as sessions from './sessions'
import * as browsingData from './browsing-data'
import * as notifications from './notifications'

/** SW 工具 handler 签名：接收参数，返回 ExecutionResult */
export type Handler = (args: Record<string, unknown>) => Promise<ExecutionResult>

/** SW 工具注册表：tool 名 → handler */
export const REGISTRY: Record<string, Handler> = {
  // ─── SLASH 命令别名（直接路由到 SW handler）───
  find_tab: tabs.update,
  close_duplicate_tabs: tabs.remove,
  close_tabs_by_url: tabs.removeByUrl,
  sort_tabs: tabs.move,
  pin_tab: tabs.update,
  duplicate_tab: tabs.create,
  ungroup_all: tabs.ungroupAll,
  group_by_domain: tabs.groupByDomain,
  reopen_closed_tab: sessions.restore,
  search_history: history.search,
  delete_history: history.remove,
  new_window: windows.create,
  get_cookies: cookies.observe,
  clear_cookies: cookies.remove,
  get_top_sites: topSites.observe,
  list_extensions: extensions.observe,
  enable_extension: extensions.update,
  disable_extension: extensions.update,
  uninstall_extension: extensions.remove,
  get_site_permissions: permissions.observe,
  set_site_permission: permissions.update,
  add_bookmark: bookmarks.addCurrentPage,
  remove_bookmark: bookmarks.removeNode,
  list_groups: tabs.observeGroups,
  reload_tab: tabs.update,
  move_tab: tabs.move,
  // ─── TABS ───
  tabs_observe: tabs.observe,
  tabs_get: tabs.get,
  tabs_highlight: tabs.highlight,
  tabs_go_back: tabs.goBack,
  tabs_go_forward: tabs.goForward,
  tabs_capture_visible: tabs.captureVisibleTab,
  tabs_get_zoom: tabs.getZoom,
  tabs_set_zoom: tabs.setZoom,
  tabs_get_zoom_settings: tabs.getZoomSettings,
  tabs_set_zoom_settings: tabs.setZoomSettings,
  tabs_create: tabs.create,
  tabs_update: tabs.update,
  tabs_reload: tabs.reload,
  tabs_duplicate: tabs.duplicate,
  tabs_discard: tabs.discard,
  tabs_remove: tabs.remove,
  tabs_remove_by_url: tabs.removeByUrl,
  tabs_move: tabs.move,
  tabs_observe_groups: tabs.observeGroups,
  tabs_group_by_domain: tabs.groupByDomain,
  tabs_ungroup_all: tabs.ungroupAll,
  tab_groups_query: tabGroups.query,
  tab_groups_get: tabGroups.get,
  tab_groups_create: tabGroups.create,
  tab_groups_update: tabGroups.update,
  tab_groups_move_tabs: tabGroups.moveTabs,
  tab_groups_ungroup_tabs: tabGroups.ungroupTabs,
  tab_groups_find_or_create_by_title: tabGroups.findOrCreateByTitle,
  // ─── BOOKMARKS ───
  bookmarks_observe_tree: bookmarks.observeTree,
  bookmarks_get: bookmarks.get,
  bookmarks_get_children: bookmarks.getChildren,
  bookmarks_get_sub_tree: bookmarks.getSubTree,
  bookmarks_search: bookmarks.search,
  bookmarks_get_recent: bookmarks.getRecent,
  bookmarks_create_node: bookmarks.createNode,
  bookmarks_update_node: bookmarks.updateNode,
  bookmarks_move_node: bookmarks.moveNode,
  bookmarks_remove_node: bookmarks.removeNode,
  bookmarks_open_node: bookmarks.openNode,
  bookmarks_add_current_page: bookmarks.addCurrentPage,
  // ─── HISTORY ───
  history_search: history.search,
  history_search_min: history.searchMin,
  history_get_visits: history.getVisits,
  history_delete_url: history.deleteUrl,
  history_delete_range: history.deleteRange,
  history_delete_all: history.deleteAll,
  history_remove: history.remove,
  // ─── WINDOWS ───
  windows_observe: windows.observe,
  windows_get: windows.get,
  windows_get_current: windows.getCurrent,
  windows_get_last_focused: windows.getLastFocused,
  windows_get_all: windows.getAll,
  windows_create: windows.create,
  windows_update: windows.update,
  windows_remove: windows.remove,
  // ─── NAVIGATION / PAGE ───
  navigate: navigation.navigate,
  screenshot: navigation.screenshot,
  zoom: navigation.zoom,
  downloads_search: downloads.search,
  downloads_download: downloads.download,
  downloads_pause: downloads.pause,
  downloads_resume: downloads.resume,
  downloads_cancel: downloads.cancel,
  downloads_show: downloads.show,
  downloads_open: downloads.open,
  downloads_erase: downloads.erase,
  downloads_remove_file: downloads.removeFile,
  // ─── STORAGE / SESSIONS ───
  storage_get: storage.get,
  storage_set: storage.set,
  storage_remove: storage.remove,
  storage_area_get: storage.areaGet,
  storage_area_set: storage.areaSet,
  storage_area_remove: storage.areaRemove,
  storage_area_clear: storage.areaClear,
  sessions_observe: sessions.observe,
  sessions_get_devices: sessions.getDevices,
  sessions_restore: sessions.restore,
  sessions_restore_by_id: sessions.restore,
  browsing_data_settings: browsingData.settings,
  browsing_data_remove: browsingData.remove,
  browsing_data_remove_cache: browsingData.removeCache,
  browsing_data_remove_cookies: browsingData.removeCookies,
  notifications_create: notifications.create,
  notifications_update: notifications.update,
  notifications_get_all: notifications.getAll,
  notifications_list: notifications.list,
  notifications_clear: notifications.clear,
  theme_observe: themeFont.observeTheme,
  theme_update: themeFont.updateTheme,
  font_size_observe: themeFont.observeFontSize,
  font_size_update: themeFont.updateFontSize,
  font_family_observe: themeFont.observeFontFamily,
  font_family_update: themeFont.updateFontFamily,
  // ─── COOKIES ───
  cookies_observe: cookies.observe,
  cookies_get: cookies.get,
  cookies_get_all: cookies.getAll,
  cookies_get_all_cookie_stores: cookies.getAllCookieStores,
  cookies_set: cookies.set,
  cookies_remove: cookies.remove,
  // ─── TOP SITES ───
  top_sites_observe: topSites.observe,
  // ─── EXTENSIONS ───
  extensions_observe: extensions.observe,
  extensions_update: extensions.update,
  extensions_remove: extensions.remove,
  // ─── PERMISSIONS ───
  permissions_observe: permissions.observe,
  permissions_update: permissions.update,
  permissions_clear: permissions.clear,
  content_settings_get: contentSettings.get,
  content_settings_set: contentSettings.set,
  content_settings_clear: contentSettings.clear,
}

/** 危险工具集合：调用前需要 force=true 或前端二次确认
 *
 * 注意：DANGEROUS_TOOLS 由 getToolPolicy() 的 requiresUserConfirmation 派生；
 * 由于 aiHidden 命令不出现在 policy（getToolPolicy 会跳过 aiHidden），
 * slash 专属的危险命令（如 ungroup_all / close_duplicate_tabs / close_tabs_by_url
 * / remove_bookmark / uninstall_extension）需要直接列出，避免漏掉。
 */
export const DANGEROUS_TOOLS = new Set<string>([
  ...Object.keys(REGISTRY).filter((name) => getToolPolicy(name)?.requiresUserConfirmation),
  // slash 专属（aiHidden=true，不在 policy 里）：二次确认走 confirmationToken 闭环
  'tabs_ungroup_all',
  'tabs_remove_by_url',
  'tabs_remove',
  'bookmarks_remove_node',
  'history_remove',
  'cookies_remove',
  'extensions_remove',
  'notifications_clear',
  'browsing_data_remove',
  'storage_area_remove',
  'storage_area_clear',
  'content_settings_set',
  'content_settings_clear',
])

/**
 * 为二次确认卡构建 children 列表。
 *
 * children 每条形如 { id, title?, url? }，前端会映射为带 checkbox 的可勾选项。
 * 不支持的 intent 返回 undefined，前端按"无 children"处理。
 *
 * children 的 id 可能是 string（书签/历史 URL）或 number（tabId）；
 * 前端 ConfirmCard 会过滤 tabId === undefined 的条目（history_remove URL 字符串）。
 */
export async function buildConfirmChildren(
  tool: string,
  args: Record<string, unknown>
): Promise<Array<{ id: string | number; title?: string; url?: string }> | undefined> {
  try {
    if (tool === 'bookmarks_remove_node') {
      const nodeId = args.nodeId as string | undefined
      if (!nodeId) return undefined
      try {
        const nodes = await chrome.bookmarks.get(nodeId)
        const node = nodes[0]
        if (!node || !node.children) return undefined
        const children = await chrome.bookmarks.getChildren(nodeId)
        return children.map((c) => ({ id: c.id, title: c.title, url: c.url }))
      } catch {
        return undefined
      }
    }
    if (tool === 'tabs_remove') {
      const explicitIds = Array.isArray(args.tabIds)
        ? (args.tabIds as unknown[]).filter((id): id is number => typeof id === 'number')
        : []
      let candidateIds: number[]
      if (explicitIds.length > 0) {
        candidateIds = explicitIds
      } else if (typeof args.domain === 'string' && args.domain.trim()) {
        const query: chrome.tabs.QueryOptions =
          args.currentWindow === false ? {} : { currentWindow: true }
        const all = await chrome.tabs.query(query)
        const d = args.domain.toLowerCase().replace(/^www\./, '')
        candidateIds = all
          .filter((t) => !t.pinned && t.id !== undefined)
          .filter((t) => {
            try {
              const host = new URL(t.url || '').hostname.toLowerCase().replace(/^www\./, '')
              return host === d || host.endsWith(`.${d}`)
            } catch {
              return false
            }
          })
          .map((t) => t.id!)
      } else {
        return undefined
      }
      const tabs = await Promise.all(
        candidateIds.map((id) => chrome.tabs.get(id).catch(() => null))
      )
      return tabs
        .filter((t): t is chrome.tabs.Tab => !!t && t.id !== undefined)
        .map((t) => ({ id: t.id!, title: t.title, url: t.url }))
    }
    if (tool === 'history_remove' && args.query) {
      const items = await chrome.history.search({
        text: args.query as string,
        maxResults: 20,
      })
      return items
        .filter((it) => !!it.url)
        .map((it) => ({ id: it.url as string, title: it.title, url: it.url }))
    }
  } catch {
    return undefined
  }
  return undefined
}

/** 检查工具所需的扩展权限；测试环境缺少 permissions API 时保持兼容。 */
async function checkToolPermissions(policy: {
  requiredPermissions: string[]
}): Promise<ExecutionResult | null> {
  if (!policy.requiredPermissions.length) return null
  const permissionsApi = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.permissions
  if (!permissionsApi?.contains) return null
  try {
    const granted = await callContains(permissionsApi, { permissions: policy.requiredPermissions })
    return granted
      ? null
      : { success: false, code: 'PERMISSION_DENIED', message: '扩展缺少执行该工具所需权限' }
  } catch {
    return { success: false, code: 'PERMISSION_DENIED', message: '无法确认扩展权限状态' }
  }
}

/** 同时支持 Promise 和 callback 风格 chrome.permissions.contains，便于测试 mock。 */
function callContains(api: unknown, request: { permissions?: string[] }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = (
        api as {
          contains: (
            req: { permissions?: string[] },
            cb: (granted: boolean) => void
          ) => void | Promise<boolean>
        }
      ).contains(request, (granted: boolean) => {
        const lastError = (
          globalThis as unknown as { chrome?: { runtime?: { lastError?: { message?: string } } } }
        ).chrome?.runtime?.lastError
        if (lastError) {
          reject(new Error(lastError.message ?? 'permissions.contains 失败'))
          return
        }
        resolve(Boolean(granted))
      })
      if (result && typeof (result as Promise<boolean>).then === 'function') {
        ;(result as Promise<boolean>).then(resolve, reject)
      }
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/** 校验需要网站访问的工具目标，拒绝内部页面和非法协议。 */
async function checkToolHost(
  policy: { hostAccess: string },
  args: Record<string, unknown>,
  tool?: string
): Promise<ExecutionResult | null> {
  if (policy.hostAccess === 'none') return null
  // storage_* 不需要 host 校验（读的是扩展自身存储）
  if (tool && tool.startsWith('storage_')) return null
  let url = typeof args.url === 'string' ? args.url : undefined
  if (!url && typeof args.domain === 'string') url = `https://${args.domain}/`
  if (!url && typeof args.tabId === 'number') {
    try {
      url = (await chrome.tabs.get(args.tabId)).url
    } catch {
      return { success: false, code: 'TARGET_NOT_FOUND', message: '目标标签页不存在' }
    }
  }
  if (!url) return { success: false, code: 'PERMISSION_DENIED', message: '缺少网站访问目标' }
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || isProtectedHost(parsed)) {
      return { success: false, code: 'PERMISSION_DENIED', message: '目标页面不允许访问' }
    }
  } catch {
    return { success: false, code: 'PERMISSION_DENIED', message: '目标 URL 无效' }
  }
  return null
}

/** 判断 URL 是否属于浏览器或扩展内部页面。 */
function isProtectedHost(url: URL): boolean {
  return (
    url.protocol === 'chrome:' ||
    url.protocol === 'chrome-extension:' ||
    url.hostname === 'chrome.google.com'
  )
}

/** 去除敏感字段，返回用于确认卡 UI 展示的安全摘要。 */
function sanitizeDetailArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (key === 'force' || key === 'confirmationToken') continue
    if (key === 'password' || key === 'value' || key === 'cookieValue') continue
    sanitized[key] = value
  }
  return sanitized
}

/** dispatchTool 入口（替代旧 executeCommand）
 *
 * 流程：
 *   1. 未知 tool → UNKNOWN_TOOL
 *   2. 工具权限不足 → PERMISSION_DENIED
 *   3. 危险 tool + 无 __preConfirmed + force !== true → NEEDS_CONFIRM
 *   4. 危险 tool + force:true 但 confirmationToken 缺失/无效 → CONFIRM_INVALID
 *   5. 其它 → 直接调 handler
 *
 * 用解构剥离 force/__preConfirmed 字段，避免污染原 args。
 *
 * __preConfirmed 标记用于前端确认卡用户已点确认后，直接绕过危险检查执行。
 */
export async function dispatchTool(
  tool: string,
  args: Record<string, unknown> = {}
): Promise<ExecutionResult> {
  console.log(
    `[AI管家] dispatchTool enter tool=${tool}`,
    `argsKeys=${Object.keys(args).join(',')}`,
    `dangerous=${DANGEROUS_TOOLS.has(tool)}`
  )
  console.log(`[AI管家] dispatchTool args=${JSON.stringify(args)}`)
  const unsupportedReason = getUnsupportedReason(tool)
  if (unsupportedReason) {
    console.warn(`[AI管家] reject: UNSUPPORTED_TOOL tool=${tool} reason=${unsupportedReason}`)
    return { success: false, code: 'UNSUPPORTED_TOOL', message: unsupportedReason }
  }
  const handler = REGISTRY[tool]
  if (!handler) {
    console.warn(`[AI管家] reject: UNKNOWN_TOOL tool=${tool}`)
    return { success: false, code: 'UNKNOWN_TOOL', message: `未知工具: ${tool}` }
  }
  console.log(`[AI管家] REGISTRY lookup OK tool=${tool}`)
  const validationError = validateToolArgs(tool, args)
  if (validationError) {
    console.warn(
      `[AI管家] reject: validateToolArgs tool=${tool} code=${validationError.code} message=${validationError.message}`
    )
    return { ...validationError, success: false }
  }
  console.log(`[AI管家] validateToolArgs OK tool=${tool}`)

  const policy = getToolPolicy(tool)
  if (!policy) {
    console.warn(`[AI管家] reject: TOOL_POLICY_MISSING tool=${tool}`)
    return { success: false, code: 'TOOL_POLICY_MISSING', message: '工具权限策略缺失' }
  }
  const permissionError = await checkToolPermissions(policy)
  if (permissionError) {
    console.warn(`[AI管家] reject: PERMISSION_DENIED tool=${tool} code=${permissionError.code}`)
    return permissionError
  }
  console.log(`[AI管家] checkToolPermissions OK tool=${tool}`)
  const hostError = await checkToolHost(policy, args, tool)
  if (hostError) {
    console.warn(`[AI管家] reject: checkToolHost tool=${tool} code=${hostError.code} msg=${hostError.message}`)
    return hostError
  }
  console.log(`[AI管家] checkToolHost OK tool=${tool}`)

  // 前端确认卡用户已确认(__preConfirmed)或已有 force:true，跳过危险检查
  const isPreConfirmed = args.__preConfirmed === true
  const hasForce = args.force === true
  const isDangerous = DANGEROUS_TOOLS.has(tool)
  console.log(
    `[AI管家] dangerCheck tool=${tool} isPreConfirmed=${isPreConfirmed} hasForce=${hasForce} isDangerous=${isDangerous}`
  )
  if (isDangerous && !isPreConfirmed && !hasForce) {
    console.log(`[AI管家] NEEDS_CONFIRM tool=${tool}, building children...`)
    const children = await buildConfirmChildren(tool, args)
    console.log(
      `[AI管家] buildConfirmChildren tool=${tool} childrenCount=${children?.length ?? 0}`,
      children ? `firstIds=${children.slice(0, 5).map((c) => c.id).join(',')}` : ''
    )
    const confirmationToken = issueConfirmation(tool, args)
    return {
      success: false,
      code: 'NEEDS_CONFIRM',
      message: `确认执行 "${tool}" 操作？此操作不可撤销。`,
      detail: {
        tool,
        payload: { tool, args: sanitizeDetailArgs(args) },
        nodeId: args.nodeId,
        title: args.title,
        confirmationToken,
        children,
      },
    }
  }

  const { force: _force, __preConfirmed: _preConfirmed, ...cleanArgs } = args
  const startedAt = Date.now()
  console.log(`[AI管家] handler invoke tool=${tool} cleanArgs=${JSON.stringify(cleanArgs)}`)
  try {
    const result = await handler(cleanArgs)
    console.log(
      `[AI管家] handler done tool=${tool} duration=${Date.now() - startedAt}ms`,
      `success=${result.success !== false} code=${result.code ?? '-'} message=${result.message ?? '-'}`
    )
    void recordAudit({
      timestamp: Date.now(),
      tool,
      success: result.success !== false,
      code: result.code,
      durationMs: Date.now() - startedAt,
      confirmed: DANGEROUS_TOOLS.has(tool),
      context: { argKeys: summarizeArgsKeys(cleanArgs) },
    })
    const finalPolicy = getToolPolicy(tool)
    return {
      ...result,
      success: result.success !== false,
      data: result.data ?? result.result,
      meta: {
        api: tool,
        namespace: tool.split('_')[0],
        durationMs: Date.now() - startedAt,
      },
      ...(finalPolicy?.sensitiveOutput ? { sensitiveOutput: true } : {}),
    }
  } catch (error: unknown) {
    console.error(
      `[AI管家] handler threw tool=${tool} duration=${Date.now() - startedAt}ms`,
      error
    )
    void recordAudit({
      timestamp: Date.now(),
      tool,
      success: false,
      code: 'API_ERROR',
      durationMs: Date.now() - startedAt,
      confirmed: DANGEROUS_TOOLS.has(tool),
      context: { argKeys: summarizeArgsKeys(cleanArgs) },
    })
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      code: 'API_ERROR',
      message,
      suggestion: '请检查参数和 Chrome 当前状态后重试',
    }
  }
}
