/**
 * Content Script 消息类型定义
 */

export type ContentScriptMessage =
  | { type: 'SNAPSHOT'; timestamp: number }
  | { type: 'CLICK'; ref: string; timestamp: number }
  | { type: 'TYPE'; ref: string; text: string; submit?: boolean; timestamp: number }
  | { type: 'SELECT'; ref: string; value: string; timestamp: number }
  | { type: 'HOVER'; ref: string; timestamp: number }
  | { type: 'PRESS_KEY'; key: string; timestamp: number }
  | { type: 'NAVIGATE'; url: string; timestamp: number }
  | { type: 'SCREENSHOT'; path?: string; timestamp: number }
  | { type: 'CHECK'; ref: string; timestamp: number }
  | { type: 'UNCHECK'; ref: string; timestamp: number }
  | { type: 'FILL_FORM'; fields: Array<{ ref: string; value: string }>; timestamp: number }
  | { type: 'WAIT_FOR'; text?: string; ref?: string; timeout?: number; timestamp: number }
  | { type: 'NAVIGATE_BACK'; timestamp: number }
  | { type: 'NAVIGATE_FORWARD'; timestamp: number }
  | { type: 'RELOAD'; timestamp: number }

export type ContentScriptResponse =
  | { success: true; data?: unknown; timestamp: number }
  | {
      success: false
      error: string
      message?: string
      suggestion?: string
      timestamp: number
    }
