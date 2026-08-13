/**
 * 设置管理 Composable
 * 管理 AI 模型的加载、保存和多模型切换，以及主题设置
 */

import { ref, readonly } from 'vue'
import type { AIModel } from '../types'

const STORAGE_KEYS = {
  MODELS: 'ai_models',
  ACTIVE_MODEL_ID: 'active_model_id',
  THEME_MODE: 'theme_mode',
  ACCENT_COLOR: 'accent_color',
}

// 单例状态
const modelsState = ref<AIModel[]>([])
const activeModelIdState = ref<string>('')
const themeModeState = ref<'light' | 'dark'>('dark')
const accentColorState = ref('#3b82f6')

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

function createDefaultModel(): AIModel {
  return {
    id: generateId(),
    name: 'DeepSeek V3',
    provider: 'openai',
    apiKey: '',
    apiEndpoint: 'https://api.deepseek.com',
    modelName: 'deepseek-chat',
    isDefault: true,
    createdAt: Date.now(),
  }
}

export function useSettings() {
  // ──── 主题 ────

  function applyThemeToDOM(mode: 'light' | 'dark', accent: string) {
    const html = document.documentElement
    if (mode === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    html.setAttribute('data-theme', mode)
    html.style.setProperty('--app-accent', accent)
    html.style.setProperty('--el-color-primary', accent)
  }

  async function loadTheme(): Promise<void> {
    const result = (await chrome.storage.local.get([
      STORAGE_KEYS.THEME_MODE,
      STORAGE_KEYS.ACCENT_COLOR,
    ])) as Record<string, string | undefined>
    themeModeState.value = (result[STORAGE_KEYS.THEME_MODE] || 'dark') as 'light' | 'dark'
    accentColorState.value = result[STORAGE_KEYS.ACCENT_COLOR] || '#3b82f6'
    // 立即应用
    applyThemeToDOM(themeModeState.value, accentColorState.value)
  }

  async function setThemeMode(mode: 'light' | 'dark'): Promise<void> {
    themeModeState.value = mode
    await chrome.storage.local.set({ [STORAGE_KEYS.THEME_MODE]: mode })
    applyThemeToDOM(mode, accentColorState.value)
  }

  async function setAccentColor(color: string): Promise<void> {
    accentColorState.value = color
    await chrome.storage.local.set({ [STORAGE_KEYS.ACCENT_COLOR]: color })
    applyThemeToDOM(themeModeState.value, color)
  }

  // ──── 模型 ────

  function getActiveModel(): AIModel | undefined {
    return modelsState.value.find((m) => m.id === activeModelIdState.value)
  }

  async function loadSettings(): Promise<{ models: AIModel[]; activeModelId: string }> {
    const result = (await chrome.storage.local.get([
      STORAGE_KEYS.MODELS,
      STORAGE_KEYS.ACTIVE_MODEL_ID,
    ])) as Record<string, unknown>

    let loadedModels = result[STORAGE_KEYS.MODELS] as AIModel[] | undefined
    let loadedActiveId = result[STORAGE_KEYS.ACTIVE_MODEL_ID] as string | undefined

    if (!loadedModels || loadedModels.length === 0) {
      const defaultModel = createDefaultModel()
      loadedModels = [defaultModel]
      loadedActiveId = defaultModel.id
      await chrome.storage.local.set({
        [STORAGE_KEYS.MODELS]: loadedModels,
        [STORAGE_KEYS.ACTIVE_MODEL_ID]: loadedActiveId,
      })
    }

    if (!loadedActiveId) {
      const defaultModel = loadedModels.find((m) => m.isDefault) || loadedModels[0]
      loadedActiveId = defaultModel.id
      await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_MODEL_ID]: loadedActiveId })
    }

    modelsState.value = loadedModels
    activeModelIdState.value = loadedActiveId

    // 加载主题
    await loadTheme()

    return { models: loadedModels, activeModelId: loadedActiveId }
  }

  async function saveModels(newModels: AIModel[]): Promise<void> {
    modelsState.value = newModels
    await chrome.storage.local.set({ [STORAGE_KEYS.MODELS]: newModels })
  }

  async function addModel(
    model: Omit<AIModel, 'id' | 'isDefault' | 'createdAt'>
  ): Promise<AIModel> {
    if (!model.apiKey?.trim()) {
      throw new Error('请输入 API Key')
    }
    if (!model.apiEndpoint?.trim()) {
      throw new Error('请输入 API 端点')
    }
    if (!model.modelName?.trim()) {
      throw new Error('请输入模型名称')
    }
    const newModel: AIModel = {
      ...model,
      id: generateId(),
      isDefault: false,
      createdAt: Date.now(),
    }
    const newModels = [...modelsState.value, newModel]
    await saveModels(newModels)
    return newModel
  }

  async function updateModel(modelId: string, updates: Partial<AIModel>): Promise<void> {
    const newModels = modelsState.value.map((m) => (m.id === modelId ? { ...m, ...updates } : m))
    await saveModels(newModels)
  }

  async function deleteModel(modelId: string): Promise<boolean> {
    if (modelsState.value.length <= 1) {
      return false
    }
    const newModels = modelsState.value.filter((m) => m.id !== modelId)
    await saveModels(newModels)

    if (activeModelIdState.value === modelId) {
      await setActiveModel(newModels[0].id)
    }
    return true
  }

  async function setActiveModel(modelId: string): Promise<void> {
    activeModelIdState.value = modelId
    await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_MODEL_ID]: modelId })
  }

  async function setDefaultModel(modelId: string): Promise<void> {
    const newModels = modelsState.value.map((m) => ({
      ...m,
      isDefault: m.id === modelId,
    }))
    await saveModels(newModels)
  }

  return {
    // 模型
    models: readonly(modelsState),
    activeModelId: readonly(activeModelIdState),
    getActiveModel,
    loadSettings,
    addModel,
    updateModel,
    deleteModel,
    setActiveModel,
    setDefaultModel,
    // 主题
    themeMode: readonly(themeModeState),
    accentColor: readonly(accentColorState),
    setThemeMode,
    setAccentColor,
    applyThemeToDOM,
  }
}
