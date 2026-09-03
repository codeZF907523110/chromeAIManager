/**
 * AI 浏览器管家 — 主逻辑 Composable（精简版 / Plan-First）
 *
 * 本文件瘦身后仅保留 AI 侧职责：
 *   - aiEngine 单例（供 usePlanRunner 共用）
 *   - 模型管理（initEngine / selectModel / loadSettings / 模型 CRUD）
 *   - 消息持久化（IndexedDB via messageStore）
 *   - 状态消息通道（setStatusMessage / updateStatusText / removeStatusText）
 *   - handleSubmit：分发到 slash runner 或 plan runner（具体由 App.vue 注入）
 *   - handleNaturalLanguage：调 usePlanRunner.run
 *
 * 已迁出：
 *   - 斜杠命令解析 / 确认 / SW dispatch / 客户端命令路由 / 录制执行器
 *     → src/composables/useSlashCommandRunner.ts（自包含）
 *   - 单步结果渲染（renderExecutionResult / formatResultDescription）
 *     → src/shared/render-result.ts（中立层）
 *   - 嵌入按钮 dispatchToSW
 *     → useSlashCommandRunner.dispatchToSW（App.vue 透传）
 *
 * 对外 API 保持稳定（App.vue / MessageBubble.vue / CommandInput.vue 不变）。
 */

import { ref, watch } from 'vue'
import type { ConfirmCardData, Context, MessageBody, MessageLog } from '../types'
import { messageStore } from '../shared/message-store'
import { AIEngine } from '../shared/ai/engine'
import { useSettings } from './useSettings'
import type { PlanRunnerContext } from './usePlanRunner'
import { SLASH_COMMANDS } from '../shared/slash-commands'

// ──── 模块级单例 ────

/** AI 引擎（模块级单例，供 usePlanRunner 共用） */
export const aiEngine = new AIEngine()

// ──── Composable 主体 ────

/**
 * AI 侧 composable。
 *
 * 由于 App.vue 同时持有 useSlashCommandRunner 实例和 useAIEngine 实例，
 * 但只有 useAIEngine 提供 handleSubmit（保留向后兼容），
 * 这里把分发器作为可选依赖注入；不传则使用默认行为：
 *   - 斜杠命令：不执行（要求 App.vue 自己用 slashRunner.run 接入）
 *   - 自然语言：调 usePlanRunner.run
 */
