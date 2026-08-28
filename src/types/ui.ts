/**
 * UI 相关类型定义
 */

// ──── Agent 状态类型 ────

export interface AgentState {
  messageLog: import('./ai').MessageLog[]
  isSettingsOpen: boolean
  commandInputValue: string
}

// ──── 设置类型 ────

export interface Settings {
  aiProvider: string
  apiKey: string
  apiEndpoint: string
  modelName: string
}