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

// ──── 确认卡数据类型（slash 与 plan 共用） ────

/**
 * 确认卡单个条目
 * - primary / secondary 是展示文本
 * - tabId 复用于"分组 ID / 书签 ID / history URL"等异构 ID；undefined 表示不可单独勾选
 * - selected 仅在需要"反向选择"（如"是否关闭以下标签"）时使用，默认 true
 * - tabIds 扩展字段：携带 tabIds 数组，用于 close_duplicate_tabs 等需要批量操作的场景
 * - label 扩展字段：checkbox 的显示文本，优先于 primary（用于 bookmark 等场景）
 */
export interface ConfirmCardItem {
  primary: string
  secondary: string
  tabId?: number
  selected?: boolean
  /** 扩展字段：携带 tabIds 数组 */
  tabIds?: number[]
  /** 扩展字段：携带书签 ID 数组 */
  bookmarkIds?: string[]
  /** 扩展字段：checkbox 的显示文本，优先于 primary */
  label?: string
}

/**
 * 确认卡数据扩展字段（ConfirmPreview 的额外字段透传到 ConfirmCardData）
 */
export interface ConfirmCardExtra {
  /** 扩展字段：全部待关闭的 tabIds */
  allTabIds?: number[]
}

/**
 * 通用确认卡数据
 * slash runner 与 plan runner 共用同一份协议，ConfirmCard.vue 直接消费。
 */
export interface ConfirmCardData extends ConfirmCardExtra {
  title: string
  description?: string
  items: ConfirmCardItem[]
  /**
   * 当用户通过 checkbox 选择不同条目后再确认时，回调会接收到最终选中的 tabIds。
   * 不传则表示"全选不可干预"，使用 items 中所有 tabId。
   */
  onConfirm?: (selectedTabIds: number[]) => Promise<void>
  onCancel?: () => void
}
