/**
 * 任务规划执行器（Service Worker 端）
 * 实施五阶段方案：①分析意图 → ②扫描DOM → ③规划流程 → ④执行+审查循环 → ⑤最终审查
 */

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
    // 阶段①：分析意图（AI 决策，已移除硬编码关键词分类）
    case 'analyze': {
      const text = (payload.userText || '').trim()
      if (!text) {
        return { success: false, phase: 'ABORTED', error: '用户目标不能为空' }
      }

      // DOM 操作能力已移除，task_plan 暂时不可用
      return {
        success: false,
        phase: 'ABORTED',
        error: 'task_plan 功能暂时不可用，等待新 DOM 操作架构实现',
        message: 'DOM 操作功能正在重新架构中，暂不支持任务规划命令',
      }
    }

    // 阶段②：扫描 DOM（已废弃）
    case 'scan': {
      return { success: false, phase: 'ABORTED', error: 'task_plan 功能暂时不可用' }
    }

    // 阶段③：设置步骤序列
    case 'setPlan': {
      if (!task) return { success: false, phase: 'ABORTED', error: '任务未初始化' }
      task.phase = 'PLAN_STEPS'
      task.steps = payload.steps || []
      task.planStatus = payload.planStatus || 'READY'
      task.currentStep = 0
      task.stepResults = []

      return {
        success: true,
        phase: 'PLAN_STEPS',
        steps: task.steps,
        planStatus: task.planStatus,
        totalSteps: task.steps.length,
        message: `计划已就绪，共 ${task.steps.length} 个步骤`,
      }
    }

    // 阶段④：执行下一步（已废弃）
    case 'executeStep': {
      return { success: false, phase: 'ABORTED', error: 'task_plan 功能暂时不可用' }
    }

    // 阶段⑤：最终审查（已废弃）
    case 'finalReview': {
      return { success: false, phase: 'ABORTED', error: 'task_plan 功能暂时不可用' }
    }

    // 用户数据填入（已废弃）
    case 'provideData': {
      return { success: false, phase: 'ABORTED', error: 'task_plan 功能暂时不可用' }
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
