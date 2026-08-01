<template>
  <div class="app">
    <!-- 标题栏 -->
    <header class="header">
      <span class="header-brand">
        <span class="header-icon">◆</span>
        <span class="header-title">AI 浏览器管家</span>
      </span>
      <div class="header-actions">
        <button class="header-btn" title="设置" @click="toggleSettings">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button
          class="header-btn mode-btn"
          :class="{ active: state.displayMode === 'sidepanel' }"
          title="侧边栏模式"
          @click="switchMode('sidepanel')"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </button>
        <button
          class="header-btn mode-btn"
          :class="{ active: state.displayMode === 'popup' }"
          title="弹窗模式"
          @click="switchMode('popup')"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="8.5 12 12 15.5 16.5 11"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- 消息展示区 -->
    <MessageList :messages="state.messageLog" />

    <!-- 设置面板 -->
    <div v-if="isSettingsOpen" class="settings-panel">
      <form @submit="saveSettingsHandler">
        <label>
          AI 提供者
          <select v-model="settings.aiProvider">
            <option value="auto">自动（优先本地）</option>
            <option value="gemini-nano">Gemini Nano（本地）</option>
            <option value="openai">OpenAI 兼容 API</option>
          </select>
        </label>
        <label>
          API Key
          <input type="password" v-model="settings.apiKey" placeholder="sk-..." />
        </label>
        <label>
          API 端点
          <input type="text" v-model="settings.apiEndpoint" placeholder="https://api.deepseek.com" />
        </label>
        <label>
          模型名称
          <input type="text" v-model="settings.modelName" placeholder="deepseek-chat" />
        </label>
        <button type="submit">保存设置</button>
      </form>
    </div>

    <!-- 命令输入区 -->
    <CommandInput
      v-model="commandInput"
      @submit="handleSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import MessageList from './components/MessageList.vue';
import CommandInput from './components/CommandInput.vue';
import { useAIEngine } from './composables/useAIEngine';

const {
  state,
  handleSubmit,
  toggleSettings,
  switchMode,
  loadSettings,
  saveSettings,
} = useAIEngine();

const isSettingsOpen = ref(false);
const commandInput = ref('');

interface Settings {
  aiProvider: string;
  apiKey: string;
  apiEndpoint: string;
  modelName: string;
}

const settings = ref<Settings>({
  aiProvider: 'auto',
  apiKey: '',
  apiEndpoint: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
});

async function saveSettingsHandler(e: Event) {
  e.preventDefault();
  await saveSettings(settings.value);
  isSettingsOpen.value = false;
}

onMounted(async () => {
  const saved = await loadSettings();
  settings.value = saved as Settings;

  // 恢复上次会话
  const raw = sessionStorage.getItem('ai_message_log');
  if (raw) {
    try {
      const logs = JSON.parse(raw);
      // 消息会在 MessageList 中自动渲染
    } catch {
      // ignore
    }
  }
});
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #fff;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fff;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.header-icon {
  color: #1976d2;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  color: #666;
}

.header-btn:hover {
  background: #f5f5f5;
}

.header-btn.active {
  color: #1976d2;
}

.settings-panel {
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}

.settings-panel form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-panel label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.settings-panel input,
.settings-panel select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.settings-panel button {
  padding: 10px 20px;
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.settings-panel button:hover {
  background: #1565c0;
}
</style>
