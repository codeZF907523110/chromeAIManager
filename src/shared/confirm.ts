/**
 * 安全确认中间件 — 生成危险操作的预览清单
 * 在 Side Panel 中运行，利用 contextCache 的标签数据做本地计算
 */

import { findDuplicateGroups } from '../service-worker/utils/tab-matcher'
import type { Context } from '../types'
import type { AIPlan } from './ai/plan-types'

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
    /** 扩展字段：携带 tabIds 数组，用于 close_duplicate_tabs 等需要批量操作的场景 */
    tabIds?: number[]
    /** 扩展字段：携带书签 ID 数组 */
    bookmarkIds?: string[]
  }>
  /** 扩展字段：全部待关闭的 tabIds（用于 close_duplicate_tabs 等批量操作） */
  allTabIds?: number[]
}

/**
 * 危险操作二次确认后，把用户勾选结果归一化到 plan 重发 payload
 *
 * children 的 id 可能是 string（书签节点 / history URL）或 number（tabId）；
 * 按 tool 类型归一化到对应字段，避免 SW 端做错类型转换。
 *
 * 规则（与旧 useAIEngine.ts:673-683 完全一致）：
 *   - history_remove → selectedUrls (string[])
 *   - bookmarks_remove_node → selectedIds (number[])
 *   - tabs_remove / tabs_remove_by_url → tabIds (number[])
 *   - 其他 → 透传 selectedIds
 */
export function buildReconfirmPayload(
  originalPlan: AIPlan,
  confirmItem: { id: string; tool: string },
  selectedIds: Array<string | number>,
  options: { confirmationToken?: string } = {}
): AIPlan {
  const tool = confirmItem.tool
  return {
    thought: originalPlan.thought,
    plan: originalPlan.plan?.map((it) => {
      if (it.id !== confirmItem.id) return it
      const extra: Record<string, unknown> = {
        force: true,
        ...(options.confirmationToken ? { confirmationToken: options.confirmationToken } : {}),
      }
      if (tool === 'history_remove') {
        extra.selectedUrls = selectedIds.map((id) => String(id))
      } else if (tool === 'bookmarks_remove_node') {
        extra.selectedIds = selectedIds
          .map((id) => (typeof id === 'number' ? id : Number(id)))
          .filter((id): id is number => Number.isFinite(id) && id > 0)
      } else if (tool === 'tabs_remove' || tool === 'tabs_remove_by_url') {
        extra.tabIds = selectedIds
          .map((id) => (typeof id === 'number' ? id : Number(id)))
          .filter((id): id is number => Number.isInteger(id) && id >= 0)
      } else if (tool === 'cookies_remove') {
        // selectedIds 是 cookie name（字符串）
        extra.selectedNames = selectedIds.map((id) => String(id))
      } else {
        extra.selectedIds = selectedIds
      }
      return {
        ...it,
        args: { ...it.args, ...extra },
        ...(it.seededResults ? { seededResults: it.seededResults } : {}),
      }
    }),
  }
}

/**
 * 生成确认预览
 * @returns preview 对象或 null（无需确认）
 */
