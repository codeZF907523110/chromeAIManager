/**
 * 上下文相关类型定义
 */

// ──── 上下文类型 ────

export interface Context {
  mode: 'detailed'
  tabCount: number
  activeTab: {
    id: number
    title: string
    url: string
  } | null
  tabs: {
    id: number
    title: string
    url: string
    windowId: number
    active: boolean
    groupId: number
    index: number
    muted: boolean
    pinned?: boolean
  }[]
  bookmarkFolders: string[]
  timestamp: number
}
