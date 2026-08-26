/**
 * 命令反馈 Markdown 工厂
 *
 * 把命令结果（ExecutionResult）转成 MessageBody：
 *   - 命令有对应的 markdownFactory → 生成带占位符的 markdown + components
 *   - 没注册的 → 走 fallback（纯 markdown 文本）
 *
 * 与 useAIEngine.ts 的 renderExecutionResult 是替代关系——
 * 每个命令调用对应的 xxxMarkdownBody() 即可。
 */

import type { MessageBody } from '../../types/message-block'
import type { ExecutionResult } from '../../types/execution'
import HistoryTable from '../../components/blocks/HistoryTable.vue'
import TabList from '../../components/blocks/TabList.vue'
import ActionButtonGroup from '../../components/blocks/ActionButtonGroup.vue'
import { newBlockId } from '../../composables/useMarkdown'

/**
 * /history 命令反馈：开篇 markdown + HistoryTable 组件
 */
export function historyMarkdownBody(r: ExecutionResult): MessageBody {
  const items = ((r as Record<string, unknown>).items ?? []) as Array<{
    title?: string
    url: string
    lastVisitTime?: number
    visitCount?: number
  }>
  const timeRange = (r as Record<string, unknown>).timeRange as
    { label?: string; start?: number; end?: number } | undefined
  const count = (r.found as number | undefined) ?? items.length
  const id = newBlockId('hist')
  const label = timeRange?.label || '今天'
  if (count === 0) {
    return { markdown: `今天还没有浏览记录呢~` }
  }
  return {
    markdown: `为你找到 **${count}** 条**${label}**的浏览记录：\n\n<history-table data-id="${id}" />\n\n如需进一步筛选，请用 \`/history [关键词]\`。`,
    components: [{ id, component: HistoryTable, props: { items, timeRange } }],
  }
}

/**
 * tabs_observe / 通用 tabs 列表反馈：开篇 + TabList 组件
 */
export function tabsListMarkdownBody(r: ExecutionResult): MessageBody {
  const tabs = ((r as Record<string, unknown>).tabs ?? []) as Array<{
    id?: number
    title?: string
    url: string
    active?: boolean
    pinned?: boolean
  }>
  const id = newBlockId('tabs')
  const count = (r.observed as number | undefined) ?? tabs.length
  return {
    markdown: `当前有 **${count}** 个标签页：\n\n<tab-list data-id="${id}" />`,
    components: [{ id, component: TabList, props: { tabs, variant: 'open-list' } }],
  }
}

/**
 * 命令反馈工厂表
 * key = SW intent 名
 */
type FactoryFn = (r: ExecutionResult) => MessageBody

export const markdownFactories: Record<string, FactoryFn> = {
  history_search: historyMarkdownBody,
  search_history: historyMarkdownBody,
  tabs_observe: tabsListMarkdownBody,
}

export function buildMarkdownBody(intent: string, result: ExecutionResult): MessageBody | null {
  const fn = markdownFactories[intent]
  return fn ? fn(result) : null
}

/**
 * 命令执行失败的统一反馈（Markdown）
 */
export function errorMarkdownBody(result: ExecutionResult): MessageBody {
  const message = result.message || '操作失败'
  const suggestion = result.suggestion ? `（${result.suggestion}）` : ''
  return { markdown: `抱歉，操作 "${message}" 失败喵${suggestion ? ' ' + suggestion : ''}` }
}

/**
 * 用于操作的简单按钮组工厂：失败时给"重试"
 */
export function retryActionButton(retryIntent: string) {
  const id = newBlockId('act')
  return {
    markdown: `\n\n<action-group data-id="${id}" />`,
    components: [
      {
        id,
        component: ActionButtonGroup,
        props: { buttons: [{ label: '重试', intent: retryIntent }] },
      },
    ],
  }
}