export function useAIEngine() {
  // ──── 子 Composable ────
  const settingsComposable = useSettings()

  // ──── 状态 ────
  const messageLog = ref<MessageLog[]>([])
  const isSettingsOpen = ref(false)
  const isInitialized = ref(false)
  const commandInputValue = ref('')
  /** App.vue 持有的统一确认卡状态（slash + plan 共用） */
  const pendingConfirm = ref<ConfirmCardData | null>(null)

  /**
   * 当前在跑的"状态消息"id（思考中 / 执行中）。
   * 该消息是临时 system 通道，runner 通过 updateStatusText 改写它，
   * 完成后由 removeStatusText 从 messageLog 中移除。
   */
  let statusMessageId: string | null = null

  function setStatusMessage(text: string): void {
    addMessageLocal('system', text)
    // 取最新 push 的消息记录其真实 id；addMessageLocal 内部分配 UUID
    const last = messageLog.value[messageLog.value.length - 1]
    statusMessageId = last?.id ?? null
    // 状态消息也持久化（关闭重开后即使残留也能继续移除）；
    // 完成时由 removeStatusText 同步从 IndexedDB 删除。
  }

  function updateStatusText(text: string): void {
    if (!statusMessageId) {
      setStatusMessage(text)
      return
    }
    const target = messageLog.value.find((m) => m.id === statusMessageId)
    if (target) {
      target.text = { markdown: text }
    } else {
      setStatusMessage(text)
    }
  }

  function removeStatusText(): void {
    if (!statusMessageId) return
    const idx = messageLog.value.findIndex((m) => m.id === statusMessageId)
    if (idx >= 0) {
      const removed = messageLog.value.splice(idx, 1)[0]
      // 状态消息是临时通道，不写入 IndexedDB；已写入的需要清理
      if (removed?.id) {
        void messageStore.remove(removed.id).catch((e: unknown) => {
          console.warn('[AI管家] 移除状态消息失败:', e instanceof Error ? e.message : String(e))
        })
      }
    }
    statusMessageId = null
  }

  // ──── 初始化 AI 引擎 ────

  async function initEngine() {
    await settingsComposable.loadSettings()
    const activeModel = settingsComposable.getActiveModel()
    if (activeModel) {
      aiEngine.setModel(activeModel)
    }
    // 加载持久化的消息
    await loadPersistedMessages()
    isInitialized.value = true

    // 监听模型变化，自动同步到 aiEngine
    watch(
      () => settingsComposable.activeModelId.value,
      (newId) => {
        const model = settingsComposable.models.value.find((m) => m.id === newId)
        if (model) aiEngine.setModel(model)
      }
    )
  }

  /**
   * 加载持久化的消息
   */
  async function loadPersistedMessages() {
    try {
      const items = await messageStore.list()
      if (items.length > 0) {
        messageLog.value = items
      }
    } catch (e: unknown) {
      console.warn('[AI管家] 加载消息失败:', e instanceof Error ? e.message : String(e))
    }
  }

  /**
   * 切换当前模型
   */
  async function selectModel(modelId: string) {
    await settingsComposable.setActiveModel(modelId)
    const activeModel = settingsComposable.getActiveModel()
    if (activeModel) {
      aiEngine.setModel(activeModel)
    }
  }

  // ──── 自然语言入口（AI 侧） ────

  async function handleNaturalLanguage(text: string) {
    const ai = await aiEngine.checkAvailability()
    if (!ai.available) {
      addMessageLocal(
        'system',
        `AI 不可用: ${ai.reason || '未配置'}\n\n可用斜杠命令:\n${formatSlashCommands()}`
      )
      return
    }

    if (pendingConfirm.value) {
      cleanup()
    }

    // 显示"思考中"system 消息；runner 会通过 updateStatusText 改写它
    setStatusMessage('思考中...')

    const { run: runPlan } = await import('./usePlanRunner')
    const runnerContext: PlanRunnerContext = {
      addMessage: addMessageLocal,
      updateStatusText,
      removeStatusText,
      setPendingConfirm: (value) => {
        pendingConfirm.value = value
      },
      renderExecutionResult: async (_intent, _response, _slots) => {
        // plan 路径下由 usePlanRunner 自己负责单步渲染（包括 clientExec / showConfirmCard），
        // 这里无需做额外工作；保留参数仅为保持 PlanRunnerContext 接口兼容。
      },
    }
    try {
      await runPlan(text, runnerContext)
    } catch (e: unknown) {
      // 兜底清理状态消息，避免异常时残留
      removeStatusText()
      addMessageLocal(
        'system',
        `抱歉，处理您的请求时遇到了问题喵~（${e instanceof Error ? e.message : String(e)}）`
      )
    }
  }

  /**
   * 命令分发入口。
   * 斜杠命令的实际处理委托给外部传入的 slash runner（由 App.vue 注入），
   * 自然语言走 handleNaturalLanguage。
   */
  async function handleSubmit(
    text: string,
    slashRunner?: { run: (text: string) => Promise<void> }
  ): Promise<void> {
    const trimmedText = text.trim()
    if (!trimmedText) return

    if (trimmedText.startsWith('/')) {
      addMessageLocal('user', trimmedText)
      if (slashRunner) {
        try {
          await slashRunner.run(trimmedText)
        } catch {
          addMessageLocal('system', '抱歉，处理命令时遇到了问题喵~')
        }
      } else {
        // 兜底：如果未注入 slashRunner，仍给出降级提示
        addMessageLocal('system', '抱歉，斜杠命令处理器未就绪，请刷新页面重试喵~')
      }
    } else {
      addMessageLocal('user', trimmedText)
      try {
        await handleNaturalLanguage(trimmedText)
      } catch {
        addMessageLocal('system', '抱歉，处理您的请求时遇到了问题喵~')
      }
    }
  }

  // ──── 辅助函数 ────

  /**
   * 把字符串 / MessageBody 规范化为 MessageBody
   */
  function normalizeBody(text: string | MessageBody): MessageBody {
    return typeof text === 'string' ? { markdown: text } : text
  }

  function addMessageLocal(
    type: MessageLog['type'],
    text: string | MessageBody,
    image?: string,
    video?: string,
    recordingFile?: MessageLog['recordingFile']
  ): void {
    const body = normalizeBody(text)
    const msg: MessageLog = {
      type,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      text: body,
      image,
      video,
      recordingFile,
    }
    messageLog.value.push(msg)
    void persistMessage(msg)
  }

  async function persistMessage(msg: MessageLog): Promise<void> {
    try {
      await messageStore.append(msg)
    } catch (e: unknown) {
      console.warn('[AI管家] 持久化消息失败:', e instanceof Error ? e.message : String(e))
      addMessageLocal(
        'system',
        `⚠ 上一条消息保存失败：${e instanceof Error ? e.message : String(e) || '未知错误'}`
      )
    }
  }

  async function clearMessages(): Promise<void> {
    if (isInitialized.value) {
      try {
        await messageStore.clear()
      } catch (e: unknown) {
        console.warn('[AI管家] 清空消息失败:', e instanceof Error ? e.message : String(e))
        addMessageLocal(
          'system',
          `⚠ 清空聊天记录失败：${e instanceof Error ? e.message : String(e) || '未知错误'}`
        )
        return
      }
    }
    messageLog.value = []
    statusMessageId = null
  }

  async function deleteMessage(index: number): Promise<void> {
    if (index < 0 || index >= messageLog.value.length) return
    let deleteCount = 0
    const removedIds: string[] = []
    for (let i = index; i < messageLog.value.length; i++) {
      const msg = messageLog.value[i]
      if (i > index && msg.type === 'user') {
        break
      }
      deleteCount++
      if (msg.id) removedIds.push(msg.id)
    }
    if (isInitialized.value && removedIds.length > 0) {
      try {
        await messageStore.removeMany(removedIds)
      } catch (e: unknown) {
        console.warn('[AI管家] 删除消息失败:', e instanceof Error ? e.message : String(e))
        addMessageLocal(
          'system',
          `⚠ 删除消息失败：${e instanceof Error ? e.message : String(e) || '未知错误'}`
        )
        return
      }
    }
    messageLog.value.splice(index, deleteCount)
  }

  function cleanup() {
    pendingConfirm.value = null
    removeStatusText()
    void import('./usePlanRunner').then(({ abort }) => {
      abort()
    })
  }

  /**
   * 返回 slash 命令简表，供 AI 不可用时的降级提示使用。
   * 直接从 SLASH_COMMANDS 生成（不再依赖 slash runner 实例）。
   */
  function formatSlashCommands(): string {
    return SLASH_COMMANDS.map((command) => `/${command.slash} — ${command.description}`).join('\n')
  }

  function getContext(): Promise<Context> {
    return import('./usePrecompute').then(({ refreshContext }) => refreshContext())
  }

  function toggleSettings() {
    isSettingsOpen.value = !isSettingsOpen.value
  }

  // ──── 返回值 ────
  return {
    state: {
      get messageLog() {
        return messageLog.value
      },
      get isSettingsOpen() {
        return isSettingsOpen.value
      },
      get commandInputValue() {
        return commandInputValue.value
      },
    },

    aiEngine,

    addMessage: addMessageLocal,
    clearMessages,
    deleteMessage,

    handleSubmit,
    handleNaturalLanguage,
    getContext,
    cleanup,
    toggleSettings,
    initEngine,
    selectModel,

    models: settingsComposable.models,
    activeModelId: settingsComposable.activeModelId,
    getActiveModel: settingsComposable.getActiveModel,
    addModel: settingsComposable.addModel,
    updateModel: settingsComposable.updateModel,
    deleteModel: settingsComposable.deleteModel,
    setDefaultModel: settingsComposable.setDefaultModel,

    commandInputValue,

    pendingConfirm,
  }
}
