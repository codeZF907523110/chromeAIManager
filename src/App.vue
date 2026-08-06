<template>
  <div class="app">
    <!-- 粒子背景 -->
    <ParticleCanvas />

    <!-- 标题栏 -->
    <header class="header">
      <div class="header-brand">
        <span class="header-icon">◆</span>
        <span class="header-title">AI 浏览器管家</span>
      </div>
      <div class="header-actions">
        <el-button text @click="toggleSettings">
          <Settings :size="16" />
        </el-button>

        <el-button text @click="switchMode('sidepanel')" title="侧边栏模式">
          <LayoutPanelLeft :size="16" />
        </el-button>

        <el-button text @click="switchMode('popup')" title="弹窗模式">
          <PanelRight :size="16" />
        </el-button>
      </div>
    </header>

    <!-- 消息列表 -->
    <MessageList :messages="state.messageLog" />

    <!-- 确认卡片 -->
    <ConfirmCard
      v-if="pendingConfirm"
      :title="pendingConfirm.title"
      :description="pendingConfirm.description"
      :items="pendingConfirm.items"
      :on-confirm="pendingConfirm.onConfirm"
      @cancel="pendingConfirm.onCancel"
    />

    <!-- 设置面板 -->
    <div v-if="state.isSettingsOpen" class="settings-panel">
      <!-- 设置首页 -->
      <div v-if="settingsPage === 'home'" class="settings-home">
        <div class="settings-header">
          <span class="settings-title">设置</span>
        </div>
        <div class="settings-cells">
          <div class="settings-cell" @click="settingsPage = 'models'">
            <div class="cell-content">
              <span class="cell-title">模型管理</span>
              <span class="cell-desc">添加、编辑、删除 AI 模型</span>
            </div>
            <ChevronRight :size="16" class="cell-arrow" />
          </div>
          <div class="settings-cell" @click="settingsPage = 'theme'">
            <div class="cell-content">
              <span class="cell-title">主题设置</span>
              <span class="cell-desc">自定义界面外观</span>
            </div>
            <ChevronRight :size="16" class="cell-arrow" />
          </div>
          <div class="settings-cell" @click="settingsPage = 'about'">
            <div class="cell-content">
              <span class="cell-title">关于</span>
              <span class="cell-desc">版本信息和帮助</span>
            </div>
            <ChevronRight :size="16" class="cell-arrow" />
          </div>
        </div>
        <el-button class="close-btn" @click="toggleSettings">关闭</el-button>
      </div>

      <!-- 模型管理页面 -->
      <div v-if="settingsPage === 'models'" class="settings-page">
        <div class="settings-header">
          <div class="back-btn" @click="settingsPage = 'home'">
            <ChevronLeft :size="16" />
            <span>返回</span>
          </div>
          <span class="settings-title">模型管理</span>
          <el-button text @click="showAddDialog = true">
            <Plus :size="16" />
          </el-button>
        </div>

        <!-- 模型列表 -->
        <div class="model-list">
          <div v-for="model in models" :key="model.id" class="model-item">
            <div class="model-info">
              <div class="model-name-row">
                <span class="model-name">{{ model.name }}</span>
                <el-tag v-if="model.isDefault" size="small">默认</el-tag>
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
                设为默认
              </el-button>
              <el-button size="small" text @click="startEditModel(model)">编辑</el-button>
              <el-button
                v-if="models.length > 1"
                size="small"
                text
                type="danger"
                @click="handleDeleteModel(model.id)"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 主题设置页面 -->
      <div v-if="settingsPage === 'theme'" class="settings-page">
        <div class="settings-header">
          <div class="back-btn" @click="settingsPage = 'home'">
            <ChevronLeft :size="16" />
            <span>返回</span>
          </div>
          <span class="settings-title">主题设置</span>
        </div>
        <div class="placeholder-text">主题设置功能开发中...</div>
      </div>

      <!-- 关于页面 -->
      <div v-if="settingsPage === 'about'" class="settings-page">
        <div class="settings-header">
          <div class="back-btn" @click="settingsPage = 'home'">
            <ChevronLeft :size="16" />
            <span>返回</span>
          </div>
          <span class="settings-title">关于</span>
        </div>
        <div class="about-content">
          <h3>AI 浏览器管家</h3>
          <p class="version">版本 0.1.0</p>
          <p class="desc">一个基于 AI 的浏览器命令中心</p>
        </div>
      </div>
    </div>

    <!-- 添加模型弹窗 -->
    <div v-if="showAddDialog" class="modal-overlay" @click.self="showAddDialog = false">
      <div class="modal-content">
        <div class="modal-header">
          <span>添加模型</span>
          <div class="modal-close" @click="showAddDialog = false">
            <X :size="16" />
          </div>
        </div>
        <div class="modal-body">
          <div class="form-item">
            <label>模型名称</label>
            <el-input v-model="newModel.name" placeholder="如：DeepSeek V3" />
          </div>
          <div class="form-item">
            <label>提供商</label>
            <el-select v-model="newModel.provider" placeholder="选择提供商">
              <el-option value="openai" label="OpenAI 兼容 API" />
              <el-option value="gemini-nano" label="Gemini Nano（本地）" />
              <el-option value="auto" label="自动" />
            </el-select>
          </div>
          <template v-if="newModel.provider !== 'gemini-nano'">
            <div class="form-item">
              <label>API Key</label>
              <el-input
                v-model="newModel.apiKey"
                type="password"
                placeholder="sk-..."
                show-password
              />
            </div>
            <div class="form-item">
              <label>API 端点</label>
              <el-input v-model="newModel.apiEndpoint" placeholder="https://api.deepseek.com" />
            </div>
            <div class="form-item">
              <label>模型名称</label>
              <el-input v-model="newModel.modelName" placeholder="deepseek-chat" />
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <el-button @click="showAddDialog = false">取消</el-button>
          <el-button type="primary" @click="handleAddModel">保存</el-button>
        </div>
      </div>
    </div>

    <!-- 编辑模型弹窗 -->
    <div v-if="editDialogVisible" class="modal-overlay" @click.self="editDialogVisible = false">
      <div class="modal-content">
        <div class="modal-header">
          <span>编辑模型</span>
          <div class="modal-close" @click="editDialogVisible = false">
            <X :size="16" />
          </div>
        </div>
        <div class="modal-body">
          <div class="form-item">
            <label>模型名称</label>
            <el-input v-model="editingModel!.name" />
          </div>
          <div class="form-item">
            <label>提供商</label>
            <el-select v-model="editingModel!.provider">
              <el-option value="openai" label="OpenAI 兼容 API" />
              <el-option value="gemini-nano" label="Gemini Nano（本地）" />
              <el-option value="auto" label="自动" />
            </el-select>
          </div>
          <template v-if="editingModel && editingModel.provider !== 'gemini-nano'">
            <div class="form-item">
              <label>API Key</label>
              <el-input v-model="editingModel!.apiKey" type="password" show-password />
            </div>
            <div class="form-item">
              <label>API 端点</label>
              <el-input v-model="editingModel!.apiEndpoint" />
            </div>
            <div class="form-item">
              <label>模型名称</label>
              <el-input v-model="editingModel!.modelName" />
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <el-button @click="editDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSaveEdit">保存</el-button>
        </div>
      </div>
    </div>

    <!-- 命令输入区 -->
    <CommandInput ref="commandInputRef" v-model="commandInput" @submit="handleSubmit" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  Settings,
  LayoutPanelLeft,
  PanelRight,
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
} from 'lucide-vue-next'
import ParticleCanvas from './components/ParticleCanvas.vue'
import MessageList from './components/MessageList.vue'
import CommandInput from './components/CommandInput.vue'
import ConfirmCard from './components/ConfirmCard.vue'
import { useAIEngine } from './composables/useAIEngine'
import type { AIModel, AIProvider } from './types'

