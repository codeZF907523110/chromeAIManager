/**
 * 块组件注册表 — 项目内 Vue 组件白名单
 *
 * 第一版只支持静态注册。所有块组件在 src/components/blocks/ 下，
 * 新增组件 = 写一个 .vue 文件 + 在此加一行。
 *
 * 字段：
 *   - component：要渲染的 Vue 组件
 *   - aiUsable：AI 是否可以选用（true 时同步注入到 system prompt）
 *   - description：组件用途与 props schema，写给 AI 看
 */

import type { Component } from 'vue'
import HistoryTable from './HistoryTable.vue'
import TabList from './TabList.vue'
import ActionButtonGroup from './ActionButtonGroup.vue'

export interface BlockEntry {
  component: Component
  aiUsable: boolean
  description: string
}

/**
 * 组件注册表。key = 占位符中的 tag 名（如 'history-table'）
 */
export const blockRegistry: Map<string, BlockEntry> = new Map([
  [
    'history-table',
    {
      component: HistoryTable,
      aiUsable: true,
      description:
        '浏览历史表格。props: { items: Array<{ title, url, lastVisitTime?, visitCount? }>, timeRange?: { label? }, maxUrlDisplay?: number }',
    },
  ],
  [
    'tab-list',
    {
      component: TabList,
      aiUsable: true,
      description:
        '标签列表。props: { tabs: Array<{ id?, title?, url, active?, pinned? }>, variant?: "open-list" | "closed-list" | "sort-preview", maxRows?: number }',
    },
  ],
  [
    'action-group',
    {
      component: ActionButtonGroup,
      aiUsable: true,
      description: '操作按钮组，点击触发命令。props: { buttons: Array<{ label, intent, args? }> }',
    },
  ],
])

/** AI system prompt 用的组件清单（仅 aiUsable=true） */
export function aiUsableBlockManifest(): string {
  const lines: string[] = []
  for (const [tag, entry] of blockRegistry) {
    if (!entry.aiUsable) continue
    lines.push(`- <${tag} data-id="<id>" ...attrs />`)
    lines.push(`    用途：${entry.description}`)
    lines.push('')
  }
  return lines.join('\n').trim()
}
