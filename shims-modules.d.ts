// Type declarations for JS modules
declare module '../shared/commands.js' {
  export const COMMANDS: any[];
  export const COMMAND_MAP: Record<string, any>;
}

declare module '../shared/constants.js' {
  export const MSG_GET_CONTEXT: string;
  export const MSG_GET_BOOKMARKS: string;
  export const MSG_EXECUTE: string;
  export const MSG_SET_DISPLAY_MODE: string;
  export const MAX_AGENT_STEPS: number;
  export const STEP_TIMEOUT_MS: number;
  export const TOTAL_TASK_TIMEOUT_MS: number;
  export const MAX_CONSECUTIVE_FAILURES: number;
  export const MAX_MESSAGES_COUNT: number;
}

declare module '../shared/prompts.js' {
  export function buildAgentSystemPrompt(context: any): string;
}

declare module '../shared/json-repair.js' {
  export function repairJSON(raw: string): any;
}

declare module '../sidepanel/command/slash-commands.js' {
  export function matchSlashCommand(text: string): any;
  export const SLASH_COMMANDS: any[];
}

declare module '../sidepanel/command/confirm.js' {
  export function generateConfirmPreview(intent: string, slots: any, context: any): any;
}

declare module '../sidepanel/ai/engine.js' {
  export class AIEngine {
    checkAvailability(): Promise<any>;
    chatWithHistory(messages: any[], options?: any): Promise<string>;
    reset(): void;
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
