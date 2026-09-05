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
import { summarizePlanResult } from '../shared/ai/post-plan-summarizer'
import { wrapCatReply, wrapCatReplyFinal } from '../shared/personality'
import { buildReconfirmPayload } from '../shared/confirm'
import { executeClientExec } from '../shared/client-exec'
import {
  renderExecutionResult as renderResult,
  type RenderResultDeps,
} from '../shared/render-result'
import type { ConfirmCardData, MessageBody, MessageLog } from '../types'
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
 * 直接暴露响应式 ref，避免 200ms setInterval 轮询。
 * B33 修复：App.vue 用 `runningRef` 配合 watch 即可，无需轮询。
 */
export const runningRef = ref(false)
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

  // 4. chat + plan 合并路径（P1-8）：
  //    AI 既返 chat.reply 又返非空 plan 时：
  //    - 先把 chat.reply 排到 ai-chat 通道（用户先看到闲聊）
  //    - 再走标准的 precompute + SW dispatch + render 路径，让 plan 也被执行
  //    - 旧 chat+screenshot 特殊路径已并入：showScreenshot 闭包合并到 chat.reply 后面
  if (parsed.chat && parsed.plan?.length) {
    ctx.addMessage('ai-chat', wrapCatReply(parsed.chat.reply))
    // 继续走下面标准 plan 执行路径；不要 return。
  } else if (parsed.chat) {
    // 纯闲聊：plan 为空或缺失
    ctx.addMessage('ai-chat', wrapCatReply(parsed.chat.reply))
    ctx.removeStatusText()
    return
  }

  // 5. 空 plan：AI 仅在 parsed.chat/thought 里写过自然语言解释，直接复述即可
  const planItems = parsed.plan ?? []
  if (!parsed.chat && planItems.length === 0) {
    ctx.addMessage('ai-chat', wrapCatReplyFinal(parsed.thought || '好的喵~'))
    ctx.removeStatusText()
    return
  }

  // 6. 兜底补齐 plan item 必填字段（AI 偶尔会漏 deps）。
  //    SW 端 isValidAIPlan 仍做严格校验；这里仅做兼容性兜底。
  for (const item of planItems) {
    if (!Array.isArray(item.deps)) {
      console.warn(`[usePlanRunner] AI 漏了 deps 字段，补 []; item=${item.id} tool=${item.tool}`)
      item.deps = []
    }
    if (!item.args || typeof item.args !== 'object') {
      console.warn(`[usePlanRunner] AI 漏了 args 字段，补 {}; item=${item.id} tool=${item.tool}`)
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
    for (const item of planItems) {
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
  ctx.updateStatusText(`执行中 (0/${planItems.length})`)

  // 7. 一次性发给 SW 做 DAG 调度
  let report: PlanExecutionReport
  try {
    console.log(
      `[usePlanRunner] -> SW MSG_EXECUTE_PLAN items=${planItems.length}`,
      planItems.map((it) => `${it.id}:${it.tool}:${JSON.stringify(it.args)}`).join(' | ')
    )
    report = (await chrome.runtime.sendMessage({
      type: MSG_EXECUTE_PLAN,
      command: { plan: { ...parsed, plan: planItems } },
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
    ctx.updateStatusText(`执行中 (${report.items.length}/${planItems.length})`)
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
  //    弹出确认卡期间不算「在跑」——runningRef 立刻重置，停止按钮不会再转圈；
  //    用户最终确认 / 取消由 handleConfirm 内部按需再次置 true。
  if (report.needsConfirm) {
    runningRef.value = false
    await showAiConfirmCard(report.needsConfirm, parsed, userText, ctx)
    ctx.removeStatusText()
    return
  }

  // 8. 处理 clientExec 路径（tabs.group_by_domain / tabs.ungroup_all）
  //    clientExec 路径会自己写入 ai-chat 反馈，避免重复输出汇总
  await handleClientExec(report, ctx)

  // 9. 单步渲染：跳过 clientExec（已渲过），由 renderExecutionResult 写入 ai-chat
  //    闭包标志 anyRendered 用于"是否有步骤已渲染过"的判定；不再维护 17 intent 白名单。
  let anyRendered = false
  // P1-8 合并：chat+plan 路径下，若 plan 含 screenshot，要把截图拼到 chat reply 之后，
  // 保持原 chat+screenshot 视觉一致性。hasChat 标记当前 plan 是否来自 chat+plan 合并路径。
  const hasChat = !!parsed.chat && !!parsed.plan?.length
  const chatReply = hasChat ? parsed.chat!.reply : ''
  const renderDeps: RenderResultDeps = {
    addAIChat: (text) => ctx.addMessage('ai-chat', text),
    addSystem: (text) => ctx.addMessage('system', text),
    markRendered: () => {
      anyRendered = true
    },
    showScreenshot: (dataUrl, tabTitle) => {
      // 合并路径：把截图拼到闲聊回复之后；纯 plan 路径保持默认 showScreenshot。
      if (hasChat) {
        const merged = `${chatReply}\n\n[截图: ${tabTitle || '页面'}]`
        ctx.addMessage('ai-chat', wrapCatReply(merged), dataUrl)
      } else {
        ctx.addMessage('ai-chat', wrapCatReply(`[截图: ${tabTitle || '页面'}]`), dataUrl)
      }
      anyRendered = true
    },
  }
  for (const item of report.items) {
    const r = item.result as { clientExec?: string }
    if (typeof r?.clientExec === 'string') continue // 已由 handleClientExec 渲过
    await renderResult(item.tool, item.result, item.args, renderDeps)
  }

  // 10. 仅当 clientExec 未单独反馈 + 单步未渲染过时，调一次 AI 复盘生成自然语言回复
  const hasClientExec = report.items.some(
    (it) => typeof (it.result as { clientExec?: string }).clientExec === 'string'
  )
  const isPaused = !!report.paused
  // 失败 / 暂停 plan：即使有步骤已渲染过，也追加 AI 复盘给用户一个"整体结论"。
  // 阻止"每步都有气泡但没人告诉我到底成没成"的体验。
  const needsPostSummary =
    (!report.success || isPaused) && !report.needsConfirm && userText.trim().length > 0
  if (needsPostSummary) {
    const summary = await summarizePlanResult({ userText, report })
    if (summary) {
      ctx.addMessage('ai-chat', wrapCatReplyFinal(summary))
    }
  }
  if (!hasClientExec && !anyRendered && !needsPostSummary) {
    const summary = await summarizePlanResult({ userText, report })
    if (summary) {
      ctx.addMessage('ai-chat', wrapCatReplyFinal(summary))
    } else {
      // AI 不可用时退化文案（仅收尾 emoji，不再"嘿嘿好呀喵~ 已完成 1 步"）
      const succeeded = report.items.filter((i) => i.result.success !== false).length
      const failed = report.items.length - succeeded
      const fallback =
        failed > 0 ? `完成 ${succeeded} 步，有 ${failed} 步失败` : `已完成 ${succeeded} 步`
      ctx.addMessage('ai-chat', wrapCatReplyFinal(fallback))
    }
  }
  runningRef.value = false
  ctx.removeStatusText()
}

/**
 * 危险操作确认弹卡回调：用户勾选后重发整 plan
 *
 * payload 转换由 shared/confirm.ts: buildReconfirmPayload 统一处理。
 */
export async function handleConfirm(
  originalPlan: AIPlan,
  userText: string,
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
    runningRef.value = false
    ctx.removeStatusText()
    return
  }

  await handleClientExec(report, ctx)

  // confirm 后二次执行：单步渲染跳过 clientExec，闭包标志用于判定是否需要 AI 复盘。
  let anyRendered = false
  const renderDeps: RenderResultDeps = {
    addAIChat: (text) => ctx.addMessage('ai-chat', text),
    addSystem: (text) => ctx.addMessage('system', text),
    markRendered: () => {
      anyRendered = true
    },
  }
  for (const item of report.items) {
    const r = item.result as { clientExec?: string }
    if (typeof r?.clientExec === 'string') continue
    await renderResult(item.tool, item.result, item.args, renderDeps)
  }

  const hasClientExec = report.items.some(
    (it) => typeof (it.result as { clientExec?: string }).clientExec === 'string'
  )
  if (report.needsConfirm) {
    runningRef.value = false
    showConfirmCard(report.needsConfirm, reconfirm, userText, ctx)
  } else if (!hasClientExec && !anyRendered) {
    // 确认完成后：AI 复盘基于真实执行结果生成自然语言回复；
    // thought 是 AI 的内部推理，不再回显给用户。
    const summary = await summarizePlanResult({ userText, report })
    if (summary) {
      ctx.addMessage('ai-chat', wrapCatReplyFinal(summary))
    } else {
      const succeeded = report.items.filter((i) => i.result.success !== false).length
      const failed = report.items.length - succeeded
      const fallback =
        failed > 0 ? `完成 ${succeeded} 步，有 ${failed} 步失败` : `已完成 ${succeeded} 步`
      ctx.addMessage('ai-chat', wrapCatReplyFinal(fallback))
    }
  }
  runningRef.value = false
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
  userText: string,
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
      await handleConfirm(
        plan,
        userText,
        { id: needsConfirm.itemId, tool },
        allSelected,
        ctx,
        token
      )
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
 *
 * P1-5 扩展：除了 domain 类工具，对 close_tabs_by_url / close_duplicate_tabs /
 * ungroup_all / bookmarks_remove_node / history_remove / tabs_remove_by_url 等
 * 也基于 candidates + contextCache 反查 children。
 */
async function showAiConfirmCard(
  needsConfirm: { itemId: string; detail: Record<string, unknown> },
  plan: AIPlan,
  userText: string,
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

  // SW children 为空时，前端补一次（覆盖所有 dangerous 工具，不止 domain 类）
  if (children.length === 0) {
    children = await backfillChildren(tool, args)
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
      await handleConfirm(
        plan,
        userText,
        { id: needsConfirm.itemId, tool },
        allSelected,
        ctx,
        token
      )
    },
    onCancel: () => {
      ctx.addMessage('ai-chat', wrapCatReply('好嘞，已帮你取消啦~'))
      ctx.setPendingConfirm(null)
    },
  })
}

/**
 * P1-5：根据 tool + args 在前端 contextCache 里反查 children 列表。
 * 覆盖所有 dangerous 工具（不仅限 domain 类）。
 */
async function backfillChildren(
  tool: string,
  args: Record<string, unknown>
): Promise<Array<{ id: string | number; title?: string; url?: string }>> {
  const { contextCache, refreshContext } = await import('./usePrecompute')
  if (!contextCache.value) await refreshContext()
  const tabs = contextCache.value?.tabs ?? []
  const domain = ((args.domain as string) || '').toLowerCase().trim()
  const query = ((args.query as string) || '').toLowerCase().trim()

  const matchesDomain = (t: { url?: string; pinned?: boolean }) => {
    if (!t.url || t.pinned) return false
    try {
      const hostname = new URL(t.url).hostname.toLowerCase().replace(/^www\./, '')
      const target = domain.replace(/^www\./, '')
      return hostname === target || hostname.endsWith(`.${target}`)
    } catch {
      return false
    }
  }
  const matchesQuery = (t: { title?: string; url?: string; pinned?: boolean }) => {
    if (!t.url || t.pinned) return false
    const lowerUrl = (t.url || '').toLowerCase()
    const title = (t.title || '').toLowerCase()
    return lowerUrl.includes(query) || title.includes(query)
  }

  switch (tool) {
    case 'close_tabs_by_domain':
    case 'mute_tabs_by_domain':
    case 'unmute_tabs_by_domain':
    case 'tabs_remove':
      return domain
        ? tabs
            .filter(matchesDomain)
            .map((t) => ({ id: t.id ?? -1, title: t.title || '', url: t.url || '' }))
        : []
    case 'close_tabs_by_url':
    case 'tabs_remove_by_url':
      return query
        ? tabs
            .filter(matchesQuery)
            .map((t) => ({ id: t.id ?? -1, title: t.title || '', url: t.url || '' }))
        : []
    case 'close_duplicate_tabs': {
      const seen = new Map<string, number>()
      const dupIds: number[] = []
      for (const t of tabs) {
        const url = (t.url || '').replace(/\/$/, '')
        if (args.url && !url.includes(args.url as string)) continue
        if (seen.has(url)) dupIds.push(t.id ?? -1)
        else seen.set(url, t.id ?? -1)
      }
      return dupIds
        .map((id) => tabs.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({ id: t.id!, title: t.title || '', url: t.url || '' }))
    }
    case 'ungroup_all': {
      const grouped = new Map<number, { groupId: number; tabCount: number; title: string }>()
      for (const t of tabs) {
        if (t.groupId === undefined || t.groupId === -1) continue
        const entry = grouped.get(t.groupId) ?? {
          groupId: t.groupId,
          tabCount: 0,
          title: t.title || `分组 ${t.groupId}`,
        }
        entry.tabCount++
        grouped.set(t.groupId, entry)
      }
      return Array.from(grouped.values()).map((g) => ({
        id: g.groupId,
        title: g.title,
        url: `${g.tabCount} 个标签`,
      }))
    }
    case 'bookmarks_remove_node':
      // 由 SW buildConfirmChildren 从 nodeId 拉取；前端无 bookmarks 上下文，兜底
      return typeof args.nodeId === 'string' && args.nodeId
        ? [{ id: args.nodeId, title: '书签', url: '' }]
        : []
    case 'history_remove':
      // history_remove 的 children 是 URL 字符串，ConfirmCard 过滤掉无 tabId 的
      return query ? [{ id: query, title: `搜索: ${query}`, url: '' }] : []
    default:
      return []
  }
}