export async function generateConfirmPreview(
  intent: string,
  slots: Record<string, unknown>,
  context: Context | null
): Promise<ConfirmPreview | null> {
  if (!context?.tabs) return null

  switch (intent) {
    case 'close_tabs_by_domain':
    case 'mute_tabs_by_domain':
    case 'unmute_tabs_by_domain': {
      const domain = ((slots.domain as string) || '').toLowerCase().trim()
      if (!domain) return null
      const matching = context.tabs.filter((t) => {
        if (!t.url || t.pinned) return false
        try {
          const hostname = new URL(t.url).hostname.toLowerCase().replace(/^www\./, '')
          const target = domain.replace(/^www\./, '')
          return hostname === target || hostname.endsWith(`.${target}`)
        } catch {
          return false
        }
      })
      if (matching.length === 0) return null

      const allTabIds = matching.map((t) => t.id).filter((id): id is number => id !== undefined)

      let title = ''
      let description = ''
      if (intent === 'close_tabs_by_domain') {
        title = `将关闭 "${domain}" 下的 ${matching.length} 个标签页`
        description = '此操作不可撤销（可勾选要关闭的标签）'
      } else if (intent === 'mute_tabs_by_domain') {
        title = `将静音 "${domain}" 下的 ${matching.length} 个标签页`
        description = '可勾选要静音的标签'
      } else {
        title = `将取消静音 "${domain}" 下的 ${matching.length} 个标签页`
        description = '可勾选要取消静音的标签'
      }

      return {
        title,
        description,
        items: matching.map((t, index) => ({
          primary: t.title || t.url || '标签',
          secondary: t.url || '',
          tabId: index,
          selected: true,
        })),
        allTabIds,
      }
    }

    case 'close_duplicate_tabs': {
      const duplicateGroups = findDuplicateGroups(context.tabs, slots.url as string | undefined)
      const totalToRemove = duplicateGroups.reduce((sum, g) => sum + g.tabs.length - 1, 0)
      if (totalToRemove === 0) return null

      return {
        title: `将关闭 ${totalToRemove} 个重复标签页`,
        description: `检测到 ${duplicateGroups.length} 组重复 URL（可勾选要关闭的组）`,
        items: duplicateGroups.map((g, index) => ({
          primary: g.url,
          secondary: `${g.tabs.length} 个标签页 → 保留 1 个`,
          // groupIndex 作为每组的唯一标识，供 checkbox 使用
          tabId: index,
          // 该组需要关闭的 tabIds
          tabIds: g.tabs
            .slice(1)
            .map((t) => t.id)
            .filter((id): id is number => id !== undefined),
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

      // 收集所有匹配的 tabIds
      const allTabIdsToRemove = matching
        .map((t) => t.id)
        .filter((id): id is number => id !== undefined)

      return {
        title: `将关闭 ${matching.length} 个标签页`,
        description,
        items: matching.map((t, index) => ({
          primary: t.title || t.url,
          secondary: t.url,
          // index 作为每条的标识，供 checkbox 使用
          tabId: index,
          selected: true,
        })),
        // 扩展字段：全部待关闭的 tabIds
        allTabIds: allTabIdsToRemove,
      }
    }

    case 'ungroup_all': {
      const groupedTabs = context.tabs.filter((t) => t.groupId !== undefined && t.groupId !== -1)
      const groupIds = new Set(groupedTabs.map((t) => t.groupId))
      if (groupIds.size === 0) {
        // 没有分组：返回 null 走"无分组"提示
        return null
      }
      // 收集每个分组的信息（id、标题、tab 数）
      const groupInfos: Array<{ id: number; title: string; tabCount: number }> = []
      for (const id of groupIds) {
        const inGroup = groupedTabs.filter((t) => t.groupId === id)
        // 取该分组第一个 tab 的 title 作为分组默认名（chrome.tabGroups.update 才能改 title）
        const sample = inGroup[0]
        groupInfos.push({
          id,
          title: sample?.title || `分组 ${id}`,
          tabCount: inGroup.length,
        })
      }
      // 按 tab 数倒序：用户最可能想取消的是大分组
      groupInfos.sort((a, b) => b.tabCount - a.tabCount)

      return {
        title: `将取消 ${groupIds.size} 个标签分组`,
        description: '所有标签本身保留，仅解除分组关系（可勾选要取消的分组）',
        items: groupInfos.map((g) => ({
          // 注意：这里 primary 显示 tab 的 title（chrome.tabGroups.update 才改 title）
          // 后续客户端执行时再用 chrome.tabGroups.update 改不了已 ungroup 的分组，所以直接展示
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
      // 在 sidepanel 上下文中直接搜索书签
      try {
        const results = await chrome.bookmarks.search(query)
        if (results.length === 0) return null
        return {
          title: `将删除 ${results.length} 个匹配的书签`,
          description: '此操作不可撤销（可勾选要删除的项）',
          items: results.map((node, index) => ({
            // label 字段：显示标题和 URL
            label: node.title || node.url || '书签',
            primary: node.title || node.url || '书签',
            secondary: node.url || '',
            tabId: index, // 用 index 作为标识
            // 扩展字段：存储书签 ID
            bookmarkIds: [node.id],
            selected: true,
          })),
        }
      } catch {
        return null
      }
    }

    case 'delete_history': {
      const timeRange = (slots.timeRange as string) || 'today'
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
      let domain = slots.domain
      if (!domain) return null
      // 解析 CURRENT_TAB_DOMAIN 哨兵值：取当前活动标签的 hostname
      if (domain === '__current__') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.url) return null
        try {
          domain = new URL(tab.url).hostname
        } catch {
          return null
        }
      }
      // 拉取该域下的所有 Cookie，让用户逐个勾选
      let cookies: Array<{ name: string; path: string }> = []
      try {
        const list = await chrome.cookies.getAll({
          domain: String(domain).replace(/^https?:\/\//, ''),
        })
        cookies = list.map((c) => ({ name: c.name, path: c.path || '/' }))
      } catch {
        /* ignore */
      }
      if (cookies.length === 0) {
        return {
          title: `当前域名 "${domain}" 下没有 Cookie 可清除`,
          description: '',
          items: [],
        }
      }
      return {
        title: `将清除 "${domain}" 下的 ${cookies.length} 个 Cookie`,
        description: '此操作不可撤销，可能导致需要重新登录（可勾选要清除的 Cookie）',
        items: cookies.map((c, index) => ({
          primary: c.name,
          secondary: `path: ${c.path}`,
          tabId: index,
          selected: true,
          // 扩展字段：用 cookie 名作为标识
          bookmarkIds: [c.name],
        })),
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
