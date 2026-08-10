/**
 * 命令相关类型定义
 */

// ──── 命令槽位类型 ────

export interface CommandSlot {
  type: string
  optional?: boolean
  description?: string
}

/**
 * 客户端命令路由：标识某个 intent 由 sidepanel 端本地处理（不发到 SW）。
 * null 表示该命令不发到客户端。
 */
export type ClientIntent = 'record_screen' | 'stop_recording' | null

// ──── 命令定义类型 ────

export interface Command {
  intent: string
  description: string
  dangerous: boolean
  slots: Record<string, CommandSlot>
  /**
   * SW 路由：非 null 时表示该命令由 service-worker 处理。
   * 与 clientIntent 必须有一个为非 null；都为 null = 不可执行。
   */
  swIntent: string | null
  /**
   * 客户端路由：非 null 时表示该命令由 sidepanel 本地处理（录制等）。
   * 由 useAIEngine.executeCommand 通过 clientIntent 分支处理。
   * 可选字段，未声明则默认为 null。
   */
  clientIntent?: ClientIntent
  aiHidden?: boolean
  requiresPrecompute?: boolean
}

// ──── 斜杠命令类型 ────

export interface SlashCommand {
  slash: string
  intent: string
  description: string
  aliases?: string[]
  hasArg?: boolean
  placeholder?: string
}

export interface SlashCommandMatch {
  intent: string
  slots: Record<string, unknown>
  cmd: SlashCommand
}
