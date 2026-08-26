/**
 * AI 浏览器管家 — 主逻辑 Composable
 * 封装所有 AI 引擎、Agent 循环、命令处理的业务逻辑
 */

import { ref, watch, onScopeDispose } from 'vue'
import type {
  ChatMessage,
  MessageLog,
  AIResponse,
  Context,
  ExecutionResult,
  Lesson,
  PlanTracker,
  MessageBody,
} from '../types'
import {
  MSG_GET_CONTEXT,
  MSG_GET_BOOKMARKS,
  MSG_EXECUTE,
  MAX_AGENT_STEPS,
  STEP_TIMEOUT_MS,
  TOTAL_TASK_TIMEOUT_MS,
  MAX_CONSECUTIVE_FAILURES,
  MAX_MESSAGES_COUNT,
} from '../shared/constants'
import { getCommand } from '../shared/commands'
import { SLASH_COMMANDS, matchSlashCommand } from '../shared/slash-commands'
import { generateConfirmPreview } from '../shared/confirm'
import { AIEngine } from '../shared/ai/engine'
import { buildAgentSystemPrompt } from '../shared/prompts'
import { repairJSON } from '../shared/json-repair'
import { wrapCatReply } from '../shared/personality'
import { buildMarkdownBody } from '../shared/block-renderers'
import { useSettings } from './useSettings'
import { createRecordingExecutor } from '../recording/executor'

const SESSION_KEY = 'ai_commander_session'
const MESSAGE_LOG_KEY = 'ai_message_log'

const MAX_PERSISTED_MESSAGES = MAX_MESSAGES_COUNT

// ConfirmItem 和 PendingConfirm 是内部配置类型，保留本地定义
interface ConfirmItem {
  primary: string
  secondary: string
  /** tabId，用于 checkbox 多选时携带回执。undefined 表示不可单独选中（如说明性条目） */
  tabId?: number
  /** 初始是否选中（默认 true 表示"即将关闭"） */
  selected?: boolean
}

interface PendingConfirm {
  title: string
  description?: string
  items: ConfirmItem[]
  /**
   * 当用户通过 checkbox 选择不同条目后再确认时，回调会接收到最终选中的 tabIds。
   * 不传则表示"全选不可干预"，使用 items 中所有 tabId。
   */
  onConfirm?: (selectedTabIds: number[]) => Promise<void>
  onCancel?: () => void
}

