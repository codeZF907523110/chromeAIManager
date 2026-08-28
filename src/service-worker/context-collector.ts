/**
 * 上下文收集器 — 收集浏览器当前状态
 */

import type { TabInfo, BookmarkNode } from '../types'

export async function collectContext(
  options: { mode?: string; query?: string } = {}
): Promise<Record<string, unknown>> {
  const { mode = 'detailed' } = options

  const [tabsResult, bookmarksResult, windowResult, groupsResult] = await Promise.allSettled([
    chrome.tabs.query({}),
    chrome.bookmarks.getTree(),
    chrome.windows.getCurrent({ populate: true }),
    chrome.tabGroups.query({}),
  ])
  const allTabs = tabsResult.status === 'fulfilled' ? tabsResult.value : []
  const bookmarks = bookmarksResult.status === 'fulfilled' ? bookmarksResult.value : []
  const currentWindow = windowResult.status === 'fulfilled' ? windowResult.value : null
  const groups = groupsResult.status === 'fulfilled' ? groupsResult.value : []

  const activeTab = currentWindow?.tabs?.find((t: TabInfo) => t.active) || null

  if (mode === 'summary') {
    return buildSummary(allTabs, activeTab, bookmarks, groups)
  }

  return buildDetailed(allTabs, activeTab, bookmarks, groups)
}

// ──── 摘要模式 ────

function buildSummary(
  tabs: TabInfo[],
  activeTab: TabInfo | null,
  bookmarks: BookmarkNode[],
  groups: Array<{
    id: number
    title?: string
    color?: string
    collapsed?: boolean
    windowId?: number
  }>
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
    bookmarkFolders: extractFolders(bookmarks),
    timestamp: Date.now(),
  }
}

// ──── 详情模式 ────

function buildDetailed(
  tabs: TabInfo[],
  activeTab: TabInfo | null,
  bookmarks: BookmarkNode[],
  groups: Array<{
    id: number
    title?: string
    color?: string
    collapsed?: boolean
    windowId?: number
  }>
): Record<string, unknown> {
  const tabsInfo = tabs.map(formatTab)
  return {
    mode: 'detailed',
    tabCount: tabsInfo.length,
    activeTab: activeTab ? { id: activeTab.id, title: activeTab.title, url: activeTab.url } : null,
    tabs: tabsInfo,
    groups,
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

function extractFolders(tree: BookmarkNode[]): string[] {
  const folders: string[] = []
  function walk(nodes: BookmarkNode[], path: string) {
    for (const node of nodes) {
      if (node.children) {
        const fullPath = path ? `${path}/${node.title}` : node.title || ''
        folders.push(fullPath)
        walk(node.children ?? [], fullPath)
      }
    }
  }
  walk(tree, '')
  return folders
}
