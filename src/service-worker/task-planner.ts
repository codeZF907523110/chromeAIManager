/**
 * 任务规划执行器（Service Worker 端）
 * 实施五阶段方案：①分析意图 → ②扫描DOM → ③规划流程 → ④执行+审查循环 → ⑤最终审查
 */

import { domManipulate } from './executor'

// ──── 类型定义 ────

export type TaskIntentType = 'INTERACTIVE' | 'AUTOMATIC' | 'DATA' | 'MIXED'
export type IntentStatus = 'READY' | 'NEED_USER_DATA' | 'NEED_PAGE_NAVIGATE'
export type PlanStatus = 'READY' | 'PARTIAL'
export type StepType = 'EXECUTE' | 'ASK_USER'
export type StepStatus = 'SUCCESS' | 'RETRY' | 'SKIP' | 'FAIL' | 'ASK_USER' | 'DONE'
export type PlanPhase =
  | 'ANALYZE_INTENT'
  | 'SCAN_DOM'
  | 'PLAN_STEPS'
  | 'EXECUTE_STEPS'
  | 'FINAL_REVIEW'
  | 'ABORTED'
  | 'COMPLETED'

export interface IntentResult {
  goal: string
  type: TaskIntentType
  requiredData: string[]
  dataStatus: Record<string, 'MISSING' | 'PROVIDED'>
  precondition: string
  status: IntentStatus
  missingDataKeys?: string[]
}

export interface ScanElement {
  selector: string
  tag: string
  text: string
  interactive: boolean
  visible: boolean
}

export interface ScanResult {
  url: string
  title: string
  status: string
  elements: ScanElement[]
  regions: {
    popup: string | null
    form: string | null
    content: string | null
  }
}

export interface PlanStep {
  id: number
  goal: string
  action: { name: string; args: Record<string, unknown> }
  type: StepType
  expectState: string
  fallback?: { description: string; code: string; verify: string }
  userDataKey?: string
  userDataPrompt?: string
}

export interface StepExecutionResult {
  stepId: number
  status: StepStatus
  execution: {
    success: boolean
    result: unknown
    world?: string
    duration?: number
    error?: string
  }
  verification: { verified: boolean; verifyValue: unknown }
  failureAnalysis?: string
  retryCount: number
  skipped?: boolean
  skipReason?: string
}

export interface FinalReport {
  taskComplete: boolean
  goal: string
  completionSign: string | null
  stepsSummary: { total: number; success: number; skipped: number; failed: number }
  unfinishedSteps: Array<{ id: number; goal: string; reason: string }>
  userCanDo: string
}

// TaskPlanner 状态（模块级单例）
interface TaskState {
  phase: PlanPhase
  intent?: IntentResult
  scan?: ScanResult
  steps: PlanStep[]
  planStatus: PlanStatus
  currentStep: number
  stepResults: StepExecutionResult[]
  userData: Record<string, unknown>
  tabId: number
}

let task: TaskState | null = null

// ──── 扫描 DOM ────

