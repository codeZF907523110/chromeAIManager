/**
 * AI 浏览器管家 — 主逻辑 Composable
 * 封装所有 AI 引擎、Agent 循环、命令处理的业务逻辑
 */

import { ref } from 'vue'
import type {
  ChatMessage,
  MessageLog,
  AIResponse,
  Context,
  ExecutionResult,
  DisplayMode,
} from '../types'
import {
  MSG_GET_CONTEXT,
  MSG_GET_BOOKMARKS,
  MSG_EXECUTE,
  MSG_SET_DISPLAY_MODE,
  MAX_AGENT_STEPS,
  STEP_TIMEOUT_MS,
  TOTAL_TASK_TIMEOUT_MS,
  MAX_CONSECUTIVE_FAILURES,
  MAX_MESSAGES_COUNT,
} from '../shared/constants'
import { getCommand } from '../shared/commands'
import { SLASH_COMMANDS, matchSlashCommand } from '../sidepanel/command/slash-commands'
import { generateConfirmPreview } from '../sidepanel/command/confirm'
import { AIEngine } from '../sidepanel/ai/engine'
import { buildAgentSystemPrompt } from '../shared/prompts'
import { repairJSON } from '../shared/json-repair'
import { useSettings } from './useSettings'

const SESSION_KEY = 'ai_commander_session'
const MESSAGE_LOG_KEY = 'ai_message_log'

const MAX_PERSISTED_MESSAGES = 50

export interface AgentState {
  messageLog: MessageLog[]
  commandHistory: string[]
  contextCache: Context | null
  isSettingsOpen: boolean
  activeLoopId: string | null
  conversationMessages: ChatMessage[] | null
  planTracker: PlanTracker | null
  lessons: Lesson[]
  lastScreenshot: string | null
  displayMode: DisplayMode
  commandInputValue: string
}

interface PlanStep {
  step: number
  thought: string
  intent: string
  result: string
  status: 'ok' | 'failed'
}

interface PlanTracker {
  goal: string
  currentPlan: string
  steps: PlanStep[]
}

interface Lesson {
  domain: string
  userInput: string
  intent: string
  error: string
  timestamp: number
}

interface ConfirmItem {
  primary: string
  secondary: string
}

interface PendingConfirm {
  title: string
  description?: string
  items: ConfirmItem[]
  onConfirm: () => Promise<void>
  onCancel?: () => void
}

