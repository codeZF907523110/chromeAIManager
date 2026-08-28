/**
 * SW 工具注册表 + 危险工具拦截
 *
 * 替代旧的 executor.ts 单一 dispatch。
 * 每个 handler 文件按"领域"（tabs / bookmarks / history / ...）独立导出函数，
 * 这里集中注册并提供 dispatchTool 入口（含危险操作二次确认 + force:true 跳过）。
 */

import type { ExecutionResult } from '../../types/execution'

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
import * as tabGroups from './tab-groups'
import * as downloads from './downloads'
import * as sessions from './sessions'
import * as browsingData from './browsing-data'
import * as notifications from './notifications'

/** SW 工具 handler 签名：接收参数，返回 ExecutionResult */
export type Handler = (args: Record<string, unknown>) => Promise<ExecutionResult>

/** SW 工具注册表：tool 名 → handler */
export const REGISTRY: Record<string, Handler> = {
  // ─── TABS ───
  tabs_observe: tabs.observe,
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
  tab_groups_create: tabGroups.create,
  tab_groups_update: tabGroups.update,
  tab_groups_move_tabs: tabGroups.moveTabs,
  tab_groups_ungroup_tabs: tabGroups.ungroupTabs,
  // ─── BOOKMARKS ───
  bookmarks_observe_tree: bookmarks.observeTree,
  bookmarks_create_node: bookmarks.createNode,
  bookmarks_update_node: bookmarks.updateNode,
  bookmarks_move_node: bookmarks.moveNode,
  bookmarks_remove_node: bookmarks.removeNode,
  bookmarks_open_node: bookmarks.openNode,
  bookmarks_add_current_page: bookmarks.addCurrentPage,
  // ─── HISTORY ───
  history_search: history.search,
  history_remove: history.remove,
  // ─── WINDOWS ───
  windows_observe: windows.observe,
  windows_create: windows.create,
  windows_update: windows.update,
  // ─── NAVIGATION / PAGE ───
  navigate: navigation.navigate,
  screenshot: navigation.screenshot,
  zoom: navigation.zoom,
  downloads_search: downloads.search,
  downloads_download: downloads.download,
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
  sessions_restore: storage.restoreSession,
  sessions_observe: sessions.observe,
  sessions_restore_by_id: sessions.restore,
  browsing_data_settings: browsingData.settings,
  browsing_data_remove: browsingData.remove,
  notifications_create: notifications.create,
  notifications_clear: notifications.clear,
  notifications_list: notifications.list,
  theme_observe: themeFont.observeTheme,
  theme_update: themeFont.updateTheme,
  font_size_observe: themeFont.observeFontSize,
  font_size_update: themeFont.updateFontSize,
  font_family_observe: themeFont.observeFontFamily,
  font_family_update: themeFont.updateFontFamily,
  // ─── COOKIES ───
  cookies_observe: cookies.observe,
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
}

/** 危险工具集合：调用前需要 force=true 或前端二次确认 */
export const DANGEROUS_TOOLS = new Set([
  'tabs_remove',
  'tabs_remove_by_url',
  'bookmarks_remove_node',
  'history_remove',
  'cookies_remove',
  'extensions_remove',
  'downloads_cancel',
  'browsing_data_remove',
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
      const tabIds = Array.isArray(args.tabIds) ? (args.tabIds as number[]) : []
      if (!tabIds.length) return undefined
      const tabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null)))
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

/**
 * dispatchTool 入口（替代旧 executeCommand）
 *
 * 流程：
 *   1. 未知 tool → UNKNOWN_TOOL
 *   2. 危险 tool + force !== true → NEEDS_CONFIRM（前端弹卡）
 *   3. 其它 → 直接调 handler
 *
 * 用解构剥离 force 字段，避免污染原 args。
 */
export async function dispatchTool(
  tool: string,
  args: Record<string, unknown> = {}
): Promise<ExecutionResult> {
  const handler = REGISTRY[tool]
  if (!handler) {
    return { success: false, code: 'UNKNOWN_TOOL', message: `未知工具: ${tool}` }
  }

  if (DANGEROUS_TOOLS.has(tool) && args.force !== true) {
    return {
      success: false,
      code: 'NEEDS_CONFIRM',
      message: `确认执行 "${tool}" 操作？此操作不可撤销。`,
      detail: {
        tool,
        payload: args,
        nodeId: args.nodeId,
        title: args.title,
        children: await buildConfirmChildren(tool, args),
      },
    }
  }

  const { force: _force, ...cleanArgs } = args
  try {
    return await handler(cleanArgs)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      code: 'API_ERROR',
      message,
      suggestion: '请检查参数和 Chrome 当前状态后重试',
    }
  }
}
