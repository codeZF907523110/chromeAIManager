/**
 * 上下文收集器 — 收集浏览器当前状态
 */

import type { TabInfo, BookmarkNode } from '../types'

/** 安全调用 Chrome API；namespace 缺失或调用失败时返回 fallback。 */
async function safeCall<T>(fallback: T, fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

function hasChromeApi(name: 'tabs' | 'bookmarks' | 'windows' | 'tabGroups'): boolean {
  return !!(globalThis as { chrome?: Record<string, unknown> }).chrome?.[name]
}

export async function collectContext(
  options: { mode?: string; query?: string } = {}
): Promise<Record<string, unknown>> {
  const { mode = 'detailed' } = options

  const [tabsResult, bookmarksResult, windowResult, groupsResult] = await Promise.allSettled([
    hasChromeApi('tabs') ? chrome.tabs.query({}) : Promise.resolve([]),
    hasChromeApi('bookmarks') ? chrome.bookmarks.getTree() : Promise.resolve([]),
    hasChromeApi('windows') ? chrome.windows.getCurrent({ populate: true }) : Promise.resolve(null),
    hasChromeApi('tabGroups') ? chrome.tabGroups.query({}) : Promise.resolve([]),
  ])
  const allTabs = tabsResult.status === 'fulfilled' ? tabsResult.value : []
  const bookmarks = bookmarksResult.status === 'fulfilled' ? bookmarksResult.value : []
  const currentWindow = windowResult.status === 'fulfilled' ? windowResult.value : null
  const groups = groupsResult.status === 'fulfilled' ? groupsResult.value : []

  const activeTab = currentWindow?.tabs?.find((t: TabInfo) => t.active) || null
  const activeTabInfo = activeTab ? formatTabSnapshot(activeTab) : null
  const prioritizedTabs = [...allTabs]
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || Number(b.groupId !== -1) - Number(a.groupId !== -1)
    )
    .slice(0, 200)
  const normalizedGroups = await Promise.all(
    groups.map(async (group) => {
      const tabs = await safeCall([] as TabInfo[], () => chrome.tabs.query({ groupId: group.id }))
      return { ...group, tabIds: tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])) }
    })
  )
  const windows = await safeCall(
    [] as Array<{ id?: number; focused?: boolean; state?: string }>,
    () => chrome.windows.getAll()
  )

  if (mode === 'summary') {
    const summary = buildSummary(
      prioritizedTabs,
      activeTabInfo,
      bookmarks,
      normalizedGroups,
      windows
    )
    return attachMeta(summary, hasChromeApi)
  }

  const detailed = buildDetailed(
    prioritizedTabs,
    activeTabInfo,
    bookmarks,
    normalizedGroups,
    windows
  )
  return attachMeta(detailed, hasChromeApi)
}

/** 收集上下文后追加 capabilities / unavailable 摘要，便于 UI 区分能力差异。 */
function attachMeta(
  base: Record<string, unknown>,
  hasChromeApi: (name: 'tabs' | 'bookmarks' | 'windows' | 'tabGroups') => boolean
): Record<string, unknown> {
  const unavailable: string[] = []
  if (!hasChromeApi('tabs')) unavailable.push('tabs')
  if (!hasChromeApi('bookmarks')) unavailable.push('bookmarks')
  if (!hasChromeApi('windows')) unavailable.push('windows')
  if (!hasChromeApi('tabGroups')) unavailable.push('tabGroups')
  return {
    ...base,
    meta: {
      capabilities: {
        tabs: hasChromeApi('tabs'),
        bookmarks: hasChromeApi('bookmarks'),
        windows: hasChromeApi('windows'),
        tabGroups: hasChromeApi('tabGroups'),
      },
      unavailable,
    },
  }
}

type TabSnapshot = {
  id: number
  title: string
  url: string
  hostname: string
  windowId: number
  groupId: number
  index: number
  active: boolean
  pinned: boolean
  muted: boolean
}

/** 格式化标签快照并提取安全 hostname。 */
function formatTabSnapshot(tab: TabInfo): TabSnapshot {
  return { ...formatTab(tab), pinned: tab.pinned ?? false, hostname: extractDomain(tab.url || '') }
}

function buildSummary(
  tabs: TabInfo[],
  activeTab: TabSnapshot | null,
  bookmarks: BookmarkNode[],
  groups: Array<{
    id: number
    title?: string
    color?: string
    collapsed?: boolean
    windowId?: number
    tabIds?: number[]
  }>,
  windows: Array<{ id?: number; focused?: boolean; state?: string }>
): Record<string, unknown> {
  const domainCounts = new Map<string, number>()
  const groupCounts = new Map<number, number>()

  for (const t of tabs) {
    if (!t.url || t.url.startsWith('chrome://')) continue
    const domain = extractDomain(t.url)
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1)
    if (t.groupId !== -1) {
      groupCounts.set(t.groupId, (groupCounts.get(t.groupId) || 0) + 1)
    }
  }

  return {
    mode: 'summary',
    tabCount: tabs.length,
    activeTab: activeTab ? { id: activeTab.id, title: activeTab.title, url: activeTab.url } : null,
    domainDistribution: Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([domain, count]) => ({ domain, count })),
    groupCount: groupCounts.size,
    groups,
    windows: windows.map((window) => ({
      id: window.id,
      focused: window.focused,
      state: window.state,
    })),
    bookmarkFolders: extractFolders(bookmarks),
    timestamp: Date.now(),
  }
}

// ──── 详情模式 ────

function buildDetailed(
  tabs: TabInfo[],
  activeTab: TabSnapshot | null,
  bookmarks: BookmarkNode[],
  groups: Array<{
    id: number
    title?: string
    color?: string
    collapsed?: boolean
    windowId?: number
    tabIds?: number[]
  }>,
  windows: Array<{ id?: number; focused?: boolean; state?: string }>
): Record<string, unknown> {
  const tabsInfo = tabs.map(formatTab)
  return {
    mode: 'detailed',
    tabCount: tabsInfo.length,
    activeTab: activeTab ? { id: activeTab.id, title: activeTab.title, url: activeTab.url } : null,
    tabs: tabsInfo,
    groups,
    windows: windows.map((window) => ({
      id: window.id,
      focused: window.focused,
      state: window.state,
    })),
    bookmarkFolders: extractFolders(bookmarks),
    timestamp: Date.now(),
  }
}

// ──── 辅助函数 ────

function formatTab(t: TabInfo): TabInfo {
  return {
    id: t.id,
    title: (t.title || '').slice(0, 100),
    url: t.url,
    windowId: t.windowId,
    active: t.active,
    pinned: t.pinned ?? false,
    groupId: t.groupId ?? -1,
    index: t.index,
    muted: t.muted,
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function extractFolders(tree: BookmarkNode[]): Array<{ id: string; title: string; path: string }> {
  const folders: Array<{ id: string; title: string; path: string }> = []
  function walk(nodes: BookmarkNode[], path: string) {
    for (const node of nodes) {
      if (node.children) {
        const title = node.title || ''
        const fullPath = path ? path + '/' + title : title
        folders.push({ id: node.id, title, path: fullPath })
        walk(node.children, fullPath)
      }
    }
  }
  walk(tree, '')
  return folders
}