type SettingsPage = 'home' | 'models' | 'theme' | 'about'

const {
  state,
  handleSubmit: aiHandleSubmit,
  toggleSettings,
  switchMode,
  initEngine,
  models,
  addModel,
  updateModel,
  deleteModel,
  setDefaultModel,
  commandInputValue,
  pendingConfirm,
  renderExecutionResult,
} = useAIEngine()

const commandInput = commandInputValue
const commandInputRef = ref<InstanceType<typeof import('./components/CommandInput.vue').default>>()

// 设置页面
const settingsPage = ref<SettingsPage>('home')

// 添加模型弹窗
const showAddDialog = ref(false)
const newModel = ref({
  name: '',
  provider: 'openai' as AIProvider,
  apiKey: '',
  apiEndpoint: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
})

async function handleAddModel() {
  if (!newModel.value.name.trim()) return
  await addModel(newModel.value)
  newModel.value = {
    name: '',
    provider: 'openai',
    apiKey: '',
    apiEndpoint: 'https://api.deepseek.com',
    modelName: 'deepseek-chat',
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
    openai: 'OpenAI 兼容',
    'gemini-nano': 'Gemini Nano',
    auto: '自动',
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
  background: #0a0a0a;
  color: #f0f0f0;
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
  background: rgba(10, 10, 10, 0.9);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
  color: #fff;
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
  color: #fff;
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

/* 设置面板 */
.settings-panel {
  padding: 16px;
  background: rgba(10, 10, 10, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  max-height: 50vh;
  overflow-y: auto;
}

.settings-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #888;
  cursor: pointer;
  margin-right: 12px;
  transition: color 0.15s ease;
}

.back-btn:hover {
  color: #fff;
}

/* 设置 Cell */
.settings-cells {
  display: flex;
  flex-direction: column;
}

.settings-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  color: #e0e0e0;
}

.cell-desc {
  font-size: 12px;
  color: #666;
}

.cell-arrow {
  color: #555;
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  color: #e0e0e0;
}

.model-provider {
  font-size: 12px;
  color: #666;
}

.model-actions {
  display: flex;
  gap: 4px;
}

/* 占位文本 */
.placeholder-text {
  text-align: center;
  color: #555;
  padding: 40px 0;
}

/* 关于页面 */
.about-content {
  text-align: center;
  padding: 20px 0;
}

.about-content h3 {
  font-size: 18px;
  color: #fff;
  margin-bottom: 12px;
}

.about-content .version {
  font-size: 13px;
  color: #888;
  margin-bottom: 8px;
}

.about-content .desc {
  font-size: 13px;
  color: #666;
}

/* 关闭按钮 */
.close-btn {
  width: 100%;
  margin-top: 16px;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal-content {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header span {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.modal-close {
  color: #666;
  cursor: pointer;
  transition: color 0.15s ease;
}

.modal-close:hover {
  color: #fff;
}

.modal-body {
  padding: 16px;
}

.form-item {
  margin-bottom: 14px;
}

.form-item:last-child {
  margin-bottom: 0;
}

.form-item label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ml-2 {
  margin-left: 8px;
}
</style>
