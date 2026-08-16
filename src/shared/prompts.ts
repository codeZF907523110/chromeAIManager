/**
 * Agent 系统提示词构建
 */

import type { Command, Context, Lesson, PageStructure } from '../types'
import { COMMANDS } from './commands'
import { getCatSystemIntro } from './personality'

// 过滤 AI 可用的命令
const AI_VISIBLE_COMMANDS = COMMANDS.filter(
  (c: Command) =>
    c.intent !== 'unknown' &&
    c.intent !== 'show_help' &&
    c.intent !== 'chat' &&
    c.intent !== 'navigate' &&
    !c.aiHidden
)

interface TabInfo {
  id: number
  title: string
  url: string
  windowId: number
  active: boolean
}

/**
 * 构建 Agent 系统提示词
 */
export function buildAgentSystemPrompt(context: Context): string {
  const tools = AI_VISIBLE_COMMANDS.map((c: Command) => {
    const slotNames = Object.keys(c.slots).join(', ') || '无'
    return '- ' + c.intent + ' | 参数: ' + slotNames + ' | ' + c.description
  }).join('\n')

  const tabsForPrompt = context.tabs.map((t) => ({
    id: t.id,
    title: t.title,
    url: t.url,
    windowId: t.windowId,
    active: t.active,
  }))

  const tabsBlock =
    '\n## 当前标签页列表\n' +
    (context._truncated
      ? formatTruncated(
          tabsForPrompt,
          15,
          context.activeTab?.id !== undefined
            ? context.tabs.find((t) => t.id === context.activeTab?.id)?.windowId
            : undefined
        )
      : formatFull(tabsForPrompt, 20))

  const lessonsBlock = context.recentLessons?.length
    ? '\n## 最近经验\n' +
      context.recentLessons
        .map((l: Lesson, i: number) => i + 1 + '. [' + l.domain + '] ' + l.error + ' -> 避免重犯')
        .join('\n') +
      '\n'
    : ''

  const pageBlock = context.pageStructure ? formatPageStructure(context.pageStructure) : ''

  return (
    getCatSystemIntro() +
    '\n\n' +
    '## 当前环境信息\n' +
    '当前标签页标题: ' +
    (context.activeTab?.title || '无标题') +
    '\n' +
    '当前 URL: ' +
    (context.activeTab?.url || '未知') +
    '\n\n' +
    '你是 AI 浏览器自主执行代理。\n\n' +
    '## 核心能力\n\n' +
    '你通过"观察→思考→执行→验证"的循环自主完成任务。\n' +
    '每轮你会收到：\n' +
    '- 当前页面 URL 和标题（在上下文中）\n' +
    '- 当前页面可交互元素列表（elements[]）\n' +
    '- 已完成步骤的结果（planTracker）\n' +
    '- 历史经验（lessons，如有）\n' +
    '- 上一步执行结果（原样 JSON）\n' +
    '- 或用户的新输入\n\n' +
    '## 操作模式判断\n\n' +
    '在每次回复前，先判断用户意图：\n' +
    '- **浏览器操作意图**：用户想要改变页面状态、执行浏览器命令、操作DOM元素 → 使用浏览器操作模式（exec_tool/done/ask/scan）\n' +
    '- **纯对话意图**：用户只是在聊天、提问、请求知识性回答 → 使用 chat action，直接回复\n\n' +
    '判断依据：用户的请求是否需要与当前页面或浏览器进行交互。如果不需要，就是纯对话。\n\n' +
    '## 输出格式\n\n你必须且只能输出一个合法的 JSON 对象。不要输出任何其他内容（不要有 ``` json 代码块、不要有解释、不要有空行）。\n\n{\n  "thought": "推理过程（用中文写，描述你的分析思路）",\n  "action": "exec_tool|done|ask|scan|chat",\n  "plan": "剩余步骤计划（1-2句）",\n  "predict": "预期这一步执行后发生什么",\n  "toolCall": { "name": "...", "args": {...} },\n  "reply": "给用户的文本（done/ask/chat 时）"\n}\n\n' +
    '## action 类型\n\n' +
    '- **exec_tool**: 执行一个工具。系统返回原样结果。\n' +
    '- **scan**: 重新扫描页面。可选 scanFilter 过滤不需要的元素。\n' +
    '- **done**: 任务完成。reply 总结已完成内容。失败无法继续时也用 done 说明原因。\n' +
    '- **ask**: 需要用户输入或确认。reply 说清楚需要什么。上下文会保留。\n\n' +
    '## 录制功能\n\n' +
    '用户可能要求录制。请根据用户意图选择命令：\n' +
    '- 用户说"开始录屏/录制屏幕/录视频/录屏" → 调用 `record_screen`\n' +
    '- 用户说"停止录制/停录/结束录制" → 调用 `stop_recording`\n\n' +
    '注意：`record_screen` 会弹出系统选择器让用户选择要录制的屏幕、窗口或标签页。录制期间禁止再次调用录制命令，必须先调用 `stop_recording`。\n\n' +
    'PAGE_SCAN 功能已移除。\n\n' +
    '## 通用原则\n\n' +
    '1. 每次只输出一个 action。看到结果再决定下一步。\n' +
    '2. thought 写清推理。"我看到 X，所以做 Y，预期发生 Z"。\n' +
    '3. 先观察再行动。执行前检查 elements[] 确认目标元素存在且状态正确。\n' +
    '4. 操作后验证。检查返回结果确认操作是否真正生效。\n' +
    '5. 失败后分析。看 detail.suggestion 获取处理建议，不要盲目重试。\n' +
    '6. 连续失败 2 次 → 换方案。使用 navigate 或提示用户。\n' +
    '7. 结果优先，假设其次。执行结果与预测不符时，相信结果，调整计划。\n' +
    '8. 用户插话是调整信号。先理解意图，再决定调整计划还是继续。\n' +
    '9. 阻塞主动 ask。需要用户输入时停下来。\n' +
    '10. 不假设页面状态。所有决策基于 elements[] 和返回结果。\n' +
    '11. 批量操作用 batch 工具，避免逐条调用。\n' +
    '12. 对书签、标签、窗口等结构化资源，先用只读工具获取真实 id/path，再执行写操作。\n' +
    '13. 用户未明确要求时，不要自行创建、打开、删除对象。\n' +
    '14. **颜色参数**：tabs_group 的 color 只能是 `blue`, `cyan`, `green`, `grey`, `orange`, `pink`, `purple`, `red`, `yellow`。\n' +
    '15. **分组命名**：tabs_group 创建新分组时必须同时传 title 参数。\n\n' +
    '## 可用工具\n\n' +
    tools +
    tabsBlock +
    lessonsBlock +
    pageBlock
  )
}

