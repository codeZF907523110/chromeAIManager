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
import { MSG_EXECUTE_PLAN, MSG_GET_CONTEXT } from '../shared/constants'
import type { AIPlan } from '../shared/ai/plan-types'
import type { PlanExecutionReport } from '../service-worker/plan-runner'
import { wrapCatReply } from '../shared/personality'
import { buildReconfirmPayload } from '../shared/confirm'
import type { MessageBody, MessageLog } from '../types'

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
  setPendingConfirm: (value: PendingConfirm | null) => void
  renderExecutionResult: (
    intent: string,
    response: unknown,
    slots?: Record<string, unknown>
  ) => Promise<void>
}

interface PendingConfirm {
  title: string
  description?: string
  items: Array<{
    primary: string
    secondary: string
    tabId?: number
    selected?: boolean
  }>
  onConfirm?: (selectedTabIds: number[]) => Promise<void>
  onCancel?: () => void
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

  // 1. 收集 summary 上下文
  const summaryContext = await getSummaryContext()

  // 2. 调 AI（jsonMode 强制 JSON）
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
  // AI 调用成功；后续步骤（解析 + SW dispatch）不属于"AI 思考"，
  // runningRef 不再反映 abort 状态，由 handleSubmit 时序保证。
  abortCtl = null
  runningRef.value = false

  // 3. 严格解析
  let parsed: AIPlan
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    ctx.addMessage('ai-chat', wrapCatReply('抱歉，我没理解您的请求喵~'))
    ctx.removeStatusText()
    return
  }

  // 4. 闲聊路径
  if (parsed.chat) {
    ctx.addMessage('ai-chat', wrapCatReply(parsed.chat.reply))
    ctx.removeStatusText()
    return
  }

  // 5. 空 plan
  if (!parsed.plan?.length) {
    ctx.addMessage('ai-chat', wrapCatReply(parsed.thought || '已完成'))
    ctx.removeStatusText()
    return
  }

  // 6. 切到执行中：用 updateStatusText 把状态消息替换为执行进度
  ctx.updateStatusText(`执行中 (0/${parsed.plan.length})`)

  // 7. 一次性发给 SW 做 DAG 调度
  let report: PlanExecutionReport
  try {
    report = (await chrome.runtime.sendMessage({
      type: MSG_EXECUTE_PLAN,
      command: { plan: parsed },
    })) as PlanExecutionReport
    ctx.updateStatusText(`执行中 (${report.items.length}/${parsed.plan.length})`)
  } catch (e: unknown) {
    ctx.addMessage(
      'system',
      `抱歉，Service Worker 暂时无法响应喵~（${e instanceof Error ? e.message : String(e)}）`
    )
    runningRef.value = false
    ctx.removeStatusText()
    return
  }

  // 8. 处理 clientExec 路径（tabs.group_by_domain / tabs.ungroup_all）
  //    clientExec 路径会自己写入 ai-chat 反馈，避免重复输出汇总
  await handleClientExec(report, ctx)

  // 9. 仅当 clientExec 未单独反馈时，输出一条汇总消息
  //    通过 report.items 中是否含 clientExec 字段判断，避免重复回复
  const hasClientExec = report.items.some(
    (it) => typeof (it.result as { clientExec?: string }).clientExec === 'string'
  )
  if (!hasClientExec) {
    emitFinalChat(report, parsed.thought, ctx)
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
  ctx: PlanRunnerContext
): Promise<void> {
  const reconfirm = buildReconfirmPayload(originalPlan, confirmItem, selectedIds)
  ctx.updateStatusText(`执行中 (0/${reconfirm.plan?.length ?? 0})`)
  const report = (await chrome.runtime.sendMessage({
    type: MSG_EXECUTE_PLAN,
    command: { plan: reconfirm },
  })) as PlanExecutionReport
  ctx.updateStatusText(`执行中 (${report.items.length}/${reconfirm.plan?.length ?? 0})`)

  await handleClientExec(report, ctx)
  const hasClientExec = report.items.some(
    (it) => typeof (it.result as { clientExec?: string }).clientExec === 'string'
  )
  if (report.needsConfirm) {
    showConfirmCard(report.needsConfirm, reconfirm, ctx)
  } else if (!hasClientExec) {
    emitFinalChat(report, reconfirm.thought, ctx)
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
    tabsSummary: `总 ${raw.tabCount} 个；域名分布: ${raw.domainDistribution
      .slice(0, 5)
      .map((d) => `${d.domain}:${d.count}`)
      .join(', ')}`,
    bookmarkFolders: raw.bookmarkFolders,
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
      await handleConfirm(plan, { id: needsConfirm.itemId, tool }, allSelected, ctx)
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
