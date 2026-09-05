/**
 * Post-plan Summarizer — 复盘式 LLM 调用
 *
 * 目的：plan 跑完后，让 AI 用自然语言把"用户原始请求 + 真实执行结果"复述一遍。
 * 替代原本 wrapCatReply("已完成 N 步") 的死汇总（见 usePlanRunner.ts 中已删除的 emitFinalChat）。
 *
 * 设计原则：
 *  - 只调一次 chat（temperature 0.6, jsonMode false, mode 'chat'）
 *  - 强制 system 提示词限定输出（不编造、不硬塞"还有什么想让我做的吗"）
 *  - 失败兜底返回 null，调用方决定退化文案（见 usePlanRunner 中 wrapCatReplyFinal 路径）
 */

import { aiEngine } from '../../composables/useAIEngine'
import type { PlanExecutionReport } from '../../service-worker/plan-runner'

interface SummarizeOptions {
  userText: string
  report: PlanExecutionReport
  signal?: AbortSignal
}

/** 序列化为精简 JSON，仅保留 AI 复盘需要的字段；剔除 children / dataUrl 等冗余数据。 */
function buildExecutionSummary(report: PlanExecutionReport): string {
  const slim = report.items.map((it) => {
    const r = (it.result ?? {}) as Record<string, unknown>
    return {
      tool: it.tool,
      success: it.result?.success !== false,
      code: r.code,
      message: r.message,
      removed: r.removed,
      deleted: r.deleted,
      groupedTabs: r.groupedTabs,
      ungrouped: r.ungrouped,
      createdNode: r.createdNode,
      updatedNode: r.updatedNode,
      removedNode: r.removedNode,
      folder: r.folder,
      bookmark: r.bookmark,
      tab: r.tab,
      enabled: r.enabled,
      disabled: r.disabled,
      uninstalled: r.uninstalled,
      moved: r.moved,
      title: r.title,
    }
  })
  return JSON.stringify({ success: report.success, items: slim })
}

export async function summarizePlanResult(opts: SummarizeOptions): Promise<string | null> {
  const { userText, report, signal } = opts
  if (!userText) return null

  const systemPrompt =
    '你叫小喵，是用户的浏览器智能管家。' +
    '根据"用户原始请求"和"执行摘要"，用一段自然语言告诉用户结果。' +
    '规则：\n' +
    '1. 必须复述用户原始请求的关键动作；\n' +
    '2. 只能引用执行摘要里出现的真实数据，不允许编造 tab 数、文件名、域名；\n' +
    '3. 失败项明确说"哪个步骤失败 + 原因"（message 有就用 message）；\n' +
    '4. 中文回复，不要追加"还有什么想让我做的吗"；\n' +
    '5. 不使用 Markdown 标题，普通段落即可；\n' +
    '6. 不超过 80 字。'

  const userPrompt = `用户请求：${userText}\n执行摘要：${buildExecutionSummary(report)}`

  try {
    const raw = await aiEngine.chatWithHistory(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.6, jsonMode: false, mode: 'chat', signal }
    )
    if (!raw) return null
    const cleaned = raw
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim()
    if (!cleaned) return null
    return cleaned.length > 500 ? cleaned.slice(0, 500) + '…' : cleaned
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'AbortError') return null
    console.warn('[post-plan-summarizer] 调用失败：', e instanceof Error ? e.message : String(e))
    return null
  }
}
