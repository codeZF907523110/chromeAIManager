/**
 * 上下文相关类型定义
 */

// ──── 页面结构类型 ────

export interface PageElement {
  text?: string
  attrs?: Record<string, string | null>
  tag: string
}

export interface Iframe {
  src: string
  id?: string
  name?: string
}

export interface PageStructure {
  totalCount?: number
  count?: number
  title?: string
  url?: string
  truncated?: boolean
  elements?: PageElement[]
  iframes?: Iframe[]
}

// ──── 历史记录类型 ────

export interface Lesson {
  domain: string
  userInput: string
  intent: string
  error: string
  timestamp: number
}

// ──── 计划追踪类型 ────

export interface PlanStep {
  step: number
  thought: string
  intent: string
  result: string
  status: 'ok' | 'failed'
}

export interface PlanTracker {
  goal: string
  currentPlan: string
  steps: PlanStep[]
}

// ──── 会话类型 ────

export interface SessionData {
  planTracker?: PlanTracker
  lessons?: Lesson[]
  timestamp: number
}

// ──── 上下文类型 ────

export interface Context {
  mode: 'detailed'
  tabCount: number
  totalTabCount: number
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
  _truncated: boolean
  timestamp: number
  pageStructure?: PageStructure | null
  recentLessons?: Lesson[]
}
