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
} from '../shared/constants'
import { getCommand } from '../shared/commands'
import { SLASH_COMMANDS, matchSlashCommand } from '../shared/slash-commands'
import { generateConfirmPreview } from '../shared/confirm'
import { messageStore } from '../shared/message-store'
import { AIEngine } from '../shared/ai/engine'
import { buildAgentSystemPrompt } from '../shared/prompts'
import { repairJSON, isTruncated } from '../shared/json-repair'
import { sanitizeThought } from '../shared/thought-summary'
import { wrapCatReply } from '../shared/personality'
import { buildMarkdownBody } from '../shared/block-renderers'
import { useSettings } from './useSettings'
import { createRecordingExecutor } from '../recording/executor'
import { i18n } from '../locales'

const SESSION_KEY = 'ai_commander_session'

/**
 * 罐头文案取词入口（非组件模块）：走 i18n 全局 composer，语言切换即时生效
 * @param key 词条 key
 * @param params 插值参数（可选）
 * @returns 当前语言的文案；词条缺失时由 fallbackLocale（en）兜底
 */
function t(key: string, params?: Record<string, unknown>): string {
  return params ? i18n.global.t(key, params) : i18n.global.t(key)
}

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
  /** 最近一次截图的模式：visible / full / area，emitAIChat 时透传给 showScreenshot 用于区分提示文案 */
  const lastScreenshotMode = ref<string | null>(null)
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
          title: t('engine.restoreTitle'),
          description: t('engine.restoreDesc'),
          items: [
            {
              primary: savedPlan.goal || t('engine.restoreGoalFallback'),
              secondary: t('engine.restoreMinutes', {
                min: Math.round((Date.now() - data.timestamp) / 1000 / 60),
              }),
            },
          ],
          onConfirm: async (_selectedTabIds: number[]) => {
            planTracker.value = savedPlan
            lessons.value = savedLessons
            // 恢复对话上下文（agentLoop 中检查 conversationMessages 非空则复用）
            if (data.conversationMessages) {
              conversationMessages.value = data.conversationMessages as ChatMessage[]
            }
            addMessage('system', t('engine.restoreDone'))
          },
          onCancel: () => {
            sessionStorage.removeItem(SESSION_KEY)
            addMessage('system', t('engine.restoreDiscard'))
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

  // ──── Agent 主循环 ────

  // Agent loop 当前活动的 AbortController（用于立即停止按钮）
  let abortController: AbortController | null = null

  /**
   * 折叠历史消息里的整页 dump（快照 nodesText / 页面扫描结果），只保留最新一份。
   *
   * 背景：browser_* 操作类工具每步返回操作后快照（nodesText 数百行），scan 返回整页
   * 元素列表；push 进 messages 后若不裁剪，第 N 步要把前 N-1 步的全部快照重发一遍，
   * 服务端 prefill 随步数叠加 → "思考中"越来越久。业界做法（Playwright MCP /
   * browser-use）：对话里只保留最新页面状态，旧快照用占位符替代——旧 ref 随
   * snapshotCache 刷新本已失效，留着只有 prefill 成本、没有信息价值。
   *
   * @param messages agent loop 的对话消息数组（就地修改）
   */
  function foldStaleSnapshots(messages: ChatMessage[]): void {
    let keptLatest = false
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role !== 'user') continue
      const isDump = m.content.includes('"nodesText"') || m.content.startsWith('页面扫描结果(')
      if (!isDump) continue
      if (!keptLatest) {
        keptLatest = true // 从尾部数第一个命中 = 最新，保留
        continue
      }
      const toolMatch = m.content.match(/^执行结果\(([^)]+)\):/)
      const what = toolMatch ? `工具 ${toolMatch[1]} 的页面快照` : '页面扫描结果'
      messages[i] = {
        ...m,
        content: `[历史快照已折叠] ${what}已被更新的快照取代，仅保留最新一份以控制上下文长度；页面当前状态以最新快照为准。`,
      }
    }
  }

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

    addMessage('system', t('engine.thinking', { step: stepCount + 1, total: MAX_AGENT_STEPS }))

    try {
      while (stepCount < MAX_AGENT_STEPS) {
        if (activeLoopId.value !== loopId) return

        if (Date.now() - startTime > TOTAL_TASK_TIMEOUT_MS) {
          const timeoutSec = Math.round(TOTAL_TASK_TIMEOUT_MS / 1000)
          addMessage('system', t('engine.taskTimeout', { sec: timeoutSec }))
          reportUserFacingError(t('engine.taskTimeoutReply', { sec: timeoutSec }))
          cleanup()
          return
        }

        let raw: string
        // 本次 AI 调用的起始时间：try/catch 两侧的耗时日志共用，必须声明在 try 之外
        // （定义在 try 块内时 catch 里不可见，会报 TS2304）
        const chatStart = Date.now()
        try {
          // 根据最后一条 assistant 消息的 action 决定 temperature：工具调用用 0.1（严格），闲聊/首轮用 1.2（宽松）
          const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
          // 匹配所有工具调用 action：browser_* / tabs_* / bookmarks_* 等前缀，以及 task_plan / navigate / screenshot / batch / scan / exec_plan / askUserResponse / done / exec_tool / execute
          const isToolCall =
            lastAssistantMsg &&
            /"action"\s*:\s*"(browser_|tabs_|bookmarks_|history_|windows_|storage_|cookies_|permissions_|extensions_|theme_|font_|downloads_|sessions_|top_sites_|task_plan|navigate|screenshot|batch|scan|exec_plan|askUserResponse|done|exec_tool|execute|zoom)"/.test(
              lastAssistantMsg.content
            )
          console.log('[AI-debug] useAIEngine.chatWithHistory start', {
            step: stepCount + 1,
            isToolCall,
            messagesCount: messages.length,
            totalChars: messages.reduce((n, m) => n + m.content.length, 0),
          })
          raw = await aiEngine.chatWithHistory(messages, {
            temperature: isToolCall ? 0.1 : 1.2,
            maxTokens: 4096,
            signal: abortController?.signal,
          })
          console.log('[AI-debug] useAIEngine.chatWithHistory returned', {
            step: stepCount + 1,
            elapsedMs: Date.now() - chatStart,
            rawLen: raw?.length ?? 0,
          })
          // AI 响应已返回，再次检查是否被中途停止（网络请求发出后无法取消，但返回后可以中断处理）
          if (activeLoopId.value !== loopId) {
            // 用户已点停止：反馈消息由 stopAgentLoop 统一发出，这里静默退出防重复
            console.log('[AI Commander] Agent loop stopped during AI call, aborting')
            return
          }
          console.log('[AI Commander] Raw response:', raw?.slice(0, 500))
          console.log('[AI Commander] Raw response type:', typeof raw, 'length:', raw?.length)
        } catch (e: unknown) {
          console.log('[AI-debug] useAIEngine.chatWithHistory THREW', {
            step: stepCount + 1,
            elapsedMs: Date.now() - chatStart,
            errorType: e instanceof Error ? e.constructor.name : typeof e,
            errorMessage: e instanceof Error ? e.message : String(e),
          })
          // 停止时可能抛出 AbortError 或其他中断异常，静默忽略
          if (activeLoopId.value !== loopId) {
            console.log('[AI Commander] Agent loop stopped during AI call (exception path)')
            return
          }
          const msg = e instanceof Error ? e.message : String(e)
          if (msg === 'NO_AI_BACKEND') {
            addMessage('system', t('engine.noBackend'))
            reportUserFacingError(t('engine.noBackendReply'))
          } else {
            addMessage('system', t('engine.serviceUnavailable'))
            reportUserFacingError(t('engine.serviceUnavailableReply'))
          }
          cleanup()
          return
        }

        if (!raw || raw.trim() === '') {
          console.error('[AI Commander] AI returned empty response!')
          addMessage('system', t('engine.emptyResponse'))
          reportUserFacingError(t('engine.emptyResponseReply'))
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

        // 把 AI 的 thought 推给用户：放在解析后、下一步执行前，
        // 不论后续是正常执行 / 重试 / 解析失败都能看到上一轮的思考。
        const cleanThought = sanitizeThought(json?.thought || '')
        if (cleanThought) {
          addMessage('system', t('engine.thought', { text: cleanThought }))
        }

        if (!json?.action) {
          jsonRetryCount++
          // 区分截断与格式问题：截断时用专门的精简重试提示，
          // 否则 AI 以为只是格式问题会原样重发大输出 → 再次截断 → 永远失败。
          const truncated = isTruncated(raw)
          if (jsonRetryCount >= 2) {
            addMessage('system', t('engine.notUnderstood'))
            reportUserFacingError(
              truncated ? t('engine.notUnderstoodTruncatedReply') : t('engine.notUnderstoodReply')
            )
            console.error(
              '[AI Commander] AI failed to understand (truncated:',
              truncated,
              '):',
              raw
            )
            cleanup()
            return
          }
          console.warn(
            '[AI Commander] JSON parse failed, retry',
            jsonRetryCount,
            'truncated:',
            truncated
          )
          messages.push({ role: 'assistant', content: raw })
          messages.push({
            role: 'user',
            content: truncated
              ? '上一次输出过长被截断（超出 max_tokens），JSON 不完整。请精简输出：去掉 components 数组，用简短 markdown 概述结果即可（如"已列出 N 个标签，当前活跃：xxx"），不要在回复里复述完整数据，只输出一个合法 JSON 对象。'
              : '请重新输出，严格按照 JSON 格式，只输出 JSON 对象，不要有其他内容。',
          })
          continue
        }
        jsonRetryCount = 0

        if (json.action === 'done') {
          const replyBody = resolveAIReply(json, t('engine.done'))
          emitAIChat(replyBody, true)
          return
        }

        if (json.action === 'ask') {
          messages.push({ role: 'assistant', content: raw })
          conversationMessages.value = [...messages]
          activeLoopId.value = null
          persistPlanTracker()
          emitAIChat(resolveAIReply(json, t('engine.needMoreInfo')), false)
          return
        }

        if (json.action === 'scan') {
          const scanResult = await scanCurrentPage((json.args?.scanFilter as string) || undefined)
          const scanStr = scanResult
            ? `页面扫描结果(${scanResult.totalCount || scanResult.count}元素): ${JSON.stringify(scanResult)}`
            : '扫描失败'
          messages.push({ role: 'assistant', content: raw })
          messages.push({ role: 'user', content: scanStr })
          foldStaleSnapshots(messages)
          addMessage('system', t('engine.rescanned'))
          continue
        }

        // 处理 exec_plan：任务规划执行器（analyze → scan → setPlan → executeStep循环 → finalReview）
        if (json.action === 'exec_plan') {
          stepCount++
          addMessage('system', t('engine.running', { step: stepCount, total: MAX_AGENT_STEPS }))

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
            addMessage('system', t('engine.needUserData', { prompt }))
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
              addMessage('system', t('engine.planAnalyzeDone'))
              continue
            } else {
              // 需要用户数据，中断
              messages.push({ role: 'assistant', content: raw })
              messages.push({
                role: 'user',
                content: `[阶段①中断] ${planResult.error}\n请提供所需数据后重新发起任务`,
              })
              addMessage('system', t('engine.needMoreInfo'))
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
              addMessage('system', t('engine.planScanDone'))
              continue
            } else {
              messages.push({ role: 'assistant', content: raw })
              messages.push({ role: 'user', content: `[阶段②失败] ${planResult.error}` })
              addMessage('system', t('engine.scanProblem'))
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
            addMessage('system', t('engine.planReady', { count: planResult.totalSteps }))
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
            let statusText = t('step.statusRunning', { index: stepIndex, total })

            if (status === 'SUCCESS') {
              statusIcon = '✓'
              statusText = t('step.statusDone', { index: stepIndex, total })
            } else if (status === 'SKIP') {
              statusIcon = '⊘'
              statusText = t('step.statusSkipped', { index: stepIndex, total })
            } else if (status === 'FAIL') {
              statusIcon = '✗'
              statusText = t('step.statusFailed', { index: stepIndex, total })
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
              addMessage('system', t('engine.planAllDone'))
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
            addMessage(
              'system',
              report?.taskComplete ? t('engine.planTaskDone') : t('engine.planTaskPartial')
            )
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
            addMessage('system', t('engine.receivedUserData', { key: dataKey }))
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
          actionStr.startsWith('cookies_') ||
          actionStr.startsWith('permissions_') ||
          actionStr.startsWith('extensions_') ||
          actionStr.startsWith('theme_') ||
          actionStr.startsWith('font_') ||
          actionStr.startsWith('downloads_') ||
          actionStr.startsWith('sessions_') ||
          actionStr.startsWith('top_sites_') ||
          actionStr === 'task_plan' ||
          actionStr === 'navigate' ||
          actionStr === 'screenshot' ||
          actionStr === 'batch' ||
          actionStr === 'zoom'
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
          addMessage('system', t('engine.unknownAction'))
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
        addMessage('system', t('engine.running', { step: stepCount, total: MAX_AGENT_STEPS }))

        let result: ExecutionResult
        try {
          // AI agent loop 的危险命令视为已确认（force:true）：agent loop 每步都有
          // system 摘要可见、可随时点停止按钮中断，等价于"渐进式确认"。
          // 否则每个危险命令都返回 NEEDS_CONFIRM 会终止循环，多步任务（如删多个空文件夹）无法连续执行。
          const dangerous = !!getCommand(toolName)?.dangerous
          result = await Promise.race([
            executeCommand(toolName, dangerous ? { ...toolArgs, force: true } : toolArgs),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('ACT_TIMEOUT')), STEP_TIMEOUT_MS)
            ),
          ])
        } catch {
          result = {
            success: false,
            code: 'ACT_TIMEOUT',
            message: t('engine.stepTimeout'),
            detail: { reason: '单步操作超过 ' + STEP_TIMEOUT_MS / 1000 + ' 秒' },
          }
        }

        // clientExec 命令（chrome.tabs.group/ungroup 在 MV3 SW 会静默挂起）：
        // SW 只准备分组数据返回 clientExec 标志，真正的 API 调用需在 side panel 执行。
        // 这里执行后用真实结果替换 SW 结果，让后续 formatStepSummary / AI 反馈 / 验证都基于真实执行结果。
        if ((result as Record<string, unknown>).clientExec) {
          result = await executeClientExec(result)
        }

        // 防御性兜底：agent loop 对 dangerous 命令已注入 force:true（见上方 executeCommand 调用），
        // 正常不会走到这里。保留此分支以兼容未来非 force 的危险路径——若 SW 仍返回 NEEDS_CONFIRM，
        // 则弹确认卡让用户逐项勾选（确认后执行单步，agent loop 不再恢复，故多步任务应避免走到此分支）。
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
            title: (result.message as string) || t('engine.confirmTitleFallback'),
            description:
              detail.childCount != null
                ? t('engine.confirmFolderDesc', { count: detail.childCount, title: title || '' })
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
                  addMessage('system', t('engine.confirmRetryFailed'))
                }
              } catch {
                addMessage('system', t('engine.confirmError'))
              }
              cleanup()
            },
            onCancel: () => {
              // 用 ai-chat 通道返回"已取消"，让 AI 看起来在主动回应用户意图；
              // system 通道虽然语义更准，但会让用户感觉"AI 没说话"，体验差。
              addMessage('ai-chat', wrapCatReply(t('engine.canceled')))
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
        const sanitized = sanitizeResult(result, toolName)
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
        // 维持"历史中至多一份整页 dump"不变式，防止请求体随步数线性膨胀
        foldStaleSnapshots(messages)

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

        // 操作成功的针对性验证。注意：条件不能用 result.triggered/result.result 门控书签分支——
        // 书签写操作返回 movedNode/createdNode/updatedNode/removedNode，既不返回 triggered 也不返回 result，
        // 旧条件 (result.triggered || result.result !== undefined) 会让书签验证永不触发，
        // AI 在多步任务中拿不到最新 id 列表 → 幻觉 id。故书签分支独立判定（仅看 !error && !code）。
        if (!result.error && !result.code) {
          if (
            toolName === 'tabs_move' ||
            toolName === 'tabs_group_by_domain' ||
            toolName === 'tabs_ungroup'
          ) {
            // 标签页移动/分组/取消分组后，验证新状态
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
          } else if (
            toolName === 'bookmarks_move_node' ||
            toolName === 'bookmarks_create_node' ||
            toolName === 'bookmarks_remove_node' ||
            toolName === 'bookmarks_update_node'
          ) {
            // 书签写操作后，回灌实际节点数据（关键字段）让 AI 基于最新 id 继续，
            // 避免多步任务中 id 失效后 AI 幻觉出不存在的 id。
            // 扩展到 remove/update：删除/更新后同样需要回灌最新树，否则后续步骤会用到失效 id。
            const verifyResult = await executeCommand('bookmarks_observe_tree', { maxResults: 80 })
            const nodeList = verifyResult.success
              ? ((verifyResult as Record<string, unknown>).nodes as Array<Record<string, unknown>>)
              : undefined
            if (Array.isArray(nodeList)) {
              // 仅回灌关键字段，避免完整树过大撑爆上下文
              const compact = nodeList.map((n) => ({
                id: n.id,
                title: n.title,
                type: n.type,
                parentId: n.parentId,
                childCount: n.childCount,
              }))
              messages.push({
                role: 'system',
                content: `[验证] 书签操作完成，当前书签节点 ${nodeList.length} 个：${JSON.stringify(compact)}`,
              })
            }
          } else if (result.triggered || result.result !== undefined) {
            // 其他操作（DOM 脚本等），扫描页面状态
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
          if (typeof result.mode === 'string') {
            lastScreenshotMode.value = result.mode as string
          }
          // 截图任务下立即弹截图气泡（非"其他任务里误触发图表"）：
          // 这里 showScreenshot 自成一个 ai-chat 气泡，与后续 chat/done/ask 收尾气泡互不干扰。
          // emitAIChat 不再消费 lastScreenshot，所以截图数据只在这里出现一次。
          void showScreenshot(
            result.screenshot as string,
            undefined,
            (typeof result.mode === 'string' ? (result.mode as string) : undefined) as
              string | undefined
          )
        }

        const stepStatus = !result.error && !result.code ? '✓' : '❌'
        // thought 已在解析后立即输出（见上方「💭 AI 思考」气泡），这里只展示步骤摘要，避免一泡过长。
        addMessage('system', `[${stepCount}] ${stepStatus} ${formatStepSummary(result, toolName)}`)

        // 如果执行失败，用友好提示告知用户
        if (result.code || result.error) {
          const errorMsg = result.code
            ? t('engine.opFailed', { message: result.message || t('step.failedFallback') })
            : t('engine.opError', { error: result.error })
          addMessage('system', t('engine.stepProblem', { msg: errorMsg }))
        }

        // 更早压缩消息，避免系统 prompt（含页面 DOM）+ 历史消息超过 token 限制
        if (messages.length > 15) {
          compressMessages(messages)
        }

        if (consecutiveErrors >= MAX_CONSECUTIVE_FAILURES) {
          addMessage('system', t('engine.consecutiveFailures', { count: consecutiveErrors }))
          reportUserFacingError(t('engine.consecutiveFailuresReply', { count: consecutiveErrors }))
          cleanup()
          return
        }

        addMessage('system', t('engine.thinking', { step: stepCount + 1, total: MAX_AGENT_STEPS }))
      }

      emitAIChat(t('engine.maxSteps', { count: MAX_AGENT_STEPS }), true)
    } catch {
      addMessage('system', t('engine.unexpected'))
      reportUserFacingError(t('engine.unexpectedReply'))
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
      addMessage('ai-chat', wrapCatReply(t('engine.unknownSlash')))
      return
    }

    const { intent, slots } = result
    const slotsAny = slots as Record<string, unknown>
    let resolvedIntent = intent

    if (resolvedIntent === 'show_help') {
      addMessage('ai-chat', wrapCatReply(formatHelp()))
      return
    }

    if (resolvedIntent === 'clear_chat') {
      // 刚 addMessage 的 user 消息（handleSlashCommand 是 handleSubmit 的同步下一步，
      // 中间无其它 addMessage）；clearMessages 会连它一起清掉，先留引用
      const userMsg = messageLog.value.at(-1)
      await clearMessages()
      if (userMsg) {
        // 清空后只保留 user 消息并显式重新落盘（put 按 id upsert，幂等），
        // 后续 addMessage 的反馈也会正常落盘 → 重启后看到的是"清除动作 + 反馈"，旧消息不复活
        messageLog.value = [userMsg]
        await persistMessage(userMsg)
      }
      addMessage('ai-chat', wrapCatReply(t('engine.clearChatDone')))
      return
    }

    if (resolvedIntent === 'reset_context') {
      cleanup()
      addMessage('ai-chat', wrapCatReply(t('engine.resetDone')))
      return
    }

    const cmd = getCommand(resolvedIntent)
    if (!cmd) {
      // 已通过 matchSlashCommand 校验 intent 名，不会走到这里；但保留兜底
      addMessage('ai-chat', wrapCatReply(t('engine.unknownSlash')))
      return
    }

    if (cmd.dangerous) {
      // 危险命令预览需要最新 tab 状态，强制刷新缓存（避免 30s 缓存导致预览与实际状态不一致）
      contextCache.value = await getContext()
      // remove_bookmark 预览需要匹配书签列表（Context 不存书签详情），预取后传给 generateConfirmPreview
      let matchedBookmarks: chrome.bookmarks.BookmarkTreeNode[] | undefined
      if (resolvedIntent === 'remove_bookmark' && slotsAny.query) {
        matchedBookmarks = (await chrome.runtime.sendMessage({
          type: MSG_GET_BOOKMARKS,
          options: { query: slotsAny.query as string },
        })) as chrome.bookmarks.BookmarkTreeNode[]
      }
      // clear_cookies 预览需要域名下的 Cookie 列表（Cookie 无稳定 id，用数组下标做 UI id）。
      // 复用 cookies_observe 通道预取，结果存闭包供 onConfirm 反查下标 → Cookie 对象。
      let matchedCookies: chrome.cookies.Cookie[] | undefined
      if (resolvedIntent === 'clear_cookies') {
        const obs = (await chrome.runtime.sendMessage({
          type: MSG_EXECUTE,
          command: {
            intent: 'cookies_observe',
            payload: { domain: slotsAny.domain },
          },
        })) as ExecutionResult | undefined
        matchedCookies = obs?.success ? (obs.cookies as chrome.cookies.Cookie[]) : undefined
      }
      const preview = await generateConfirmPreview(
        resolvedIntent,
        slotsAny,
        contextCache.value,
        matchedBookmarks,
        matchedCookies
      )
      // 没有匹配到任何标签时，preview 为 null。
      // 用 ai-chat 通道返回，让结果进入消息气泡流；AI 看起来像"正常回复"，
      // 不会出现"AI 没反应"的错觉。
      if (!preview) {
        // 危险命令没有匹配项时，给出针对性提示。
        // ungroup_all: 当前没有分组
        // delete_history: 时间范围非法（buildSlots 校验未通过）
        // close_*: 关键词没匹配到
        let msg: string
        if (resolvedIntent === 'ungroup_all') {
          msg = t('engine.noGroups')
        } else if (resolvedIntent === 'delete_history') {
          msg = t('engine.invalidTimeRange')
        } else {
          const keyword = (slotsAny.query as string) || t('engine.currentCriteria')
          msg = t('engine.noTabMatch', { keyword })
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
            // 走 selectedGroupIds 字段传给 SW
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
            } else if (resolvedIntent === 'remove_bookmark') {
              // 书签删除走 selectedIds（书签 id 是 string，SW removeBookmark 已做 number→string 兼容）
              if (selectedTabIds.length > 0) {
                await dispatchToSW(resolvedIntent, {
                  ...slotsAny,
                  force: true,
                  selectedIds: selectedTabIds,
                })
              } else {
                await dispatchToSW(resolvedIntent, { ...slotsAny, force: true })
              }
            } else if (resolvedIntent === 'clear_cookies') {
              // Cookie 无稳定 id，selectedTabIds 是预览列表的数组下标。
              // 用闭包 matchedCookies 把下标映射回 Cookie 对象，提取删除所需的最小字段集
              // {name, domain, path, secure} 传给 SW 的 selectedCookies。
              if (selectedTabIds.length > 0 && matchedCookies?.length) {
                const selectedCookies = selectedTabIds
                  .map((i) => matchedCookies?.[i])
                  .filter((c): c is chrome.cookies.Cookie => !!c)
                  .map((c) => ({
                    name: c.name,
                    domain: c.domain,
                    path: c.path,
                    secure: c.secure,
                  }))
                await dispatchToSW(resolvedIntent, {
                  ...slotsAny,
                  force: true,
                  selectedCookies,
                })
              } else {
                // 空选择兜底：按域名全删（与旧行为一致）
                await dispatchToSW(resolvedIntent, { ...slotsAny, force: true })
              }
            } else if (selectedTabIds.length > 0) {
              // 其他命令（close_* 等）走 tabIds
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
          addMessage('ai-chat', wrapCatReply(t('engine.canceled')))
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
        t('engine.aiUnavailable', {
          reason: ai.reason || t('engine.notConfigured'),
          commands: formatSlashCommands(),
        })
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
      } catch {
        addMessage('system', t('engine.submitSlashError'))
        reportUserFacingError(t('engine.submitSlashErrorReply'))
      }
    } else {
      addMessage('user', trimmedText)
      try {
        await handleNaturalLanguage(trimmedText)
      } catch {
        addMessage('system', t('engine.submitError'))
        reportUserFacingError(t('engine.submitErrorReply'))
      }
    }
  }

  // ──── 工具函数 ────

  async function executeCommand(
    intent: string,
    slots: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const cmd = getCommand(intent)
    if (!cmd) return { error: t('engine.unknownIntent', { intent }) }

    // 客户端命令（录制等）：本地处理
    if (cmd.clientIntent) {
      if (cmd.clientIntent === 'record_screen') return await recordingExecutor.start('screen')
      if (cmd.clientIntent === 'stop_recording') return await recordingExecutor.stop()
      return {
        success: false,
        code: 'UNKNOWN_CLIENT_INTENT',
        message: t('engine.unknownClientIntent', { intent: cmd.clientIntent }),
      }
    }

    if (cmd.swIntent === null) return { error: t('engine.notExecutable', { intent }) }

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
        message: t('engine.commandFailed', { msg: errorMessage }),
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
      addMessage('system', t('engine.swNoResponse'))
      reportUserFacingError(t('engine.swNoResponseReply'))
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
        // 用户在确认卡勾选过 tabIds 时直接复用，尊重用户选择（不被重算覆盖）；
        // 否则按 url 过滤自动计算重复 tab。与 close_tabs_by_url 的 precompute 同构。
        const explicitTabIds = Array.isArray(slots.tabIds) ? (slots.tabIds as number[]) : []
        if (explicitTabIds.length > 0) {
          return { tabIds: explicitTabIds.filter((id) => typeof id === 'number') }
        }
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

      case 'pin_tab':
      case 'unpin_tab': {
        // pin/unpin 固定为 true/false（不 toggle），幂等且语义明确。
        // 实时查当前 active tab，不依赖 context 缓存（避免 pinned 字段缺失或过期）。
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!active?.id) return {}
        return { tabId: active.id, pinned: intent === 'pin_tab' }
      }

      case 'remove_bookmark': {
        // 用户在确认卡勾选过书签时直接复用 selectedIds，尊重用户选择（不被重算覆盖）；
        // 否则按 query 取首个匹配回退。与 close_tabs_by_url 的 precompute 同构。
        const explicitIds = Array.isArray(slots.selectedIds) ? (slots.selectedIds as unknown[]) : []
        if (explicitIds.length > 0) {
          return { selectedIds: explicitIds }
        }
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
   * 把执行结果格式化为简短描述文案（用于 agent loop 步骤摘要 & 渲染兜底）。
   * 所有文案走 t()，语言切换即时生效。
   * @param r - 执行结果对象
   * @param intent - 命令 intent（可选）；用于区分被多类命令共用的字段（如 removed）
   * @returns 简短描述字符串
   */
  function formatResultDescription(r: Record<string, unknown>, intent?: string): string {
    /**
     * 书签节点的展示类型：书签必有 url，文件夹必无（chrome.bookmarks 节点无 nodeType 字段）
     * @param n - 书签节点
     * @returns “书签”/“文件夹”的本地化名词
     */
    const nodeKind = (n: { url?: string }): string =>
      n.url ? t('step.bookmark') : t('step.folder')
    /**
     * 书签节点的展示名：优先 title，退回 url
     * @param n - 书签节点
     * @returns 节点名称字符串
     */
    const nodeName = (n: { title?: string; url?: string }): string => n.title || n.url || ''

    if (r.code === 'NEEDS_CONFIRM') return `⚠️ ${r.message}`
    if (r.code) return `[${r.code}] ${r.message || t('step.failedFallback')}`
    if (r.error)
      return t('step.fail', {
        error: typeof r.error === 'object' ? JSON.stringify(r.error) : String(r.error),
      })
    // DOM 脚本结果
    if (r.result !== undefined) {
      if (r.result === null) return t('step.scriptNull')
      const s = typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
      return t('step.scriptResult', { text: s.slice(0, 100) })
    }
    // Bookmarks 专属字段优先判定（removedNode 仅书签删除返回，
    // 必须排在 tabs 的 removed 之前，否则书签删除会被误判成"关闭标签"）
    if (r.nodes)
      return t('step.observedBookmarks', { count: r.observed || (r.nodes as unknown[]).length })
    if (r.movedNode) {
      const n = r.movedNode as { title?: string; url?: string }
      return t('step.moved', { kind: nodeKind(n), name: nodeName(n) })
    }
    if (r.createdNode) {
      const n = r.createdNode as { title?: string; url?: string }
      return t('step.created', { kind: nodeKind(n), name: nodeName(n) })
    }
    if (r.existingNode) {
      const n = r.existingNode as { title?: string; url?: string }
      return t('step.reused', { kind: nodeKind(n), name: nodeName(n) })
    }
    if (r.updatedNode) {
      const n = r.updatedNode as { title?: string; url?: string }
      return t('step.updated', { kind: nodeKind(n), name: nodeName(n) })
    }
    if (r.openedNode) {
      const n = r.openedNode as { title?: string; url?: string }
      return t('step.opened', { name: nodeName(n) })
    }
    if (r.removedNode) {
      const n = r.removedNode as { title?: string; url?: string }
      return t('step.removed', { kind: nodeKind(n), name: nodeName(n) })
    }
    if (r.bookmark)
      return t('step.bookmarkAdded', { name: (r.bookmark as { title?: string }).title || '' })
    // Tabs
    if (r.tabs) return t('step.tabsListed', { count: r.observed || (r.tabs as unknown[]).length })
    if (r.tab && r.active !== undefined)
      return r.active
        ? t('step.tabSwitched', { name: (r.tab as { title?: string }).title || '' })
        : t('step.tabUpdated', { name: (r.tab as { title?: string }).title || '' })
    if (r.tab)
      return t('step.tabCreated', {
        name: (r.tab as { title?: string }).title || (r.tab as { url?: string }).url || '',
      })
    if (r.moved !== undefined) return t('step.tabsMoved', { count: r.moved })
    // removed 字段被 tabs_remove（关闭标签）和 bookmarks_remove_node（删除书签/文件夹）共用，
    // 按 intent 区分；无 intent 时默认按"关闭标签"处理（向后兼容）
    if (r.removed !== undefined) {
      if (intent === 'bookmarks_remove_node')
        return t('step.bookmarksRemoved', { count: r.removed })
      return t('step.tabsClosed', { count: r.removed })
    }
    if (r.groupedTabs !== undefined)
      return (
        t('step.groupsCreated', { count: r.groupedTabs }) +
        (r.failed ? t('step.failedCount', { count: r.failed }) : '')
      )
    if (r.groupId && !r.groupedTabs) return t('step.groupUpdated', { name: r.title || r.groupId })
    if (r.ungrouped !== undefined)
      return (
        t('step.groupsRemoved', { groups: r.ungrouped, tabs: r.tabsUngrouped || 0 }) +
        (r.failed ? t('step.failedCount', { count: r.failed }) : '')
      )
    if (r.groupsCleared !== undefined) return (r.message as string) || t('step.noGroupsPlain')
    if (r.groups) return t('step.groupsListed', { count: (r.groups as unknown[]).length })
    if (r.reloaded) return t('step.tabReloaded')
    if (r.pinned !== undefined) return r.pinned ? t('step.tabPinned') : t('step.tabUnpinned')
    if (r.discarded !== undefined) return t('step.tabsDiscarded', { count: r.discarded })
    if (r.duplicated !== undefined) return t('step.tabDuplicated')
    // Windows
    if (r.windows) return t('step.windowsListed', { count: (r.windows as unknown[]).length })
    if (r.window) return t('step.windowCreated')
    // History
    if (r.items) return t('step.historyFound', { count: r.found })
    if (r.deleted !== undefined && r.timeRange)
      return t('step.historyDeletedRange', { count: r.deleted, range: r.timeRange })
    if (r.deleted !== undefined) return t('step.recordsDeleted', { count: r.deleted })
    // Navigation
    if (r.navigated) return t('step.navigated', { url: r.navigated })
    if (r.dataUrl && !r.stopped && !r.pendingRecording) return t('step.screenshotCaptured')
    // 截图（screenshot intent 返回 screenshot 字段，非 dataUrl）
    if (r.screenshot && typeof r.screenshot === 'string') return t('step.screenshotCaptured')
    // Page
    if (r.zoomFactor !== undefined)
      return t('step.zoomed', { percent: Math.round((r.zoomFactor as number) * 100) })
    if (r.opened) return t('step.downloadsOpened')
    // Theme
    if (r.themeMode !== undefined) return t('step.themeSet', { mode: r.themeMode })
    // Font
    if (r.fontSize !== undefined)
      return t('step.fontSize', { label: r.fontSizeLabel || `${r.fontSize}px` })
    if (r.font) return t('step.fontSet', { font: r.font })
    // Cookies
    if (r.cookies) {
      // observeCookies 返回 domain 或 url（按 url 过滤时），兼容两者
      const where = r.domain || r.url || ''
      return t('step.cookiesObserved', { count: r.found || 0, domain: where })
    }
    if (r.cookie) return t('step.cookieSet', { name: (r.cookie as { name?: string }).name || '' })
    if (r.domain && r.deleted !== undefined)
      return t('step.cookiesCleared', { domain: r.domain, count: r.deleted })
    // Downloads
    if (r.downloads) return t('step.downloadsFound', { count: r.found || 0 })
    if (r.downloadId !== undefined)
      return t('step.downloadStarted', { name: (r as { filename?: string }).filename || '' })
    // Top Sites
    if (r.sites) return t('step.sitesShown', { count: r.found || 0 })
    // Extensions
    if (r.extensions) return t('step.extensionsListed', { count: r.found || 0 })
    if (r.id && r.enabled !== undefined)
      return r.enabled ? t('step.extEnabled') : t('step.extDisabled')
    if (r.id && (r as { uninstalled?: string }).uninstalled) return t('step.extUninstalled')
    // Permissions：站点权限（contentSettings，permissions 是数组）vs 扩展自身权限（permissions 是 {origins,permissions} 对象）
    if (r.permissions) {
      if (Array.isArray(r.permissions)) return t('step.permsObserved', { domain: r.domain })
      // 扩展自身权限：permissions 是 { origins, permissions } 对象
      const p = r.permissions as { origins?: unknown[]; permissions?: unknown[] }
      const cnt = (p.origins?.length || 0) + (p.permissions?.length || 0)
      return t('step.extPermsCount', { count: cnt })
    }
    if (r.setting && r.value) return t('step.permSet', { domain: r.domain, setting: r.setting })
    // Storage
    if (r.key && r.value !== undefined) {
      const area = r.area ? `(${r.area})` : ''
      return t('step.storageSet', {
        area,
        key: r.key,
        value: typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value),
      })
    }
    // getStorage 无 key 时返回整个区域全量（value 是对象，无 key）
    if (!r.key && r.value !== undefined && r.area) {
      const count =
        r.value && typeof r.value === 'object' ? Object.keys(r.value as object).length : 0
      return t('step.storageListed', { area: r.area, count })
    }
    if (r.key && r.area) return t('step.storageRemoved', { area: r.area, key: r.key })
    if (r.storageRemoved) return t('step.storageAreaRemoved', { name: r.storageRemoved })
    // Recording
    if (r.recording === 'screen') return t('step.recordingScreen')
    if (r.recording) return t('step.recordingStarted', { kind: r.recording })
    if (r.saved) return t('step.recordingSaved', { name: r.saved })
    if (r.stopped) {
      const size = r.size as number | undefined
      return size
        ? t('step.recordingStoppedSize', { size: (size / 1024 / 1024).toFixed(1) })
        : t('step.recordingStopped')
    }
    // Sessions
    if (r.restored) return t('step.tabRestored', { id: r.restored })
    // Batch
    if (r.results && r.total !== undefined) return t('step.batchExecuted', { count: r.total })
    // 旧格式兼容（DOM 脚本 action）
    if (r.action === 'query')
      return t('step.queryAction', {
        count: r.count,
        target: r.value || r.selector || t('step.elementFallback'),
      })
    if (r.action === 'modify')
      return t('step.modifyAction', {
        count: r.changed,
        target: r.value || r.selector,
        property: r.property,
      })
    if (r.action === 'remove')
      return t('step.removeAction', { count: r.removed, target: r.value || r.selector })
    if (r.action === 'add')
      return t('step.addAction', { tag: r.tag, target: r.target || r.parentSelector || 'body' })
    if (r.action === 'style')
      return t('step.styleAction', { count: r.changed, target: r.value || r.selector })
    if (r.action === 'event') {
      // 事件类型词条缺失时（如新增事件类型尚未补词）回退展示原始类型名
      const ev = r.eventType as string
      const label = i18n.global.te(`step.event.${ev}`) ? t(`step.event.${ev}`) : ev
      return `${label} "${r.value || r.selector}"${r.eventValue ? ' -> ' + r.eventValue : ''}`
    }
    if (r.enabled) return t('step.extEnabledNamed', { name: r.enabled })
    if (r.disabled) return t('step.extDisabledNamed', { name: r.disabled })
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

  /**
   * 追加单条消息到 IndexedDB。
   * - 错误仅记录，不抛到 UI
   * - 失败时插一条 system 警告，让用户知道"消息没存上"
   */
  /**
   * 持久化执行层：落盘单条消息，失败时仅告警不抛出（永不 reject）。
   *
   * @param msg 待落盘消息
   */
  async function persistMessageTask(msg: MessageLog): Promise<void> {
    try {
      await messageStore.append(msg)
    } catch (e: unknown) {
      console.warn('[AI管家] 持久化消息失败:', e instanceof Error ? e.message : String(e))
      // 不在 catch 里直接 addMessage：fire-and-forget 时机不可控，会在后续消息
      // push 完成后再插入 system 警告 → 视觉上"乱序"（警告出现在 ai-chat 之后）。
      // 改为：把警告入队到下一轮微任务，确保它在当前同步代码段之后的下一帧执行，
      // 但仍然保持 push 顺序（先到先 push）—— 警告会紧跟最近的 system 步骤摘要后面，
      // 而不是插到 ai-chat 之后。
      const warnText = t('warn.persistFailed', {
        msg: (e instanceof Error ? e.message : String(e)) || t('warn.unknownError'),
      })
      queueMicrotask(() => addMessage('system', warnText))
    }
  }

  /** 落盘在途任务集合：clearMessages / deleteMessage 清库前必须等它们落定（见 docs/clear-chat-resurrection.md） */
  const pendingPersists = new Set<Promise<void>>()

  /**
   * 持久化注册层：登记在途落盘任务供清库 barrier 等待，落定后解除登记。
   *
   * @param msg 待落盘消息
   * @returns 落盘任务（内部已 try/catch 兜底，永不 reject）
   */
  function persistMessage(msg: MessageLog): Promise<void> {
    const task = persistMessageTask(msg)
    pendingPersists.add(task)
    void task.finally(() => pendingPersists.delete(task))
    return task
  }

  async function clearMessages(): Promise<void> {
    // barrier：等所有在途落盘任务落定后再清库，杜绝"put 事务创建晚于 clear 事务、
    // 在清库之后落地"导致的消息复活（IndexedDB 按事务创建顺序提交）
    await Promise.allSettled([...pendingPersists])
    // 先清 IndexedDB，成功后再清内存；避免磁盘残留导致下次启动数据"复活"
    if (isInitialized.value) {
      try {
        await messageStore.clear()
      } catch (e: unknown) {
        console.warn('[AI管家] 清空消息失败:', e instanceof Error ? e.message : String(e))
        addMessage(
          'system',
          t('warn.clearFailed', {
            msg: (e instanceof Error ? e.message : String(e)) || t('warn.unknownError'),
          })
        )
        return
      }
    }
    messageLog.value = []
  }

  async function deleteMessage(index: number): Promise<void> {
    if (index < 0 || index >= messageLog.value.length) return
    // 先找出要删的消息和对应 id
    let deleteCount = 0
    const removedIds: string[] = []
    for (let i = index; i < messageLog.value.length; i++) {
      const msg = messageLog.value[i]
      // 如果遇到用户消息，停止删除（不删除后续的用户消息）
      if (i > index && msg.type === 'user') {
        break
      }
      deleteCount++
      if (msg.id) removedIds.push(msg.id)
    }
    // barrier：等在途落盘任务落定再删库，同 clearMessages——刚 add 的消息若正被删除，
    // 其 put 事务可能晚于 delete 落地而复活
    await Promise.allSettled([...pendingPersists])
    // 先删 IndexedDB，成功后再 splice 内存；失败保留磁盘+内存一致
    if (isInitialized.value && removedIds.length > 0) {
      try {
        await messageStore.removeMany(removedIds)
      } catch (e: unknown) {
        console.warn('[AI管家] 删除消息失败:', e instanceof Error ? e.message : String(e))
        addMessage(
          'system',
          t('warn.deleteFailed', {
            msg: (e instanceof Error ? e.message : String(e)) || t('warn.unknownError'),
          })
        )
        return
      }
    }
    messageLog.value.splice(index, deleteCount)
  }

  function cleanup() {
    activeLoopId.value = null
    planTracker.value = null
    conversationMessages.value = null
    lessons.value = []
    lastScreenshot.value = null
    lastScreenshotMode.value = null
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

  /**
   * 用户点击停止按钮的统一入口：先补齐"用户输入 → AI 回复"的反馈对，再中断请求并清理状态。
   *
   * 背景：停止可能发生在三个时机（AI 请求中 / 响应已返回 / 工具执行中），此前反馈不一致——
   * 只发 system 日志气泡时用户会觉得"输入了但没有回答"（聊天里缺少 ai-chat 回复），
   * 响应已返回的路径还会重复发 system 消息。收敛到这里统一发一次：
   * - system 标记（保留步骤日志语义）+ ai-chat 猫式回复（对齐 reportUserFacingError 双气泡惯例）
   * - cleanup() 中断后 agentLoop 的所有退出路径静默 return，不会重复反馈
   *
   * @returns void；无进行中任务时直接返回（停止按钮兜底防误触）
   */
  function stopAgentLoop(): void {
    if (!activeLoopId.value) return
    addMessage('system', t('engine.stopped'))
    addMessage('ai-chat', {
      markdown: wrapCatReply(t('engine.stoppedReply')),
    })
    cleanup()
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

  /**
   * 操作类 browser_* 工具集合：content script 执行后会自动附带操作后的最新页面快照
   * （data.snapshot，对标 Playwright MCP），sanitize 时与 browser_snapshot 同级处理。
   */
  const POST_ACTION_SNAPSHOT_TOOLS = new Set([
    'browser_click',
    'browser_type',
    'browser_select_option',
    'browser_hover',
    'browser_press_key',
    'browser_check',
    'browser_uncheck',
    'browser_fill_form',
  ])

  function sanitizeResult(obj: unknown, toolName?: string): unknown {
    if (obj === null || obj === undefined) return obj
    if (typeof obj === 'string') {
      return obj.length > 500 ? obj.slice(0, 200) + `...[截断, 原长 ${obj.length} 字符]` : obj
    }
    if (typeof obj !== 'object') return obj

    // 数组截断阈值：回灌给 AI 的数组最多 30 项，超出则截断 + 记录提示。
    // 避免 history_search(100条)/bookmarks_observe_tree(500节点) 等大数组
    // 完整回灌撑爆 AI 上下文，导致输出被截断、JSON 解析失败（"我没有理解您的请求"）。
    // browser_snapshot 及操作类工具例外：AI 视图只回灌 nodesText 逐行文本（nodes 数组
    // 仅供程序消费），文本放宽到 8000 字符——通用 500→200 截断会把快照毁掉。
    // 操作类工具的 nodesText 嵌在 data.snapshot 里，replacer 按 key 名 'nodes' 任意深度剔除。
    const isSnapshot =
      toolName === 'browser_snapshot' ||
      (toolName !== undefined && POST_ACTION_SNAPSHOT_TOOLS.has(toolName))
    const MAX_ARRAY = isSnapshot ? 120 : 30
    const MAX_STR = isSnapshot ? 8000 : 500
    const truncatedArrays: Array<{ field: string; total: number }> = []
    const seen = new WeakSet()
    try {
      const str = JSON.stringify(obj, (key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]'
          seen.add(val)
        }
        // 超长数组截断：保留前 MAX_ARRAY 项，记录字段名和原始长度供外层提示
        if (Array.isArray(val) && val.length > MAX_ARRAY) {
          truncatedArrays.push({ field: key || '(root)', total: val.length })
          return val.slice(0, MAX_ARRAY)
        }
        // browser_snapshot：AI 只阅读 nodesText 逐行文本，嵌套的 nodes 数组不回灌（省 token 且模型更好读）
        if (isSnapshot && key === 'nodes') {
          return undefined
        }
        // 截图 / 大体积 dataURL 不塞进文本上下文（会撑爆 token）。
        // 但要让 AI 知道结果存在：把这类字段替换成一个简短标记，AI 知道截图已经捕获、
        // 已存入 lastScreenshot，可继续基于"已知页面状态"推理；不要让 AI 以为结果是空的。
        if (/data[_]?url|screenshot/i.test(key)) {
          if (typeof val !== 'string' || val.length === 0) return undefined
          const isScreenshotTool =
            toolName === 'screenshot' || toolName === 'browser_take_screenshot'
          return isScreenshotTool
            ? `[screenshot: 截图已捕获 ${val.length} 字符（${toolName}），UI 已展示，请基于已有页面上下文继续推理]`
            : `[${key}: 已捕获 ${val.length} 字符的二进制数据，UI 已展示]`
        }
        if (typeof val === 'string' && val.length > MAX_STR) {
          return val.slice(0, MAX_STR) + `...[截断, 原长 ${val.length} 字符]`
        }
        return val
      })
      const parsed = JSON.parse(str)
      // 有截断时在结果顶层加提示，让 AI 知道数据不全、需缩小查询范围取完整数据
      if (truncatedArrays.length > 0 && parsed && typeof parsed === 'object') {
        ;(parsed as Record<string, unknown>)._resultTruncated = truncatedArrays.map(
          (t) =>
            `${t.field}: 共${t.total}项，已截断为前${MAX_ARRAY}项。如需完整数据请缩小查询范围（加 query/domain 过滤或减小 maxResults）`
        )
      }
      return parsed
    } catch {
      return { _error: 'serialization failed', _keys: Object.keys(obj as object) }
    }
  }

  /**
   * 执行 clientExec 命令（chrome.tabs.group/ungroup 在 MV3 SW 上下文会静默挂起，
   * 需在 side panel 用户激活上下文执行）。
   * SW 把分组数据准备好后返回 clientExec 标志 + groups，这里真正调用 Chrome API，
   * 返回带 cleared/created/ungrouped 等字段的结果，让 formatResultDescription / AI 反馈能准确描述。
   * 被 agentLoop（每步执行后替换 result）和 renderExecutionResult（斜杠命令路径）共用。
   * @param result - SW 返回的带 clientExec 标志的结果
   * @returns 执行后的真实结果（无 clientExec 时原样返回）
   */
  async function executeClientExec(result: ExecutionResult): Promise<ExecutionResult> {
    const r = result as Record<string, unknown>
    if (!r.clientExec || !Array.isArray(r.groups)) return result

    // 取消分组：把每个分组内的 tabIds 调 chrome.tabs.ungroup 移出分组
    if (r.clientExec === 'tabs_ungroup_all') {
      const groups = r.groups as Array<{ groupId: number; tabIds: number[] }>
      let cleared = 0
      let tabsUngrouped = 0
      const failed: Array<{ groupId: number; reason: string }> = []
      for (const g of groups) {
        try {
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
          tabsUngrouped += validIds.length
        } catch (e: unknown) {
          const reason = e instanceof Error ? e.message : String(e)
          console.warn('[clientExec] ungroup 失败:', g.groupId, 'err=', reason)
          failed.push({ groupId: g.groupId, reason })
        }
      }
      return {
        success: cleared > 0,
        ungrouped: cleared,
        tabsUngrouped,
        failed: failed.length,
        message:
          cleared > 0
            ? t('step.groupsRemoved', { groups: cleared, tabs: tabsUngrouped }) +
              (failed.length > 0 ? t('step.failedCount', { count: failed.length }) : '')
            : failed.length > 0
              ? t('engine.ungroupFailedAll', {
                  list: failed.map((f) => f.reason).join('; '),
                })
              : t('step.noGroupsPlain'),
      }
    }

    // 按域名分组：调 chrome.tabs.group 创建分组，再 chrome.tabGroups.update 设标题
    if (r.clientExec === 'tabs_group_by_domain') {
      const groups = r.groups as Array<{ title: string; tabIds: number[]; windowId: number }>
      let created = 0
      const failed: Array<{ title: string; reason: string }> = []
      for (const g of groups) {
        try {
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
            failed.push({ title: g.title, reason: t('engine.tooFewTabs') })
            continue
          }
          const resultGroupId = await chrome.tabs.group({
            tabIds: validIds,
            createProperties: { windowId: g.windowId },
          })
          try {
            await chrome.tabGroups.update(resultGroupId, { title: g.title })
          } catch (e) {
            console.warn('[clientExec] 设置分组标题失败:', g.title, e)
          }
          created++
        } catch (e: unknown) {
          const reason = e instanceof Error ? e.message : String(e)
          console.warn('[clientExec] 创建分组失败:', g.title, 'err=', reason)
          failed.push({ title: g.title, reason })
        }
      }
      return {
        success: created > 0,
        groupedTabs: created,
        failed: failed.length,
        message:
          created > 0
            ? t('step.groupsCreated', { count: created }) +
              (failed.length > 0
                ? t('engine.groupPartialFail', {
                    count: failed.length,
                    list: failed.map((f) => `${f.title}(${f.reason})`).join(', '),
                  })
                : '')
            : failed.length > 0
              ? t('engine.groupFailedAll', {
                  list: failed.map((f) => `${f.title}(${f.reason})`).join('; '),
                })
              : t('engine.noTabsToGroup'),
      }
    }

    return result
  }

  /**
   * Agent loop 步骤日志摘要（紧凑格式）
   */
  function formatStepSummary(result: ExecutionResult, toolName: string): string {
    return formatResultDescription(result as Record<string, unknown>, toolName)
  }

  function formatHelp(): string {
    // markdown 表格：命令 / 别名 / 参数 / 说明
    // - 表格里的 `|` 必须转义为 `\|`（词条里的 {'|'} 会被 vue-i18n 解析回字面量 |）
    // - aliases 拼接多个别名，便于一眼看到
    const lines: string[] = [
      t('slash.header'),
      '',
      `| ${t('slash.colCommand')} | ${t('slash.colAlias')} | ${t('slash.colArg')} | ${t('slash.colDesc')} |`,
      '| --- | --- | --- | --- |',
    ]
    for (const c of SLASH_COMMANDS) {
      const cmd = `/${c.slash}`
      const aliases =
        c.aliases && c.aliases.length > 0 ? c.aliases.map((a) => `/${a}`).join(', ') : '-'
      // hasArg 命令在词条表里必有 ph；desc/ph 缺失时由 fallbackLocale（en）兜底
      const arg = c.hasArg ? `<${t(`slash.${c.intent}.ph`)}>` : '-'
      const desc = t(`slash.${c.intent}.desc`).replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(`| \`${cmd}\` | ${aliases} | \`${arg}\` | ${desc} |`)
    }
    return lines.join('\n')
  }

  function formatSlashCommands(): string {
    return SLASH_COMMANDS.map((c) => `/${c.slash} — ${t(`slash.${c.intent}.desc`)}`).join('\n')
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
      addMessage(
        'ai-chat',
        wrapCatReply(
          t('engine.failWithMessage', {
            message: result.message || t('engine.failGeneric'),
            hint: result.suggestion
              ? ' ' + t('engine.opSuggestion', { text: result.suggestion })
              : '',
          })
        )
      )
      return
    }
    if (result.error) {
      addMessage('ai-chat', wrapCatReply(t('engine.failGeneric')))
      return
    }

    const r = result as Record<string, unknown>

    // 客户端执行路径：chrome.tabs.group/ungroup 在 MV3 SW 上下文会被静默挂起
    // （SW 不是用户激活的上下文）。SW 把分组数据准备好后返回 clientExec 标志，
    // 我们在 side panel（用户激活上下文）里直接调 API（逻辑抽到 executeClientExec，与 agentLoop 共用）。
    if (r.clientExec) {
      const execResult = await executeClientExec(result)
      addMessage(
        'ai-chat',
        wrapCatReply((execResult as { message?: string }).message || t('engine.done'))
      )
      return
    }

    // 截图：显示图片并自动复制到剪贴板
    if (r.screenshot && typeof r.screenshot === 'string') {
      // 整页截图超长截断等提示信息（content script 返回的 message）
      if (r.message && typeof r.message === 'string') {
        addMessage('system', r.message)
      }
      showScreenshot(r.screenshot, r.tabTitle as string | undefined, r.mode as string | undefined)
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
      addMessage('ai-chat', { markdown: wrapCatReply(t('intent.pinned')) })
      return
    }
    if (intent === 'unpin_tab') {
      addMessage('ai-chat', { markdown: wrapCatReply(t('intent.unpinned')) })
      return
    }
    if (intent === 'duplicate_tab') {
      const title = (r.tab as { title?: string } | undefined)?.title
      const url = (r.tab as { url?: string } | undefined)?.url
      const label = title || url
      addMessage('ai-chat', {
        markdown: wrapCatReply(
          label ? t('intent.tabDuplicated', { label }) : t('intent.tabDuplicatedPlain')
        ),
      })
      return
    }
    if (intent === 'tabs_create') {
      const title = (r.tab as { title?: string } | undefined)?.title
      const url = (r.tab as { url?: string } | undefined)?.url
      const label = title || url
      addMessage('ai-chat', {
        markdown: wrapCatReply(
          label ? t('intent.tabCreated', { label }) : t('intent.tabCreatedPlain')
        ),
      })
      return
    }
    if (intent === 'add_bookmark') {
      const bm = r.bookmark as { title?: string; url?: string } | undefined
      const label = bm?.title || bm?.url
      addMessage('ai-chat', {
        markdown: wrapCatReply(
          label ? t('intent.bookmarkAdded', { label }) : t('intent.bookmarkAddedPlain')
        ),
      })
      return
    }
    if (intent === 'remove_bookmark') {
      const node = r.removedNode as { title?: string; url?: string } | undefined
      const label = node?.title || node?.url
      const removed = typeof r.removed === 'number' ? r.removed : 1
      // 文件夹判定：无 url 即文件夹（chrome.bookmarks.get 返回的节点可能不含 children 字段）
      const isFolder = node && !node.url
      addMessage('ai-chat', {
        markdown: wrapCatReply(
          label && isFolder && removed > 1
            ? t('intent.folderDeleted', { label, count: removed })
            : label
              ? t('intent.bookmarkDeleted', { label })
              : t('intent.bookmarksDeleted', { count: removed })
        ),
      })
      return
    }
    if (intent === 'delete_history') {
      // /clear-history：基于 slots.timeRange 生成文案，不依赖不可靠的 r.deleted
      // （deleteAll/deleteRange 返回 void，无法精确计数；仅 query/selectedUrls 场景有 deleted）
      const timeRange = (slots?.timeRange as string) || 'all'
      const rangeKey = `intent.historyRange.${timeRange}`
      // 未知时间范围词条缺失时回退展示原始值
      const label = i18n.global.te(rangeKey) ? t(rangeKey) : timeRange
      const deleted = typeof r.deleted === 'number' ? r.deleted : null
      addMessage('ai-chat', {
        markdown: wrapCatReply(
          deleted != null
            ? t('intent.historyDeleted', { range: label, count: deleted })
            : t('intent.historyDeletedAll', { range: label })
        ),
      })
      return
    }
    if (intent === 'clear_cookies') {
      // SW removeCookies 返回 { success, removed, domain }；removed 是真实删除条数
      const domain = r.domain as string | undefined
      const removed = typeof r.removed === 'number' ? r.removed : 0
      addMessage('ai-chat', {
        markdown: wrapCatReply(
          domain
            ? t('intent.cookiesCleared', { domain, count: removed })
            : t('intent.cookiesClearedAll', { count: removed })
        ),
      })
      return
    }
    if (intent === 'set_theme') {
      const tr = r as Record<string, unknown>
      const mode = tr.themeMode as string | undefined
      const color = tr.themeColor as string | undefined
      if (color) {
        addMessage('ai-chat', { markdown: wrapCatReply(t('intent.themeColorSet', { color })) })
      } else if (mode) {
        const modeKey = `intent.themeMode.${mode}`
        // 未知主题模式词条缺失时回退展示原始值
        const label = i18n.global.te(modeKey) ? t(modeKey) : mode
        addMessage('ai-chat', {
          markdown: wrapCatReply(t('intent.themeModeSet', { mode: label })),
        })
      } else {
        addMessage('ai-chat', { markdown: wrapCatReply(t('intent.themeSet')) })
      }
      return
    }

    // 走 markdown-factory 优先；未注册的 intent 走 fallback（纯 markdown 兜底）
    const body = buildMarkdownBody(intent, result)
    addMessage(
      'ai-chat',
      body ?? {
        markdown: wrapCatReply(formatResultDescription(r, intent) || t('engine.done')),
      }
    )
  }

  // ──── 录制执行器（由独立模块管理，避免本文件状态膨胀） ────
  // 所有录制逻辑（状态机、资源管理、cleanup）都在 recordingExecutor 内部完成
  // 此处仅作为依赖注入入口
  /**
   * 在 system 错误气泡之外，再补一个 ai-chat 友好反馈。
   *
   * 为什么需要：system 气泡字号小、视觉上像日志。AI 错误/超时/服务不可用时如果只
   * 有 system 气泡，用户会以为"AI 没回复我"。再补一个 ai-chat（cat 语气）让用户
   * 明确感知到这是 AI 在说话、且告知出了什么问题。
   *
   * 调用方已经在 addMessage('system', ...) 后调用本函数，避免重复文案。
   *
   * @param friendlyReply 给用户看的友好解释（与 system 文案不同角度，cat 语气）
   */
  function reportUserFacingError(friendlyReply: string): void {
    addMessage('ai-chat', { markdown: wrapCatReply(friendlyReply) })
  }

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

  /** 截图模式 → 词条 key（未知模式走无模式前缀文案，与旧 SCREENSHOT_MODE_LABEL 行为一致） */
  const SCREENSHOT_MODE_KEYS: Record<string, string> = {
    full: 'shot.modeFull',
    area: 'shot.modeArea',
    visible: 'shot.modeVisible',
  }

  /**
   * 显示截图气泡 + 异步复制到剪贴板。文案按 mode + 复制结果生成。
   * @param dataUrl - 截图 data URL
   * @param tabTitle - 当前标签标题（缺省 fallback 为「页面」词条）
   * @param mode - 截图模式：'visible' | 'full' | 'area'，缺省/未知时不带模式前缀
   */
  async function showScreenshot(dataUrl: string, tabTitle?: string, mode?: string) {
    const ok = await copyScreenshotToClipboard(dataUrl)
    const tail = ok ? t('shot.copiedTail') : t('shot.manualTail')
    const title = tabTitle || t('shot.pageFallback')
    const modeKey = mode ? SCREENSHOT_MODE_KEYS[mode] : undefined
    const prefix = modeKey
      ? t('shot.prefix', { mode: t(modeKey), title })
      : t('shot.prefixPlain', { title })
    addMessage('ai-chat', wrapCatReply(`${prefix} ${tail}`), dataUrl)
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
    if (ai.reply && typeof ai.reply === 'object') return unwrapStructuredReply(ai.reply)
    if (typeof ai.reply === 'string') {
      return { markdown: wrapCatReply(unwrapNestedString(ai.reply) ?? ai.reply) }
    }
    if (typeof ai.content === 'string') {
      return { markdown: wrapCatReply(unwrapNestedString(ai.content) ?? ai.content) }
    }
    if (typeof nested === 'string') {
      return { markdown: wrapCatReply(unwrapNestedString(nested) ?? nested) }
    }
    return { markdown: wrapCatReply(fallback) }
  }

  /**
   * 从一个 MessageBody / 结构化对象里取可读的 markdown 文本。
   * 仅做最小剥离：markdown 字段是字符串时原样保留，components 透传。
   * 不再尝试格式化 JSON 对象 —— 这种代偿逻辑会让 prompt 失效（模型会觉得"反正代码会兜底"）。
   */
  function unwrapStructuredReply(body: MessageBody): MessageBody {
    const next: MessageBody = {
      markdown: typeof body.markdown === 'string' ? wrapCatReply(body.markdown) : wrapCatReply(''),
    }
    if (body.components) next.components = body.components
    return next
  }

  /**
   * 把明显的套娃字符串剥到最里层 reply/content/message 字段（最多 2 层）。
   *
   * 只处理 `{"reply":"..."}` / `{"content":"..."}` / `{"message":"..."}` 这种外层包装。
   * 不处理 JSON 对象（不格式化嵌套对象 —— 见 unwrapStructuredReply 注释）。
   * 主要修复一类具体 bug：AI 把整段 markdown 包成 `{"reply": "..."}` 字符串塞进 args.reply。
   */
  function unwrapNestedString(text: string): string | undefined {
    const trimmed = text.trim()
    if (trimmed[0] !== '{') return undefined
    try {
      const parsed = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== 'object') return undefined
      const v =
        (parsed as Record<string, unknown>).reply ??
        (parsed as Record<string, unknown>).content ??
        (parsed as Record<string, unknown>).message
      return typeof v === 'string' ? v : undefined
    } catch {
      return undefined
    }
  }

  /**
   * 发送 AI 对话消息（chat / done / ask 等收尾 action）。
   *
   * 不再附带截图气泡：截图气泡由 screenshot 工具步骤显式触发（见 agent loop 中的
   * if (toolName === 'screenshot' || ...) 分支），避免一个 ai-chat 任务里同时出现
   * "网页内容" + "整页截图" 两个气泡。lastScreenshot 只在收尾 action 是 chat 时才
   * 被消费（chat 路径用 message.history / next chat 即可消费，不需要单独气泡）。
   */
  function emitAIChat(text: string | MessageBody, doCleanup: boolean) {
    // 消费掉截图数据，避免下次 chat 又把旧截图带出来。
    // 但不再调用 showScreenshot 弹截图气泡——截图由 screenshot 工具步骤单独呈现。
    lastScreenshot.value = null
    lastScreenshotMode.value = null
    const body: MessageBody = typeof text === 'string' ? { markdown: wrapCatReply(text) } : text
    addMessage('ai-chat', body)
    if (doCleanup) cleanup()
  }

  /**
   * 将 data URL 截图复制到剪贴板。
   * @param dataUrl - 图片 data URL
   * @returns true 复制成功；false 失败（用户无感知前的最后兜底，仅 console.warn）
   */
  async function copyScreenshotToClipboard(dataUrl: string): Promise<boolean> {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      console.log('[AI管家] 截图已复制到剪贴板')
      return true
    } catch (err) {
      console.warn('[AI管家] 复制截图失败:', err)
      return false
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
      get isInitialized() {
        return isInitialized.value
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
    cleanup,
    stopAgentLoop,
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
