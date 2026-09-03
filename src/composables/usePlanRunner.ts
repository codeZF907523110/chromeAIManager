/**
 * Plan Runner — 自然语言入口
 *
 * 单次 AI 调用 → 严格 JSON 解析 → SW plan-runner DAG 调度 → 渲染结果。
 * 替代旧 useAIEngine.agentLoop 的"多轮工具调用循环"。
 *
 * 状态消息（思考中 / 执行中）走 useAIEngine 提供的 system 消息通道，
 * 通过 PlanRunnerContext.updateStatusText / removeStatusText 控制。
 * 这样保持与历史一致的"system 通道"形态，UI 沿用 .bubble-system 样式。
 */

import { ref } from 'vue'
import { aiEngine } from './useAIEngine'
import { buildSystemPrompt, type ContextSnapshot } from '../shared/ai/system-prompt'
import { getCommand } from '../shared/commands'
import { MSG_EXECUTE_PLAN, MSG_GET_CONTEXT } from '../shared/constants'
import type { AIPlan } from '../shared/ai/plan-types'
import type { PlanExecutionReport } from '../service-worker/plan-runner'
import { wrapCatReply } from '../shared/personality'
import { buildReconfirmPayload } from '../shared/confirm'
import { executeClientExec } from '../shared/client-exec'
import {
  renderExecutionResult as renderResult,
  type RenderResultDeps,
} from '../shared/render-result'
import type { ConfirmCardData, MessageBody, MessageLog } from '../types'
import { detectHalfPlan } from '../shared/ai/intent-rules'
export interface PlanRunnerContext {
  addMessage: (
    type: MessageLog['type'],
    text: string | MessageBody,
    image?: string,
    video?: string,
    recordingFile?: MessageLog['recordingFile']
  ) => void
  /** 替换当前的状态消息文本（如 "思考中..." → "执行中 (1/3)"） */
  updateStatusText: (text: string) => void
  /** 完成或失败后移除状态消息 */
  removeStatusText: () => void
  setPendingConfirm: (value: ConfirmCardData | null) => void
  renderExecutionResult: (
    intent: string,
    response: unknown,
    slots?: Record<string, unknown>
  ) => Promise<void>
}

/** 单次 in-flight AI 调用的 AbortController */
let abortCtl: AbortController | null = null

/**
 * 当前 plan 路径是否在跑（暴露给 UI 显示停止按钮）
 * 用 ref + setter 让 App.vue 的轮询能拿到最新值
 */
const runningRef = ref(false)
export function isRunning(): boolean {
  return runningRef.value
}

/** 中断当前 AI 请求（用户在 UI 上点"停止"时调用） */
export function abort(): void {
  if (abortCtl) {
    abortCtl.abort(new Error('USER_STOPPED'))
    abortCtl = null
  }
  runningRef.value = false
}

/**
 * 自然语言入口：单次 AI 调用 + DAG 调度执行 plan
 */
