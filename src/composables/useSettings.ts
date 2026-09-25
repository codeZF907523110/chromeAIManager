/**
 * 设置管理 Composable
 * 管理 AI 模型的加载、保存和多模型切换，以及主题、界面语言设置
 */

import { computed, ref, readonly } from 'vue'
import type { AIModel } from '../types'
import {
  createDefaultModel as createDefaultModelFromConstants,
  STORAGE_KEY_LOCALE,
} from '../shared/constants'
import { i18n, setLocale as applyLocale, isLocaleCode, type LocaleCode } from '../locales'

const STORAGE_KEYS = {
  MODELS: 'ai_models',
  ACTIVE_MODEL_ID: 'active_model_id',
  THEME_MODE: 'theme_mode',
  ACCENT_COLOR: 'accent_color',
  LOCALE: STORAGE_KEY_LOCALE,
}

// 单例状态
const modelsState = ref<AIModel[]>([])
const activeModelIdState = ref<string>('')
const themeModeState = ref<'light' | 'dark'>('dark')
const accentColorState = ref('#3b82f6')

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

/**
 * 罐头文案取词入口（非组件模块）：走 i18n 全局 composer，语言切换即时生效
 * @param key 词条 key
 * @param params 插值参数（可选）
 * @returns 当前语言的文案；词条缺失时由 fallbackLocale（en）兜底
 */
function t(key: string, params?: Record<string, unknown>): string {
  return params ? i18n.global.t(key, params) : i18n.global.t(key)
}

function createDefaultModel(): AIModel {
  return createDefaultModelFromConstants(generateId(), Date.now())
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
    accentColorState.value = (result[STORAGE_KEYS.ACCENT_COLOR] as string) || '#3b82f6'
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

  // ──── 界面语言 ────

  /** 当前生效语言（只读镜像，真实来源是 i18n 实例） */
  const locale = computed<LocaleCode>(() => i18n.global.locale.value as LocaleCode)

  /**
   * 切换界面语言并持久化
   * @param code 目标语言代码（须为 LOCALES 注册值）
   * @throws 语言包加载失败时向上抛出（设置面板负责提示），存储不写入
   */
  async function setLocale(code: LocaleCode): Promise<void> {
    await applyLocale(code)
    await chrome.storage.local.set({ [STORAGE_KEYS.LOCALE]: code })
  }

  /**
   * 从存储装载用户的语言偏好（启动时调用；无偏好时保持系统语言解析结果）
   * @throws 语言包加载失败时抛出，由调用方兜底
   */
  async function loadLocale(): Promise<void> {
    const result = (await chrome.storage.local.get([STORAGE_KEYS.LOCALE])) as Record<
      string,
      string | undefined
    >
    const stored = result[STORAGE_KEYS.LOCALE]
    if (isLocaleCode(stored) && stored !== i18n.global.locale.value) {
      await applyLocale(stored)
    }
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

    // 加载主题与界面语言
    await loadTheme()
    await loadLocale()

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
      throw new Error(t('settings.errApiKey'))
    }
    if (!model.apiEndpoint?.trim()) {
      throw new Error(t('settings.errApiEndpoint'))
    }
    if (!model.modelName?.trim()) {
      throw new Error(t('settings.errModelName'))
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
    // 界面语言
    locale,
    setLocale,
  }
}
