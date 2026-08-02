/**
 * 命令相关类型定义
 */

// ──── 命令槽位类型 ────

export interface CommandSlot {
  type: string
  optional?: boolean
  description?: string
}

// ──── 命令定义类型 ────

export interface Command {
  intent: string
  description: string
  dangerous: boolean
  slots: Record<string, CommandSlot>
  swIntent: string | null
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
