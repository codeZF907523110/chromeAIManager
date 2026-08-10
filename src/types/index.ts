/**
 * AI 浏览器管家 — TypeScript 类型统一导出
 */

// AI 相关类型
export type { ChatMessage, MessageLog } from './ai'
export type { AIResponse, ToolCall } from './ai'
export type { AIProvider, AIConfig, AIModel } from './ai'
export type { AIStatus, AIOptions } from './ai'
export type { AIAdapter } from './ai'

// Chrome API 相关类型
export type { TabInfo, ActiveTab, BookmarkNode, WindowInfo } from './chrome'

// 命令相关类型
export type { CommandSlot, Command } from './command'
export type { SlashCommand, SlashCommandMatch } from './command'

// 上下文相关类型
export type { PageElement, Iframe, PageStructure } from './context'
export type { Lesson, PlanStep, PlanTracker, SessionData, Context } from './context'

// 执行结果相关类型
export type { ExecutionResult, ExecuteCommandPayload } from './execution'

// UI 相关类型
export type { AgentState, Settings } from './ui'
