<template>
  <div class="app">
    <!-- 粒子背景 -->
    <ParticleCanvas />

    <!-- 标题栏 -->
    <header class="header">
      <div class="header-brand">
        <span class="header-icon">◆</span>
        <span class="header-title">{{ t('app.brand') }}</span>
      </div>
      <div class="header-actions">
        <el-button
          text
          @click="toggleTheme"
          :title="themeMode === 'dark' ? t('app.toLight') : t('app.toDark')"
        >
          <Moon v-if="themeMode === 'dark'" :size="16" />
          <Sun v-else :size="16" />
        </el-button>
        <el-button text @click="toggleSettings">
          <Settings :size="16" />
        </el-button>
      </div>
    </header>

    <!-- 消息列表 -->
    <MessageList
      :messages="state.messageLog"
      :active-loop-id="state.activeLoopId"
      @delete="deleteMessage"
    />

    <!-- 确认卡片 -->
    <ConfirmCard
      v-if="pendingConfirm"
      :title="pendingConfirm.title"
      :description="pendingConfirm.description"
      :items="pendingConfirm.items"
      :on-confirm="pendingConfirm.onConfirm || (async () => {})"
      @cancel="pendingConfirm.onCancel"
    />

    <!-- 设置抽屉 -->
    <el-drawer
      v-model="state.isSettingsOpen"
      direction="btt"
      size="40%"
      :before-close="toggleSettings"
      class="settings-drawer"
    >
      <template #header>
        <div class="drawer-nav">
          <div v-if="settingsPage !== 'home'" class="back-btn" @click="settingsPage = 'home'">
            <ChevronLeft :size="14" />
            <span>{{ t('app.back') }}</span>
          </div>
          <span class="drawer-nav-title">
            {{
              settingsPage === 'home'
                ? t('app.settings')
                : settingsPage === 'models'
                  ? t('app.models')
                  : t('app.about')
            }}
          </span>
          <el-button
            v-if="settingsPage === 'models'"
            text
            @click="showAddDialog = true"
            class="add-btn"
          >
            <Plus :size="16" />
          </el-button>
        </div>
      </template>

      <!-- 首页 -->
      <div v-if="settingsPage === 'home'">
        <div class="settings-cell" @click="settingsPage = 'models'">
          <div class="cell-content">
            <span class="cell-title">{{ t('app.models') }}</span>
            <span class="cell-desc">{{ t('app.modelsDesc') }}</span>
          </div>
          <ChevronRight :size="16" class="cell-arrow" />
        </div>
        <div class="settings-cell" @click.stop>
          <div class="cell-content">
            <span class="cell-title">{{ t('settings.language') }}</span>
          </div>
          <el-select
            :model-value="locale"
            size="small"
            style="width: 130px"
            @change="handleLocaleChange"
          >
            <el-option v-for="l in LOCALES" :key="l.code" :value="l.code" :label="l.label" />
          </el-select>
        </div>
        <div class="settings-cell" @click="settingsPage = 'about'">
          <div class="cell-content">
            <span class="cell-title">{{ t('app.about') }}</span>
            <span class="cell-desc">{{ t('app.aboutDesc') }}</span>
          </div>
          <ChevronRight :size="16" class="cell-arrow" />
        </div>
      </div>

      <!-- 模型管理页 -->
      <div v-else-if="settingsPage === 'models'" class="model-list">
        <div v-for="model in models" :key="model.id" class="model-item">
          <div class="model-info">
            <div class="model-name-row">
              <span class="model-name">{{ model.name }}</span>
              <el-tag v-if="model.isDefault" size="small">{{ t('app.defaultTag') }}</el-tag>
            </div>
            <span class="model-provider">{{ getProviderLabel(model.provider) }}</span>
          </div>
          <div class="model-actions">
            <el-button
              v-if="!model.isDefault"
              size="small"
              text
              @click="handleSetDefault(model.id)"
            >
              {{ t('app.setDefault') }}
            </el-button>
            <el-button size="small" text @click="startEditModel(model)">
              {{ t('app.edit') }}
            </el-button>
            <el-button
              v-if="models.length > 1"
              size="small"
              text
              type="danger"
              @click="handleDeleteModel(model.id)"
            >
              {{ t('app.delete') }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- 关于页 -->
      <div v-else-if="settingsPage === 'about'" class="about-content">
        <h3>{{ t('app.brand') }}</h3>
        <p class="version">{{ t('app.version', { version: appVersion }) }}</p>
        <p class="desc">{{ t('app.appDesc') }}</p>
      </div>
    </el-drawer>

    <!-- 添加模型弹窗 -->
    <el-dialog
      v-model="showAddDialog"
      :title="t('app.addModel')"
      width="90%"
      style="max-width: 400px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('app.displayName')">
          <el-input v-model="newModel.name" :placeholder="t('app.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('app.provider')">
          <el-select
            v-model="newModel.provider"
            :placeholder="t('app.selectProvider')"
            style="width: 100%"
          >
            <el-option value="openai" :label="t('app.providerOpenai')" />
            <el-option value="gemini-nano" :label="t('app.providerNano')" />
            <el-option value="auto" :label="t('app.providerAuto')" />
          </el-select>
        </el-form-item>
        <template v-if="newModel.provider !== 'gemini-nano'">
          <el-form-item label="API Key">
            <el-input
              v-model="newModel.apiKey"
              type="password"
              placeholder="sk-..."
              show-password
            />
          </el-form-item>
          <el-form-item :label="t('app.apiEndpoint')">
            <el-input v-model="newModel.apiEndpoint" :placeholder="t('app.endpointPlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('app.modelId')">
            <el-input v-model="newModel.modelName" :placeholder="t('app.modelPlaceholder')" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">{{ t('app.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddModel">{{ t('app.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 编辑模型弹窗 -->
    <el-dialog
      v-model="editDialogVisible"
      :title="t('app.editModel')"
      width="90%"
      style="max-width: 400px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('app.displayName')">
          <el-input v-model="editingModel!.name" :placeholder="t('app.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('app.provider')">
          <el-select v-model="editingModel!.provider" style="width: 100%">
            <el-option value="openai" :label="t('app.providerOpenai')" />
            <el-option value="gemini-nano" :label="t('app.providerNano')" />
            <el-option value="auto" :label="t('app.providerAuto')" />
          </el-select>
        </el-form-item>
        <template v-if="editingModel && editingModel.provider !== 'gemini-nano'">
          <el-form-item label="API Key">
            <el-input v-model="editingModel!.apiKey" type="password" show-password />
          </el-form-item>
          <el-form-item :label="t('app.apiEndpoint')">
            <el-input v-model="editingModel!.apiEndpoint" />
          </el-form-item>
          <el-form-item :label="t('app.modelId')">
            <el-input v-model="editingModel!.modelName" :placeholder="t('app.modelPlaceholder')" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">{{ t('app.cancel') }}</el-button>
        <el-button type="primary" @click="handleSaveEdit">{{ t('app.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 命令输入区 -->
    <CommandInput
      ref="commandInputRef"
      v-model="commandInput"
      :messages="state.messageLog"
      :is-running="!!state.activeLoopId"
      :is-initialized="state.isInitialized"
      @submit="handleSubmit"
      @stop="handleStop"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Settings, ChevronRight, ChevronLeft, Plus, Sun, Moon } from 'lucide-vue-next'
import ParticleCanvas from './components/ParticleCanvas.vue'
import MessageList from './components/MessageList.vue'
import CommandInput from './components/CommandInput.vue'
import ConfirmCard from './components/ConfirmCard.vue'
import { useAIEngine } from './composables/useAIEngine'
import { useSettings } from './composables/useSettings'
import { LOCALES, type LocaleCode } from './locales'
import { useI18n } from 'vue-i18n'
import type { AIModel, AIProvider } from './types'

type SettingsPage = 'home' | 'models' | 'about'

// 版本号 — 从 manifest.json 读取（Service Worker 环境）或在构建时由 Vite 注入
const appVersion =
  (typeof chrome !== 'undefined' && chrome.runtime?.getManifest()?.version) ||
  import.meta.env.VITE_APP_VERSION ||
  '0.1.0'

const {
  state,
  handleSubmit: aiHandleSubmit,
  stopAgentLoop: aiStopAgentLoop,
  toggleSettings,
  initEngine,
  models,
  addModel,
  updateModel,
  deleteModel,
  setDefaultModel,
  commandInputValue,
  pendingConfirm,
  renderExecutionResult,
  deleteMessage,
} = useAIEngine()

const { themeMode, setThemeMode, locale, setLocale } = useSettings()
const { t } = useI18n()

/**
 * 处理设置面板中的语言切换
 * @param code 下拉框选中的语言代码
 */
async function handleLocaleChange(code: LocaleCode) {
  try {
    await setLocale(code)
  } catch (err) {
    console.error('[settings] 语言切换失败:', err)
  }
}

const commandInput = commandInputValue
const commandInputRef = ref<InstanceType<typeof import('./components/CommandInput.vue').default>>()

// 设置页面
const settingsPage = ref<SettingsPage>('home')

// 右上角主题切换
async function toggleTheme() {
  const next = themeMode.value === 'dark' ? 'light' : 'dark'
  await setThemeMode(next)
}

// 添加模型弹窗
const showAddDialog = ref(false)
const newModel = ref({
  name: '',
  provider: 'openai' as AIProvider,
  apiKey: '',
  apiEndpoint: '',
  modelName: '',
})

async function handleAddModel() {
  if (!newModel.value.name.trim()) return
  await addModel(newModel.value)
  newModel.value = {
    name: '',
    provider: 'openai',
    apiKey: '',
    apiEndpoint: '',
    modelName: '',
  }
  showAddDialog.value = false
}

// 编辑模型弹窗
const editDialogVisible = ref(false)
const editingModel = ref<AIModel | null>(null)

function startEditModel(model: AIModel) {
  editingModel.value = { ...model }
  editDialogVisible.value = true
}

async function handleSaveEdit() {
  if (!editingModel.value) return
  await updateModel(editingModel.value.id, editingModel.value)
  editDialogVisible.value = false
}

// 模型操作
async function handleDeleteModel(modelId: string) {
  if (models.value.length <= 1) return
  await deleteModel(modelId)
}

async function handleSetDefault(modelId: string) {
  await setDefaultModel(modelId)
}

function getProviderLabel(provider: AIProvider): string {
  const labels: Record<AIProvider, string> = {
    openai: t('app.providerOpenaiCompat'),
    'gemini-nano': 'Gemini Nano',
    auto: t('app.providerAuto'),
  }
  return labels[provider] || provider
}

// 上次发送的命令（用于连续去重，成功提交后清零以允许非连续重复）
let lastSubmittedText = ''

// chrome.runtime 消息监听器（需在 onBeforeUnmount 中清理）
const msgListener = (msg: { type?: string; intent?: string; response?: unknown }) => {
  if (msg.type === 'EXECUTE_RESULT' && msg.intent) {
    renderExecutionResult(msg.intent, msg.response)
  }
}

// 提交命令
async function handleSubmit() {
  const text = commandInput.value
  if (!text.trim()) return
  // 连续重复命令不重复发送
  if (text.trim() === lastSubmittedText) return
  lastSubmittedText = text.trim()
  await aiHandleSubmit(text)
  lastSubmittedText = '' // 清零，允许发送相同命令（非连续）
}

// 停止当前任务：反馈（system 标记 + ai-chat 回复）与中断、清理统一收敛在 stopAgentLoop，
// 三种中断时机（AI 请求中/响应已返回/工具执行中）行为一致，agentLoop 内部静默退出不重复反馈。
function handleStop() {
  aiStopAgentLoop()
}

onMounted(async () => {
  await initEngine()
  // 自动聚焦到输入框
  commandInputRef.value?.focus()
  // 恢复上次的输入草稿
  try {
    const draft = sessionStorage.getItem('lastInput')
    if (draft) commandInput.value = draft
  } catch {
    /* empty */
  }
  // beforeunload 保存输入草稿
  window.addEventListener('beforeunload', saveSession)

  // 监听 SW 主动推送的执行结果
  chrome.runtime.onMessage.addListener(msgListener)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', saveSession)
  chrome.runtime.onMessage.removeListener(msgListener)
})

function saveSession() {
  try {
    sessionStorage.setItem('lastInput', commandInput.value)
    // IndexedDB 已按消息粒度写入，无需统一 save
  } catch {
    /* empty */
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
  background: var(--app-bg);
  color: var(--app-text-primary);
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: relative;
}

/* 标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--app-bg-card);
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: var(--app-text-primary);
  font-size: 16px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary);
}

.header-actions {
  display: flex;
  gap: 4px;
}

/* 消息区域 */
.messages {
  flex: 1;
  padding: 0;
}

.messages-wrap {
  display: flex;
  flex-direction: column;
}

/* 设置抽屉 */
.el-drawer__header {
  margin-bottom: 0 !important;
  padding-bottom: 0;
}

.drawer-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.drawer-nav-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text-primary);
}

.add-btn {
  color: var(--app-text-muted);
  padding: 4px;
}

.add-btn:hover {
  color: var(--app-text-primary);
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--app-text-muted);
  cursor: pointer;
  margin-right: 12px;
  transition: color 0.15s ease;
}

.back-btn:hover {
  color: var(--app-text-primary);
}

/* 设置 Cell */
.settings-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border-light);
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.settings-cell:last-child {
  border-bottom: none;
}

.settings-cell:hover {
  opacity: 0.7;
}

.cell-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-title {
  font-size: 14px;
  color: var(--app-text-primary);
}

.cell-desc {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.cell-arrow {
  color: var(--app-text-muted);
}

/* 模型列表 */
.model-list {
  display: flex;
  flex-direction: column;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--app-border-light);
}

.model-item:last-child {
  border-bottom: none;
}

.model-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text-primary);
}

.model-provider {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.model-actions {
  display: flex;
  gap: 4px;
}

/* 占位文本 */
.placeholder-text {
  text-align: center;
  color: var(--app-text-muted);
  padding: 40px 0;
}

/* 关于页面 */
.about-content {
  text-align: center;
  padding: 20px 0;
}

.about-content h3 {
  font-size: 18px;
  color: var(--app-text-primary);
  margin-bottom: 12px;
}

.about-content .version {
  font-size: 13px;
  color: var(--app-text-secondary);
  margin-bottom: 8px;
}

.about-content .desc {
  font-size: 13px;
  color: var(--app-text-muted);
}

/* 亮色主题下遮罩 */
:root[data-theme='light'] .el-overlay {
  background: rgba(0, 0, 0, 0.5);
}

.ml-2 {
  margin-left: 8px;
}
</style>
