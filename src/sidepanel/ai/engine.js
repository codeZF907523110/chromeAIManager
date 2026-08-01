/**
 * AI 引擎 — 自动选择后端（Gemini Nano 优先，OpenAI 降级）
 */
import { detectAICapability, AI_CAPABILITIES } from './api-detector.js';
import { GeminiNanoAdapter } from './gemini-nano.js';
import { OpenAIAdapter } from './openai-adapter.js';

export class AIEngine {
  constructor() {
    this.backend = null;
    this._checked = null;
  }

  /** 检查可用性，返回 { available, backend, offline, reason? } */
  async checkAvailability() {
    if (this._checked) return this._checked;

    const config = await chrome.storage.local.get({
      aiProvider: 'auto', apiKey: '', apiEndpoint: 'https://api.deepseek.com', modelName: 'deepseek-chat'
    });

    const cap = await detectAICapability();

    if (cap !== AI_CAPABILITIES.NONE && (config.aiProvider === 'auto' || config.aiProvider === 'gemini-nano')) {
      this._checked = { available: true, backend: 'gemini-nano', offline: true };
    } else if (config.apiKey && (config.aiProvider === 'auto' || config.aiProvider === 'openai')) {
      this._checked = { available: true, backend: 'openai', offline: false };
    } else {
      this._checked = {
        available: false,
        reason: !config.apiKey
          ? '请配置 API Key（推荐 DeepSeek V3: https://platform.deepseek.com 申请 key，极便宜），或使用 OpenAI / Ollama'
          : 'AI 服务不可用，请检查配置'
      };
    }
    return this._checked;
  }

  async prompt(systemPrompt, userMessage, options = {}) {
    const backend = await this._getBackend();
    return backend.chat(systemPrompt, userMessage, options);
  }

  /** Agent Loop 专用：传入完整 messages 数组（含历史） */
  async chatWithHistory(messages, options = {}) {
    const backend = await this._getBackend();
    if (backend.chatWithMessages) {
      return backend.chatWithMessages(messages, options);
    }
    const last = messages[messages.length - 1];
    const system = messages.find(m => m.role === 'system')?.content || '';
    return backend.chat(system, last.content, options);
  }

  async _getBackend() {
    if (this.backend) return this.backend;
    const status = await this.checkAvailability();
    if (!status.available) throw new Error('NO_AI_BACKEND');

    if (status.backend === 'gemini-nano') {
      const cap = await detectAICapability();
      this.backend = new GeminiNanoAdapter(cap);
    } else {
      const config = await chrome.storage.local.get({
        aiProvider: 'auto', apiKey: '', apiEndpoint: 'https://api.deepseek.com', modelName: 'deepseek-chat'
      });
      this.backend = new OpenAIAdapter({ apiKey: config.apiKey, endpoint: config.apiEndpoint, model: config.modelName });
    }
    return this.backend;
  }

  reset() { this.backend = null; this._checked = null; }
}
