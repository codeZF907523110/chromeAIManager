/**
 * 上下文预计算 — 把 query/url 等参数解析为 tabIds 等 SW 直接可用的字段
 *
 * 模块级单例 contextCache（取代 useAIEngine 内部 ref）：
 *   - dispatchToSW 入口强制刷新
 *   - precompute 函数读取最新值
 *
 * 这部分逻辑从旧 useAIEngine.ts:1093-1210 完整迁移，
 * 保持 requiresPrecompute 命令（close_duplicate_tabs / close_tabs_by_url / sort_tabs /
 * pin_tab / duplicate_tab / ungroup_all / remove_bookmark / enable_extension / ...）
 * 走"前端解析 → SW dispatch"路径。
 */

import { ref } from 'vue'
import type { Context } from '../types'
import { MSG_GET_CONTEXT, MSG_GET_BOOKMARKS } from '../shared/constants'

/** 模块级单例 — 跨 useAIEngine 与 usePlanRunner 共享 */
export const contextCache = ref<Context | null>(null)

/**
 * 强制刷新 contextCache（避免 30s TTL 与用户实际操作之间的一致性问题）。
 * 返回最新值。
 */
export async function refreshContext(): Promise<Context> {
  const next = (await chrome.runtime.sendMessage({
    type: MSG_GET_CONTEXT,
    options: { mode: 'detailed' },
  })) as Context
  contextCache.value = next
  return next
}

/**
 * 前端预计算：根据当前标签状态把 slots 转换为 SW 可直接消费的参数
 *
 * 返回的对象会通过 spread 合并到 slots（同名 key 覆盖），保留 force 等控制字段。
 * 任何查询 / API 失败都返回原 slots，让 SW 端兜底处理。
 *
 * @param intent userIntent（commands.ts 中的 intent 名，非 swIntent）
 * @param slots  来自斜杠命令或嵌入组件按钮的入参
 */
