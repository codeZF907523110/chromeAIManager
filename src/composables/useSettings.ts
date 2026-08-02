/**
 * 设置管理 Composable
 * 管理 AI 模型的加载、保存和多模型切换
 */

import { ref, readonly } from 'vue'
import type { AIModel } from '../types'

const STORAGE_KEYS = {
  MODELS: 'ai_models',
  ACTIVE_MODEL_ID: 'active_model_id',
}

// 单例状态
const modelsState = ref<AIModel[]>([])
const activeModelIdState = ref<string>('')

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
  /**
   * 获取当前激活的模型
   */
  function getActiveModel(): AIModel | undefined {
    return modelsState.value.find((m) => m.id === activeModelIdState.value)
  }

  /**
   * 加载所有设置
   */
  async function loadSettings(): Promise<{ models: AIModel[]; activeModelId: string }> {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.MODELS,
      STORAGE_KEYS.ACTIVE_MODEL_ID,
    ])

    let loadedModels = result[STORAGE_KEYS.MODELS] as AIModel[] | undefined
    let loadedActiveId = result[STORAGE_KEYS.ACTIVE_MODEL_ID] as string | undefined

    // 如果没有模型，创建默认模型
    if (!loadedModels || loadedModels.length === 0) {
      const defaultModel = createDefaultModel()
      loadedModels = [defaultModel]
      loadedActiveId = defaultModel.id
      await chrome.storage.local.set({
        [STORAGE_KEYS.MODELS]: loadedModels,
        [STORAGE_KEYS.ACTIVE_MODEL_ID]: loadedActiveId,
      })
    }

    // 如果没有激活的模型 ID，使用默认模型
    if (!loadedActiveId) {
      const defaultModel = loadedModels.find((m) => m.isDefault) || loadedModels[0]
      loadedActiveId = defaultModel.id
      await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_MODEL_ID]: loadedActiveId })
    }

    modelsState.value = loadedModels
    activeModelIdState.value = loadedActiveId

    console.log('[useSettings] loaded models:', loadedModels)
    return { models: loadedModels, activeModelId: loadedActiveId }
  }

  /**
   * 保存所有模型
   */
  async function saveModels(newModels: AIModel[]): Promise<void> {
    modelsState.value = newModels
    await chrome.storage.local.set({ [STORAGE_KEYS.MODELS]: newModels })
  }

  /**
   * 添加新模型
   */
  async function addModel(
    model: Omit<AIModel, 'id' | 'isDefault' | 'createdAt'>
  ): Promise<AIModel> {
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

  /**
   * 更新模型
   */
  async function updateModel(modelId: string, updates: Partial<AIModel>): Promise<void> {
    const newModels = modelsState.value.map((m) => (m.id === modelId ? { ...m, ...updates } : m))
    await saveModels(newModels)
  }

  /**
   * 删除模型（至少保留一个）
   */
  async function deleteModel(modelId: string): Promise<boolean> {
    if (modelsState.value.length <= 1) {
      return false
    }
    const newModels = modelsState.value.filter((m) => m.id !== modelId)
    await saveModels(newModels)

    // 如果删除的是当前激活的模型，切换到第一个
    if (activeModelIdState.value === modelId) {
      await setActiveModel(newModels[0].id)
    }
    return true
  }

  /**
   * 设置当前激活的模型
   */
  async function setActiveModel(modelId: string): Promise<void> {
    activeModelIdState.value = modelId
    await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_MODEL_ID]: modelId })
  }

  /**
   * 设置默认模型
   */
  async function setDefaultModel(modelId: string): Promise<void> {
    const newModels = modelsState.value.map((m) => ({
      ...m,
      isDefault: m.id === modelId,
    }))
    await saveModels(newModels)
  }

  return {
    models: readonly(modelsState),
    activeModelId: readonly(activeModelIdState),
    getActiveModel,
    loadSettings,
    addModel,
    updateModel,
    deleteModel,
    setActiveModel,
    setDefaultModel,
  }
}
