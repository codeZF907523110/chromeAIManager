/**
 * Gemini Nano 适配器 — Chrome 内置 AI（离线推理）
 * 根据探测到的 API 形态选择正确的调用方式
 */
import { AI_CAPABILITIES } from './api-detector.js';

export class GeminiNanoAdapter {
  constructor(capabilityType) {
    this.capabilityType = capabilityType;
    this.session = null;
  }

  async chat(systemPrompt, userMessage, options = {}) {
    if (!this.session) {
      this.session = await this._createSession(systemPrompt, options);
    }
    try {
      return await this.session.prompt(userMessage);
    } catch {
      // session 可能过期，重建
      this.destroy();
      this.session = await this._createSession(systemPrompt, options);
      return await this.session.prompt(userMessage);
    }
  }

  async _createSession(systemPrompt, options) {
    const opts = { systemPrompt, temperature: options.temperature ?? 0.1, topK: options.topK ?? 1 };
    switch (this.capabilityType) {
      case AI_CAPABILITIES.WINDOW_AI_LM:
        return window.ai.languageModel.create(opts);
      case AI_CAPABILITIES.WINDOW_AI_ASSISTANT:
        return window.ai.assistant.create(opts);
      case AI_CAPABILITIES.ORIGIN_TRIAL:
        return chrome.aiOriginTrial.languageModel.create(opts);
      default:
        throw new Error('Unsupported AI capability');
    }
  }

  destroy() {
    if (this.session) { try { this.session.destroy(); } catch (_) {} this.session = null; }
  }
}