export async function precompute(
  intent: string,
  slots: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { tabs = [] } = contextCache.value ?? {}
  const activeTab = tabs.find((t) => t.active)
  const currentWindowId = activeTab?.windowId
  const currentWindowTabs = tabs
    .filter((tab) => currentWindowId === undefined || tab.windowId === currentWindowId)
    .filter((tab) => tab.id !== undefined)
  const matchesQuery = (tab: (typeof tabs)[number], query: string): boolean => {
    const q = query.toLowerCase().trim()
    return (tab.title || '').toLowerCase().includes(q) || (tab.url || '').toLowerCase().includes(q)
  }
  const matchesDomain = (tab: (typeof tabs)[number], domain: string): boolean => {
    try {
      const hostname = new URL(tab.url || '').hostname.toLowerCase().replace(/^www\./, '')
      const target = domain
        .toLowerCase()
        .trim()
        .replace(/^www\./, '')
      return hostname === target || hostname.endsWith(`.${target}`)
    } catch {
      return false
    }
  }

  switch (intent) {
    case 'find_tab': {
      const query = typeof slots.query === 'string' ? slots.query : ''
      const target = currentWindowTabs.find((tab) => matchesQuery(tab, query))
      return target?.id === undefined ? {} : { tabId: target.id, active: true }
    }

    case 'screenshot': {
      const query = typeof slots.query === 'string' ? slots.query : ''
      const target = query ? currentWindowTabs.find((tab) => matchesQuery(tab, query)) : activeTab
      return target?.id === undefined ? {} : { tabId: target.id }
    }

    case 'reload_tab': {
      if (slots.all === true) {
        return {
          tabIds: currentWindowTabs.filter((tab) => !tab.pinned).map((tab) => tab.id),
          reload: true,
        }
      }
      return activeTab?.id === undefined ? {} : { tabId: activeTab.id, reload: true }
    }

    case 'move_tab': {
      const requested = Number(slots.index)
      if (!Number.isInteger(requested) || requested < 1) return {}
      const sourceId = slots.fromTabId !== undefined ? Number(slots.fromTabId) : activeTab?.id
      if (sourceId === undefined || !Number.isInteger(sourceId)) return {}
      const maxIndex = Math.max(0, currentWindowTabs.length - 1)
      return { tabIds: [sourceId], index: Math.min(requested - 1, maxIndex) }
    }

    case 'close_tabs_by_domain':
    case 'mute_tabs_by_domain':
    case 'unmute_tabs_by_domain': {
      const domain = typeof slots.domain === 'string' ? slots.domain : ''
      const tabIds = currentWindowTabs
        .filter((tab) => matchesDomain(tab, domain))
        .map((tab) => tab.id)
      if (intent === 'mute_tabs_by_domain') return { tabIds, muted: true }
      if (intent === 'unmute_tabs_by_domain') return { tabIds, muted: false }
      return { tabIds }
    }

    case 'discard_tabs': {
      const candidates = slots.domain
        ? currentWindowTabs.filter((tab) => matchesDomain(tab, String(slots.domain)))
        : currentWindowTabs
      const filtered = candidates.filter((tab) => !tab.pinned && !tab.active)
      return { tabIds: filtered.map((tab) => tab.id), discarded: true }
    }

    case 'group_tabs': {
      const pattern = slots.pattern?.toString().toLowerCase()
      const filtered = pattern
        ? currentWindowTabs.filter(
            (tab) => matchesQuery(tab, pattern) || matchesDomain(tab, pattern)
          )
        : currentWindowTabs
      return {
        tabIds: filtered.map((tab) => tab.id),
        title: slots.groupName as string,
        color: slots.color as string,
      }
    }

    case 'close_duplicate_tabs': {
      const seen = new Map<string, number>()
      const dupIds: number[] = []
      for (const t of tabs) {
        const url = (t.url || '').replace(/\/$/, '')
        if (slots.url && !url.includes(slots.url as string)) continue
        if (seen.has(url)) dupIds.push(t.id)
        else seen.set(url, t.id)
      }
      return { tabIds: dupIds }
    }

    // close_tabs_by_url：precompute 这里不做任何事；SW 端按 query/domain/url 模糊匹配
    case 'close_tabs_by_url':
      return slots

    // ungroup_all：按 groupId 分桶，把用户勾选的分组带过去
    case 'ungroup_all': {
      const selectedGroupIds = Array.isArray(slots.selectedGroupIds)
        ? (slots.selectedGroupIds as unknown[])
            .map((g) => Number(g))
            .filter((g) => Number.isFinite(g))
        : null
      const groupMap = new Map<number, number[]>()
      for (const t of tabs) {
        if (t.id === undefined) continue
        if (t.groupId === undefined || t.groupId === -1) continue
        if (selectedGroupIds && !selectedGroupIds.includes(t.groupId)) continue
        if (!groupMap.has(t.groupId)) groupMap.set(t.groupId, [])
        groupMap.get(t.groupId)!.push(t.id)
      }
      const result: Record<string, unknown> = { tabIds: [] }
      for (const [, ids] of groupMap) {
        ;(result.tabIds as number[]).push(...ids)
      }
      return result
    }

    case 'duplicate_tab': {
      if (!activeTab) return {}
      return {
        url: activeTab.url,
        active: true,
        index: (activeTab.index || 0) + 1,
      }
    }

    case 'sort_tabs': {
      const order = (slots.order as string) || 'domain'
      const sorted = [...tabs].sort((a, b) => {
        if (order === 'title') return (a.title || '').localeCompare(b.title || '')
        const dA = a.url ? new URL(a.url).hostname : ''
        const dB = b.url ? new URL(b.url).hostname : ''
        return dA.localeCompare(dB) || (a.index || 0) - (b.index || 0)
      })
      return { tabIds: sorted.map((t) => t.id), index: 0 }
    }

    case 'pin_tab': {
      if (!activeTab) return {}
      // 实时拉取当前 active tab，避免缓存中 pinned 状态过期导致 toggle 错位
      let isPinned = activeTab.pinned
      try {
        const liveTab = await chrome.tabs.get(activeTab.id!)
        isPinned = !!liveTab.pinned
      } catch {
        // tab 已不存在就用缓存值
      }
      return { tabId: activeTab.id, pinned: !isPinned }
    }

    case 'remove_bookmark': {
      if (!slots.query) return {}
      try {
        const results = (await chrome.runtime.sendMessage({
          type: MSG_GET_BOOKMARKS,
          options: { query: slots.query as string },
        })) as unknown[]
        const node = results?.[0] as { id: string } | undefined
        if (!node) return {}
        return { nodeId: node.id }
      } catch {
        return {}
      }
    }

    case 'enable_extension':
    case 'disable_extension':
    case 'uninstall_extension': {
      if (!slots.query) return {}
      try {
        const exts = await chrome.management.getAll()
        const q = (slots.query as string).toLowerCase()
        const match = exts.find((e) => e.id === slots.query || e.name.toLowerCase().includes(q))
        if (!match) return {}
        if (intent === 'enable_extension') return { id: match.id, enabled: true }
        if (intent === 'disable_extension') return { id: match.id, enabled: false }
        return { id: match.id }
      } catch {
        return {}
      }
    }

    default:
      return slots
  }
}
