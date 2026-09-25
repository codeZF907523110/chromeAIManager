/**
 * 安全确认中间件 — 生成危险操作的预览清单
 * 在 Side Panel 中运行，利用 contextCache 的标签数据做本地计算
 */

import { findDuplicateGroups } from '../service-worker/utils/tab-matcher'
import { i18n } from '../locales'
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
 * 罐头文案取词入口（非组件模块）：走 i18n 全局 composer，语言切换即时生效
 * @param key 词条 key
 * @param params 插值参数（可选）
 * @returns 当前语言的文案；词条缺失时由 fallbackLocale（en）兜底
 */
function t(key: string, params?: Record<string, unknown>): string {
  return params ? i18n.global.t(key, params) : i18n.global.t(key)
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
        title: t('preview.closeDupTitle', { count: dupTabs.length }),
        description: t('preview.closeDupDesc', { groups: duplicateGroups.length }),
        items: dupTabs.map((tab) => ({
          primary: tab.title || tab.url,
          secondary: tab.url,
          tabId: tab.id,
          selected: true,
        })),
      }
    }

    case 'close_tabs_by_url': {
      // 纯 url/title 子串模糊匹配。命令命名为 close_tabs_by_url，
      // 语义明确为"按 URL 匹配关闭"。
      const q = ((slots.query as string) || '').toString().toLowerCase().trim()
      if (!q) return null

      const matching = context.tabs.filter((tab) => {
        // pinned 标签与 SW 端语义保持一致：默认不列入"可关闭"清单。
        if (!tab.url || tab.pinned) return false
        const lowerUrl = tab.url.toLowerCase()
        const title = (tab.title || '').toLowerCase()
        return lowerUrl.includes(q) || title.includes(q)
      })
      if (matching.length === 0) return null

      // 统计 pinned 被跳过的数量，提示给用户
      const skippedPinned = context.tabs.filter((tab) => {
        if (!tab.url || !tab.pinned) return false
        const lowerUrl = tab.url.toLowerCase()
        const title = (tab.title || '').toLowerCase()
        return lowerUrl.includes(q) || title.includes(q)
      }).length

      const description =
        t('preview.matchKeyword', { keyword: q }) +
        (skippedPinned > 0 ? t('preview.skippedPinned', { count: skippedPinned }) : '')

      return {
        title: t('preview.closeByTitle', { count: matching.length }),
        description,
        items: matching.map((tab) => ({
          primary: tab.title || tab.url,
          secondary: tab.url,
          tabId: tab.id,
          selected: true,
        })),
      }
    }

    case 'ungroup_all': {
      const groupedTabs = context.tabs.filter(
        (tab) => tab.groupId !== undefined && tab.groupId !== -1
      )
      const groupIds = new Set(groupedTabs.map((tab) => tab.groupId))
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
        const inGroup = groupedTabs.filter((tab) => tab.groupId === id)
        const meta = groupMetaMap.get(id as number)
        groupInfos.push({
          id: id as number,
          title: meta?.title || inGroup[0]?.title || t('preview.groupFallback', { id }),
          tabCount: inGroup.length,
        })
      }
      // 按 tab 数倒序：用户最可能想取消的是大分组
      groupInfos.sort((a, b) => b.tabCount - a.tabCount)

      return {
        title: t('preview.ungroupTitle', { count: groupIds.size }),
        description: t('preview.ungroupDesc'),
        items: groupInfos.map((g) => ({
          primary: g.title,
          secondary: t('preview.tabCount', { count: g.tabCount }),
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
        primary: b.title || b.url || t('preview.untitled'),
        secondary: b.url || '',
        // 书签 id 是数字字符串（如 "1043"），转 number 给 ConfirmCard 的 checkbox 机制
        tabId: Number(b.id),
        selected: true,
      }))
      if (items.length === 0) return null
      return {
        title: t('preview.removeBookmarkTitle', { count: items.length }),
        description: t('preview.bookmarkKeywordDesc', { keyword: query }),
        items,
      }
    }

    case 'delete_history': {
      const timeRange = slots.timeRange as string | undefined
      // timeRange 缺失表示 buildSlots 校验未通过（非法范围），不生成预览
      if (!timeRange) return null
      // 未知时间范围词条缺失时回退展示原始值
      const rangeKey = `intent.historyRange.${timeRange}`
      const label = i18n.global.te(rangeKey) ? i18n.global.t(rangeKey) : timeRange
      return {
        title: t('preview.historyTitle', { range: label }),
        description: t('preview.irreversible'),
        items: slots.query
          ? [
              {
                primary: t('preview.matchKeyword', { keyword: String(slots.query) }),
                secondary: label,
              },
            ]
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
            ? t('preview.cookiesClearTitle', { domain, count: items.length })
            : t('preview.cookiesEmptyTitle', { domain }),
        description: t('preview.cookiesClearDesc'),
        items,
      }
    }

    case 'uninstall_extension': {
      const query = slots.query
      if (!query) return null
      return {
        title: t('preview.uninstallExtTitle', { query: String(query) }),
        description: t('preview.uninstallExtDesc'),
        items: [],
      }
    }

    case 'storage_remove': {
      const key = slots.key
      if (!key) return null
      return {
        title: t('preview.storageRemoveTitle', { key: String(key) }),
        description: t('preview.irreversibleShort'),
        items: [],
      }
    }

    default:
      return null
  }
}
