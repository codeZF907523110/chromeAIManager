/**
 * AI 能力检测 — Chrome 内置 AI（Gemini Nano）
 *
 * 兼容两代官方 API 形态（方法签名一致，只是挂载位置与状态词不同）：
 * - 标准全局 `LanguageModel`（Chrome 138+ stable，扩展页面/侧边栏可用，无需权限）
 *     availability(): 'available' | 'downloadable' | 'downloading' | 'unavailable'
 * - 扩展命名空间 `chrome.languageModel`（131-137 预览版形态）
 *     capabilities(): { available: 'readily' | 'after-download' | 'no' }
 *
 * 两种形态都探测，任一返回"模型已就绪"即判定可用；探测不到任何 API（如 Chrome < 138）
 * 返回 no-api 状态，由调用方引导用户添加云端模型。
 */

export const AI_CAPABILITIES = {
  NONE: 'none',
  LANGUAGE_MODEL: 'languageModel',
} as const

export type AICapabilityType = (typeof AI_CAPABILITIES)[keyof typeof AI_CAPABILITIES]

export interface AISession {
  prompt: (input: string) => Promise<string>
  destroy: () => void
}

/**
 * LanguageModel API 公共形态（标准全局与 chrome.languageModel 命名空间一致）。
 * availability/capabilities 二者必有其一（依浏览器版本而异），create 恒存在。
 */
export interface LanguageModelApi {
  availability?(): Promise<string>
  capabilities?(): Promise<{ available: string }>
  create(options?: {
    /** 会话级提示词；第一条应为 system 角色 */
    initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    temperature?: number
    topK?: number
  }): Promise<AISession>
}

/**
 * 获取当前环境可用的 LanguageModel API 实例。
 * 优先标准全局 `LanguageModel`（Chrome 138+），兜底 `chrome.languageModel`（预览版形态）。
 *
 * @returns API 实例；两者都不存在（Chrome < 138）时返回 undefined
 */
export function getLanguageModelApi(): LanguageModelApi | undefined {
  const std = (globalThis as Record<string, unknown>).LanguageModel as LanguageModelApi | undefined
  if (std?.create) return std
  const ext =
    typeof chrome !== 'undefined'
      ? ((chrome as unknown as Record<string, unknown>).languageModel as
          LanguageModelApi | undefined)
      : undefined
  if (ext?.create) return ext
  return undefined
}

/** 探测结果：capability 判定可用性；rawStatus 保留原始状态值供报错文案/日志定位 */
export interface AIDetectResult {
  capability: AICapabilityType
  /** 原始状态值：available/readily=就绪；downloadable/downloading/after-download=未下载；unavailable/no=不支持；no-api=浏览器无此 API */
  rawStatus: string
}

/**
 * 检测当前浏览器内置 AI 是否就绪。
 * 模型未下载（downloadable/after-download）按不可用处理并记日志，
 * 由调用方引导用户配置云端模型。
 */
export async function detectAICapability(): Promise<AIDetectResult> {
  const lm = getLanguageModelApi()
  if (!lm) return { capability: AI_CAPABILITIES.NONE, rawStatus: 'no-api' }

  // 标准形态：availability() → available/downloadable/downloading/unavailable
  if (typeof lm.availability === 'function') {
    try {
      const status = await lm.availability()
      if (status === 'available') {
        return { capability: AI_CAPABILITIES.LANGUAGE_MODEL, rawStatus: status }
      }
      if (status === 'downloadable' || status === 'downloading') {
        console.log('[AI管家] Gemini Nano 模型未就绪，状态:', status)
        return { capability: AI_CAPABILITIES.NONE, rawStatus: status }
      }
    } catch {
      // availability 抛错时继续尝试旧形态
    }
  }

  // 旧形态兜底：capabilities() → readily/after-download/no（131-137 预览版）
  if (typeof lm.capabilities === 'function') {
    try {
      const caps = await lm.capabilities()
      const status = caps?.available || 'unknown'
      if (status === 'readily') {
        return { capability: AI_CAPABILITIES.LANGUAGE_MODEL, rawStatus: status }
      }
      if (status === 'after-download') {
        console.log('[AI管家] Gemini Nano 模型未下载（~2GB），内置 AI 暂不可用')
        return { capability: AI_CAPABILITIES.NONE, rawStatus: status }
      }
    } catch {
      // 继续走最底部兜底
    }
  }

  return { capability: AI_CAPABILITIES.NONE, rawStatus: 'unavailable' }
}