async function scanPageDOM(tabId: number): Promise<ScanResult | null> {
  const code = `
    var els = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [onclick], div, span, label, h1, h2, h3, h4, h5, h6, p, li, td, th, img, svg');
    var result = [];
    var seenSelectors = new Set();
    var count = 0;
    for (var i = 0; i < els.length && count < 200; i++) {
      var el = els[i];
      var tag = el.tagName.toLowerCase();
      var text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 100);
      if (!text && tag !== 'img' && tag !== 'svg' && tag !== 'input') continue;
      if (el.offsetParent === null && tag !== 'input' && tag !== 'select' && tag !== 'textarea') continue;
      var sel = tag + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
      if (seenSelectors.has(sel)) continue;
      seenSelectors.add(sel);
      var interactive = ['button', 'a', 'input', 'select', 'textarea', '[role="button"]'].some(function(s) {
        try { return el.matches(s); } catch(e) { return false; }
      });
      result.push({
        selector: sel,
        tag: tag,
        text: text,
        interactive: interactive,
        visible: el.offsetParent !== null || tag === 'input' || tag === 'select' || tag === 'textarea'
      });
      count++;
    }
    var popup = document.querySelector('.modal, .popup, .dialog, [role="dialog"], [aria-modal="true"]');
    var forms = document.querySelectorAll('form');
    var formFields = [];
    forms.forEach(function(f) {
      var inputs = f.querySelectorAll('input, select, textarea');
      inputs.forEach(function(inp) {
        formFields.push({
          tag: inp.tagName.toLowerCase(),
          type: inp.type || '',
          name: inp.name || '',
          id: inp.id || '',
          placeholder: inp.placeholder || '',
          required: inp.required || false
        });
      });
    });
    return {
      url: location.href,
      title: document.title || '',
      status: document.readyState,
      elements: result,
      regions: {
        popup: popup ? '存在弹窗: ' + (popup.className || popup.id || 'dialog') : null,
        form: formFields.length ? JSON.stringify(formFields.slice(0, 20)) : null,
        content: document.body ? (document.body.innerText || '').trim().slice(0, 300) : null
      }
    };
  `
  try {
    const result = await domManipulate({ tabId, code })
    if (result.success && result.result) {
      return result.result as ScanResult
    }
  } catch {
    // ignore
  }
  return null
}

// ──── 最终验证 ────

async function verifyFinalState(tabId: number): Promise<{ complete: boolean; sign: string }> {
  const code = `
    var hasLoginBtn = !!document.querySelector('button, a');
    var hasUserInfo = !!document.querySelector('[class*="user"], [class*="avatar"], [class*="nickname"], [data-userid]');
    return {
      complete: !hasLoginBtn || hasUserInfo,
      sign: hasUserInfo ? '检测到用户信息元素' : (hasLoginBtn ? '仍存在操作入口' : '未检测到明确状态')
    };
  `
  try {
    const result = await domManipulate({ tabId, code })
    if (result.success && result.result) {
      return result.result as { complete: boolean; sign: string }
    }
  } catch {
    // ignore
  }
  return { complete: false, sign: '验证执行失败' }
}

// ──── 发送消息给 AI（推送到 sidepanel） ────

function sendToAI(type: string, data: Record<string, unknown>): void {
  try {
    chrome.runtime.sendMessage({ type: 'TASK_PLANNER_UPDATE', plannerType: type, ...data })
  } catch {
    // sidepanel 可能未打开
  }
}

// ──── 分析失败原因 ────

function analyzeFailure(
  result: { success?: boolean; message?: string },
  verifyValue: unknown
): string {
  if (result.success === false) {
    const msg = result.message || ''
    if (
      msg.includes('not found') ||
      msg.includes('不存在') ||
      msg.includes('null') ||
      msg.includes('undefined')
    ) {
      return '元素未找到：选择器可能错误或页面结构已变化'
    }
    if (msg.includes('CSP') || msg.includes('Security')) {
      return 'CSP 安全策略阻止了操作'
    }
    if (msg.includes('timeout') || msg.includes('超时')) {
      return '操作超时'
    }
    return '执行失败: ' + msg
  }
  if (verifyValue === false || verifyValue === null || verifyValue === undefined) {
    return '验证未通过，verify 返回值为 ' + String(verifyValue)
  }
  return '未知失败原因'
}

// ──── 对外接口 ────

export interface ExecPlanPayload {
  action:
    | 'analyze'
    | 'scan'
    | 'setPlan'
    | 'executeStep'
    | 'provideData'
    | 'finalReview'
    | 'abort'
    | 'getState'
  // analyze
  userText?: string
  providedData?: Record<string, unknown>
  // scan
  // setPlan
  steps?: PlanStep[]
  planStatus?: PlanStatus
  // executeStep
  // provideData
  userDataKey?: string
  userDataValue?: unknown
  // abort
  reason?: string
}

export interface ExecPlanResult {
  success: boolean
  phase: PlanPhase
  intent?: IntentResult
  scan?: ScanResult
  steps?: PlanStep[]
  planStatus?: PlanStatus
  stepResults?: StepExecutionResult[]
  currentStep?: number
  totalSteps?: number
  askUserPrompt?: string
  askUserKey?: string
  finalReport?: FinalReport
  error?: string
  message?: string
}

