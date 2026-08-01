/**
 * window.ai API 探测器
 * 动态探测当前 Chrome 支持的内置 AI 形态：
 * - window.ai.languageModel (Chrome 127-130)
 * - window.ai.assistant (Chrome 131+)
 * - chrome.aiOriginTrial.languageModel (Origin Trial)
 */
export const AI_CAPABILITIES = {
  NONE: 'none',
  WINDOW_AI_LM: 'window.ai.languageModel',
  WINDOW_AI_ASSISTANT: 'window.ai.assistant',
  ORIGIN_TRIAL: 'originTrial'
};

export async function detectAICapability() {
  // 检测 1: window.ai.languageModel
  if (typeof window !== 'undefined' && window.ai?.languageModel) {
    try {
      const caps = await window.ai.languageModel.capabilities();
      if (caps?.available === 'readily') return AI_CAPABILITIES.WINDOW_AI_LM;
      if (caps?.available === 'after-download') console.log('[AI管家] Gemini Nano 需下载（~2GB）');
    } catch (_) {}
  }

  // 检测 2: window.ai.assistant（未来形态）
  if (typeof window !== 'undefined' && window.ai?.assistant) {
    try {
      const caps = await window.ai.assistant.capabilities();
      if (caps?.available === 'readily') return AI_CAPABILITIES.WINDOW_AI_ASSISTANT;
    } catch (_) {}
  }

  // 检测 3: chrome.aiOriginTrial
  if (typeof chrome !== 'undefined' && chrome.aiOriginTrial?.languageModel) {
    try {
      const caps = await chrome.aiOriginTrial.languageModel.capabilities();
      if (caps?.available === 'readily') return AI_CAPABILITIES.ORIGIN_TRIAL;
    } catch (_) {}
  }

  return AI_CAPABILITIES.NONE;
}
