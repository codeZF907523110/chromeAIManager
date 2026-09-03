/**
 * 上下文预计算 — 把 query/url 等参数解析为 tabIds 等 SW 直接可用的字段
 *
 * 模块级单例 contextCache（取代 useAIEngine 内部 ref）：
 *   - useSlashCommandRunner.sendToSW / dispatchToSW 入口强制刷新
 *   - precompute 函数读取最新值
 *
 * 这部分逻辑从旧 useAIEngine.ts 完整迁移，
 * 保持 requiresPrecompute 命令（close_duplicate_tabs / close_tabs_by_url / sort_tabs /
 * pin_tab / duplicate_tab / ungroup_all / remove_bookmark / enable_extension / ...）
 * 走"前端解析 → SW dispatch"路径。
 */

import { ref } from 'vue'
import type { Context } from '../types'
import { MSG_GET_CONTEXT } from '../shared/constants'

/** 模块级单例 — 跨 useAIEngine 与 usePlanRunner 共享 */
export const contextCache = ref<Context | null>(null)

/** 暴露给 intent-rules.ts 等纯函数模块复用，避免重写。
 *  签名必须与 usePrecompute 内部 matchesQuery/matchesDomain 完全一致；
 *  内部函数因闭包捕获 tabs 不可直接 export，故在此处再写一份纯函数版本。
 */
export function matchesQueryUtil(
  tab: { title?: string; url?: string },
  query: string
): boolean {
  const q = query.toLowerCase().trim()
  return (
    (tab.title || '').toLowerCase().includes(q) ||
    (tab.url || '').toLowerCase().includes(q)
  )
}

