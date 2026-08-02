/**
 * Tab 匹配工具函数
 */

import type { TabInfo } from '../../types'

interface DuplicateGroup {
  url: string
  tabs: TabInfo[]
}

/**
 * 标准化 URL（去除尾部斜杠、规范化协议等）
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/$/, '')
    return `${u.protocol}//${u.hostname}${path}${u.search}`
  } catch {
    return url
  }
}

/**
 * 查找重复标签组（URL 标准化后完全相同）
 */
export function findDuplicateGroups(tabs: TabInfo[], targetUrl?: string): DuplicateGroup[] {
  const urlMap = new Map<string, TabInfo[]>()

  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://')) continue
    const normalized = normalizeUrl(tab.url)
    if (targetUrl && normalized !== normalizeUrl(targetUrl)) continue

    if (!urlMap.has(normalized)) urlMap.set(normalized, [])
    urlMap.get(normalized)!.push(tab)
  }

  return Array.from(urlMap.entries())
    .filter(([, tabs]) => tabs.length > 1)
    .map(([url, tabs]) => ({ url, tabs }))
}

/**
 * 模糊搜索标签（多关键词 AND 匹配标题 + URL）
 */
export function searchTabs(tabs: TabInfo[], query: string): TabInfo[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  return tabs
    .filter((t) => {
      if (!t.url || t.url.startsWith('chrome://')) return false
      const title = (t.title || '').toLowerCase()
      const url = (t.url || '').toLowerCase()
      return terms.every((term) => title.includes(term) || url.includes(term))
    })
    .sort((a, b) => {
      const aTitle = terms.every((t) => (a.title || '').toLowerCase().includes(t))
      const bTitle = terms.every((t) => (b.title || '').toLowerCase().includes(t))
      if (aTitle && !bTitle) return -1
      if (!aTitle && bTitle) return 1
      if (a.active) return -1
      if (b.active) return 1
      return 0
    })
}