export async function execPlan(payload: ExecPlanPayload): Promise<ExecPlanResult> {
  switch (payload.action) {
    // 阶段①：分析意图
    case 'analyze': {
      const text = (payload.userText || '').trim()
      if (!text) {
        return { success: false, phase: 'ABORTED', error: '用户目标不能为空' }
      }

      let type: TaskIntentType = 'AUTOMATIC'
      const interactiveKeywords = ['登录', '注册', '填写', '输入', '验证码', '密码']
      const dataKeywords = ['导出', '保存', '抓取', '下载', '爬取', '获取']

      const hasInteractive = interactiveKeywords.some((kw) => text.includes(kw))
      const hasData = dataKeywords.some((kw) => text.includes(kw))

      if (hasInteractive && hasData) type = 'MIXED'
      else if (hasInteractive) type = 'INTERACTIVE'
      else if (hasData) type = 'DATA'

      const requiredData: string[] = []
      if (type === 'INTERACTIVE' || type === 'MIXED') {
        requiredData.push('用户账号信息')
        if (text.includes('验证码') || text.includes('短信')) {
          requiredData.push('验证码')
        }
      }
      if (type === 'DATA') {
        requiredData.push('数据范围/格式要求')
      }

      const dataStatus: Record<string, 'MISSING' | 'PROVIDED'> = {}
      const missingDataKeys: string[] = []
      const provided = payload.providedData || {}

      for (const key of requiredData) {
        const matched = Object.keys(provided).some(
          (k) => key.includes(k) || k.includes(key.replace(/信息|要求/g, ''))
        )
        dataStatus[key] = matched ? 'PROVIDED' : 'MISSING'
        if (!matched) missingDataKeys.push(key)
      }

      let precondition = '用户需在目标页面执行操作'
      if (text.includes('当前页面') || text.includes('这个页面')) {
        precondition = '在当前活动标签页执行'
      }

      const status: IntentStatus = missingDataKeys.length > 0 ? 'NEED_USER_DATA' : 'READY'

      const intent: IntentResult = {
        goal: text,
        type,
        requiredData,
        dataStatus,
        precondition,
        status,
        missingDataKeys: missingDataKeys.length > 0 ? missingDataKeys : undefined,
      }

      task = {
        phase: status === 'READY' ? 'ANALYZE_INTENT' : 'ABORTED',
        intent,
        steps: [],
        planStatus: 'READY',
        currentStep: 0,
        stepResults: [],
        userData: { ...provided },
        tabId: 0,
      }

      if (status === 'NEED_USER_DATA') {
        return {
          success: false,
          phase: 'ABORTED',
          intent,
          error: '需要用户提供数据: ' + missingDataKeys.join('、'),
          message: '请提供完成目标所需的数据: ' + missingDataKeys.join('、'),
        }
      }

      return { success: true, phase: 'ANALYZE_INTENT', intent }
    }

    // 阶段②：扫描 DOM
    case 'scan': {
      if (!task) return { success: false, phase: 'ABORTED', error: '任务未初始化' }
      task.phase = 'SCAN_DOM'

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return { success: false, phase: 'ABORTED', error: '无法获取当前标签页' }
      task.tabId = tab.id

      let retries = 0
      while (retries < 3) {
        const scan = await scanPageDOM(tab.id)
        if (scan) {
          task.scan = scan
          return { success: true, phase: 'SCAN_DOM', scan }
        }
        retries++
        await new Promise((r) => setTimeout(r, 1000))
      }

      task.phase = 'ABORTED'
      return { success: false, phase: 'ABORTED', error: '页面扫描失败，已重试 3 次' }
    }

    // 阶段③：设置步骤序列
    case 'setPlan': {
      if (!task) return { success: false, phase: 'ABORTED', error: '任务未初始化' }
      task.phase = 'PLAN_STEPS'
      task.steps = payload.steps || []
      task.planStatus = payload.planStatus || 'READY'
      task.currentStep = 0
      task.stepResults = []

      sendToAI('planReady', {
        steps: task.steps,
        planStatus: task.planStatus,
        totalSteps: task.steps.length,
      })

      return {
        success: true,
        phase: 'PLAN_STEPS',
        steps: task.steps,
        planStatus: task.planStatus,
        totalSteps: task.steps.length,
        message: `计划已就绪，共 ${task.steps.length} 个步骤`,
      }
    }

    // 阶段④：执行下一步
    case 'executeStep': {
      if (!task || !task.steps.length) {
        return { success: false, phase: 'ABORTED', error: '计划未就绪' }
      }
      task.phase = 'EXECUTE_STEPS'

      const stepIndex = task.currentStep
      if (stepIndex >= task.steps.length) {
        task.phase = 'FINAL_REVIEW'
        return {
          success: true,
          phase: 'FINAL_REVIEW',
          stepResults: task.stepResults,
          currentStep: stepIndex,
          totalSteps: task.steps.length,
        }
      }

      const step = task.steps[stepIndex]

      // ASK_USER：暂停等待用户输入
      if (step.type === 'ASK_USER') {
        sendToAI('askUser', {
          stepId: step.id,
          goal: step.goal,
          prompt:
            (step.action.args?.prompt as string) || '请提供' + (step.userDataKey || '所需数据'),
          userDataKey: step.userDataKey,
          currentStep: stepIndex + 1,
          totalSteps: task.steps.length,
        })

        return {
          success: true,
          phase: 'EXECUTE_STEPS',
          askUserPrompt:
            (step.action.args?.prompt as string) || '请提供' + (step.userDataKey || '所需数据'),
          askUserKey: step.userDataKey,
          currentStep: stepIndex + 1,
          totalSteps: task.steps.length,
        }
      }

      // EXECUTE：执行 DOM 操作
      const execution: StepExecutionResult = {
        stepId: step.id,
        status: 'RETRY',
        execution: { success: false, result: null },
        verification: { verified: false, verifyValue: undefined },
        retryCount: 0,
      }

      const maxRetries = 2
      let code = step.action.args.code as string
      let verify = step.action.args.verify as string | undefined
      let usedFallback = false

      while (execution.retryCount <= maxRetries) {
        const startTime = Date.now()

        try {
          const result = await domManipulate({
            tabId: task.tabId,
            code,
            verify,
          })

          execution.execution = {
            success: result.success !== false,
            result: result.result,
            world: result.world as string | undefined,
            duration: Date.now() - startTime,
            error: result.success === false ? result.message : undefined,
          }

          if (result.success && result.detail?.verifyValue !== undefined) {
            const vv = result.detail.verifyValue
            execution.verification = {
              verified: vv !== false && vv !== null && vv !== undefined,
              verifyValue: vv,
            }
          } else if (result.success) {
            execution.verification = { verified: true, verifyValue: true }
          } else {
            execution.verification = { verified: false, verifyValue: undefined }
          }

          if (execution.verification.verified) {
            execution.status = 'SUCCESS'
            break
          }

          execution.failureAnalysis = analyzeFailure(result, execution.verification.verifyValue)

          if (execution.retryCount < maxRetries) {
            if (!usedFallback && step.fallback) {
              code = step.fallback.code
              verify = step.fallback.verify
              usedFallback = true
            } else {
              code = 'await new Promise(function(r){setTimeout(r,1500);});\n' + code
            }
          }
        } catch (e: unknown) {
          execution.execution.error = (e as Error)?.message || String(e)
          execution.failureAnalysis = '执行异常: ' + execution.execution.error
        }

        execution.retryCount++

        if (execution.retryCount > maxRetries) {
          const canSkip = stepIndex + 1 < task.steps.length
          if (canSkip) {
            execution.status = 'SKIP'
            execution.skipped = true
            execution.skipReason = '步骤执行失败且重试耗尽，已跳过'
          } else {
            execution.status = 'FAIL'
          }
        }
      }

      task.stepResults.push(execution)
      task.currentStep++

      sendToAI('stepResult', {
        stepId: step.id,
        goal: step.goal,
        status: execution.status,
        verification: execution.verification,
        failureAnalysis: execution.failureAnalysis,
        skipReason: execution.skipReason,
        currentStep: task.currentStep,
        totalSteps: task.steps.length,
      })

      if (task.currentStep >= task.steps.length) {
        task.phase = 'FINAL_REVIEW'
      }

      return {
        success: true,
        phase: task.phase,
        stepResults: task.stepResults,
        currentStep: task.currentStep,
        totalSteps: task.steps.length,
      }
    }

    // 用户数据填入（用于 ASK_USER 步骤后继续）
    case 'provideData': {
      if (!task) return { success: false, phase: 'ABORTED', error: '任务未初始化' }
      if (payload.userDataKey) {
        task.userData[payload.userDataKey] = payload.userDataValue
      }
      return {
        success: true,
        phase: 'EXECUTE_STEPS',
        currentStep: task.currentStep,
        totalSteps: task.steps.length,
      }
    }

    // 阶段⑤：最终审查
    case 'finalReview': {
      if (!task) return { success: false, phase: 'ABORTED', error: '任务未初始化' }
      task.phase = 'FINAL_REVIEW'

      const successSteps = task.stepResults.filter((s) => s.status === 'SUCCESS').length
      const skippedSteps = task.stepResults.filter((s) => s.status === 'SKIP').length
      const failedSteps = task.stepResults.filter((s) => s.status === 'FAIL').length

      let completionSign: string | null = null
      let taskComplete = false

      if (failedSteps === 0 && skippedSteps === 0) {
        try {
          const v = await verifyFinalState(task.tabId)
          taskComplete = v.complete
          completionSign = v.sign
        } catch {
          taskComplete = successSteps === task.steps.length
          completionSign = successSteps + '/' + task.steps.length + ' 步骤执行成功'
        }
      } else if (failedSteps === 0) {
        taskComplete = false
        completionSign =
          successSteps + '/' + task.steps.length + ' 步骤成功，' + skippedSteps + ' 步骤跳过'
      } else {
        taskComplete = false
        completionSign =
          successSteps + '/' + task.steps.length + ' 步骤成功，' + failedSteps + ' 步骤失败'
      }

      const unfinishedSteps = task.stepResults
        .filter((s) => s.status === 'FAIL' || s.status === 'SKIP')
        .map((s) => ({
          id: s.stepId,
          goal: task!.steps[s.stepId - 1]?.goal || '步骤 ' + s.stepId,
          reason: s.failureAnalysis || s.skipReason || '未知原因',
        }))

      const finalReport: FinalReport = {
        taskComplete,
        goal: task.intent?.goal || '',
        completionSign,
        stepsSummary: {
          total: task.steps.length,
          success: successSteps,
          skipped: skippedSteps,
          failed: failedSteps,
        },
        unfinishedSteps,
        userCanDo:
          unfinishedSteps.length > 0
            ? '可重新发起任务，或手动完成剩余步骤'
            : '如需执行其他操作，请继续描述',
      }

      task.phase = taskComplete ? 'COMPLETED' : 'ABORTED'

      sendToAI('finalReport', { finalReport })

      return {
        success: true,
        phase: task.phase,
        finalReport,
        stepResults: task.stepResults,
        totalSteps: task.steps.length,
      }
    }

    // 中断任务
    case 'abort': {
      if (task) {
        task.phase = 'ABORTED'
      }
      task = null
      return { success: false, phase: 'ABORTED', error: payload.reason || '任务已中断' }
    }

    // 获取当前状态
    case 'getState': {
      if (!task) {
        return { success: false, phase: 'ANALYZE_INTENT', error: '无进行中的任务' }
      }
      return {
        success: true,
        phase: task.phase,
        intent: task.intent,
        scan: task.scan,
        steps: task.steps,
        planStatus: task.planStatus,
        stepResults: task.stepResults,
        currentStep: task.currentStep,
        totalSteps: task.steps.length,
      }
    }

    default:
      return {
        success: false,
        phase: 'ABORTED',
        error: '未知 action: ' + (payload as unknown as Record<string, unknown>).action,
      }
  }
}