export function useAIEngine() {
  // ──── 子 Composable ────
  const settingsComposable = useSettings()
  const aiEngine = new AIEngine()

  // ──── 状态 ────
  const messageLog = ref<MessageLog[]>([])
  const contextCache = ref<Context | null>(null)
  const contextCacheTime = ref(0)
  const activeLoopId = ref<string | null>(null)
  const conversationMessages = ref<ChatMessage[] | null>(null)
  const planTracker = ref<PlanTracker | null>(null)
  const lessons = ref<Lesson[]>([])
  const lastScreenshot = ref<string | null>(null)
  const displayMode = ref<DisplayMode>('sidepanel')
  const commandInputValue = ref('')
  const isSettingsOpen = ref(false)
  const isInitialized = ref(false)
  const pendingConfirm = ref<PendingConfirm | null>(null)

  // ──── 初始化 AI 引擎 ────

  async function initEngine() {
    await settingsComposable.loadSettings()
    const activeModel = settingsComposable.getActiveModel()
    if (activeModel) {
      aiEngine.setModel(activeModel)
    }
    // 加载持久化的消息
    await loadPersistedMessages()
    // 尝试恢复未完成的会话
    await recoverContext()
    isInitialized.value = true
  }

  /**
   * 恢复上次未完成的任务（5分钟过期）
   */
  async function recoverContext() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      // 5 分钟过期
      if (Date.now() - data.timestamp > 5 * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY)
        return
      }
      if (data.planTracker) {
        const savedPlan = data.planTracker
        const savedLessons = data.lessons || []
        pendingConfirm.value = {
          title: '恢复上次的任务？',
          description: '上次的任务还在进行中，是否要继续？',
          items: [
            {
              primary: savedPlan.stepDescription || '未完成的任务',
              secondary: `${Math.round((Date.now() - data.timestamp) / 1000 / 60)} 分钟前`,
            },
          ],
          onConfirm: async () => {
            planTracker.value = savedPlan
            lessons.value = savedLessons
            addMessage('system', '已恢复上次任务的上下文。请继续告诉我你的需求。')
          },
          onCancel: () => {
            sessionStorage.removeItem(SESSION_KEY)
            addMessage('system', '已放弃上次的任务。')
          },
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * 加载持久化的消息
   */
  async function loadPersistedMessages() {
    try {
      const result = (await chrome.storage.local.get(MESSAGE_LOG_KEY)) as Record<string, unknown>
      const persisted = result[MESSAGE_LOG_KEY] as MessageLog[] | undefined
      if (persisted && Array.isArray(persisted)) {
        messageLog.value = persisted.slice(-MAX_PERSISTED_MESSAGES)
      }
    } catch {
      // ignore
    }
  }

  /**
   * 保存消息到存储
   */
  async function persistMessages() {
    try {
      await chrome.storage.local.set({
        [MESSAGE_LOG_KEY]: messageLog.value.slice(-MAX_PERSISTED_MESSAGES),
      })
    } catch {
      // ignore
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

  // ──── Agent 主循环 ────

  async function agentLoop(userText: string) {
    const loopId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    activeLoopId.value = loopId

    const startTime = Date.now()
    const context = await getContext()

    const pageData = await scanCurrentPage()
    context.pageStructure = (pageData ?? undefined) as unknown as typeof context.pageStructure
    context.recentLessons = lessons.value.slice(-3)

    const systemPrompt = buildAgentSystemPrompt(context)
    let messages: ChatMessage[]

    if (conversationMessages.value) {
      messages = [...conversationMessages.value]
      messages[0] = { role: 'system', content: systemPrompt }
      messages.push({ role: 'user', content: '【用户指令】\n' + userText })
    } else {
      planTracker.value = null
      lessons.value = []
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '【用户指令】\n' + userText },
      ]
    }
    conversationMessages.value = null

    let stepCount = 0
    let consecutiveErrors = 0
    let jsonRetryCount = 0

    addMessage('system', '思考中...')

    while (stepCount < MAX_AGENT_STEPS) {
      if (activeLoopId.value !== loopId) return

      if (Date.now() - startTime > TOTAL_TASK_TIMEOUT_MS) {
        addMessage('system', '任务执行超时（120 秒），已停止。')
        cleanup()
        return
      }

      let raw: string
      try {
        raw = await aiEngine.chatWithHistory(messages, {
          temperature: 0.2,
          maxTokens: 4096,
        })
        console.log('[AI Commander] Raw response:', raw?.slice(0, 500))
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        addMessage('error', `AI 调用失败: ${errorMessage}`)
        cleanup()
        return
      }

      let json: AIResponse | null
      try {
        json = repairJSON(raw)
      } catch {
        json = null
      }

      if (!json?.action) {
        const jsonMatch = raw.match(/\{[\s\S]*"action"[\s\S]*\}/)
        if (jsonMatch) {
          try {
            json = JSON.parse(jsonMatch[0]) as AIResponse
          } catch {
            json = null
          }
        }
      }

      if (!json?.action) {
        jsonRetryCount++
        if (jsonRetryCount >= 2) {
          const rawPreview = raw ? raw.slice(0, 200) + (raw.length > 200 ? '...' : '') : '(空响应)'
          addMessage(
            'error',
            `抱歉，我不太理解您的请求。请尝试用更完整、更具体的方式描述。\n\nAI 返回的内容（前200字符）：${rawPreview}`
          )
          console.error('[AI Commander] AI failed to understand:', raw)
          cleanup()
          return
        }
        console.warn('[AI Commander] JSON parse failed, retry', jsonRetryCount)
        messages.push({ role: 'assistant', content: raw })
        messages.push({
          role: 'user',
          content: '请重新输出，严格按照 JSON 格式，只输出 JSON 对象，不要有其他内容。',
        })
        continue
      }
      jsonRetryCount = 0

      if (json.action === 'done') {
        emitAIChat(json.reply || json.content || '操作完成', true)
        return
      }

      if (json.action === 'ask') {
        messages.push({ role: 'assistant', content: raw })
        conversationMessages.value = [...messages]
        activeLoopId.value = null
        persistPlanTracker()
        emitAIChat(json.reply || json.content || '请提供更多信息', false)
        return
      }

      if (json.action === 'scan') {
        const scanResult = await scanCurrentPage(json.toolCall?.args?.scanFilter as string)
        const scanStr = scanResult
          ? `页面扫描结果(${scanResult.totalCount || scanResult.count}元素): ${JSON.stringify(scanResult)}`
          : '扫描失败'
        messages.push({ role: 'assistant', content: raw })
        messages.push({ role: 'user', content: scanStr })
        addMessage('system', '已重新扫描页面')
        continue
      }

      if (json.action === 'chat') {
        const reply = (json.toolCall?.args?.reply as string) || json.reply || ''
        emitAIChat(reply, false)
        messages.push({ role: 'assistant', content: raw })
        conversationMessages.value = [...messages]
        activeLoopId.value = null
        persistPlanTracker()
        return
      }

      // 处理 execute action（兼容旧格式）
      if (json.action === 'execute' && json.toolCall) {
        json.action = 'exec_tool'
      }

      if (json.action !== 'exec_tool' || !json.toolCall) {
        addMessage('error', `未知 action: ${json.action}`)
        cleanup()
        return
      }

      const toolCall = json.toolCall
      const toolName = toolCall.name

      if (toolName === 'chat') {
        emitAIChat((toolCall.args?.reply as string) || '', true)
        return
      }

      const thought = json.thought || ''
      stepCount++
      addMessage('system', `执行中... (${stepCount}/${MAX_AGENT_STEPS})`)

      let result: ExecutionResult
      try {
        result = await Promise.race([
          executeCommand(toolName, toolCall.args || {}),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('ACT_TIMEOUT')), STEP_TIMEOUT_MS)
          ),
        ])
      } catch {
        result = {
          success: false,
          code: 'ACT_TIMEOUT',
          message: '操作执行超时（10 秒未完成）',
          detail: { reason: '单步操作超过 ' + STEP_TIMEOUT_MS / 1000 + ' 秒' },
        }
      }

      if (result.success === false && result.code === 'NEEDS_CONFIRM') {
        const detail = (result.detail || {}) as Record<string, unknown>
        const confirmItems = (detail.children as Array<{ title?: string; url?: string }>) || []
        const nodeId = detail.nodeId as string | undefined
        const title = detail.title as string | undefined
        cleanup() // 取消任何挂起的操作，再显示新的确认卡
        pendingConfirm.value = {
          title: (result.message as string) || '确认操作',
          description: detail.childCount
            ? `包含 ${detail.childCount} 个子项的文件夹 "${title || ''}"`
            : undefined,
          items: confirmItems.map((c) => ({
            primary: c.title || c.url || '',
            secondary: c.url || '',
          })),
          onConfirm: async () => {
            try {
              const confirmResult = await executeCommand(toolName, {
                ...toolCall.args,
                nodeId,
                force: true,
              })
              if (confirmResult.success !== false) {
                addMessage('system', `✓ 已删除文件夹 "${title || ''}"`)
              } else {
                addMessage('error', confirmResult.error || confirmResult.message || '操作失败')
              }
            } catch (e: unknown) {
              addMessage('error', e instanceof Error ? e.message : String(e))
            }
            cleanup()
          },
          onCancel: () => {
            addMessage('system', `已取消删除 "${title || ''}"`)
            cleanup()
          },
        }
        return
      }

      if (result.success === false && result.code) {
        consecutiveErrors++
      } else if (result.error) {
        consecutiveErrors++
      } else {
        consecutiveErrors = 0
      }

      updatePlanTracker(userText, json.plan, thought, toolName, result)

      if (json.predict && !result.error && !result.code) {
        const mismatch = verifyPredict(json.predict, result)
        if (mismatch) {
          messages.push({ role: 'system', content: mismatch })
        }
      }

      const errMsg = result.code ? `[${result.code}] ${result.message || ''}` : result.error
      if (errMsg) {
        addLesson(userText, toolName, errMsg)
      }

      messages.push({ role: 'assistant', content: raw })
      const sanitized = sanitizeResult(result)
      messages.push({
        role: 'user',
        content: `执行结果(${toolName}): ${JSON.stringify(sanitized)}`,
      })

      if (result.result === undefined) {
        messages.push({
          role: 'system',
          content: '脚本返回 undefined，通常表示脚本里没有写 return。请补上明确的 return 后重试。',
        })
      } else if (result.result === null) {
        messages.push({
          role: 'system',
          content: '脚本返回 null，通常表示选择器未命中目标元素，或脚本主动返回了空值。',
        })
      }

      if ((result.triggered || result.result !== undefined) && !result.error && !result.code) {
        const postScan = await scanCurrentPage()
        if (postScan?.elements?.length) {
          messages.push({
            role: 'system',
            content: `[自动验证] 操作后页面状态(${postScan.totalCount || postScan.count}元素): ${JSON.stringify(postScan)}`,
          })
        }
      }

      if (toolName === 'screenshot' && result.screenshot) {
        lastScreenshot.value = result.screenshot as string
      }

      const stepStatus = !result.error && !result.code ? '✓' : '❌'
      addMessage(
        'system',
        `[${stepCount}] ${stepStatus} 💭 ${thought}\n    ${formatStepSummary(result, toolName)}`
      )

      if (messages.length > MAX_MESSAGES_COUNT) {
        compressMessages(messages)
      }

      if (consecutiveErrors >= MAX_CONSECUTIVE_FAILURES) {
        addMessage('system', `连续 ${consecutiveErrors} 步执行失败，已停止。`)
        cleanup()
        return
      }

      addMessage('system', '思考中...')
    }

    emitAIChat('已达到最大执行步数。任务可能未完成，请继续告诉我下一步。', true)
  }

  // ──── 命令处理 ────

  async function handleSlashCommand(text: string) {
    if (activeLoopId.value || pendingConfirm.value) cleanup()

    const result = matchSlashCommand(text)
    if (!result) {
      return
    }
    if ('error' in result) {
      addMessage(
        'error',
        `未知命令: "${text}"。可用命令: ${SLASH_COMMANDS.map((c) => '/' + c.slash).join(', ')}`
      )
      return
    }

    const { intent, slots } = result
    const slotsAny = slots as Record<string, unknown>
    let resolvedIntent = intent
    if (intent === 'get_theme' && (slotsAny.mode || slotsAny.color)) resolvedIntent = 'set_theme'
    if (intent === 'get_font_size' && slotsAny.size) resolvedIntent = 'set_font_size'
    if (intent === 'get_font_family' && slotsAny.family) resolvedIntent = 'set_font_family'

    if (resolvedIntent === 'show_help') {
      addMessage('system', formatHelp())
      return
    }

    const cmd = getCommand(resolvedIntent)
    if (!cmd) {
      addMessage('error', `未知意图: ${resolvedIntent}`)
      return
    }

    if (cmd.dangerous) {
      const context = await getContext()
      const preview = generateConfirmPreview(resolvedIntent, slotsAny, context)
      if (preview) {
        pendingConfirm.value = {
          title: preview.title,
          description: preview.description,
          items: preview.items,
          onConfirm: async () => {
            await dispatchToSW(resolvedIntent, slotsAny)
            pendingConfirm.value = null // 执行完毕关闭确认卡
          },
          onCancel: () => {
            addMessage('system', '操作已取消')
          },
        }
      } else {
        // 没有预览项时，直接执行（没有危险操作需要确认）
        await dispatchToSW(resolvedIntent, slotsAny)
      }
    } else {
      await dispatchToSW(resolvedIntent, slotsAny)
    }
  }

  async function handleNaturalLanguage(text: string) {
    const ai = await aiEngine.checkAvailability()
    if (!ai.available) {
      addMessage(
        'system',
        `AI 不可用: ${ai.reason || '未配置'}\n\n可用斜杠命令:\n${formatSlashCommands()}`
      )
      return
    }

    if (activeLoopId.value || pendingConfirm.value) {
      cleanup() // 取消挂起的循环和确认对话框
    }

    await agentLoop(text)
  }

  async function handleSubmit(text: string) {
    const trimmedText = text.trim()
    if (!trimmedText) return

    addMessage('user', trimmedText)

    try {
      if (trimmedText.startsWith('/')) {
        await handleSlashCommand(trimmedText)
      } else {
        await handleNaturalLanguage(trimmedText)
      }
    } catch (error) {
      addMessage('error', error instanceof Error ? error.message : String(error))
    }
  }

  // ──── 工具函数 ────

  async function executeCommand(
    intent: string,
    slots: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const cmd = getCommand(intent)
    if (!cmd || cmd.swIntent === null) return { error: `未知命令: ${intent}` }

    try {
      let payload = slots
      if (cmd.requiresPrecompute) {
        payload = await precompute(intent, slots)
      }
      return (await chrome.runtime.sendMessage({
        type: MSG_EXECUTE,
        command: { intent: cmd.swIntent, payload },
      })) as ExecutionResult
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      return {
        success: false,
        code: 'COM_DISCONNECTED',
        message: '命令执行失败: ' + errorMessage,
        detail: { reason: errorMessage },
      }
    }
  }

  async function dispatchToSW(
    userIntent: string,
    slots: Record<string, unknown>
  ): Promise<ExecutionResult | null> {
    const cmd = getCommand(userIntent)
    if (!cmd || cmd.swIntent === null) return null

    let payload = slots
    if (cmd.requiresPrecompute) {
      payload = await precompute(userIntent, slots)
    }

    let response: ExecutionResult
    try {
      response = (await chrome.runtime.sendMessage({
        type: MSG_EXECUTE,
        command: { intent: cmd.swIntent, payload },
      })) as ExecutionResult
    } catch (e: unknown) {
      addMessage('error', `Service Worker 响应失败: ${e instanceof Error ? e.message : String(e)}`)
      return { success: false, code: 'SW_ERROR', message: String(e) }
    }
    renderExecutionResult(userIntent, response)
    return response
  }

  async function precompute(
    intent: string,
    slots: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!contextCache.value?.tabs) {
      contextCache.value = await getContext()
    }
    const { tabs = [] } = contextCache.value ?? {}
    const activeTab = tabs.find((t) => t.active)

    switch (intent) {
      case 'group_tabs': {
        const pattern = slots.pattern?.toString().toLowerCase()
        let filtered = tabs
        if (pattern) {
          filtered = tabs.filter((t) => {
            try {
              return (
                new URL(t.url).hostname.includes(pattern) ||
                (t.title || '').toLowerCase().includes(pattern)
              )
            } catch {
              return false
            }
          })
        }
        return {
          tabIds: filtered.map((t) => t.id),
          title: slots.groupName as string,
          color: slots.color as string,
        }
      }

      case 'close_duplicate_tabs': {
        const seen = new Map<string, number>()
        const dupIds: number[] = []
        for (const t of tabs) {
          const url = (t.url || '').replace(/\/$/, '')
          if (slots.url && !url.includes(slots.url as string)) continue
          if (seen.has(url)) dupIds.push(t.id)
          else seen.set(url, t.id)
        }
        return { tabIds: dupIds }
      }

      case 'close_tabs_by_domain':
      case 'mute_tabs_by_domain':
      case 'unmute_tabs_by_domain':
      case 'discard_tabs': {
        const domain = (slots.domain?.toString() || '').toLowerCase()
        let matches = tabs
        if (slots.all) {
          matches = tabs.filter((t) => !t.pinned)
        } else if (domain) {
          matches = tabs.filter((t) => {
            try {
              return new URL(t.url).hostname.includes(domain)
            } catch {
              return false
            }
          })
        }
        const params: Record<string, unknown> = { tabId: matches[0]?.id }
        if (intent === 'mute_tabs_by_domain') params.muted = true
        if (intent === 'unmute_tabs_by_domain') params.muted = false
        if (intent === 'discard_tabs') params.discarded = true
        return params
      }

      case 'close_other_tabs': {
        return {
          tabIds: tabs.filter((t) => t.id !== activeTab?.id && !t.pinned).map((t) => t.id),
        }
      }

      case 'duplicate_tab': {
        if (!activeTab) return {}
        return {
          url: activeTab.url,
          active: true,
          index: (activeTab.index || 0) + 1,
        }
      }

      case 'sort_tabs': {
        const order = (slots.order as string) || 'domain'
        const sorted = [...tabs].sort((a, b) => {
          if (order === 'title') return (a.title || '').localeCompare(b.title || '')
          const dA = a.url ? new URL(a.url).hostname : ''
          const dB = b.url ? new URL(b.url).hostname : ''
          return dA.localeCompare(dB) || (a.index || 0) - (b.index || 0)
        })
        return { tabIds: sorted.map((t) => t.id), index: 0 }
      }

      case 'pin_tab': {
        if (!activeTab) return {}
        return { tabId: activeTab.id, pinned: !activeTab.pinned }
      }

      case 'reload_tab':
        return { tabId: activeTab?.id, reload: true }

      case 'rename_group': {
        if (!activeTab || activeTab.groupId === -1) return {}
        return { groupId: activeTab.groupId, title: slots.name as string }
      }

      case 'remove_bookmark': {
        if (!slots.query) return {}
        try {
          const results = (await chrome.runtime.sendMessage({
            type: MSG_GET_BOOKMARKS,
            options: { query: slots.query as string },
          })) as unknown[]
          const node = results?.[0] as { id: string } | undefined
          if (!node) return {}
          return { nodeId: node.id }
        } catch {
          return {}
        }
      }

      case 'enable_extension':
      case 'disable_extension':
      case 'uninstall_extension': {
        if (!slots.query) return {}
        try {
          const exts = await chrome.management.getAll()
          const q = (slots.query as string).toLowerCase()
          const match = exts.find((e) => e.id === slots.query || e.name.toLowerCase().includes(q))
          if (!match) return {}
          if (intent === 'enable_extension') return { id: match.id, enabled: true }
          if (intent === 'disable_extension') return { id: match.id, enabled: false }
          return { id: match.id }
        } catch {
          return {}
        }
      }

      default:
        return slots
    }
  }

  const CONTEXT_CACHE_TTL_MS = 30_000 // 30 秒过期

  async function getContext(): Promise<Context> {
    const now = Date.now()
    // 缓存未过期且已有数据则直接返回
    if (contextCache.value && now - contextCacheTime.value < CONTEXT_CACHE_TTL_MS) {
      return contextCache.value
    }
    try {
      contextCache.value = (await chrome.runtime.sendMessage({
        type: MSG_GET_CONTEXT,
        options: { mode: 'detailed' },
      })) as Context
      contextCacheTime.value = now
    } catch (e: unknown) {
      console.warn('[AI管家] 获取上下文失败:', e)
      contextCache.value = { tabs: [], pageStructure: undefined } as unknown as Context
    }
    return contextCache.value!
  }

  async function scanCurrentPage(
    filter?: string
  ): Promise<{ totalCount?: number; count?: number; elements?: unknown[] } | null> {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (!tab?.id) return null
      return (await chrome.tabs.sendMessage(tab.id, {
        type: 'PAGE_SCAN',
        filter,
      })) as { totalCount?: number; count?: number; elements?: unknown[] }
    } catch {
      return null
    }
  }

  async function switchMode(mode: DisplayMode) {
    displayMode.value = mode
    await chrome.storage.local.set({ displayMode: mode })

    if (mode === 'sidepanel') {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'CLOSE_OVERLAY' }, '*')
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        await chrome.sidePanel.open({ windowId: tab.windowId })
      }
      await chrome.runtime.sendMessage({ type: MSG_SET_DISPLAY_MODE, mode })
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/overlay.js'],
        })
      } catch {
        // ignore
      }
      window.close()
      await chrome.runtime.sendMessage({ type: MSG_SET_DISPLAY_MODE, mode })
    }
  }

  // ──── 辅助函数 ────

  function addMessage(type: MessageLog['type'], text: string, image?: string): void {
    messageLog.value.push({ type, text, image })
    if (isInitialized.value) {
      persistMessages()
    }
  }

  function clearMessages(): void {
    messageLog.value = []
    if (isInitialized.value) {
      persistMessages()
    }
  }

  function cleanup() {
    activeLoopId.value = null
    planTracker.value = null
    conversationMessages.value = null
    lessons.value = []
    lastScreenshot.value = null
    pendingConfirm.value = null // 取消挂起的确认对话框
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
  }

  function compressMessages(messages: ChatMessage[]) {
    const systemMsg = messages.find((m) => m.role === 'system')
    const recent = messages.slice(-20)
    messages.length = 0
    if (systemMsg) messages.push(systemMsg)
    messages.push(
      { role: 'system', content: '[已省略中间对话]' },
      ...recent.filter((m) => m.role !== 'system')
    )
  }

  function persistPlanTracker() {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          planTracker: planTracker.value,
          lessons: lessons.value,
          timestamp: Date.now(),
        })
      )
    } catch {
      // ignore
    }
  }

  function updatePlanTracker(
    userGoal: string,
    plan: string | undefined,
    thought: string,
    intent: string,
    result: ExecutionResult
  ) {
    if (!planTracker.value) {
      planTracker.value = {
        goal: userGoal,
        currentPlan: plan || '',
        steps: [],
      }
    }
    if (plan) planTracker.value.currentPlan = plan
    planTracker.value.steps.push({
      step: planTracker.value.steps.length + 1,
      thought,
      intent,
      result: JSON.stringify(result).slice(0, 200),
      status: result.error || result.code ? 'failed' : 'ok',
    })
    if (planTracker.value.steps.length > 20) {
      planTracker.value.steps.shift()
    }
  }

  function addLesson(userInput: string, intent: string, error: string) {
    const domain = contextCache.value?.activeTab?.url
      ? new URL(contextCache.value.activeTab.url).hostname
      : 'unknown'
    lessons.value.push({
      domain,
      userInput: userInput.slice(0, 60),
      intent,
      error: error.slice(0, 100),
      timestamp: Date.now(),
    })
    if (lessons.value.length > 10) {
      lessons.value.shift()
    }
  }

  function verifyPredict(predict: string, result: ExecutionResult): string | null {
    const lowerPredict = predict.toLowerCase()
    const lowerResult = JSON.stringify(result).toLowerCase()
    const keywords = lowerPredict.split(/[\s,，、]+/).filter((k) => k.length > 2)
    if (keywords.length === 0) return null
    const matched = keywords.some((k) => lowerResult.includes(k))
    if (!matched) {
      return `⚠ 预测不匹配。预测: "${predict}" | 实际: ${JSON.stringify(result)}。请重新评估。`
    }
    return null
  }

  function sanitizeResult(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj
    if (typeof obj === 'string') {
      return obj.length > 500 ? obj.slice(0, 200) + `...[截断, 原长 ${obj.length} 字符]` : obj
    }
    if (typeof obj !== 'object') return obj

    const seen = new WeakSet()
    try {
      const str = JSON.stringify(obj, (key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]'
          seen.add(val)
        }
        if (/data[_]?url|screenshot/i.test(key)) return undefined
        if (typeof val === 'string' && val.length > 500) {
          return val.slice(0, 200) + `...[截断, 原长 ${val.length} 字符]`
        }
        return val
      })
      return JSON.parse(str)
    } catch {
      return { _error: 'serialization failed', _keys: Object.keys(obj as object) }
    }
  }

  function formatStepSummary(result: ExecutionResult, _toolName: string): string {
    const r = result as Record<string, unknown>
    if (r.code === 'NEEDS_CONFIRM') return `⚠️ ${r.message}`
    if (r.code) return `[${r.code}] ${r.message || '操作失败'}`
    if (r.error) return `失败: ${typeof r.error === 'object' ? JSON.stringify(r.error) : r.error}`
    // DOM 脚本结果
    if (r.result !== undefined) {
      if (r.result === null) return '脚本结果: null（通常表示未命中元素）'
      const s = typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
      return '脚本结果: ' + s.slice(0, 100)
    }
    // Tabs
    if (r.tabs) return `列出 ${r.observed || (r.tabs as unknown[]).length} 个标签`
    if (r.tab && r.active !== undefined)
      return r.active
        ? `切换到标签 *${(r.tab as { title?: string }).title || ''}*`
        : `更新标签 *${(r.tab as { title?: string }).title || ''}*`
    if (r.tab)
      return `创建标签 *${(r.tab as { title?: string }).title || (r.tab as { url?: string }).url || ''}*`
    if (r.moved !== undefined) return `移动 ${r.moved} 个标签`
    if (r.removed !== undefined) return `关闭 ${r.removed} 个标签`
    if (r.groupedTabs) return `创建分组 *${r.title || r.groupName}* (${r.groupedTabs} 个标签)`
    if (r.groupId && !r.groupedTabs) return `更新分组 *${r.title || r.groupId}*`
    if (r.ungrouped !== undefined) return `取消 ${r.ungrouped} 个分组`
    if (r.groups) return `列出 ${(r.groups as unknown[]).length} 个标签组`
    if (r.reloaded) return '刷新标签'
    if (r.pinned !== undefined) return r.pinned ? '固定标签' : '取消固定'
    if (r.discarded !== undefined) return `休眠 ${r.discarded} 个标签`
    if (r.duplicated !== undefined) return '复制标签'
    // Bookmarks
    if (r.nodes) return `观察到 ${r.observed || (r.nodes as unknown[]).length} 个书签节点`
    if (r.movedNode)
      return `移动 ${(r.movedNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.movedNode as { title: string }).title}*`
    if (r.createdNode)
      return `创建 ${(r.createdNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.createdNode as { title: string }).title}*`
    if (r.existingNode)
      return `目标已存在，复用 ${(r.existingNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.existingNode as { title: string }).title}*`
    if (r.updatedNode)
      return `更新 ${(r.updatedNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.updatedNode as { title: string }).title}*`
    if (r.openedNode) return `打开书签 *${(r.openedNode as { title: string }).title}*`
    if (r.removedNode)
      return `删除 ${(r.removedNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.removedNode as { title: string }).title}*`
    if (r.bookmark) return `添加书签 *${(r.bookmark as { title: string }).title}*`
    // Windows
    if (r.windows) return `列出 ${(r.windows as unknown[]).length} 个窗口`
    if (r.window) return '创建窗口'
    // History
    if (r.items) return `搜索到 ${r.found} 条历史`
    if (r.deleted !== undefined && r.timeRange) return `删除 ${r.deleted} 条历史 (${r.timeRange})`
    if (r.deleted !== undefined) return `删除 ${r.deleted} 条记录`
    // Navigation
    if (r.navigated) return `导航至 ${r.navigated}`
    if (r.dataUrl) return '截图已捕获'
    // Page
    if (r.zoomFactor !== undefined) return `缩放至 ${Math.round((r.zoomFactor as number) * 100)}%`
    if (r.opened) return '打开下载页面'
    // Theme
    if (r.themeMode !== undefined) return `主题: ${r.themeMode}`
    // Font
    if (r.fontSize !== undefined) return `字号: ${r.fontSizeLabel || r.fontSize + 'px'}`
    if (r.font) return `字体: ${r.font}`
    // Cookies
    if (r.cookies) return `查看 ${r.found || 0} 个 Cookie (${r.domain})`
    if (r.domain && r.deleted !== undefined) return `清除 ${r.domain} 的 ${r.deleted} 个 Cookie`
    // Top Sites
    if (r.sites) return `展示 ${r.found || 0} 个常用网站`
    // Extensions
    if (r.extensions) return `列出 ${r.found || 0} 个扩展`
    if (r.id && r.enabled !== undefined) return r.enabled ? '启用扩展' : '禁用扩展'
    if (r.id && (r as { uninstalled?: string }).uninstalled) return `卸载扩展`
    // Permissions
    if (r.permissions) return `查看 ${r.domain} 的权限设置`
    if (r.setting && r.value) return `设置 ${r.domain} 的 ${r.setting} 权限`
    // Storage
    if (r.key && r.value !== undefined)
      return `存储 *${r.key}* = ${typeof r.value === 'object' ? JSON.stringify(r.value) : r.value}`
    if (r.storageRemoved) return `删除存储 *${r.storageRemoved}*`
    // Recording
    if (r.recording) return `开始录制 ${r.recording}`
    if (r.saved) return `录制已保存为 ${r.saved}`
    if (r.stopped) return '录制已停止'
    // Sessions
    if (r.restored) return `恢复标签 ${r.restored}`
    // Batch
    if (r.results && r.total !== undefined) return `批量执行 ${r.total} 个操作`
    // 旧格式兼容
    if (r.action === 'query') return `查询 ${r.count} 个 "${r.value || r.selector || '元素'}"`
    if (r.action === 'modify')
      return `修改 ${r.changed} 个 "${r.value || r.selector}" 的 ${r.property}`
    if (r.action === 'remove') return `删除 ${r.removed} 个 "${r.value || r.selector}"`
    if (r.action === 'add') return `添加 <${r.tag}> 到 ${r.target || r.parentSelector || 'body'}`
    if (r.action === 'style') return `修改 ${r.changed} 个 "${r.value || r.selector}" 样式`
    if (r.action === 'event') {
      const evLabels: Record<string, string> = {
        click: '点击',
        input: '输入',
        focus: '聚焦',
        blur: '失焦',
        submit: '提交表单',
        change: '变更',
        scroll: '滚动',
        select: '全选',
        keydown: '按键',
        keyup: '抬起',
      }
      return `${evLabels[r.eventType as string] || r.eventType} "${r.value || r.selector}"${r.eventValue ? ' -> ' + r.eventValue : ''}`
    }
    if (r.enabled) return `启用扩展 *${r.enabled}*`
    if (r.disabled) return `禁用扩展 *${r.disabled}*`
    if (r.moved && r.to) return `移动 *${r.moved}* → ${r.to}`
    if (r.reordered) return `调整 *${r.reordered}* 位置`
    if (r.sortedBookmarks) return `整理 *${r.folder}* 中 ${r.sortedBookmarks} 个书签`
    if ((r.folder as { title?: string })?.title)
      return `创建文件夹 *${(r.folder as { title: string }).title}*`
    if (r.renamed && r.to) return `重命名 *${r.renamed}* -> *${r.to}*`
    if (r.renamed) return `重命名 *${r.renamed}*`
    return JSON.stringify(result).slice(0, 100)
  }

  function formatHelp(): string {
    return (
      '可用命令:\n\n' +
      SLASH_COMMANDS.map(
        (c) =>
          `  /${c.slash}${c.hasArg ? ' <' + (c.placeholder || '参数') + '>' : ''}  —  ${c.description}`
      ).join('\n')
    )
  }

  function formatSlashCommands(): string {
    return SLASH_COMMANDS.map((c) => '/' + c.slash + ' — ' + c.description).join('\n')
  }

  function renderExecutionResult(intent: string, response: unknown) {
    const result = response as ExecutionResult
    if (result.success === false && result.code) {
      addMessage('error', `[${result.code}] ${result.message || '操作失败'}`)
      return
    }
    if (result.error) {
      addMessage('error', result.error as string)
      return
    }

    const r = result as Record<string, unknown>

    // 截图：显示图片并自动复制到剪贴板
    if (r.screenshot && typeof r.screenshot === 'string') {
      showScreenshot(r.screenshot, r.tabTitle as string | undefined)
      return
    }
    // 截图摘要（agent loop 步骤中显示）
    else if (r.dataUrl) {
      // 已在 agent loop 中通过 lastScreenshot + emitAIChat 处理，此处仅作兜底摘要
    }

    let text = '操作完成'

    // intent 感知覆盖
    if (intent === 'sort_tabs' && r.moved) text = `已按域名排序 ${r.moved} 个标签`
    else if (intent === 'pin_tab') {
      const tab = r.tab as { pinned?: boolean } | undefined
      text = tab?.pinned ? '已固定标签' : '已取消固定'
    } else if (intent === 'reload_tab') text = '已刷新'
    else if (intent === 'rename_group') text = r.title ? `已重命名分组: ${r.title}` : '已重命名分组'
    else if (intent === 'duplicate_tab') text = '标签已复制'
    else if (intent === 'mute_tabs_by_domain' && r.tab) text = '已静音'
    else if (intent === 'unmute_tabs_by_domain' && r.tab) text = '已取消静音'
    else if (intent === 'discard_tabs' && r.tab) text = '已休眠'
    else if (intent === 'remove_bookmark') text = '已删除书签'
    else if (intent === 'clear_cookies') text = 'Cookie 已清理'
    else if (intent === 'close_duplicate_tabs' && r.removed) text = `已关闭 ${r.removed} 个重复标签`
    else if (intent === 'close_tabs_by_domain' && r.removed) text = `已关闭 ${r.removed} 个标签`
    else if (intent === 'close_other_tabs' && r.removed) text = `已关闭 ${r.removed} 个标签`
    // 通用结果类型
    else if (r.closed) text = `已为你关闭 ${r.closed} 个标签页`
    else if (r.focused) text = `已切换到: ${(r.focused as { title?: string }).title || ''}`
    else if (r.found && r.bookmarks)
      text = `为你找到 ${r.found} 个书签:\n${(r.bookmarks as Array<{ title: string; url: string }>).map((b) => `  ${b.title} — ${b.url}`).join('\n')}`
    else if (r.items)
      text = `为你找到 ${r.found || (r.items as unknown[]).length} 条历史记录:\n${(
        r.items as Array<{
          lastVisitTime?: number
          title?: string
          url: string
          visitCount?: number
        }>
      )
        .map((it) => {
          const time = it.lastVisitTime ? new Date(it.lastVisitTime).toLocaleString('zh-CN') : ''
          return `  ${it.title}\n    ${it.url}${time ? '\n    ' + time : ''}${it.visitCount ? ' · 访问 ' + it.visitCount + ' 次' : ''}`
        })
        .join('\n')}`
    else if (r.cookies)
      text = `为你找到 ${r.found} 个 Cookie (${r.domain}):\n${(r.cookies as Array<{ name: string; value: string; secure?: boolean; httpOnly?: boolean; sameSite?: string }>).map((c) => `  ${c.name} = ${c.value}${c.secure ? ' [安全]' : ''}${c.httpOnly ? ' [HttpOnly]' : ''}${c.sameSite ? ' SameSite=' + c.sameSite : ''}`).join('\n')}`
    else if (r.sites)
      text = `为你展示最常访问的 ${r.found} 个网站:\n${(r.sites as Array<{ title: string; url: string }>).map((s, i) => `  ${i + 1}. ${s.title} — ${s.url}`).join('\n')}`
    else if (r.extensions)
      text = `为你找到 ${r.found} 个扩展:\n${(r.extensions as Array<{ enabled: boolean; name: string; id: string; description?: string }>).map((e) => `  ${e.enabled ? '✓' : '✗'} ${e.name} (${e.id.slice(0, 12)}...)${e.description ? '\n    ' + e.description : ''}`).join('\n')}`
    else if (r.enabled) text = `已为你启用扩展 "${r.enabled}"`
    else if (r.disabled) text = `已为你禁用扩展 "${r.disabled}"`
    else if (r.uninstalled) text = `已为你卸载扩展 "${r.uninstalled}"`
    else if (r.permissions) {
      const labels: Record<string, string> = { allow: '允许', block: '阻止', default: '默认' }
      text = `为你查看 ${r.domain} 的权限设置:\n${Object.entries(
        r.permissions as Record<string, string>
      )
        .map(([k, v]) => `  ${k}: ${labels[v] || v}`)
        .join('\n')}`
    } else if (r.setting && r.value !== undefined) {
      const label: Record<string, string> = { allow: '允许', block: '阻止', default: '默认' }
      text = `已将 ${r.domain} 的 ${r.setting} 权限设置为 ${label[r.value as string] || r.value}`
    } else if (r.key && r.value !== undefined)
      text = `存储 "${r.key}" = ${typeof r.value === 'object' ? JSON.stringify(r.value) : r.value}`
    else if (r.found) text = `为你找到 ${r.found} 条结果`
    else if (r.sorted) text = `已按 ${r.order} 排序 ${r.sorted} 个标签`
    else if (r.groupedTabs)
      text = `已创建分组 "${r.title || r.groupName}"，包含 ${r.groupedTabs} 个标签`
    else if (r.ungrouped) text = `已取消 ${r.ungrouped} 个标签的分组`
    else if (r.restored) text = `已恢复: ${r.restored}`
    else if (r.navigated) text = `已导航至 ${r.navigated}`
    else if (r.muted) text = `已静音 ${r.muted} 个标签`
    else if (r.pinned !== undefined) text = r.pinned ? '已固定标签' : '已取消固定'
    else if (r.reloaded) text = '已刷新'
    else if (r.duplicated) text = '标签已复制'
    else if (r.removed) text = `已删除 ${r.removed} 个书签`
    else if (r.storageRemoved) text = `已删除存储键 "${r.storageRemoved}"`
    else if (r.bookmark)
      text = `已添加书签: ${(r.bookmark as { title: string; folder?: string }).title}${r.bookmark && (r.bookmark as { folder?: string }).folder ? ` → ${(r.bookmark as { folder?: string }).folder}` : ''}`
    else if (r.opened) text = `已打开: ${r.opened}`
    else if (r.reordered) text = `已将 "${r.reordered}" 调整到第 ${r.index} 位`
    else if (r.moved && r.to) text = `已将 "${r.moved}" 移动到 ${r.to}`
    else if (r.moved !== undefined) text = `标签已移到位置 ${((r.index as number) || 0) + 1}`
    else if (r.discarded) text = `已休眠 ${r.discarded} 个标签`
    else if (r.unmuted) text = `已取消静音 ${r.unmuted} 个标签`
    else if (r.zoom !== undefined) text = `缩放: ${Math.round((r.zoom as number) * 100)}%`
    else if (r.windowId) text = '新窗口已打开'
    else if (r.domain && r.deleted !== undefined)
      text = `已为你清除 ${r.domain} 的 ${r.deleted} 个 Cookie`
    else if (typeof r.deleted === 'string') text = `已删除文件夹 "${r.deleted}"`
    else if (r.deleted)
      text = `已清理 ${r.deleted} 条${r.timeRange ? ` (${r.timeRange})` : ''}历史记录`
    else if (r.timeRange) text = `已清除${r.timeRange === 'all' ? '全部' : ''}历史记录`
    else if (r.groupsCreated !== undefined)
      text =
        (r.groupsCreated as number) > 0
          ? `已创建 ${r.groupsCreated} 个分组`
          : '当前页面暂无需要分组'
    else if (r.groups)
      text = `为你找到 ${r.total} 个分组:\n${(r.groups as Array<{ title?: string; count: number; tabs: Array<{ title?: string }> }>).map((g) => `  ${g.title || '未命名'} (${g.count} 个标签)\n    ${g.tabs.map((t) => t.title).join(' · ')}`).join('\n')}`
    else if (r.renamed && r.to) text = `已将文件夹 "${r.renamed}" 重命名为 "${r.to}"`
    else if (r.renamed) text = `已重命名分组: ${r.renamed}`
    else if (r.sortedBookmarks) text = `已整理 "${r.folder}" 中的 ${r.sortedBookmarks} 个书签`
    else if ((r.folder as { title?: string })?.title)
      text = `已创建书签文件夹 "${(r.folder as { title: string }).title}"`
    else if (r.applied) text = (r.message as string) || '设置已生效'
    else if (r.darkMode !== undefined) text = r.darkMode ? '夜间模式已开启' : '夜间模式已关闭'
    else if (r.themeMode) {
      const modeLabel: Record<string, string> = { light: '浅色', dark: '深色', device: '跟随设备' }
      text = `当前主题模式: ${modeLabel[r.themeMode as string] || r.themeMode}`
    } else if (r.fontSize && r.fontSizeLabel)
      text = `当前字号: ${r.fontSizeLabel} (${r.fontSize}px)`
    else if ((r.fonts as { standard?: string } | undefined)?.standard) {
      const f = r.fonts as { standard?: string; serif?: string; sansSerif?: string; fixed?: string }
      text = `当前字体设置:\n标准: ${f.standard || '-'}\n衬线: ${f.serif || '-'}\n无衬线: ${f.sansSerif || '-'}\n等宽: ${f.fixed || '-'}`
    } else if (r.fontSize) text = `字号: ${r.fontSize}`
    else if (r.font) text = `字体: ${r.font}`
    else if (r.recording) text = (r.message as string) || `已开始录制 ${r.recording}`
    else if (r.saved) text = `录制已保存为 ${r.saved}`
    else if (r.stopped) text = '录制已停止'
    else if (r.message && typeof r.message === 'string') text = r.message
    else if (r.action === 'query')
      text = `找到 ${r.count} 个匹配元素:\n${(r.items as Array<{ index: number; text?: string; html?: string }>).map((it) => `  [${it.index}] ${it.text || it.html || ''}`).join('\n')}`
    else if (r.action === 'modify') text = `已修改 ${r.changed} 个 "${r.value}" 的 ${r.property}`
    else if (r.action === 'remove') text = `已删除 ${r.removed} 个元素`
    else if (r.action === 'add') text = `已添加 <${r.tag}>`
    else if (r.action === 'style') text = `已修改 ${r.changed} 个元素样式`
    else if (r.action === 'event') {
      const evLabels: Record<string, string> = {
        click: '点击',
        input: '输入',
        focus: '聚焦',
        blur: '失焦',
        submit: '提交表单',
        change: '变更',
        scroll: '滚动',
        select: '全选',
        keydown: '按键',
        keyup: '抬起',
        dblclick: '双击',
      }
      text = `已对 "${r.value}" 触发 ${evLabels[r.eventType as string] || r.eventType} 事件`
    }

    addMessage('ai-chat', text)
  }

  /**
   * 显示截图并复制到剪贴板（供 slash command 路径使用）
   */
  function showScreenshot(dataUrl: string, tabTitle?: string) {
    addMessage('ai-chat', `[截图: ${tabTitle || '页面'}]`, dataUrl)
    copyScreenshotToClipboard(dataUrl)
  }

  /**
   * 发送 AI 对话消息，自动附带待处理的截图。
   * 保证文字和截图在同一个气泡中显示。
   */
  function emitAIChat(text: string, doCleanup: boolean) {
    const image = lastScreenshot.value
    if (image) {
      copyScreenshotToClipboard(image)
      lastScreenshot.value = null
    }
    addMessage('ai-chat', text, image || undefined)
    if (doCleanup) cleanup()
  }

  /**
   * 将 data URL 截图复制到剪贴板
   */
  async function copyScreenshotToClipboard(dataUrl: string) {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      console.log('[AI管家] 截图已复制到剪贴板')
    } catch (err) {
      console.warn('[AI管家] 复制截图失败:', err)
    }
  }

  function mdToHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
  }

  function toggleSettings() {
    console.log('[DEBUG] toggleSettings called, current:', isSettingsOpen.value)
    isSettingsOpen.value = !isSettingsOpen.value
    console.log('[DEBUG] toggleSettings after:', isSettingsOpen.value)
  }

  // ──── 返回值 ────
  return {
    state: {
      get messageLog() {
        return messageLog.value
      },
      get displayMode() {
        return displayMode.value
      },
      get isSettingsOpen() {
        return isSettingsOpen.value
      },
      get activeLoopId() {
        return activeLoopId.value
      },
      get conversationMessages() {
        return conversationMessages.value
      },
      get planTracker() {
        return planTracker.value
      },
      get lessons() {
        return lessons.value
      },
      get lastScreenshot() {
        return lastScreenshot.value
      },
      get commandInputValue() {
        return commandInputValue.value
      },
    },

    // AI 引擎
    aiEngine,

    // 消息
    addMessage,
    clearMessages,

    // 方法
    handleSubmit,
    handleSlashCommand,
    handleNaturalLanguage,
    agentLoop,
    executeCommand,
    dispatchToSW,
    getContext,
    scanCurrentPage,
    switchMode,
    cleanup,
    mdToHtml,
    renderExecutionResult,
    toggleSettings,
    initEngine,
    selectModel,

    // 模型管理
    models: settingsComposable.models,
    activeModelId: settingsComposable.activeModelId,
    getActiveModel: settingsComposable.getActiveModel,
    addModel: settingsComposable.addModel,
    updateModel: settingsComposable.updateModel,
    deleteModel: settingsComposable.deleteModel,
    setDefaultModel: settingsComposable.setDefaultModel,

    // 命令输入值
    commandInputValue,

    // 确认对话框
    pendingConfirm,
  }
}
