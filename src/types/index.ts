/**
 * AI 浏览器管家 — TypeScript 类型定义
 */

// ──── 消息类型 ────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MessageLog {
  type: 'user' | 'system' | 'ai' | 'ai-chat' | 'error';
  text: string;
}

// ──── AI 响应类型 ────

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface AIResponse {
  thought?: string;
  action: 'exec_tool' | 'done' | 'ask' | 'scan' | 'chat';
  plan?: string;
  predict?: string;
  toolCall?: ToolCall;
  reply?: string;
  content?: string;
}

// ──── 上下文类型 ────

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  windowId: number;
  active: boolean;
  groupId: number;
  index: number;
  muted: boolean;
  pinned?: boolean;
}

export interface ActiveTab {
  id: number;
  title: string;
  url: string;
}

export interface Context {
  mode: 'detailed';
  tabCount: number;
  totalTabCount: number;
  activeTab: ActiveTab | null;
  tabs: TabInfo[];
  bookmarkFolders: string[];
  _truncated: boolean;
  timestamp: number;
  pageStructure?: PageStructure | null;
  recentLessons?: Lesson[];
}

export interface PageStructure {
  totalCount?: number;
  count?: number;
  title?: string;
  url?: string;
  truncated?: boolean;
  elements?: PageElement[];
  iframes?: iframe[];
}

export interface PageElement {
  text?: string;
  attrs?: Record<string, string | null>;
  tag: string;
}

export interface iframe {
  src: string;
  id?: string;
  name?: string;
}

// ──── 执行结果类型 ────

export interface ExecutionResult {
  success?: boolean;
  code?: string;
  message?: string;
  error?: string;
  result?: unknown;
  detail?: Record<string, unknown>;
  [key: string]: unknown;
}

// ──── 历史记录类型 ────

export interface Lesson {
  domain: string;
  userInput: string;
  intent: string;
  error: string;
  timestamp: number;
}

export interface PlanTracker {
  goal: string;
  currentPlan: string;
  steps: PlanStep[];
}

export interface PlanStep {
  step: number;
  thought: string;
  intent: string;
  result: string;
  status: 'ok' | 'failed';
}

// ──── 会话类型 ────

export interface SessionData {
  planTracker?: PlanTracker;
  lessons?: Lesson[];
  timestamp: number;
}

// ──── 命令类型 ────

export interface CommandSlot {
  type: string;
  optional?: boolean;
  description?: string;
}

export interface Command {
  intent: string;
  description: string;
  dangerous: boolean;
  slots: Record<string, CommandSlot>;
  swIntent: string | null;
  aiHidden?: boolean;
  requiresPrecompute?: boolean;
}

// ──── AI 配置类型 ────

export interface AIConfig {
  aiProvider: 'auto' | 'gemini-nano' | 'openai';
  apiKey: string;
  apiEndpoint: string;
  modelName: string;
}

// ──── 显示模式类型 ────

export type DisplayMode = 'sidepanel' | 'popup';
