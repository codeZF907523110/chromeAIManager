/**
 * 安全确认中间件 — 生成危险操作的预览清单
 * 在 Side Panel 中运行，利用 contextCache 的标签数据做本地计算
 */

import { findDuplicateGroups } from '../service-worker/utils/tab-matcher'
import type { Context } from '../types'

export interface ConfirmPreview {
  title: string
  description: string
  items: Array<{
    primary: string
    secondary: string
    /** tabId，给 checkbox 多选用 */
    tabId?: number
    /** 初始是否勾选（默认 true = 即将关闭） */
    selected?: boolean
  }>
}

/**
 * 生成确认预览
 * @param intent - 命令意图
 * @param slots - 命令参数
 * @param context - 当前浏览器上下文（含 tabs 等）
 * @param matchedBookmarks - 预取的匹配书签列表（仅 remove_bookmark 用，因 Context 不存书签详情）
 * @param matchedCookies - 预取的 Cookie 列表（仅 clear_cookies 用，Cookie 无稳定 id，用数组下标做 UI id）
 * @returns preview 对象或 null（无需确认 / 无匹配项）
 */
export async function generateConfirmPreview(
  intent: string,
  slots: Record<string, unknown>,
  context: Context | null,
  matchedBookmarks?: chrome.bookmarks.BookmarkTreeNode[],
  matchedCookies?: chrome.cookies.Cookie[]
): Promise<ConfirmPreview | null> {
  if (!context?.tabs) return null

  switch (intent) {
    case 'close_duplicate_tabs': {
      const duplicateGroups = findDuplicateGroups(context.tabs, slots.url as string | undefined)
      // 每组保留首个，其余重复标签展开为独立行，支持逐个勾选要关闭的标签。
      // 与 close_tabs_by_url 预览同构（每行带 tabId → ConfirmCard 渲染 checkbox）。
      const dupTabs = duplicateGroups.flatMap((g) => g.tabs.slice(1))
      if (dupTabs.length === 0) return null

      return {
        title: `将关闭 ${dupTabs.length} 个重复标签页`,
        description: `检测到 ${duplicateGroups.length} 组重复 URL（可勾选要关闭的标签）`,
        items: dupTabs.map((t) => ({
          primary: t.title || t.url,
          secondary: t.url,
          tabId: t.id,
          selected: true,
        })),
      }
    }

    case 'close_tabs_by_url': {
      // 纯 url/title 子串模糊匹配。命令命名为 close_tabs_by_url，
      // 语义明确为"按 URL 匹配关闭"。
      const q = ((slots.query as string) || '').toString().toLowerCase().trim()
      if (!q) return null

      const matching = context.tabs.filter((t) => {
        // pinned 标签与 SW 端语义保持一致：默认不列入"可关闭"清单。
        if (!t.url || t.pinned) return false
        const lowerUrl = t.url.toLowerCase()
        const title = (t.title || '').toLowerCase()
        return lowerUrl.includes(q) || title.includes(q)
      })
      if (matching.length === 0) return null

      // 统计 pinned 被跳过的数量，提示给用户
      const skippedPinned = context.tabs.filter((t) => {
        if (!t.url || !t.pinned) return false
        const lowerUrl = t.url.toLowerCase()
        const title = (t.title || '').toLowerCase()
        return lowerUrl.includes(q) || title.includes(q)
      }).length

      const description =
        skippedPinned > 0
          ? `匹配关键词: ${q}（${skippedPinned} 个固定标签已跳过）`
          : `匹配关键词: ${q}`

      return {
        title: `将关闭 ${matching.length} 个标签页`,
        description,
        items: matching.map((t) => ({
          primary: t.title || t.url,
          secondary: t.url,
          tabId: t.id,
          selected: true,
        })),
      }
    }

    case 'ungroup_all': {
      const groupedTabs = context.tabs.filter((t) => t.groupId !== undefined && t.groupId !== -1)
      const groupIds = new Set(groupedTabs.map((t) => t.groupId))
      if (groupIds.size === 0) {
        // 没有分组：返回 null 走"无分组"提示
        return null
      }
      // 取真实分组标题（chrome.tabGroups.query），避免用首个 tab 标题当分组名导致用户识别不出分组。
      // confirm.ts 在 side panel（用户激活上下文）运行，可直接调 tabGroups API。
      let groupMetaMap = new Map<number, { title: string; color: string }>()
      try {
        const metas = await chrome.tabGroups.query({})
        groupMetaMap = new Map(
          metas.map((m) => [m.id as number, { title: m.title || '', color: m.color || 'grey' }])
        )
      } catch {
        // tabGroups 不可用时退回用 tab 标题（保持向后兼容）
      }
      // 收集每个分组的信息（id、真实标题、tab 数）
      const groupInfos: Array<{ id: number; title: string; tabCount: number }> = []
      for (const id of groupIds) {
        const inGroup = groupedTabs.filter((t) => t.groupId === id)
        const meta = groupMetaMap.get(id as number)
        groupInfos.push({
          id: id as number,
          title: meta?.title || inGroup[0]?.title || `分组 ${id}`,
          tabCount: inGroup.length,
        })
      }
      // 按 tab 数倒序：用户最可能想取消的是大分组
      groupInfos.sort((a, b) => b.tabCount - a.tabCount)

      return {
        title: `将取消 ${groupIds.size} 个标签分组`,
        description: '所有标签本身保留，仅解除分组关系（可勾选要取消的分组）',
        items: groupInfos.map((g) => ({
          primary: g.title,
          secondary: `${g.tabCount} 个标签`,
          tabId: g.id, // ← 复用 tabId 字段携带 groupId（确认卡 checkbox 机制）
          selected: true,
        })),
      }
    }

    case 'remove_bookmark': {
      const query = slots.query as string | undefined
      if (!query) return null
      // 书签详情不在 Context 里（只有 bookmarkFolders 路径），由调用方预取后经
      // matchedBookmarks 传入。每行带 tabId（书签 id 转 number）→ ConfirmCard 渲染 checkbox。
      const items = (matchedBookmarks ?? []).map((b) => ({
        primary: b.title || b.url || '(无标题)',
        secondary: b.url || '',
        // 书签 id 是数字字符串（如 "1043"），转 number 给 ConfirmCard 的 checkbox 机制
        tabId: Number(b.id),
        selected: true,
      }))
      if (items.length === 0) return null
      return {
        title: `将删除 ${items.length} 个匹配书签`,
        description: `关键词: ${query}（可勾选要删除的书签）`,
        items,
      }
    }

    case 'delete_history': {
      const timeRange = slots.timeRange as string | undefined
      // timeRange 缺失表示 buildSlots 校验未通过（非法范围），不生成预览
      if (!timeRange) return null
      const label: Record<string, string> = {
        today: '今天',
        yesterday: '昨天',
        week: '最近一周',
        month: '最近一个月',
        all: '全部',
      }
      return {
        title: `将删除${label[timeRange] || timeRange}的浏览历史`,
        description: '此操作不可恢复',
        items: slots.query
          ? [{ primary: `匹配关键词: ${slots.query}`, secondary: label[timeRange] || timeRange }]
          : [],
      }
    }

    case 'clear_cookies': {
      // 无 domain 时取当前活动标签页域名（与 SW 端 removeCookies 的兜底逻辑一致），
      // 而非返回 null —— 否则会被当作"无匹配"拦截，导致 /clear-cookies 无参时无法执行。
      let domain = slots.domain as string | undefined
      if (!domain) {
        const activeUrl = context?.activeTab?.url
        if (activeUrl) {
          try {
            domain = new URL(activeUrl).hostname
          } catch {
            // 当前页非合法 URL，无法预览
            return null
          }
        }
      }
      if (!domain) return null
      // Cookie 无稳定 id 字段（仅 name/domain/path/secure 等），用数组下标作 ConfirmCard
      // 的 checkbox id；onConfirm 把下标映射回闭包捕获的 matchedCookies 列表再传给 SW。
      const items = (matchedCookies ?? []).map((c, i) => ({
        primary: c.name,
        secondary: `${c.domain}${c.path}`,
        tabId: i, // 数组下标作 UI id（仅本轮预览内有效）
        selected: true,
      }))
      return {
        title:
          items.length > 0
            ? `将清除域名 "${domain}" 下的 ${items.length} 个 Cookie`
            : `域名 "${domain}" 下没有 Cookie`,
        description: '此操作不可撤销，可能导致需要重新登录（可勾选要清除的 Cookie）',
        items,
      }
    }

    case 'uninstall_extension': {
      const query = slots.query
      if (!query) return null
      return {
        title: `将卸载扩展 "${query}"`,
        description: '此操作不可撤销，扩展的所有数据将被清除',
        items: [],
      }
    }

    case 'storage_remove': {
      const key = slots.key
      if (!key) return null
      return {
        title: `将删除存储键 "${key}"`,
        description: '此操作不可撤销',
        items: [],
      }
    }

    default:
      return null
  }
}