export async function run(userText: string, ctx: PlanRunnerContext): Promise<void> {
  abortCtl?.abort()
  abortCtl = new AbortController()
  runningRef.value = true

  // 收集 summary 上下文
  const summaryContext = await getSummaryContext()

  // 调 AI（jsonMode 强制 JSON）
  let raw: string
  try {
    raw = await aiEngine.chatWithHistory(
      [
        { role: 'system', content: buildSystemPrompt(summaryContext) },
        { role: 'user', content: userText },
      ],
      { temperature: 0.1, jsonMode: true, mode: 'task', signal: abortCtl.signal }
    )
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'NO_AI_BACKEND') {
      ctx.addMessage('system', 'AI 服务未配置，请在设置中添加 API Key 或使用 Gemini Nano')
    } else if ((e as { name?: string })?.name === 'AbortError') {
      ctx.addMessage('system', '已停止当前任务')
    } else {
      ctx.addMessage('system', '抱歉，AI 服务暂时不可用，请稍后再试喵~')
    }
    abortCtl = null
    runningRef.value = false
    ctx.removeStatusText()
    return
  }
  abortCtl = null
  runningRef.value = false

  // 严格解析
  let parsed: AIPlan
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    ctx.addMessage('ai-chat', wrapCatReply('抱歉，我没理解您的请求喵~'))
    ctx.removeStatusText()
    return
  }

  // 闲聊路径：检查是否同时有截图需求
  if (parsed.chat) {
    // 检查 AI plan 中是否有截图命令
    if (parsed.plan?.some((item) => item.tool === 'screenshot')) {
      // 有截图 plan，需要将截图和闲聊合并到一条消息
      ctx.updateStatusText('执行中...')

      // 创建带合并逻辑的渲染依赖
      const chatReply = parsed.chat.reply
      let screenshotHandled = false

      const screenshotDeps: RenderResultDeps = {
        addAIChat: (text) => ctx.addMessage('ai-chat', text),
        addSystem: (text) => ctx.addMessage('system', text),
        showScreenshot: (dataUrl, tabTitle) => {
          // 将截图和闲聊内容合并到一条消息
          const markdown = chatReply
            ? `${chatReply}\n\n[截图: ${tabTitle || '页面'}]`
            : `[截图: ${tabTitle || '页面'}]`
          ctx.addMessage('ai-chat', wrapCatReply(markdown), dataUrl)
          screenshotHandled = true
        },
      }

      try {
        console.log(
          `[usePlanRunner][chat+screenshot] -> SW MSG_EXECUTE_PLAN items=${parsed.plan?.length ?? 0}`
        )
        const report = (await chrome.runtime.sendMessage({
          type: MSG_EXECUTE_PLAN,
          command: { plan: parsed },
        })) as PlanExecutionReport
        console.log(
          `[usePlanRunner][chat+screenshot] <- SW report hasItems=${Array.isArray(report?.items)}, items=${report?.items?.length ?? 0}, success=${report?.success}, needsConfirm=${!!report?.needsConfirm}`,
          `itemCodes=${report?.items?.map((it) => `${it.tool}:${(it.result as { code?: string; success?: boolean })?.code ?? (it.result as { success?: boolean })?.success ?? '?'}`).join(',') ?? '<no-items>'}`
        )
        if (!report || !Array.isArray(report.items)) {
          const reason =
            (report as { error?: string; message?: string; code?: string } | null)?.error ||
            (report as { message?: string } | null)?.message ||
            (report as { code?: string } | null)?.code ||
            'SW 返回结构无效'
          console.error(
            `[usePlanRunner][chat+screenshot] invalid structure, report=${JSON.stringify(report)?.slice(0, 500)}`
          )
          throw new Error(reason)
        }

        // 渲染结果
        for (const item of report.items) {
          await renderResult(item.tool, item.result, item.args, screenshotDeps)
        }

        // 如果截图未处理（AI 没有返回截图），补发闲聊消息
        if (!screenshotHandled) {
          ctx.addMessage('ai-chat', wrapCatReply(chatReply))
        }
      } catch (e: unknown) {
        ctx.addMessage('system', `执行失败: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      // 没有截图 plan，直接发送闲聊
      ctx.addMessage('ai-chat', wrapCatReply(parsed.chat.reply))
    }
    ctx.removeStatusText()
    return
  }

  // 5. 空 plan
  if (!parsed.plan?.length) {
    ctx.addMessage('ai-chat', wrapCatReply(parsed.thought || '已完成'))
    ctx.removeStatusText()
    return
  }

  // 6. 兜底补齐 plan item 必填字段（AI 偶尔会漏 deps）。
  //    SW 端 isValidAIPlan 仍做严格校验；这里仅做兼容性兜底。
  for (const item of parsed.plan) {
    if (!Array.isArray(item.deps)) {
      console.warn(
        `[usePlanRunner] AI 漏了 deps 字段，补 []; item=${item.id} tool=${item.tool}`
      )
      item.deps = []
    }
    if (!item.args || typeof item.args !== 'object') {
      console.warn(
        `[usePlanRunner] AI 漏了 args 字段，补 {}; item=${item.id} tool=${item.tool}`
      )
      item.args = {}
    }
  }

  // 7. 对每个 plan item 应用 precompute（如果 requiresPrecompute），
  //    把 query/domain 等参数转换为 tabIds 等 SW 可直接消费的字段
  //
  // ⚠️ 关键：对于危险工具（dangerous=true）必须保留 domain 而不预解析为 tabIds。
  // 如果把 tabIds 注入 args，SW 端 buildConfirmChildren 会走 explicitIds 分支，
  // 看似"已经确定目标"——但这会让用户失去确认和反悔的机会。
  // 正确做法：让 args 保持 { domain }，让 SW 端 dispatchTool 在 NEEDS_CONFIRM 时
  // 自己基于 domain 计算 children 列表，再让用户在前端确认卡上勾选。
  try {
    const { refreshContext, precompute } = await import('./usePrecompute')
    await refreshContext()
    for (const item of parsed.plan) {
      const command = getCommand(item.tool)
      if (!command?.requiresPrecompute) continue

      const before = JSON.stringify(item.args)
      const computed = await precompute(item.tool, item.args)

      // 危险工具：保留原始 args（domain/query），把预计算的 tabIds 作为"候选"
      // 注入到顶层 candidates 字段，让 SW buildConfirmChildren 用作回退数据源，
      // 但 dispatchTool 仍走 NEEDS_CONFIRM 路径。
      if (command.dangerous) {
        console.log(
          `[usePlanRunner] dangerous tool=${item.tool}, skip arg overwrite, store candidates only`
        )
        if (Array.isArray((computed as { tabIds?: unknown }).tabIds)) {
          ;(item as unknown as { candidates?: unknown }).candidates = (
            computed as { tabIds?: unknown }
          ).tabIds
        }
        console.log(
          `[usePlanRunner] precompute tool=${item.tool} before=${before} after=${JSON.stringify(item.args)} candidates=${JSON.stringify((item as { candidates?: unknown }).candidates)}`
        )
        continue
      }

      // 非危险工具：正常合并
      const mergedArgs = { ...item.args, ...computed }
      if (Array.isArray((mergedArgs as { tabIds?: unknown }).tabIds)) {
        ;(item as unknown as { tabIds?: unknown }).tabIds = (
          mergedArgs as { tabIds?: unknown }
        ).tabIds
      }
      item.args = mergedArgs
      console.log(
        `[usePlanRunner] precompute tool=${item.tool} before=${before} after=${JSON.stringify(item.args)}`
      )
    }
  } catch (e: unknown) {
    console.warn('[AI管家] precompute 失败:', e instanceof Error ? e.message : String(e))
  }

  // 7. 切到执行中：用 updateStatusText 把状态消息替换为执行进度
  ctx.updateStatusText(`执行中 (0/${parsed.plan.length})`)

  // 7. 一次性发给 SW 做 DAG 调度
  let report: PlanExecutionReport
  try {
    console.log(
      `[usePlanRunner] -> SW MSG_EXECUTE_PLAN items=${parsed.plan.length}`,
      parsed.plan.map((it) => `${it.id}:${it.tool}:${JSON.stringify(it.args)}`).join(' | ')
    )
    report = (await chrome.runtime.sendMessage({
      type: MSG_EXECUTE_PLAN,
      command: { plan: parsed },
    })) as PlanExecutionReport
    console.log(
      `[usePlanRunner] <- SW report hasItems=${Array.isArray(report?.items)}, items=${report?.items?.length ?? 0}, success=${report?.success}, needsConfirm=${!!report?.needsConfirm}`,
      `keys=${report ? Object.keys(report).join(',') : '<null>'}`,
      `itemCodes=${report?.items?.map((it) => `${it.tool}:${(it.result as { code?: string; success?: boolean })?.code ?? (it.result as { success?: boolean })?.success ?? '?'}`).join(',') ?? '<no-items>'}`
    )
    if (!report || !Array.isArray(report.items)) {
      const reason =
        (report as { error?: string; message?: string; code?: string } | null)?.error ||
        (report as { message?: string } | null)?.message ||
        (report as { code?: string } | null)?.code ||
        'SW 返回结构无效'
      console.error(
        `[usePlanRunner] SW returned invalid structure, report=${JSON.stringify(report)?.slice(0, 500)}`
      )
      throw new Error(reason)
    }
    ctx.updateStatusText(`执行中 (${report.items.length}/${parsed.plan.length})`)
  } catch (e: unknown) {
    console.error('[usePlanRunner] SW call failed', e)
    ctx.addMessage(
      'system',
      `抱歉，Service Worker 暂时无法响应喵~（${e instanceof Error ? e.message : String(e)}）`
    )
    runningRef.value = false
    ctx.removeStatusText()
    return
  }

  // 7.5 检查是否有需要前端确认的危险操作
  if (report.needsConfirm) {
    await showAiConfirmCard(report.needsConfirm, parsed, ctx)
    ctx.removeStatusText()
    return
  }

  // 7.6 检测 AI"半成品 plan"：只观察但没真执行操作
  // 典型场景：AI 调 tabs_observe 看了一下 baidu 标签，但没接着调 tabs_remove
  // 导致用户输入"关闭所有百度标签页"后只回复"已完成 1 步"，但实际什么都没关。
  // 防御：detectAndCompleteHalfPlan() 把这种半成品 plan 补全为完整的执行计划；
  // 同时把第一轮已执行的 observe 结果作为 seededResults 注入合成 mutation，
  // SW 端 plan-runner 会复用种子避免重复 observe。
  // 修复 confirm-card bug：augmentedPlan 必须传给 showAiConfirmCard，
  // 因为 confirm item 的 id 在合成 plan 中，原 parsed 里查不到会回退到「确认操作」。
  const halfPlanResult = detectAndCompleteHalfPlan(parsed, userText, report.items)
  if (halfPlanResult.completed && halfPlanResult.newPlan) {
    const augmentedPlan: AIPlan = {
      thought: parsed.thought,
      plan: halfPlanResult.newPlan,
    }
    console.log(
      `[usePlanRunner] half-plan detected rule=${halfPlanResult.diagnostics?.matchedRule ?? '?'}`,
      `items=${augmentedPlan.plan.length}, segments=${halfPlanResult.diagnostics?.segments?.length ?? 1}`
    )
    try {
      const newReport = (await chrome.runtime.sendMessage({
        type: MSG_EXECUTE_PLAN,
        command: { plan: augmentedPlan },
      })) as PlanExecutionReport
      if (newReport?.needsConfirm) {
        await showAiConfirmCard(newReport.needsConfirm, augmentedPlan, ctx)
        ctx.removeStatusText()
        return
      }
      await handleClientExec(newReport, ctx)
      ctx.removeStatusText()
      return
    } catch (e: unknown) {
      console.warn('[usePlanRunner] half-plan re-execute failed', e)
    }
  }

  // 8. 处理 clientExec 路径（tabs.group_by_domain / tabs.ungroup_all）
  //    clientExec 路径会自己写入 ai-chat 反馈，避免重复输出汇总
  await handleClientExec(report, ctx)

  // 9. 仅当 clientExec 未单独反馈时，输出一条汇总消息
  //    通过 report.items 中是否含 clientExec 字段判断，避免重复回复
  const hasClientExec = report.items.some(
    (it) => typeof (it.result as { clientExec?: string }).clientExec === 'string'
  )
  const hasRendered = report.items.some((it) => {
    const intent = getCommand(it.tool)?.intent ?? it.tool
    return (
      intent === 'tabs_remove' ||
      intent === 'close_tabs_by_domain' ||
      intent === 'clear_cookies' ||
      intent === 'delete_history' ||
      intent === 'remove_bookmark' ||
      intent === 'uninstall_extension' ||
      intent === 'tabs_create' ||
      intent === 'add_bookmark' ||
      intent === 'find_tab' ||
      intent === 'reopen_closed_tab' ||
      intent === 'pin_tab' ||
      intent === 'duplicate_tab' ||
      intent === 'enable_extension' ||
      intent === 'disable_extension' ||
      intent === 'set_theme' ||
      intent === 'theme_update'
    )
  })
  if (!hasClientExec && !hasRendered) {
    // AI 思考过程（thought）属于内部推理，不应回显给用户；
    // 让 emitFinalChat 用"已完成 N 步"作为兜底语。
    emitFinalChat(report, '', ctx)
  }
  ctx.removeStatusText()
}

/**
 * 危险操作确认弹卡回调：用户勾选后重发整 plan
 *
 * payload 转换由 shared/confirm.ts: buildReconfirmPayload 统一处理。
 */
export async function handleConfirm(
  originalPlan: AIPlan,
  confirmItem: { id: string; tool: string },
  selectedIds: Array<string | number>,
  ctx: PlanRunnerContext,
  confirmationToken?: string
): Promise<void> {
  const reconfirm = buildReconfirmPayload(originalPlan, confirmItem, selectedIds, {
    confirmationToken,
  })
  ctx.updateStatusText(`执行中 (0/${reconfirm.plan?.length ?? 0})`)
  let report: PlanExecutionReport
  try {
    console.log(
      `[usePlanRunner][handleConfirm] -> SW MSG_EXECUTE_PLAN items=${reconfirm.plan?.length ?? 0}`
    )
    report = (await chrome.runtime.sendMessage({
      type: MSG_EXECUTE_PLAN,
      command: { plan: reconfirm },
    })) as PlanExecutionReport
    console.log(
      `[usePlanRunner][handleConfirm] <- SW report hasItems=${Array.isArray(report?.items)}, items=${report?.items?.length ?? 0}, success=${report?.success}, needsConfirm=${!!report?.needsConfirm}`,
      `itemCodes=${report?.items?.map((it) => `${it.tool}:${(it.result as { code?: string; success?: boolean })?.code ?? (it.result as { success?: boolean })?.success ?? '?'}`).join(',') ?? '<no-items>'}`
    )
    if (!report || !Array.isArray(report.items)) {
      const reason =
        (report as { error?: string; message?: string; code?: string } | null)?.error ||
        (report as { message?: string } | null)?.message ||
        (report as { code?: string } | null)?.code ||
        'SW 返回结构无效'
      console.error(
        `[usePlanRunner][handleConfirm] invalid structure, report=${JSON.stringify(report)?.slice(0, 500)}`
      )
      throw new Error(reason)
    }
    ctx.updateStatusText(`执行中 (${report.items.length}/${reconfirm.plan?.length ?? 0})`)
  } catch (e: unknown) {
    ctx.addMessage(
      'system',
      `抱歉，Service Worker 暂时无法响应喵~（${e instanceof Error ? e.message : String(e)}）`
    )
    ctx.removeStatusText()
    return
  }

  await handleClientExec(report, ctx)
  const hasClientExec = report.items.some(
    (it) => typeof (it.result as { clientExec?: string }).clientExec === 'string'
  )
  if (report.needsConfirm) {
    showConfirmCard(report.needsConfirm, reconfirm, ctx)
  } else if (!hasClientExec) {
    // 确认完成后：thought 是 AI 的内部推理，对用户没有价值，
    // 这里改用一句简洁的完成语，不输出思考过程。
    emitFinalChat(report, '', ctx)
  }
  ctx.removeStatusText()
}

/**
 * 处理 clientExec 路径
 * MV3 SW 不是用户激活上下文，chrome.tabs.group / ungroup 在 SW 中会被静默挂起。
 * SW 把分组数据准备好后返回 clientExec 标志，这里在 side panel 里直接调 API。
 */
async function handleClientExec(
  report: PlanExecutionReport,
  ctx: PlanRunnerContext
): Promise<void> {
  for (const item of report.items) {
    const outcome = await executeClientExec(item.result as { clientExec?: string })
    if (outcome) {
      ctx.addMessage('ai-chat', wrapCatReply(outcome.message))
      continue
    }
    const r = item.result as {
      clientExec?: string
      tabIds?: unknown
      groupId?: unknown
      title?: unknown
      color?: unknown
      windowId?: unknown
      groups?: unknown
      changes?: unknown
    }
    if (r.clientExec === 'tab_groups_update') {
      try {
        const groupId = Number(r.groupId)
        const changes = r.changes as Record<string, unknown>
        const updated = await chrome.tabGroups.update(groupId, changes)
        ctx.addMessage(
          'ai-chat',
          wrapCatReply(`已更新标签组${updated?.title ? `：${updated.title}` : ''}`)
        )
      } catch (e: unknown) {
        ctx.addMessage(
          'ai-chat',
          wrapCatReply(`更新标签组失败：${e instanceof Error ? e.message : String(e)}`)
        )
      }
    } else if (r.clientExec === 'tabs_group_create' && Array.isArray(r.tabIds)) {
      try {
        const groupId = await chrome.tabs.group({
          tabIds: r.tabIds as number[],
          createProperties: r.windowId ? { windowId: r.windowId as number } : undefined,
        })
        if (typeof r.title === 'string' || typeof r.color === 'string') {
          await chrome.tabGroups.update(groupId, {
            ...(typeof r.title === 'string' ? { title: r.title } : {}),
            ...(typeof r.color === 'string' ? { color: r.color } : {}),
          })
        }
        ctx.addMessage('ai-chat', wrapCatReply(`已创建标签组${r.title ? `：${r.title}` : ''}`))
      } catch (e: unknown) {
        ctx.addMessage(
          'ai-chat',
          wrapCatReply(`创建标签组失败：${e instanceof Error ? e.message : String(e)}`)
        )
      }
    } else if (r.clientExec === 'tabs_group_move' && Array.isArray(r.tabIds)) {
      try {
        await chrome.tabs.group({ groupId: r.groupId as number, tabIds: r.tabIds as number[] })
        ctx.addMessage('ai-chat', wrapCatReply(`已将 ${r.tabIds.length} 个标签页加入标签组`))
      } catch (e: unknown) {
        ctx.addMessage(
          'ai-chat',
          wrapCatReply(`加入标签组失败：${e instanceof Error ? e.message : String(e)}`)
        )
      }
    } else if (r.clientExec === 'tabs_ungroup' && Array.isArray(r.tabIds)) {
      try {
        await chrome.tabs.ungroup(r.tabIds as number[])
        ctx.addMessage('ai-chat', wrapCatReply(`已将 ${r.tabIds.length} 个标签页移出标签组`))
      } catch (e: unknown) {
        ctx.addMessage(
          'ai-chat',
          wrapCatReply(`移出标签组失败：${e instanceof Error ? e.message : String(e)}`)
        )
      }
    } else if (r.clientExec === 'tabs_group_by_domain' && Array.isArray(r.groups)) {
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
              /* tab 已不存在 */
            }
          }
          if (validIds.length < 2) {
            failed.push({ title: g.title, reason: '有效 tab 数 < 2' })
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
          failed.push({ title: g.title, reason })
        }
      }
      if (created > 0) {
        let msg = `已创建 ${created} 个分组`
        if (failed.length > 0)
          msg += `（${failed.length} 个失败: ${failed.map((f) => `${f.title}(${f.reason})`).join(', ')}）`
        ctx.addMessage('ai-chat', wrapCatReply(msg))
      } else {
        ctx.addMessage(
          'ai-chat',
          wrapCatReply(
            failed.length > 0
              ? `分组失败: ${failed.map((f) => `${f.title}(${f.reason})`).join('; ')}`
              : '没有需要分组的标签'
          )
        )
      }
    } else if (r.clientExec === 'tabs_ungroup_all' && Array.isArray(r.groups)) {
      const groups = r.groups as Array<{ groupId: number; tabIds: number[] }>
      let cleared = 0
      const failed: Array<{ groupId: number; reason: string }> = []
      for (const g of groups) {
        try {
          const validIds: number[] = []
          for (const id of g.tabIds) {
            try {
              await chrome.tabs.get(id)
              validIds.push(id)
            } catch {
              /* tab 已不存在 */
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
          failed.push({ groupId: g.groupId, reason })
        }
      }
      if (cleared > 0) {
        let msg = `已取消 ${cleared} 个分组`
        if (failed.length > 0) msg += `（${failed.length} 个失败）`
        ctx.addMessage('ai-chat', wrapCatReply(msg))
      } else {
        ctx.addMessage(
          'ai-chat',
          wrapCatReply(
            failed.length > 0
              ? `取消分组失败: ${failed.map((f) => f.reason).join('; ')}`
              : '当前没有任何标签分组'
          )
        )
      }
    }
  }
}

/** 收集 summary 上下文（轻量） */
async function getSummaryContext(): Promise<ContextSnapshot> {
  const raw = (await chrome.runtime.sendMessage({
    type: MSG_GET_CONTEXT,
    options: { mode: 'summary' },
  })) as {
    activeTab: { id: number; title: string; url: string } | null
    tabCount: number
    domainDistribution: Array<{ domain: string; count: number }>
    bookmarkFolders: string[]
  }
  return {
    activeTab: raw.activeTab
      ? {
          id: raw.activeTab.id,
          title: raw.activeTab.title,
          url: raw.activeTab.url,
          hostname: (() => {
            try {
              return new URL(raw.activeTab.url).hostname
            } catch {
              return ''
            }
          })(),
        }
      : null,
    tabsSummary: `总 ${raw.tabCount ?? 0} 个；域名分布: ${(raw.domainDistribution ?? [])
      .slice(0, 5)
      .map((d) => `${d.domain}:${d.count}`)
      .join(', ')}`,
    bookmarkFolders: raw.bookmarkFolders.map((folder) => {
      // 兼容旧数据（bookmarkFolders 是 string[]）和新数据（{id, title, path} 对象）
      if (typeof folder === 'string') {
        return {
          id: folder,
          title: folder.split('/').pop() || folder,
          path: folder,
        }
      }
      const obj = folder as { id: string; title: string; path: string }
      return obj
    }),
  }
}

/** 危险弹卡：children 类型归一化 → 调用方提供的确认状态回调 */
function showConfirmCard(
  needsConfirm: { itemId: string; detail: Record<string, unknown> },
  plan: AIPlan,
  ctx: PlanRunnerContext
): void {
  const detail = needsConfirm.detail
  const item = plan.plan?.find((it) => it.id === needsConfirm.itemId)
  const tool = item?.tool ?? ''
  const confirmItems =
    (Array.isArray(detail.children)
      ? (detail.children as Array<{ id: string | number; title?: string; url?: string }>)
      : []) || []
  ctx.setPendingConfirm({
    title: (detail.message as string) || '确认操作',
    description:
      detail.childCount != null
        ? `包含 ${detail.childCount} 个子项的文件夹 "${detail.title || ''}"`
        : undefined,
    items: confirmItems.map((c) => {
      const numericId = typeof c.id === 'number' ? c.id : Number(c.id)
      return {
        primary: c.title || c.url || '',
        secondary: c.url || '',
        // history_remove 的 id 是 URL 字符串，转 Number 是 NaN → tabId 留 undefined → ConfirmCard 会过滤掉
        tabId: Number.isFinite(numericId) && numericId > 0 ? (numericId as number) : undefined,
        selected: true,
      }
    }),
    onConfirm: async (selectedTabIds: number[]) => {
      const allSelected =
        selectedTabIds.length === 0 ? confirmItems.map((c) => c.id) : selectedTabIds
      ctx.setPendingConfirm(null)
      const token =
        typeof detail.confirmationToken === 'string' ? detail.confirmationToken : undefined
      await handleConfirm(plan, { id: needsConfirm.itemId, tool }, allSelected, ctx, token)
    },
    onCancel: () => {
      ctx.addMessage('ai-chat', wrapCatReply('好嘞，已帮你取消啦~'))
      ctx.setPendingConfirm(null)
    },
  })
}

/**
 * AI 路径的确认弹卡：在 plan 执行后如果 SW 返回 needsConfirm，
 * 用本地 context + 预计算的 tabIds 生成勾选式确认卡。
 *
 * 与 useSlashCommandRunner.prepareConfirmation 的区别：
 * - 这里 SW 已经做了一次预检（dispatchTool 拦截 dangerous），但仍需要前端展示勾选 UI
 * - 因此前端用 precompute 的结果回查 contextCache 拼出 children 列表
 */
async function showAiConfirmCard(
  needsConfirm: { itemId: string; detail: Record<string, unknown> },
  plan: AIPlan,
  ctx: PlanRunnerContext
): Promise<void> {
  const detail = needsConfirm.detail
  const item = plan.plan?.find((it) => it.id === needsConfirm.itemId)
  const tool = item?.tool ?? ''
  const args = item?.args ?? {}

  // 优先用 SW 返回的 children（更准确）
  let children: Array<{ id: string | number; title?: string; url?: string }> = Array.isArray(
    detail.children
  )
    ? (detail.children as Array<{ id: string | number; title?: string; url?: string }>)
    : []

  // 对于 close_tabs_by_domain / mute_tabs_by_domain 等批量工具，
  // SW 的 children 可能为空（dispatchTool 没生成 children），需要前端补上
  if (
    children.length === 0 &&
    (tool === 'close_tabs_by_domain' ||
      tool === 'mute_tabs_by_domain' ||
      tool === 'unmute_tabs_by_domain')
  ) {
    const { contextCache, refreshContext } = await import('./usePrecompute')
    if (!contextCache.value) await refreshContext()
    const tabs = contextCache.value?.tabs ?? []
    const domain = ((args.domain as string) || '').toLowerCase().trim()
    if (domain) {
      children = tabs
        .filter((t) => {
          if (!t.url || t.pinned) return false
          try {
            const hostname = new URL(t.url).hostname.toLowerCase().replace(/^www\./, '')
            const target = domain.replace(/^www\./, '')
            return hostname === target || hostname.endsWith(`.${target}`)
          } catch {
            return false
          }
        })
        .map((t) => ({ id: t.id ?? -1, title: t.title || '', url: t.url || '' }))
    }
  }

  ctx.setPendingConfirm({
    title: (detail.message as string) || '确认操作',
    description: undefined,
    items: children.map((c) => {
      const numericId = typeof c.id === 'number' ? c.id : Number(c.id)
      return {
        primary: c.title || c.url || '',
        secondary: c.url || '',
        tabId: Number.isFinite(numericId) && numericId > 0 ? (numericId as number) : undefined,
        selected: true,
      }
    }),
    onConfirm: async (selectedTabIds: number[]) => {
      ctx.setPendingConfirm(null)
      const allSelected = selectedTabIds.length === 0 ? children.map((c) => c.id) : selectedTabIds
      const token =
        typeof detail.confirmationToken === 'string' ? detail.confirmationToken : undefined
      await handleConfirm(plan, { id: needsConfirm.itemId, tool }, allSelected, ctx, token)
    },
    onCancel: () => {
      ctx.addMessage('ai-chat', wrapCatReply('好嘞，已帮你取消啦~'))
      ctx.setPendingConfirm(null)
    },
  })
}

/** 最终汇总消息（plan 完成或全部成功） */
function emitFinalChat(report: PlanExecutionReport, thought: string, ctx: PlanRunnerContext): void {
  const succeeded = report.items.filter((i) => i.result.success !== false).length
  const failed = report.items.length - succeeded
  const base =
    thought || (failed > 0 ? `完成 ${succeeded} 步，${failed} 步失败` : `已完成 ${succeeded} 步`)
  ctx.addMessage('ai-chat', wrapCatReply(base))
}

/**
 * 检测 AI 返回的"半成品 plan"：只观察但没真执行操作。
 *
 * 典型场景：用户输入"关闭所有百度标签页"，
 * AI 返回 plan=[{tabs_observe query=baidu}]，没接着调 tabs_remove，
 * 用户看到的是"已完成 1 步"，但实际什么都没关。
 *
 * 委派给 src/shared/ai/intent-rules.ts detectHalfPlan：
 *   - 18 域 verb 表覆盖（不仅关闭 / 静音 / 休眠 / 分组）
 *   - 多步 connector 拆分（"关闭 A 然后关闭 B 然后截图"）
 *   - 参数抽取优先级：plan args → userText URL → domain → 引号 → 残余文本
 *   - 必需参数拿不到 → 跳过该合成，绝不猜测
 *
 * 该函数仅适配层：把 AIPlan 适配成 detectHalfPlan 的输入，
 * 并把 userText 作为补充上下文传入；其余逻辑全部在 intent-rules.ts。
 */
function detectAndCompleteHalfPlan(
  parsed: AIPlan,
  userText: string,
  existingResults?: PlanExecutionReport['items']
): { completed: boolean; newPlan?: NonNullable<AIPlan['plan']>; diagnostics?: { matchedRule?: string; segments?: string[]; reason?: string } } {
  return detectHalfPlan(parsed, userText, existingResults)
}
