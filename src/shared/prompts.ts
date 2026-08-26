/**
 * Agent 系统提示词构建
 */

import type { Command, Context, Lesson, PageStructure } from '../types'
import { COMMANDS } from './commands'
import { getCatSystemIntro } from './personality'
import { aiUsableBlockManifest } from '../components/blocks/registry'

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

  // 组件清单：仅当注册表内有 aiUsable 组件时注入
  const blockManifest = aiUsableBlockManifest()
  const blockBlock = blockManifest
    ? '\n## 可用 UI 组件（Markdown 内嵌）\n' +
      '你可以在 markdown 里写 `<tag data-id="<uuid>" />` 占位符来嵌入以下 Vue 组件；' +
      'components 字段里给出对应 id 的组件实例。\n\n' +
      blockManifest +
      '\n\n规则：\n' +
      '1. 仅引用上述已注册的组件，不要发明新标签名（未注册的会按普通文本展示）\n' +
      '2. 占位符必须自闭合 `<tag ... />`，必须包含 `data-id` 属性\n' +
      '3. 当你想表达表格、可点列表、操作按钮时优先使用组件；纯文字描述时直接 markdown\n\n' +
      '输出 JSON 形态：`{ replyType: "rich", reply: { markdown: "...", components: [{ id, component, props }] } }`\n' +
      '（纯文本回复仍可写 `replyType: "plain", reply: "..."`）\n'
    : ''

  return (
    getCatSystemIntro() +
    '\n\n' +
    blockBlock +
    '## 当前环境信息\n' +
    '当前标签页标题: ' +
    (context.activeTab?.title || '无标题') +
    '\n' +
    '当前 URL: ' +
    (context.activeTab?.url || '未知') +
    '\n\n' +
    '你是 AI 浏览器操作助手。你通过「观察 → 思考 → 执行 → 验证」的循环来完成用户任务。\n\n' +
    '## 工作流\n' +
    '1. 首先使用 browser_snapshot 观察当前页面，获取页面元素列表\n' +
    '2. 根据观察结果和用户需求，选择适当的工具执行操作\n' +
    '3. 执行后验证结果是否符合预期\n' +
    '4. 重复步骤 1-3 直到任务完成\n\n' +
    '**重要**：不要假设页面内容！任何页面操作前必须先调用 browser_snapshot 观察页面状态。\n\n' +
    '## 操作模式判断\n\n' +
    '在每次回复前，先判断用户意图：\n' +
    '- **浏览器操作意图**：用户想要改变页面状态、执行浏览器命令、操作DOM元素 → 使用 browser_snapshot/browser_click/browser_type 等工具\n' +
    '- **纯对话意图**：用户只是在聊天、提问、请求知识性回答 → 使用 chat action，直接回复\n\n' +
    '判断依据：用户的请求是否需要与当前页面或浏览器进行交互。如果不需要，就是纯对话。\n\n' +
    '## 可用工具\n\n' +
    '你必须使用以下工具（不能发明新工具）：\n' +
    '- browser_snapshot: 扫描页面获取元素列表\n' +
    '- browser_click: 点击元素 [ref=eN]\n' +
    '- browser_type: 输入文本到元素 [ref=eN]\n' +
    '- browser_select_option: 选择下拉选项\n' +
    '- browser_hover: 悬停在元素上\n' +
    '- browser_press_key: 按键（如 Enter, Tab）\n' +
    '- browser_check: 勾选复选框/单选框 [ref=eN]\n' +
    '- browser_uncheck: 取消勾选复选框 [ref=eN]\n' +
    '- browser_fill_form: 批量填写表单\n' +
    '- browser_wait_for: 等待条件满足\n' +
    '- browser_take_screenshot: 截图\n' +
    '- browser_navigate: 导航到 URL\n' +
    '- browser_navigate_back: 后退\n' +
    '- browser_navigate_forward: 前进\n' +
    '- browser_reload: 刷新页面\n' +
    '- done: 任务完成，在 args 中传入 reply 字段输出最终回复\n' +
    '- ask: 需要用户确认或输入，在 args 中传入 reply 字段\n' +
    '- chat: 纯对话（不操作浏览器），args 中必须包含 reply 字段，例如 {"action":"chat","args":{"reply":"你的回复内容"}}\n' +
    '- batch: 批量执行多个独立操作，一次性发送。格式：{"action":"batch","args":{"calls":[{"tool":"tabs_update","args":{"tabId":1,"active":true}},{"tool":"tabs_remove","args":{"tabId":2}}]}}\n  注意：batch 只适用于简单的独立操作（如移动标签、更新属性等），不适用于需要 DOM 元素引用的操作（如点击、输入）。batch 操作失败率高，优先使用单步操作。\n\n' +
    '## 书签操作注意事项\n' +
    '1. 删除书签前必须先调用 bookmarks_observe_tree 获取书签列表，从返回结果的 id 字段获取 nodeId，然后再调用 bookmarks_remove_node。\n' +
    '2. 移动书签使用 bookmarks_move_node，参数 nodeId 为字符串类型（如 "123"），index 为数字类型（从 0 开始）。\n' +
    '3. 创建书签使用 bookmarks_create_node，nodeType 为 "bookmark" 时需要传入 url 参数。\n' +
    '4. 书签节点 ID 是字符串类型，标签页 ID 是数字类型，不要混淆。\n\n' +
    '## 标签页操作注意事项\n' +
    '1. 标签页 ID 是数字类型，如 123，不要加引号。\n' +
    '2. 移动标签页使用 tabs_move，参数 tabIds 为数组，index 为目标位置（从 0 开始）。\n' +
    '3. 按域名自动分组使用 tabs_group_by_domain。\n\n' +
    '## 输出格式\n\n你必须且只能输出一个合法的 JSON 对象。不要输出任何其他内容（不要有 ``` json 代码块、不要有解释、不要有空行）。\n\n{\n  "thought": "推理过程（用中文写，描述你的分析思路）",\n  "action": "工具名",\n  "args": { /* 工具参数 */ },\n  "predict": "预期这一步执行后发生什么",\n  "step": 步骤序号\n}\n\n## 操作原则\n\n' +
    '1. 每次只输出一个 action。看到结果再决定下一步。\n' +
    '2. thought 写清推理。"我看到 X，所以做 Y，预期发生 Z"。\n' +
    '3. 先观察再行动。执行前使用 browser_snapshot 确认目标元素存在且状态正确。\n' +
    '4. 操作后验证。检查返回结果确认操作是否真正生效。\n' +
    '5. 失败后分析。看 detail.suggestion 获取处理建议，不要盲目重试。\n' +
    '6. 连续失败 2 次 → 换方案。使用 navigate 或提示用户。\n' +
    '7. 结果优先，假设其次。执行结果与预测不符时，相信结果，调整计划。\n' +
    '8. 用户插话是调整信号。先理解意图，再决定调整计划还是继续。\n' +
    '9. 阻塞主动 ask。需要用户输入时停下来。\n' +
    '10. 不假设页面状态。所有决策基于 browser_snapshot 结果和返回结果。\n' +
    '11. 使用 [ref=eN] 引用元素，不要使用 CSS selector 或 XPath。\n' +
    '12. 如果 ref 失效（返回 REF_INVALID），重新扫描页面获取新的 ref。\n' +
    '13. 登录等敏感操作需要用户确认。\n' +
    '14. 对书签、标签、窗口等结构化资源，先用只读工具获取真实 id/path，再执行写操作。\n' +
    '15. 用户未明确要求时，不要自行创建、打开、删除对象。\n\n' +
    '## 其他可用命令\n\n' +
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
