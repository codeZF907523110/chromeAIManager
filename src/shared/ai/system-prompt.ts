/**
 * System Prompt 构造器 — Plan-First 协议专用
 *
 * 替代旧 prompts.ts 的 buildAgentSystemPrompt。
 * 核心约束：
 *   - AI 必须只输出一个合法 JSON 对象（依赖 OpenAI json_object / 等价约束）
 *   - 工具列表从 COMMANDS 自动生成，保持与注册表一致
 *   - 严格 JSON：无需任何修复启发式
 */

import { COMMANDS } from '../commands'

export interface ContextSnapshot {
  /** 当前活动标签（无活动标签时为 null） */
  activeTab: {
    id: number
    title: string
    url: string
    hostname: string
    windowId?: number
    groupId?: number
    index?: number
  } | null
  /** 标签摘要：总数 + 域名分布 */
  tabsSummary: string
  /** 当前真实标签组信息 */
  groups?: unknown[]
  /** 书签文件夹路径列表 */
  bookmarkFolders: string[]
}

/**
 * 生成 AI 可用的工具清单
 * - 过滤 aiHidden（对 AI 隐藏的斜杠命令别名）
 * - 过滤 swIntent === null（本地命令：录制/聊天等）
 * - 过滤 browser_*（DOM 操作类，本版本不支持）
 * - 过滤 task_plan / batch（已删除）
 */
function buildToolList(): string {
  return COMMANDS.filter(
    (c) =>
      !c.aiHidden &&
      c.swIntent !== null &&
      !c.intent.startsWith('browser_') &&
      c.intent !== 'task_plan' &&
      c.intent !== 'batch'
  )
    .map((c) => {
      const slots = Object.entries(c.slots)
        .map(([name, slot]) => `${name}${slot.optional ? '?' : ''}:${slot.type}`)
        .join(', ')
      const danger = c.dangerous ? '  ⚠️' : ''
      return `- ${c.swIntent}{${slots}}${danger}  // ${c.description}`
    })
    .join('\n')
}

/**
 * 构造 AI 的 system prompt
 *
 * 输入：当前浏览器状态摘要
 * 输出：完整 system prompt（含角色、工具清单、输出格式、规则、错误模式）
 */
export function buildSystemPrompt(ctx: ContextSnapshot): string {
  const toolList = buildToolList()
  const activeLine = ctx.activeTab ? `${ctx.activeTab.title} (${ctx.activeTab.hostname})` : '无'
  const foldersLine = ctx.bookmarkFolders.join(', ') || '空'

  return `你是 AI 浏览器管家。每次请求只输出一个 JSON 对象，禁止任何其它内容。

## 当前状态
active_tab: ${activeLine}
tabs: ${ctx.tabsSummary}
bookmark_folders: ${foldersLine}

## 工具
${toolList}
⚠️ = 危险操作（自动二次确认，无需在 plan 中处理）

## 输出格式
工具调用：
{"thought":"<≤200 字>","plan":[
  {"id":"p1","tool":"<工具名>","args":{...},"deps":[],"mergedFrom":["..."]}
]}

纯闲聊：
{"thought":"...","chat":{"reply":"..."}}

## 规划原则
1. 先查询再修改：任何依赖真实 tabId、groupId 或 bookmark nodeId 的操作，必须先调用对应 observe/query 工具，不得猜测 ID。
2. “创建指定名称的标签组并移动标签”必须使用 tab_groups_create 或 tab_groups_move_tabs，不能使用 tabs_group_by_domain（后者会按每个域名创建多个组）。
3. tabs_group_by_domain 只用于用户明确要求“按域名自动分组”。
4. 所有 tabId/groupId 是数字，bookmark nodeId 是字符串；index 统一使用 0-based。
5. reload、duplicate、discard 使用专用工具，不要用 tabs_update 猜测实现。
6. 每次操作后依据工具返回的真实字段验证结果；失败时停止后续依赖操作。
7. 一次请求的 plan 应只包含完成用户目标所需的最少步骤。

## 错误模式
- tabs_remove 没传 tabIds → 会关闭当前活动标签；要关多个用 tabs_remove_by_url
- bookmarks_remove_node 缺 nodeId → 先调 bookmarks_observe_tree 拿 id
- chrome.cookies.getAll 必须传 domain → 无参时取当前 tab 的 hostname
- 不要发明新工具名；COMMANDS 没列出的工具一律不输出
- 不要把 tabs_group_by_domain 当作“创建一个指定名称的标签组”
- 不要在没有查询结果时猜测 tabId、groupId 或 bookmark nodeId`
}