export function useAIEngine() {
  // ──── 子 Composable ────
  const settingsComposable = useSettings()
  const aiEngine = new AIEngine()

  // ──── 状态 ────
  const messageLog = ref<MessageLog[]>([])
  const contextCache = ref<Context | null>(null)
  const activeLoopId = ref<string | null>(null)
  const conversationMessages = ref<ChatMessage[] | null>(null)
  const planTracker = ref<PlanTracker | null>(null)
  const lessons = ref<Lesson[]>([])
  const lastScreenshot = ref<string | null>(null)
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

    // 监听模型变化，自动同步到 aiEngine（解决删除当前模型后的引用问题）
    watch(
      () => settingsComposable.activeModelId.value,
      (newId) => {
        const model = settingsComposable.models.value.find((m) => m.id === newId)
        if (model) aiEngine.setModel(model)
      }
    )
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
              primary: savedPlan.goal || '未完成的任务',
              secondary: `${Math.round((Date.now() - data.timestamp) / 1000 / 60)} 分钟前`,
            },
          ],
          onConfirm: async (_selectedTabIds: number[]) => {
            planTracker.value = savedPlan
            lessons.value = savedLessons
            // 恢复对话上下文（agentLoop 中检查 conversationMessages 非空则复用）
            if (data.conversationMessages) {
              conversationMessages.value = data.conversationMessages as ChatMessage[]
            }
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
  /**
   * 把持久化记录反序列化为 MessageLog。
   *
   * 兼容两种历史形态：
   *   - 老数据 text: string（无 markdown / components）
   *   - 新数据 text: MessageBody = { markdown, components? }
   *
   * 损坏或形状不符的记录降级为 system + 空 markdown 气泡，避免组件渲染崩。
   */
  function normalizePersistedMessage(raw: unknown): MessageLog | null {
    if (!raw || typeof raw !== 'object') return null
    const m = raw as Partial<MessageLog> & { text?: unknown }
    let text: MessageBody
    if (typeof m.text === 'string') {
      text = { markdown: m.text }
    } else if (
      m.text &&
      typeof m.text === 'object' &&
      'markdown' in (m.text as object) &&
      typeof (m.text as { markdown: unknown }).markdown === 'string'
    ) {
      text = m.text as MessageBody
    } else {
      return null
    }
    if (!text.markdown.trim() && !m.image && !m.video && !m.recordingFile) return null
    const validTypes: MessageLog['type'][] = ['user', 'system', 'ai', 'ai-chat', 'error']
    const type = validTypes.includes(m.type as MessageLog['type'])
      ? (m.type as MessageLog['type'])
      : 'system'
    return { type, text, image: m.image, video: m.video, recordingFile: m.recordingFile }
  }

  async function loadPersistedMessages() {
    try {
      const result = (await chrome.storage.local.get(MESSAGE_LOG_KEY)) as Record<string, unknown>
      const persisted = result[MESSAGE_LOG_KEY] as unknown[] | undefined
      if (persisted && Array.isArray(persisted)) {
        messageLog.value = persisted
          .slice(-MAX_PERSISTED_MESSAGES)
          .map(normalizePersistedMessage)
          .filter((message): message is MessageLog => message !== null)
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
    } catch (e: unknown) {
      console.warn('[AI管家] 持久化消息失败:', e instanceof Error ? e.message : String(e))
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

  // Agent loop 当前活动的 AbortController（用于立即停止按钮）
  let abortController: AbortController | null = null

  async function agentLoop(userText: string) {
    const loopId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    activeLoopId.value = loopId
    abortController = new AbortController()

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

    try {
      while (stepCount < MAX_AGENT_STEPS) {
        if (activeLoopId.value !== loopId) return

        if (Date.now() - startTime > TOTAL_TASK_TIMEOUT_MS) {
          addMessage('system', '任务执行超时（120 秒），已停止。')
          cleanup()
          return
        }

        let raw: string
        try {
          // 根据最后一条 assistant 消息的 action 决定 temperature：工具调用用 0.1（严格），闲聊/首轮用 1.2（宽松）
          const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
          // 匹配所有工具调用 action：browser_* / tabs_* / bookmarks_* 等前缀，以及 task_plan / navigate / screenshot / batch / scan / exec_plan / askUserResponse / done / exec_tool / execute
          const isToolCall =
            lastAssistantMsg &&
            /"action"\s*:\s*"(browser_|tabs_|bookmarks_|history_|windows_|storage_|permissions_|extensions_|theme_|font_|download_|session_|top_sites_|task_plan|navigate|screenshot|batch|scan|exec_plan|askUserResponse|done|exec_tool|execute)"/.test(
              lastAssistantMsg.content
            )
          raw = await aiEngine.chatWithHistory(messages, {
            temperature: isToolCall ? 0.1 : 1.2,
            maxTokens: 4096,
            signal: abortController?.signal,
          })
          // AI 响应已返回，再次检查是否被中途停止（网络请求发出后无法取消，但返回后可以中断处理）
          if (activeLoopId.value !== loopId) {
            console.log('[AI Commander] Agent loop stopped during AI call, aborting')
            addMessage('system', '已停止当前任务')
            cleanup()
            return
          }
          console.log('[AI Commander] Raw response:', raw?.slice(0, 500))
          console.log('[AI Commander] Raw response type:', typeof raw, 'length:', raw?.length)
        } catch (e: unknown) {
          // 停止时可能抛出 AbortError 或其他中断异常，静默忽略
          if (activeLoopId.value !== loopId) {
            console.log('[AI Commander] Agent loop stopped during AI call (exception path)')
            return
          }
          const msg = e instanceof Error ? e.message : String(e)
          if (msg === 'NO_AI_BACKEND') {
            addMessage('system', 'AI 服务未配置，请在设置中添加 API Key 或使用 Gemini Nano')
          } else {
            addMessage('system', '抱歉，AI 服务暂时不可用，请稍后再试喵~')
          }
          cleanup()
          return
        }

        if (!raw || raw.trim() === '') {
          console.error('[AI Commander] AI returned empty response!')
          addMessage('system', '抱歉，AI 没有返回任何内容，请重新输入试试喵~')
          cleanup()
          return
        }

        let json: AIResponse | null
        try {
          json = repairJSON(raw)
          console.log('[AI Commander] Parsed JSON action:', json?.action)
          console.log('[AI Commander] Parsed JSON args:', JSON.stringify(json?.args))
        } catch {
          json = null
          console.error('[AI Commander] repairJSON failed')
        }

        if (!json?.action) {
          const jsonMatch = raw.match(/\{[\s\S]*"action"[\s\S]*\}/)
          if (jsonMatch) {
            try {
              json = JSON.parse(jsonMatch[0]) as AIResponse
              console.log('[AI Commander] Fallback parsed JSON action:', json?.action)
            } catch {
              json = null
              console.error('[AI Commander] Fallback parse also failed')
            }
          }
        }

        if (!json?.action) {
          jsonRetryCount++
          if (jsonRetryCount >= 2) {
            addMessage('system', '抱歉，我没有理解您的请求，能再详细说说吗喵？')
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
          emitAIChat(resolveAIReply(json, '操作完成'), true)
          return
        }

        if (json.action === 'ask') {
          messages.push({ role: 'assistant', content: raw })
          conversationMessages.value = [...messages]
          activeLoopId.value = null
          persistPlanTracker()
          emitAIChat(resolveAIReply(json, '请提供更多信息'), false)
          return
        }

        if (json.action === 'scan') {
          const scanResult = await scanCurrentPage((json.args?.scanFilter as string) || undefined)
          const scanStr = scanResult
            ? `页面扫描结果(${scanResult.totalCount || scanResult.count}元素): ${JSON.stringify(scanResult)}`
            : '扫描失败'
          messages.push({ role: 'assistant', content: raw })
          messages.push({ role: 'user', content: scanStr })
          addMessage('system', '已重新扫描页面')
          continue
        }

        // 处理 exec_plan：任务规划执行器（analyze → scan → setPlan → executeStep循环 → finalReview）
        if (json.action === 'exec_plan') {
          stepCount++
          addMessage('system', `执行中... (${stepCount}/${MAX_AGENT_STEPS})`)

          const args =
            ((json as unknown as Record<string, unknown>).args as Record<string, unknown>) || {}
          const planAction = (args.action || json.toolCall?.args?.action) as string
          const planArgs = {
            action: planAction,
            userText: args.userText ?? json.toolCall?.args?.userText,
            providedData: args.providedData ?? json.toolCall?.args?.providedData,
            steps: args.steps ?? json.toolCall?.args?.steps,
            planStatus: args.planStatus ?? json.toolCall?.args?.planStatus,
            userDataKey: args.userDataKey ?? json.toolCall?.args?.userDataKey,
            userDataValue: args.userDataValue ?? json.toolCall?.args?.userDataValue,
            reason: args.reason ?? json.toolCall?.args?.reason,
          }

          let planResult: Record<string, unknown>
          try {
            planResult = (await Promise.race([
              executeCommand('task_plan', planArgs),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('PLAN_TIMEOUT')), 30000)
              ),
            ])) as Record<string, unknown>
          } catch {
            planResult = { success: false, error: '任务规划执行超时（30秒）' }
          }

          const phase = planResult.phase as string

          // ASK_USER：暂停执行，向用户展示提示
          if (planResult.askUserPrompt) {
            const prompt = planResult.askUserPrompt as string
            messages.push({ role: 'assistant', content: raw })
            messages.push({
              role: 'user',
              content: `[步骤暂停] ${prompt}`,
            })
            addMessage('system', `需要用户提供数据: ${prompt}`)
            conversationMessages.value = [...messages]
            activeLoopId.value = null
            persistPlanTracker()
            return
          }

          // 分析意图结果
          if (planAction === 'analyze') {
            if (planResult.success) {
              messages.push({ role: 'assistant', content: raw })
              messages.push({
                role: 'user',
                content: `[阶段①完成] 意图分析结果:\n目标: ${(planResult.intent as Record<string, unknown>)?.goal}\n类型: ${(planResult.intent as Record<string, unknown>)?.type}\n状态: ${planResult.phase}\n请继续执行下一阶段：scan`,
              })
              addMessage('system', '意图分析完成')
              continue
            } else {
              // 需要用户数据，中断
              messages.push({ role: 'assistant', content: raw })
              messages.push({
                role: 'user',
                content: `[阶段①中断] ${planResult.error}\n请提供所需数据后重新发起任务`,
              })
              addMessage('system', `需要您提供一些信息才能继续，请告诉我更多信息喵~`)
              cleanup()
              return
            }
          }

          // 扫描结果
          if (planAction === 'scan') {
            if (planResult.success) {
              const scan = planResult.scan as Record<string, unknown> | undefined
              messages.push({ role: 'assistant', content: raw })
              messages.push({
                role: 'user',
                content: `[阶段②完成] DOM 扫描结果:\n页面: ${scan?.url}\n标题: ${scan?.title}\n可交互元素: ${(scan?.elements as unknown[])?.length || 0}个\n${scan?.regions ? JSON.stringify(scan.regions) : ''}\n请继续执行阶段③：setPlan，提供步骤序列`,
              })
              addMessage('system', '页面扫描完成')
              continue
            } else {
              messages.push({ role: 'assistant', content: raw })
              messages.push({ role: 'user', content: `[阶段②失败] ${planResult.error}` })
              addMessage('system', '扫描页面时遇到了一点问题，请再试一次喵~')
              cleanup()
              return
            }
          }

          // 步骤序列设置
          if (planAction === 'setPlan') {
            messages.push({ role: 'assistant', content: raw })
            messages.push({
              role: 'user',
              content: `[阶段③完成] 计划已就绪，共 ${planResult.totalSteps} 个步骤:\n${((planResult.steps as Array<Record<string, unknown>>) || []).map((s, i) => `${i + 1}. ${s.goal}`).join('\n')}\n请继续执行阶段④：executeStep`,
            })
            addMessage('system', `计划已就绪，共 ${planResult.totalSteps} 个步骤`)
            continue
          }

          // 执行步骤结果
          if (planAction === 'executeStep') {
            const stepResults = planResult.stepResults as Array<Record<string, unknown>> | undefined
            const lastResult = stepResults?.[stepResults.length - 1]
            const status = lastResult?.status as string
            const stepIndex = planResult.currentStep as number
            const total = planResult.totalSteps as number

            let statusIcon = '⏳'
            let statusText = `执行中 (${stepIndex}/${total})`

            if (status === 'SUCCESS') {
              statusIcon = '✓'
              statusText = `步骤完成 (${stepIndex}/${total})`
            } else if (status === 'SKIP') {
              statusIcon = '⊘'
              statusText = `步骤跳过 (${stepIndex}/${total})`
            } else if (status === 'FAIL') {
              statusIcon = '✗'
              statusText = `步骤失败 (${stepIndex}/${total})`
            }

            let detail = `${statusIcon} ${lastResult?.goal || '步骤'} - ${statusText}`
            if (lastResult?.failureAnalysis) {
              detail += `\n原因: ${lastResult.failureAnalysis}`
            }
            if (lastResult?.verification) {
              detail += `\n验证: ${JSON.stringify(lastResult.verification)}`
            }

            if (phase === 'FINAL_REVIEW' || stepIndex >= total) {
              // 全部步骤执行完毕，执行最终审查
              messages.push({ role: 'assistant', content: raw })
              messages.push({
                role: 'user',
                content: `[阶段④完成] ${detail}\n请执行阶段⑤：finalReview`,
              })
              addMessage('system', '所有步骤执行完毕，进入最终审查')
              continue
            }

            messages.push({ role: 'assistant', content: raw })
            messages.push({
              role: 'user',
              content: `[阶段④进行中] ${detail}\n请继续调用 executeStep 执行下一步`,
            })
            addMessage('system', statusText)
            continue
          }

          // 最终审查结果
          if (planAction === 'finalReview') {
            const report = planResult.finalReport as Record<string, unknown> | undefined
            messages.push({ role: 'assistant', content: raw })
            const completionText = report?.taskComplete
              ? `✓ 任务完成！${report.completionSign}`
              : `✗ 任务未完全完成。${report?.completionSign}`
            const summary = report?.stepsSummary as Record<string, number> | undefined
            messages.push({
              role: 'user',
              content: `[阶段⑤完成] ${completionText}\n步骤统计: 成功 ${summary?.success || 0}，跳过 ${summary?.skipped || 0}，失败 ${summary?.failed || 0}\n${report?.userCanDo}`,
            })
            addMessage('system', report?.taskComplete ? '任务完成' : '任务部分完成')
            cleanup()
            return
          }

          // getState / abort 等，直接返回结果
          messages.push({ role: 'assistant', content: raw })
          messages.push({
            role: 'user',
            content: `[task_plan ${planAction}] ${JSON.stringify(planResult)}`,
          })
          continue
        }

        // askUserResponse：用户填入数据后继续执行
        if (json.action === 'askUserResponse') {
          const dataKey = (json as unknown as Record<string, unknown>).userDataKey as
            string | undefined
          const dataValue = (json as unknown as Record<string, unknown>).userDataValue as unknown
          if (dataKey) {
            messages.push({
              role: 'user',
              content: `[用户提供数据] ${dataKey}: ${String(dataValue)}`,
            })
            messages.push({
              role: 'user',
              content: `已收到用户提供的数据，请继续调用 executeStep 继续执行任务`,
            })
            addMessage('system', `已接收用户数据: ${dataKey}`)
          }
          continue
        }

        if (json.action === 'chat') {
          emitAIChat(resolveAIReply(json, ''), false)
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

        // 提取工具名和参数：优先扁平格式，兼容旧 toolCall 格式
        let toolName: string
        let toolArgs: Record<string, unknown>
        const actionStr = json.action as string

        if (
          actionStr.startsWith('browser_') ||
          actionStr.startsWith('tabs_') ||
          actionStr.startsWith('bookmarks_') ||
          actionStr.startsWith('history_') ||
          actionStr.startsWith('windows_') ||
          actionStr.startsWith('storage_') ||
          actionStr.startsWith('permissions_') ||
          actionStr.startsWith('extensions_') ||
          actionStr.startsWith('theme_') ||
          actionStr.startsWith('font_') ||
          actionStr.startsWith('download_') ||
          actionStr.startsWith('session_') ||
          actionStr.startsWith('top_sites_') ||
          actionStr === 'task_plan' ||
          actionStr === 'navigate' ||
          actionStr === 'screenshot' ||
          actionStr === 'batch'
        ) {
          // 扁平格式：action 直接是工具名
          toolName = actionStr
          toolArgs = (json.args as Record<string, unknown>) || {}
        } else if (actionStr === 'exec_tool' || actionStr === 'done' || actionStr === 'ask') {
          // 旧格式：使用 toolCall
          if (!json.toolCall) {
            messages.push({ role: 'assistant', content: raw })
            messages.push({
              role: 'user',
              content: `上一步缺少 toolCall 参数。请重新输出 JSON，例如 {"action":"exec_tool","toolCall":{"name":"tabs_create","args":{"url":"..."}}}`,
            })
            continue
          }
          toolName = json.toolCall.name
          toolArgs = json.toolCall.args || {}
        } else {
          addMessage('system', '抱歉，这个操作我无法执行喵~')
          cleanup()
          return
        }

        if (toolName === 'chat') {
          // 老 toolCall 格式：args.reply 是 string
          const reply = toolArgs?.reply
          emitAIChat(typeof reply === 'string' ? reply : '', true)
          return
        }

        const thought = json.thought || ''
        stepCount++
        addMessage('system', `执行中... (${stepCount}/${MAX_AGENT_STEPS})`)

        let result: ExecutionResult
        try {
          result = await Promise.race([
            executeCommand(toolName, toolArgs),
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
          const confirmItems =
            (Array.isArray(detail.children)
              ? (detail.children as Array<{ title?: string; url?: string; id?: string | number }>)
              : []) || []
          const nodeId = detail.nodeId as string | undefined
          const title = detail.title as string | undefined
          cleanup()
          pendingConfirm.value = {
            title: (result.message as string) || '确认操作',
            description:
              detail.childCount != null
                ? `包含 ${detail.childCount} 个子项的文件夹 "${title || ''}"`
                : undefined,
            items: confirmItems.map((c) => {
              const numericId =
                typeof c.id === 'number'
                  ? c.id
                  : typeof c.id === 'string'
                    ? Number(c.id)
                    : undefined
              return {
                primary: c.title || c.url || '',
                secondary: c.url || '',
                // numericId 为 NaN 或 0 时，tabId 留 undefined → 不可单独勾选
                // （典型情况：history_remove 的 id 是 URL 字符串，转 Number 会是 NaN）
                tabId:
                  numericId !== undefined && Number.isFinite(numericId) && numericId > 0
                    ? numericId
                    : undefined,
                selected: true,
              }
            }),
            onConfirm: async (selectedTabIds: number[]) => {
              try {
                console.log(
                  '[AI Commander] Confirm called, toolName:',
                  toolName,
                  'nodeId:',
                  nodeId,
                  'json.args:',
                  JSON.stringify(json.args),
                  'selected:',
                  selectedTabIds
                )
                // 把用户勾选后的子集 ID 回传到 SW。
                // children 的 id 可能是 string（书签节点、history URL）或 number（tabId）；
                // 这里按 intent 类型归一化到对应字段，避免 SW 端做错类型转换。
                //   - bookmarks_remove_node: selectedIds (string)
                //   - history_remove: selectedUrls (string)
                //   - tabs_remove: selectedTabIds 顶层数组直接复用（已经是 number[]）
                const extraPayload: Record<string, unknown> = {}
                if (toolName === 'history_remove') {
                  extraPayload.selectedUrls = selectedTabIds.map((id) => String(id))
                } else if (toolName === 'bookmarks_remove_node') {
                  extraPayload.selectedIds = selectedTabIds
                } else if (toolName === 'tabs_remove') {
                  extraPayload.tabIds = selectedTabIds
                } else {
                  // 兜底：透传 selectedIds，让对应 SW 实现自行决定如何消费
                  extraPayload.selectedIds = selectedTabIds
                }
                const confirmResult = await executeCommand(toolName, {
                  ...(json.args ?? {}),
                  nodeId,
                  force: true,
                  ...extraPayload,
                })
                console.log('[AI Commander] Confirm result:', confirmResult)
                if (confirmResult.success !== false) {
                  renderExecutionResult(toolName, confirmResult)
                } else {
                  addMessage('system', '抱歉，这个操作没有成功喵~')
                }
              } catch (e: unknown) {
                addMessage('system', '抱歉，执行过程中遇到了一点问题喵~')
              }
              cleanup()
            },
            onCancel: () => {
              // 用 ai-chat 通道返回"已取消"，让 AI 看起来在主动回应用户意图；
              // system 通道虽然语义更准，但会让用户感觉"AI 没说话"，体验差。
              addMessage('ai-chat', wrapCatReply('好嘞，已帮你取消啦~'))
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
        const resultContent = `执行结果(${toolName}): ${JSON.stringify(sanitized)}`
        console.log(
          '[AI Commander] Tool result:',
          toolName,
          'success:',
          result.success,
          'code:',
          result.code,
          'message:',
          result.message
        )
        messages.push({
          role: 'user',
          content: resultContent,
        })

        if (result.result === undefined) {
          messages.push({
            role: 'system',
            content:
              '脚本返回 undefined，通常表示脚本里没有写 return。请补上明确的 return 后重试。',
          })
        } else if (result.result === null) {
          messages.push({
            role: 'system',
            content: '脚本返回 null，通常表示选择器未命中目标元素，或脚本主动返回了空值。',
          })
        }

        if ((result.triggered || result.result !== undefined) && !result.error && !result.code) {
          // 根据工具类型进行针对性验证
          if (toolName === 'tabs_move' || toolName === 'tabs_group_by_domain') {
            // 标签页移动/分组后，验证新状态
            const verifyResult = await executeCommand('tabs_observe', { maxResults: 10 })
            const tabList = verifyResult.success
              ? (verifyResult as Record<string, unknown>).tabs
              : undefined
            if (Array.isArray(tabList)) {
              messages.push({
                role: 'system',
                content: `[验证] 标签页状态已更新，当前可见标签: ${tabList.length} 个`,
              })
            }
          } else if (toolName === 'bookmarks_move_node' || toolName === 'bookmarks_create_node') {
            // 书签操作后，验证新状态
            const verifyResult = await executeCommand('bookmarks_observe_tree', { maxResults: 20 })
            const nodeList = verifyResult.success
              ? (verifyResult as Record<string, unknown>).nodes
              : undefined
            if (Array.isArray(nodeList)) {
              messages.push({
                role: 'system',
                content: `[验证] 书签操作完成，当前书签节点: ${nodeList.length} 个`,
              })
            }
          } else if (result.triggered || result.result !== undefined) {
            // 其他操作，扫描页面状态
            const postScan = await scanCurrentPage()
            if (postScan?.elements?.length) {
              messages.push({
                role: 'system',
                content: `[自动验证] 操作后页面状态(${postScan.totalCount || postScan.count}元素): ${JSON.stringify(postScan)}`,
              })
            }
          }
        }

        if (
          (toolName === 'screenshot' || toolName === 'browser_take_screenshot') &&
          result.screenshot
        ) {
          lastScreenshot.value = result.screenshot as string
        }

        const stepStatus = !result.error && !result.code ? '✓' : '❌'
        addMessage(
          'system',
          `[${stepCount}] ${stepStatus} 💭 ${thought}\n    ${formatStepSummary(result, toolName)}`
        )

        // 如果执行失败，用友好提示告知用户
        if (result.code || result.error) {
          const errorMsg = result.code
            ? `操作「${result.message || '失败'}」`
            : `操作失败: ${result.error}`
          addMessage('system', `抱歉，上一步执行遇到问题: ${errorMsg}喵~`)
        }

        // 更早压缩消息，避免系统 prompt（含页面 DOM）+ 历史消息超过 token 限制
        if (messages.length > 15) {
          compressMessages(messages)
        }

        if (consecutiveErrors >= MAX_CONSECUTIVE_FAILURES) {
          addMessage('system', `连续 ${consecutiveErrors} 步执行失败，已停止。`)
          cleanup()
          return
        }

        addMessage('system', '思考中...')
      }

      emitAIChat(
        '已达到最大执行步数（' +
          MAX_AGENT_STEPS +
          ' 步），任务可能未完成。请告诉我下一步该做什么喵~',
        true
      )
    } catch {
      addMessage('system', `抱歉，执行过程中遇到了问题喵~`)
      cleanup()
    }
  }

  // ──── 命令处理 ────

  async function handleSlashCommand(text: string) {
    if (activeLoopId.value || pendingConfirm.value) cleanup()

    const result = matchSlashCommand(text)
    if (!result) {
      // 不是斜杠命令：交给自然语言路径（不会到这里）
      return
    }
    if ('error' in result) {
      // 错误回执：必须用 ai-chat 通道，让用户感觉 AI 在主动回应；
      // system 通道虽然语义更准，但会让用户觉得"AI 没说话"
      const errResult = result as { error?: string; hint?: string }
      if (errResult.error === 'MISSING_ARG' && errResult.hint) {
        addMessage('ai-chat', wrapCatReply(errResult.hint))
      } else {
        addMessage('ai-chat', wrapCatReply('没认出来这个命令呢，要不试试 /help 看看有哪些可用的？'))
      }
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

    if (resolvedIntent === 'clear_chat') {
      clearMessages()
      return
    }

    if (resolvedIntent === 'reset_context') {
      cleanup()
      addMessage('ai-chat', wrapCatReply('已清除全部上下文，可以重新开始对话啦~'))
      return
    }

    const cmd = getCommand(resolvedIntent)
    if (!cmd) {
      // 已通过 matchSlashCommand 校验 intent 名，不会走到这里；但保留兜底
      addMessage('ai-chat', wrapCatReply('没认出来这个命令呢，要不试试 /help 看看有哪些可用的？'))
      return
    }

    if (cmd.dangerous) {
      // 危险命令预览需要最新 tab 状态，强制刷新缓存（避免 30s 缓存导致预览与实际状态不一致）
      contextCache.value = await getContext()
      const preview = generateConfirmPreview(resolvedIntent, slotsAny, contextCache.value)
      // 没有匹配到任何标签时，preview 为 null。
      // 用 ai-chat 通道返回，让结果进入消息气泡流；AI 看起来像"正常回复"，
      // 不会出现"AI 没反应"的错觉。
      if (!preview) {
        // 危险命令没有匹配项时，给出针对性提示。
        // ungroup_all: 当前没有分组
        // close_*: 关键词没匹配到
        let msg: string
        if (resolvedIntent === 'ungroup_all') {
          msg = '当前没有任何标签分组呢'
        } else {
          const keyword = (slotsAny.query as string) || '当前条件'
          msg = `没找到匹配 "${keyword}" 的标签呢，要不换个关键词试试？`
        }
        addMessage('ai-chat', wrapCatReply(msg))
        return
      }
      pendingConfirm.value = {
        title: preview.title,
        description: preview.description,
        items: preview.items,
        onConfirm: async (selectedTabIds: number[]) => {
          try {
            // ungroup_all 的 checkbox 项里 tabId 字段实际是 groupId（confirm.ts 里用 tabId 字段复用）
            // 走 selectedGroupIds 字段传给 SW；其他命令走 tabIds
            if (resolvedIntent === 'ungroup_all') {
              if (selectedTabIds.length > 0) {
                await dispatchToSW(resolvedIntent, {
                  ...slotsAny,
                  force: true,
                  selectedGroupIds: selectedTabIds,
                })
              } else {
                await dispatchToSW(resolvedIntent, { ...slotsAny, force: true })
              }
            } else if (selectedTabIds.length > 0) {
              await dispatchToSW(resolvedIntent, {
                ...slotsAny,
                force: true,
                tabIds: selectedTabIds,
              })
            } else {
              await dispatchToSW(resolvedIntent, { ...slotsAny, force: true })
            }
          } finally {
            // 不论成功失败都关闭确认卡，避免 SW 异常时弹窗卡住
            pendingConfirm.value = null
          }
        },
        onCancel: () => {
          // 用 ai-chat 通道返回"已取消"，让 AI 看起来在主动回应用户意图；
          // system 通道虽然语义更准，但会让用户感觉"AI 没说话"，体验差。
          addMessage('ai-chat', wrapCatReply('好嘞，已帮你取消啦~'))
          pendingConfirm.value = null // 关闭确认卡
        },
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

    if (trimmedText.startsWith('/')) {
      addMessage('user', trimmedText)
      try {
        await handleSlashCommand(trimmedText)
      } catch (error) {
        addMessage('system', '抱歉，处理命令时遇到了问题喵~')
      }
    } else {
      addMessage('user', trimmedText)
      try {
        await handleNaturalLanguage(trimmedText)
      } catch (error) {
        addMessage('system', '抱歉，处理您的请求时遇到了问题喵~')
      }
    }
  }

  // ──── 工具函数 ────

  async function executeCommand(
    intent: string,
    slots: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const cmd = getCommand(intent)
    if (!cmd) return { error: `未知命令: ${intent}` }

    // 客户端命令（录制等）：本地处理
    if (cmd.clientIntent) {
      if (cmd.clientIntent === 'record_screen') return await recordingExecutor.start('screen')
      if (cmd.clientIntent === 'stop_recording') return await recordingExecutor.stop()
      return {
        success: false,
        code: 'UNKNOWN_CLIENT_INTENT',
        message: `未知客户端命令: ${cmd.clientIntent}`,
      }
    }

    if (cmd.swIntent === null) return { error: `该命令不可执行: ${intent}` }

    try {
      let payload = slots
      if (cmd.requiresPrecompute) {
        // 用 spread 合并：precompute 的字段（如 tabIds）覆盖 slots 同名 key，
        // 但保留 slots 里的控制字段（如 force: true），否则 SW 端 DANGEROUS_INTENTS
        // 会再次拦截并返回 NEEDS_CONFIRM，导致确认弹窗后标签仍不关闭。
        payload = { ...slots, ...(await precompute(intent, slots)) }
      }
      console.log(
        '[AI Commander] Sending command:',
        intent,
        '->',
        cmd.swIntent,
        'payload:',
        JSON.stringify(payload)
      )
      return (await chrome.runtime.sendMessage({
        type: MSG_EXECUTE,
        command: { intent: cmd.swIntent, payload },
      })) as ExecutionResult
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      console.error('[AI Commander] Command execution error:', intent, errorMessage)
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
    if (!cmd) return null

    // 客户端命令：本地处理（与 executeCommand 共享同一路径）
    if (cmd.clientIntent) {
      return await executeCommand(userIntent, slots)
    }

    if (cmd.swIntent === null) return null

    let payload = slots
    if (cmd.requiresPrecompute) {
      // 每次执行前强制刷新 tabs 缓存，避免 30s TTL 导致用户操作后看不到最新状态
      contextCache.value = await getContext()
      // 用 spread 合并：precompute 的字段（如 tabIds）覆盖 slots 同名 key，
      // 但保留 slots 里的控制字段（如 force: true），否则 SW 端 DANGEROUS_INTENTS
      // 会再次拦截并返回 NEEDS_CONFIRM，导致确认弹窗后标签仍不关闭。
      payload = { ...slots, ...(await precompute(userIntent, slots)) }
    }

    let response: ExecutionResult
    try {
      response = (await chrome.runtime.sendMessage({
        type: MSG_EXECUTE,
        command: { intent: cmd.swIntent, payload },
      })) as ExecutionResult
    } catch (e: unknown) {
      addMessage('system', '抱歉，Service Worker 暂时无法响应喵~')
      return { success: false, code: 'SW_ERROR', message: String(e) }
    }
    await renderExecutionResult(userIntent, response, slots)
    return response
  }

  async function precompute(
    intent: string,
    slots: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // 缓存由 dispatchToSW 入口强制刷新，这里直接读取最新值
    const { tabs = [] } = contextCache.value ?? {}
    const activeTab = tabs.find((t) => t.active)

    switch (intent) {
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

      // close_tabs_by_url：precompute 这里不做任何事，SW 端的 tabs_remove_by_url
      // 自己按 query/domain/url 字段模糊匹配 tabs。这里必须返回 slots 原样，
      // 让 force 等控制字段透传给 SW。
      case 'close_tabs_by_url':
        return slots

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

      // ungroup_all：把 tabs 按 groupId 分桶，SW 端只把用户勾选的那几个分组带过去
      case 'ungroup_all': {
        const selectedGroupIds = Array.isArray(slots.selectedGroupIds)
          ? (slots.selectedGroupIds as unknown[])
              .map((g) => Number(g))
              .filter((g) => Number.isFinite(g))
          : null
        const groupMap = new Map<number, number[]>()
        for (const t of tabs) {
          if (t.id === undefined) continue
          if (t.groupId === undefined || t.groupId === -1) continue
          if (selectedGroupIds && !selectedGroupIds.includes(t.groupId)) continue
          if (!groupMap.has(t.groupId)) groupMap.set(t.groupId, [])
          groupMap.get(t.groupId)!.push(t.id)
        }
        const result: Record<string, unknown> = { tabIds: [] }
        for (const [, ids] of groupMap) {
          ;(result.tabIds as number[]).push(...ids)
        }
        return result
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
        // 实时拉取当前 active tab，避免缓存中 pinned 状态过期导致 toggle 错位
        // (例如刚 pin 完又 /pin，会用旧 pinned=true 算出 pinned=false，反而取消固定)
        let isPinned = activeTab.pinned
        try {
          const liveTab = await chrome.tabs.get(activeTab.id!)
          isPinned = !!liveTab.pinned
        } catch {
          // tab 已不存在就用缓存值
        }
        return { tabId: activeTab.id, pinned: !isPinned }
      }

      case 'reload_tab':
        return { tabId: activeTab?.id, reload: true }

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

  async function getContext(): Promise<Context> {
    try {
      contextCache.value = (await chrome.runtime.sendMessage({
        type: MSG_GET_CONTEXT,
        options: { mode: 'detailed' },
      })) as Context
    } catch (e: unknown) {
      console.warn('[AI管家] 获取上下文失败:', e)
      // 失败时保留旧缓存，避免一次性错误把全部功能打挂
      if (!contextCache.value) {
        contextCache.value = { tabs: [], pageStructure: undefined } as unknown as Context
      }
    }
    return contextCache.value!
  }

  async function scanCurrentPage(
    _filter?: string
  ): Promise<{ totalCount?: number; count?: number; elements?: unknown[] } | null> {
    // 使用新的 browser_snapshot 工具替代已移除的 PAGE_SCAN
    try {
      const result = await executeCommand('browser_snapshot', {
        maxElements: 200,
        includeIframes: true,
      } as Record<string, unknown>)
      if (result.success && result.result) {
        const snap = result.result as {
          nodes?: Array<{ ref: string; role: string; name: string }>
          url?: string
          title?: string
        }
        const elements = snap?.nodes?.map((n, i) => ({
          index: i,
          tag: n.role || 'element',
          text: n.name || '',
          attrs: { ref: n.ref },
        }))
        return {
          totalCount: snap?.nodes?.length || 0,
          count: snap?.nodes?.length || 0,
          elements,
        }
      }
    } catch {
      // snapshot 失败时静默处理
    }
    return null
  }

  // ──── 辅助函数 ────

  /**
   * 结果字段解析 → 通用描述模板
   *
   * 用于 agent loop 步骤日志（formatStepSummary）和 markdown-factory 未覆盖时的 fallback。
   */
  function formatResultDescription(r: Record<string, unknown>): string {
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
    if (r.dataUrl && !r.stopped && !r.pendingRecording) return '截图已捕获'
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
    if (r.recording === 'screen') return `开始录制屏幕`
    if (r.recording) return `开始录制 ${r.recording}`
    if (r.saved) return `录制已保存为 ${r.saved}`
    if (r.stopped) {
      const size = r.size as number | undefined
      return size ? `录制已停止 (${(size / 1024 / 1024).toFixed(1)}MB)` : '录制已停止'
    }
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
    return JSON.stringify(r).slice(0, 100)
  }

  /**
   * 把字符串 / MessageBody 规范化为 MessageBody
   * 字符串 → { markdown }；对象透传
   *
   * 第一版一次性切完：所有调用点必须传入 MessageBody 或 string，
   * addMessage 内部归一化，不存在"老 string 兼容入口"。
   */
  function normalizeBody(text: string | MessageBody): MessageBody {
    return typeof text === 'string' ? { markdown: text } : text
  }

  function addMessage(
    type: MessageLog['type'],
    text: string | MessageBody,
    image?: string,
    video?: string,
    recordingFile?: MessageLog['recordingFile']
  ): void {
    const body = normalizeBody(text)
    console.log(
      '[AI Commander] addMessage called, type:',
      type,
      'markdown length:',
      body.markdown.length,
      'components:',
      body.components?.length ?? 0
    )
    messageLog.value.push({ type, text: body, image, video, recordingFile })
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

  function deleteMessage(index: number): void {
    if (index >= 0 && index < messageLog.value.length) {
      // 删除整条会话：从用户消息开始，删除所有后续消息直到下一个用户消息
      let deleteCount = 0
      for (let i = index; i < messageLog.value.length; i++) {
        const msg = messageLog.value[i]
        // 如果遇到用户消息，停止删除（不删除后续的用户消息）
        if (i > index && msg.type === 'user') {
          break
        }
        deleteCount++
      }
      messageLog.value.splice(index, deleteCount)
      if (isInitialized.value) {
        persistMessages()
      }
    }
  }

  function cleanup() {
    activeLoopId.value = null
    planTracker.value = null
    conversationMessages.value = null
    lessons.value = []
    lastScreenshot.value = null
    pendingConfirm.value = null // 取消挂起的确认对话框
    // 立即中断当前 AI 请求（用户点停止按钮时调用）
    if (abortController) {
      try {
        abortController.abort(new Error('USER_STOPPED'))
      } catch {
        // ignore
      }
      abortController = null
    }
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
  }

  function compressMessages(messages: ChatMessage[]) {
    const systemMsg = messages.find((m) => m.role === 'system')
    // 保留最近 10 条交互消息（压缩前 messages.length 可能达 15+）
    const recent = messages.slice(-10)
    messages.length = 0
    if (systemMsg) messages.push(systemMsg)
    messages.push(
      { role: 'system', content: '[已省略中间对话]' },
      ...recent.filter((m) => m.role !== 'system')
    )
  }

  function persistPlanTracker() {
    try {
      // 压缩对话上下文并保存（供下次恢复）
      let savedConversation: ChatMessage[] | null = null
      if (conversationMessages.value) {
        const compressed: ChatMessage[] = []
        const sysMsg = conversationMessages.value.find((m) => m.role === 'system')
        const recent = conversationMessages.value.slice(-20).filter((m) => m.role !== 'system')
        if (sysMsg) compressed.push(sysMsg)
        compressed.push({ role: 'system', content: '[已省略中间对话]' })
        compressed.push(...recent)
        savedConversation = compressed
      }
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          planTracker: planTracker.value,
          lessons: lessons.value,
          conversationMessages: savedConversation,
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

  /**
   * Agent loop 步骤日志摘要（紧凑格式）
   */
  function formatStepSummary(result: ExecutionResult, _toolName: string): string {
    return formatResultDescription(result as Record<string, unknown>)
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

  async function renderExecutionResult(
    intent: string,
    response: unknown,
    slots?: Record<string, unknown>
  ) {
    // 预留给后续 markdown factory 按命令参数定制文案
    void slots
    const result = response as ExecutionResult
    if (result.success === false && result.code) {
      // 失败提示：用 ai-chat 通道，让用户感觉 AI 在主动回应，
      // 而不是冷冰冰的系统消息
      const message = result.message || '失败'
      const suggestion = result.suggestion ? `（${result.suggestion}）` : ''
      addMessage(
        'ai-chat',
        wrapCatReply(`抱歉，操作 "${message}" 失败喵${suggestion ? ' ' + suggestion : ''}`)
      )
      return
    }
    if (result.error) {
      addMessage('ai-chat', wrapCatReply('抱歉，操作失败了喵~'))
      return
    }

    const r = result as Record<string, unknown>

    // 客户端执行路径：chrome.tabs.group 在 MV3 SW 上下文会被静默挂起
    // （SW 不是用户激活的上下文）。SW 把分组数据准备好后返回 clientExec 标志，
    // 我们在 side panel（用户激活上下文）里直接调 API。
    if (r.clientExec === 'tabs_group_by_domain' && Array.isArray(r.groups)) {
      const groups = r.groups as Array<{ title: string; tabIds: number[]; windowId: number }>
      let created = 0
      const failed: Array<{ title: string; reason: string }> = []
      console.log('[clientExec] 收到分组数据:', groups.length, '个组', groups)
      for (const g of groups) {
        console.log(
          '[clientExec] 调用 chrome.tabs.group:',
          'title=',
          g.title,
          'windowId=',
          g.windowId,
          'tabIds=',
          g.tabIds
        )
        try {
          // 先验证每个 tab 还存在（避免无效 id 导致 API 抛错）
          const validIds: number[] = []
          for (const id of g.tabIds) {
            try {
              await chrome.tabs.get(id)
              validIds.push(id)
            } catch {
              // tab 已不存在
            }
          }
          if (validIds.length < 2) {
            failed.push({ title: g.title, reason: '有效 tab 数 < 2' })
            continue
          }
          // chrome.tabs.group 的 options 参数不接受 title/color（这两个是 tabGroups.update 的属性）。
          // 创建分组后必须再调 chrome.tabGroups.update 来设置标题。
          const resultGroupId = await chrome.tabs.group({
            tabIds: validIds,
            createProperties: { windowId: g.windowId },
          })
          // 单独设置分组标题
          try {
            await chrome.tabGroups.update(resultGroupId, { title: g.title })
          } catch (e) {
            console.warn('[clientExec] 设置分组标题失败:', g.title, e)
          }
          console.log('[clientExec] 分组成功:', g.title, 'groupId=', resultGroupId)
          created++
        } catch (e: unknown) {
          const reason = e instanceof Error ? e.message : String(e)
          console.warn('[clientExec] 创建分组失败:', g.title, 'err=', reason)
          failed.push({ title: g.title, reason })
        }
      }
      if (created > 0) {
        let msg = `已创建 ${created} 个分组`
        if (failed.length > 0)
          msg += `（${failed.length} 个失败: ${failed.map((f) => `${f.title}(${f.reason})`).join(', ')}）`
        addMessage('ai-chat', wrapCatReply(msg))
      } else {
        addMessage(
          'ai-chat',
          wrapCatReply(
            failed.length > 0
              ? `分组失败: ${failed.map((f) => `${f.title}(${f.reason})`).join('; ')}`
              : '没有需要分组的标签'
          )
        )
      }
      return
    }

    // 客户端执行路径：ungroup_all 同样在用户激活上下文（side panel）执行
    if (r.clientExec === 'tabs_ungroup_all' && Array.isArray(r.groups)) {
      const groups = r.groups as Array<{ groupId: number; tabIds: number[] }>
      let cleared = 0
      const failed: Array<{ groupId: number; reason: string }> = []
      console.log('[clientExec] 收到 ungroup 数据:', groups.length, '个组')
      for (const g of groups) {
        try {
          // 验证每个 tab 仍然存在
          const validIds: number[] = []
          for (const id of g.tabIds) {
            try {
              await chrome.tabs.get(id)
              validIds.push(id)
            } catch {
              // tab 已不存在
            }
          }
          if (validIds.length === 0) {
            failed.push({ groupId: g.groupId, reason: '组内 tab 都不存在' })
            continue
          }
          await chrome.tabs.ungroup(validIds)
          cleared++
        } catch (e: unknown) {
          const reason = e instanceof Error ? e.message : String(e)
          console.warn('[clientExec] ungroup 失败:', g.groupId, 'err=', reason)
          failed.push({ groupId: g.groupId, reason })
        }
      }
      if (cleared > 0) {
        let msg = `已取消 ${cleared} 个分组`
        if (failed.length > 0) msg += `（${failed.length} 个失败）`
        addMessage('ai-chat', wrapCatReply(msg))
      } else {
        addMessage(
          'ai-chat',
          wrapCatReply(
            failed.length > 0
              ? `取消分组失败: ${failed.map((f) => f.reason).join('; ')}`
              : '当前没有任何标签分组'
          )
        )
      }
      return
    }

    // 截图：显示图片并自动复制到剪贴板
    if (r.screenshot && typeof r.screenshot === 'string') {
      showScreenshot(r.screenshot, r.tabTitle as string | undefined)
      return
    }
    // 录制停止请求已发出，文件由 recordingExecutor 直接渲染下载卡
    if (r.stopped) {
      return
    }
    // 截图摘要（agent loop 步骤中显示）
    else if (r.dataUrl) {
      // 已在 agent loop 中通过 lastScreenshot + emitAIChat 处理，此处仅作兜底摘要
    }

    // 先按用户 intent 处理所有 tabs_update 语义，不能仅凭返回的 tab 字段猜成“创建”。
    if (intent === 'pin_tab') {
      const pinned = (r.tab as { pinned?: boolean } | undefined)?.pinned
      addMessage('ai-chat', { markdown: wrapCatReply(pinned ? '已固定标签' : '已取消固定') })
      return
    }
    if (intent === 'reload_tab') {
      addMessage('ai-chat', { markdown: wrapCatReply('已刷新当前标签') })
      return
    }
    if (intent === 'mute_tabs_by_domain') {
      addMessage('ai-chat', { markdown: wrapCatReply('已静音匹配的标签') })
      return
    }
    if (intent === 'unmute_tabs_by_domain') {
      addMessage('ai-chat', { markdown: wrapCatReply('已取消匹配标签的静音') })
      return
    }
    if (intent === 'discard_tabs') {
      addMessage('ai-chat', { markdown: wrapCatReply('已休眠匹配的标签') })
      return
    }

    // 走 markdown-factory 优先；未注册的 intent 走 fallback（纯 markdown 兜底）
    const body = buildMarkdownBody(intent, result)
    addMessage(
      'ai-chat',
      body ?? { markdown: wrapCatReply(formatResultDescription(r) || '操作完成') }
    )
  }

  // ──── 录制执行器（由独立模块管理，避免本文件状态膨胀） ────
  // 所有录制逻辑（状态机、资源管理、cleanup）都在 recordingExecutor 内部完成
  // 此处仅作为依赖注入入口
  const recordingExecutor = createRecordingExecutor({
    addSystemMessage: (text) => addMessage('system', text),
    addAIChat: (text, recordingFile) => {
      if (recordingFile) {
        addMessage('ai-chat', { markdown: '' }, undefined, undefined, recordingFile)
      } else if (text) {
        addMessage('ai-chat', text)
      }
    },
    addErrorMessage: (text) => addMessage('system', text),
  })

  // 重要：sidepanel 卸载/HMR 时强制清理所有录制资源，避免僵尸 stream 占用视频通道
  onScopeDispose(() => {
    console.log('[useAIEngine] onScopeDispose → recordingExecutor.dispose')
    recordingExecutor.dispose()
  })

  /**
   * 显示截图并复制到剪贴板（供 slash command 路径使用）
   */
  function showScreenshot(dataUrl: string, tabTitle?: string) {
    addMessage('ai-chat', wrapCatReply(`[截图: ${tabTitle || '页面'}]`), dataUrl)
    copyScreenshotToClipboard(dataUrl)
  }

  /**
   * 把 AI 协议里各种"回复字段"归一化为 MessageBody
   *
   * 优先级：
   *   1. reply 是 MessageBody（rich） → 原样透传（不再加 cat 人设）
   *   2. reply 是 string → 包成 markdown + cat 人设
   *   3. content 是 string → 同上
   *   4. args.reply / args.message / args.content（toolCall 嵌套里的 string）→ 包成 markdown
   *   5. 都缺 → fallback 字符串
   *
   * 单一收口，调用方不再各自处理。
   */
  function resolveAIReply(ai: AIResponse, fallback: string): MessageBody {
    const args = (ai.args ?? {}) as Record<string, unknown>
    const nested =
      (args.reply as string | undefined) ??
      (args.message as string | undefined) ??
      (args.content as string | undefined)
    if (ai.reply && typeof ai.reply === 'object') return ai.reply
    if (typeof ai.reply === 'string') return { markdown: wrapCatReply(ai.reply) }
    if (typeof ai.content === 'string') return { markdown: wrapCatReply(ai.content) }
    if (typeof nested === 'string') return { markdown: wrapCatReply(nested) }
    return { markdown: wrapCatReply(fallback) }
  }

  /**
   * 发送 AI 对话消息，自动附带待处理的截图。
   * 保证文字和截图在同一个气泡中显示。
   *
   * text 支持两种形态：
   *   - string：纯 markdown（被 wrapCatReply 加语气）
   *   - MessageBody：富文本（components 透传，不重复加语气）
   *
   * AI 协议里的多形态 reply 收敛在 resolveAIReply，这里只接受已规范化的 body。
   */
  function emitAIChat(text: string | MessageBody, doCleanup: boolean) {
    const image = lastScreenshot.value
    if (image) {
      copyScreenshotToClipboard(image)
      lastScreenshot.value = null
    }
    const body: MessageBody = typeof text === 'string' ? { markdown: wrapCatReply(text) } : text
    addMessage('ai-chat', body, image || undefined)
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
        return 'sidepanel'
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
    deleteMessage,

    // 方法
    handleSubmit,
    handleSlashCommand,
    handleNaturalLanguage,
    agentLoop,
    executeCommand,
    dispatchToSW,
    getContext,
    scanCurrentPage,
    persistMessages,
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
