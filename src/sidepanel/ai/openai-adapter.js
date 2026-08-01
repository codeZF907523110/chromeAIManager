/**
 * OpenAI 兼容 API 适配器
 * 支持 OpenAI / DeepSeek / Ollama / LM Studio / OpenRouter 等兼容 /v1/chat/completions 的服务
 */
export class OpenAIAdapter {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.model = config.model;
  }

  async chat(systemPrompt, userMessage, options = {}) {
    return this._call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ], options);
  }

  async chatWithMessages(messages, options = {}) {
    return this._call(messages, options);
  }

  async _call(messages, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 60000);

    try {
      await this._ensurePermission();

      const body = {
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? 4096
      };

      // 启用 JSON mode 确保输出纯 JSON（强制启用，兼容所有支持此功能的 API）
      body.response_format = { type: 'json_object' };

      const resp = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
      }

      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  async _ensurePermission() {
    const origin = new URL(this.endpoint).origin;
    const ok = await chrome.permissions.contains({ origins: [`${origin}/*`] });
    if (!ok) {
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!granted) throw new Error(`需要 ${origin} 的访问权限`);
    }
  }
}
