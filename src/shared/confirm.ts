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
 * @returns preview 对象或 null（无需确认）
 */
export function generateConfirmPreview(
  intent: string,
  slots: Record<string, unknown>,
  context: Context | null
): ConfirmPreview | null {
  if (!context?.tabs) return null

  switch (intent) {
    case 'close_duplicate_tabs': {
      const duplicateGroups = findDuplicateGroups(context.tabs, slots.url as string | undefined)
      const totalToRemove = duplicateGroups.reduce((sum, g) => sum + g.tabs.length - 1, 0)
      if (totalToRemove === 0) return null

      return {
        title: `将关闭 ${totalToRemove} 个重复标签页`,
        description: `检测到 ${duplicateGroups.length} 组重复 URL`,
        items: duplicateGroups.map((g) => ({
          primary: g.url,
          secondary: `${g.tabs.length} 个标签页 → 保留 1 个`,
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
      // Context 里没存书签详情，只有 bookmarkFolders 路径数组。
      // 这里在 SW 端没有 bookmarks_observe_tree 之类的回查接口可用，
      // 所以预览只能展示提示文本 + 用户提供的关键词，真正的勾选删除能力在 SW 端做。
      return {
        title: `将删除匹配 "${query}" 的书签`,
        description: '此操作不可撤销',
        items: [],
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
      const domain = slots.domain
      if (!domain) return null
      return {
        title: `将清除域名 "${domain}" 下的所有 Cookie`,
        description: '此操作不可撤销，可能导致需要重新登录',
        items: [],
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