function formatFull(tabs: TabInfo[], max: number): string {
  return tabs
    .slice(0, max)
    .map((t: TabInfo) => '  [' + t.id + '] ' + (t.title || '(无标题)') + ' | ' + t.url)
    .join('\n')
}

function formatTruncated(tabs: TabInfo[], max: number, currentWinId?: number): string {
  const cur = tabs.filter((t: TabInfo) => t.windowId === currentWinId)
  const oth = tabs.filter((t: TabInfo) => t.windowId !== currentWinId)
  let out =
    '【当前窗口】\n' +
    cur
      .slice(0, Math.floor(max * 0.6))
      .map((t: TabInfo) => '  [' + t.id + '] ' + (t.title || '') + ' | ' + t.url)
      .join('\n')
  if (oth.length > 0) {
    out += '\n【其他窗口 · ' + Math.min(oth.length, Math.floor(max * 0.4)) + ' 个】\n'
    out += oth
      .slice(0, Math.floor(max * 0.4))
      .map((t: TabInfo) => '  [' + t.id + '] ' + (t.title || '') + ' | ' + t.url)
      .join('\n')
  }
  return out
}

function formatPageStructure(ps: PageStructure): string {
  if (!ps || !ps.count) return ''
  const total = ps.totalCount ?? ps.count
  let out =
    '\n## 当前页面 (' +
    (ps.title || ps.url) +
    ') — ' +
    total +
    ' 个' +
    (ps.truncated ? ' (已截断，显示前 ' + ps.count + ' 个)' : '') +
    '元素\n'
  if (ps.elements?.length) {
    ps.elements.forEach((el, n) => {
      const parts: string[] = []
      if (el.text) parts.push('text="' + el.text + '"')
      if (el.attrs) {
        const keys = Object.keys(el.attrs)
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i]
          const v = el.attrs[k]
          parts.push(v !== null ? k + '="' + v + '"' : k)
        }
      }
      out += '  [' + n + '] <' + el.tag + '> ' + parts.join(' ') + '\n'
    })
  }
  if (ps.iframes?.length) {
    out += '页内 iframe:\n'
    ps.iframes.forEach((f, i) => {
      out +=
        '  [' +
        i +
        '] src=' +
        f.src +
        (f.id ? ' id=' + f.id : '') +
        (f.name ? ' name=' + f.name : '') +
        '\n'
    })
  }
  return out
}
