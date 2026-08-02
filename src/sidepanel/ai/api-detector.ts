/**
 * AI 能力检测
 * 声明 Chrome AI 全局类型
 */

// ──── Chrome AI API 全局类型声明 ────

declare global {
  interface Window {
    ai?: {
      languageModel?: {
        capabilities: () => Promise<{ available: 'readily' | 'after-download' | 'no' }>
        create: (_options?: {
          systemPrompt?: string
          temperature?: number
          topK?: number
        }) => Promise<AISession>
      }
      assistant?: {
        capabilities: () => Promise<{ available: 'readily' | 'after-download' | 'no' }>
        create: (_options?: {
          systemPrompt?: string
          temperature?: number
          topK?: number
        }) => Promise<AISession>
      }
    }
  }
}

export interface AISession {
  prompt: (_input: string) => Promise<string>
  destroy: () => void
}

export const AI_CAPABILITIES = {
  NONE: 'none',
  WINDOW_AI_LM: 'window.ai.languageModel',
  WINDOW_AI_ASSISTANT: 'window.ai.assistant',
  ORIGIN_TRIAL: 'originTrial',
} as const

export type AICapabilityType = (typeof AI_CAPABILITIES)[keyof typeof AI_CAPABILITIES]

/**
 * 检测当前 Chrome 支持的内置 AI 形态
 */
export async function detectAICapability(): Promise<AICapabilityType> {
  // 检测 1: window.ai.languageModel
  if (typeof window !== 'undefined' && window.ai?.languageModel) {
    try {
      const caps = await window.ai.languageModel.capabilities()
      if (caps?.available === 'readily') return AI_CAPABILITIES.WINDOW_AI_LM
      if (caps?.available === 'after-download') console.log('[AI管家] Gemini Nano 需下载（~2GB）')
    } catch {
      // ignore
    }
  }

  // 检测 2: window.ai.assistant（未来形态）
  if (typeof window !== 'undefined' && window.ai?.assistant) {
    try {
      const caps = await window.ai.assistant.capabilities()
      if (caps?.available === 'readily') return AI_CAPABILITIES.WINDOW_AI_ASSISTANT
    } catch {
      // ignore
    }
  }

  // 检测 3: chrome.aiOriginTrial（实验性 API）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiOriginTrial = (chrome as Record<string, any>).aiOriginTrial
  if (aiOriginTrial?.languageModel) {
    try {
      const caps = await aiOriginTrial.languageModel.capabilities()
      if (caps?.available === 'readily') return AI_CAPABILITIES.ORIGIN_TRIAL
    } catch {
      // ignore
    }
  }

  return AI_CAPABILITIES.NONE
}

/**
 * 获取 AI Origin Trial 的 languageModel
 */
export function getOriginTrialLM() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (chrome as Record<string, any>).aiOriginTrial?.languageModel
}
