/**
 * Chrome API 相关类型定义
 */

// ──── Tab 类型 ────

export interface TabInfo {
  id: number
  title: string
  url: string
  windowId: number
  active: boolean
  groupId: number
  index: number
  muted: boolean
  pinned?: boolean
}

export interface ActiveTab {
  id: number
  title: string
  url: string
}

// ──── 书签类型 ────

export interface BookmarkNode {
  id: string
  title: string
  url?: string
  dateAdded?: number
  dateGroupCreated?: number
  parentId?: string
  index?: number
  children?: BookmarkNode[]
}

// ──── 窗口类型 ────

export interface WindowInfo {
  id: number
  type: 'normal' | 'popup' | 'app' | 'devtools'
  focused: boolean
  top?: number
  left?: number
  width?: number
  height?: number
  tabs?: TabInfo[]
  incognito: boolean
  alwaysOnTop: boolean
  state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen'
}