export function matchesDomainUtil(
  tab: { url?: string },
  domain: string
): boolean {
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

/**
 * 强制刷新 contextCache（避免 30s TTL 与用户实际操作之间的一致性问题）。
 * 返回最新值。
 */
export async function refreshContext(): Promise<Context> {
  console.log('[usePrecompute] refreshContext -> SW MSG_GET_CONTEXT mode=detailed')
  const next = (await chrome.runtime.sendMessage({
    type: MSG_GET_CONTEXT,
    options: { mode: 'detailed' },
  })) as Context
  contextCache.value = next
  console.log(
    `[usePrecompute] refreshContext OK tabs=${next?.tabs?.length ?? 0}`,
    `firstTabs=${(next?.tabs ?? []).slice(0, 3).map((t) => `${t.id}:${(t.url || '').slice(0, 50)}`).join(',')}`
  )
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
  console.log(
    `[usePrecompute] enter intent=${intent} slots=${JSON.stringify(slots)}`,
    `contextTabs=${contextCache.value?.tabs?.length ?? 0}`
  )
  const { tabs = [] } = contextCache.value ?? {}
  const activeTab = tabs.find((t) => t.active)
  const currentWindowId = activeTab?.windowId
  const currentWindowTabs = tabs
    .filter((tab) => currentWindowId === undefined || tab.windowId === currentWindowId)
    .filter((tab) => tab.id !== undefined)
  console.log(
    `[usePrecompute] activeTab=${activeTab?.id} currentWindowId=${currentWindowId} currentWindowTabs=${currentWindowTabs.length}`
  )
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
      const out = target?.id === undefined ? {} : { tabId: target.id, active: true }
      console.log(`[usePrecompute] result intent=find_tab query=${query} target=${target?.id}`, out)
      return out
    }

    case 'screenshot': {
      const query = typeof slots.query === 'string' ? slots.query : ''
      const target = query ? currentWindowTabs.find((tab) => matchesQuery(tab, query)) : activeTab
      const out = target?.id === undefined ? {} : { tabId: target.id }
      console.log(`[usePrecompute] result intent=screenshot query=${query} target=${target?.id}`, out)
      return out
    }

    case 'reload_tab': {
      const out =
        slots.all === true
          ? {
              tabIds: currentWindowTabs.filter((tab) => !tab.pinned).map((tab) => tab.id),
              reload: true,
            }
          : activeTab?.id === undefined
            ? {}
            : { tabId: activeTab.id, reload: true }
      console.log(`[usePrecompute] result intent=reload_tab all=${slots.all === true}`, out)
      return out
    }

    case 'move_tab': {
      const requested = Number(slots.index)
      if (!Number.isInteger(requested) || requested < 1) {
        console.warn(`[usePrecompute] move_tab invalid index=${slots.index}`)
        return {}
      }
      const sourceId = slots.fromTabId !== undefined ? Number(slots.fromTabId) : activeTab?.id
      if (sourceId === undefined || !Number.isInteger(sourceId)) {
        console.warn(
          `[usePrecompute] move_tab source missing fromTabId=${slots.fromTabId} activeTab=${activeTab?.id}`
        )
        return {}
      }
      const maxIndex = Math.max(0, currentWindowTabs.length - 1)
      const out = { tabIds: [sourceId], index: Math.min(requested - 1, maxIndex) }
      console.log(`[usePrecompute] result intent=move_tab`, out)
      return out
    }

    case 'close_tabs_by_domain':
    case 'mute_tabs_by_domain':
    case 'unmute_tabs_by_domain': {
      const domain = typeof slots.domain === 'string' ? slots.domain : ''
      const matches = currentWindowTabs.filter((tab) => matchesDomain(tab, domain))
      const tabIds = matches.map((tab) => tab.id)
      const out =
        intent === 'mute_tabs_by_domain'
          ? { tabIds, muted: true }
          : intent === 'unmute_tabs_by_domain'
            ? { tabIds, muted: false }
            : { tabIds }
      console.log(
        `[usePrecompute] domain match intent=${intent} domain=${domain} matches=${matches.length}`,
        `matchedIds=${JSON.stringify(tabIds)}`,
        `sample=${matches.slice(0, 5).map((t) => `${t.id}:${(t.url || '').slice(0, 80)}`).join(',')}`
      )
      return out
    }

    case 'discard_tabs': {
      const candidates = slots.domain
        ? currentWindowTabs.filter((tab) => matchesDomain(tab, String(slots.domain)))
        : currentWindowTabs
      const filtered = candidates.filter((tab) => !tab.pinned && !tab.active)
      const out = { tabIds: filtered.map((tab) => tab.id), discarded: true }
      console.log(
        `[usePrecompute] discard candidates=${candidates.length} filtered=${filtered.length}`,
        out
      )
      return out
    }

    case 'group_tabs': {
      const pattern = slots.pattern?.toString().toLowerCase()
      const filtered = pattern
        ? currentWindowTabs.filter(
            (tab) => matchesQuery(tab, pattern) || matchesDomain(tab, pattern)
          )
        : currentWindowTabs
      const out = {
        tabIds: filtered.map((tab) => tab.id),
        title: slots.groupName as string,
        color: slots.color as string,
      }
      console.log(`[usePrecompute] group_tabs pattern=${pattern} matched=${filtered.length}`, out)
      return out
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
      const out = { tabIds: dupIds }
      console.log(`[usePrecompute] close_duplicate_tabs duplicates=${dupIds.length}`, out)
      return out
    }

    case 'close_tabs_by_url':
      console.log('[usePrecompute] close_tabs_by_url passthrough', slots)
      return slots

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
      const out: Record<string, unknown> = { tabIds: [] }
      for (const [, ids] of groupMap) {
        ;(out.tabIds as number[]).push(...ids)
      }
      console.log(
        `[usePrecompute] ungroup_all selectedGroups=${JSON.stringify(selectedGroupIds)} groups=${groupMap.size}`,
        out
      )
      return out
    }

    case 'duplicate_tab': {
      if (!activeTab) {
        console.warn('[usePrecompute] duplicate_tab no active tab')
        return {}
      }
      const out = {
        url: activeTab.url,
        active: true,
        index: (activeTab.index || 0) + 1,
      }
      console.log(`[usePrecompute] duplicate_tab activeTab=${activeTab.id}`, out)
      return out
    }

    case 'sort_tabs': {
      const order = (slots.order as string) || 'domain'
      const sorted = [...tabs].sort((a, b) => {
        if (order === 'title') return (a.title || '').localeCompare(b.title || '')
        const dA = a.url ? new URL(a.url).hostname : ''
        const dB = b.url ? new URL(b.url).hostname : ''
        return dA.localeCompare(dB) || (a.index || 0) - (b.index || 0)
      })
      const out = { tabIds: sorted.map((t) => t.id), index: 0 }
      console.log(`[usePrecompute] sort_tabs order=${order} count=${sorted.length}`, out)
      return out
    }

    case 'pin_tab': {
      if (!activeTab) {
        console.warn('[usePrecompute] pin_tab no active tab')
        return {}
      }
      let isPinned = activeTab.pinned
      try {
        const liveTab = await chrome.tabs.get(activeTab.id!)
        isPinned = !!liveTab.pinned
        console.log(`[usePrecompute] pin_tab live state tab=${activeTab.id} pinned=${isPinned}`)
      } catch (e) {
        console.warn(`[usePrecompute] pin_tab live lookup failed tab=${activeTab.id}`, e)
      }
      const out = { tabId: activeTab.id, pinned: !isPinned }
      console.log('[usePrecompute] pin_tab result', out)
      return out
    }

    case 'remove_bookmark':
      console.log('[usePrecompute] remove_bookmark passthrough: SW performs search')
      return {}

    case 'enable_extension':
    case 'disable_extension':
    case 'uninstall_extension': {
      if (!slots.query) {
        console.warn(`[usePrecompute] ${intent} missing query`)
        return {}
      }
      try {
        const exts = await chrome.management.getAll()
        const q = (slots.query as string).toLowerCase()
        const match = exts.find((e) => e.id === slots.query || e.name.toLowerCase().includes(q))
        console.log(
          `[usePrecompute] ${intent} lookup query=${slots.query} matched=${match?.id ?? '<none>'}`
        )
        if (!match) return {}
        if (intent === 'enable_extension') return { id: match.id, enabled: true }
        if (intent === 'disable_extension') return { id: match.id, enabled: false }
        return { id: match.id }
      } catch (e) {
        console.warn(`[usePrecompute] ${intent} lookup failed`, e)
        return {}
      }
    }

    default:
      console.log(`[usePrecompute] passthrough intent=${intent}`)
      return slots
  }
}
