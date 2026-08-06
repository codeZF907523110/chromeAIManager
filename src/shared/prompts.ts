/**
 * Agent 系统提示词构建
 */

import type { Command, Context, Lesson, PageStructure } from '../types'
import { COMMANDS } from './commands'

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
    '## dom_manipulate 工具\n\n' +
    '执行自定义 JavaScript 操作页面元素。\n{"name":"dom_manipulate","args":{"code":"..."}}\n\n' +
    'code 是 JavaScript 函数体，在页面主世界(MAIN world)执行。系统会自动包一层 function 再运行。\n' +
    '必须显式写 return 返回结果。返回值会经过安全转换：\n' +
    '- DOM 元素 → 自动提取为 {tag, id, className, value, textContent}\n' +
    '- NodeList / HTMLCollection → 自动展开为 {length, items: [...]}\n' +
    '- undefined → 转为 "(脚本无返回值)" 提示\n' +
    '- 字符串/数字/布尔/普通对象 → 原样返回\n' +
    "推荐写法：var el = document.querySelector('input'); return el;\n" +
    '也可以：return el.value / return el.tagName / return Array.from(list, e=>e.tagName)\n\n' +
    '可用 API（页面主世界环境，Trusted Types 已预配置）：\n' +
    '- DOM 查询: document.querySelector, querySelectorAll, getElementById\n' +
    '- 事件: new Event(name,{bubbles,cancelable}), new KeyboardEvent(name,{key,code,bubbles}), new MouseEvent(name,{bubbles,clientX,clientY,view:window}), new CompositionEvent(name,{data,bubbles}), new FocusEvent(name,{bubbles})\n' +
    '- 原型: HTMLInputElement.prototype, HTMLTextAreaElement.prototype\n' +
    "- 元素方法: el.click(), el.focus(), el.blur(), el.select(), el.scrollIntoView({behavior:'smooth',block:'center'}), el.dispatchEvent(ev), el.closest(sel), el.remove(), el.setAttribute(name,value), el.getAttribute(name), el.requestSubmit(), el.submit()\n" +
    '- 元素属性: el.value, el.textContent, el.innerHTML, el.checked, el.disabled, el.offsetParent, el.tagName, el.id, el.name, el.className, el.isContentEditable, el.attributes\n' +
    '- JS 内置: Object.getOwnPropertyDescriptor, Array.from, JSON.stringify, CSS.escape\n\n' +
    'PAGE_SCAN 返回页面前 300 个元素的原始属性（tag、text、attrs）及页面 iframe 列表。如需精确查找，写脚本用 querySelector 等 API 自己扫描。\n\n' +
    '## 错误码参考\n\n' +
    '操作失败时系统返回结构化错误：ELE_NOT_FOUND（未找到元素）、ELE_NOT_VISIBLE（不可见）、ELE_DISABLED（被禁用）、ELE_STALE（元素已移除）、ACT_TIMEOUT（超时）、ACT_BLOCKED（被拦截）、PAGE_BLOCKED（受保护页面）、COM_DISCONNECTED（连接断开）。根据错误码决定下一步。\n\n' +
    '## 通用原则\n\n' +
    '1. 每次只输出一个 action。看到结果再决定下一步。\n' +
    '2. thought 写清推理。"我看到 X，所以做 Y，预期发生 Z"。\n' +
    '3. 先观察再行动，行动后也要观察。执行前检查 elements[] 确认目标元素存在且状态正确。执行后检查 [自动验证] 输出，确认页面状态是否真的变化了。脚本返回 null 通常表示未命中元素或脚本主动返回空值；脚本返回 undefined 通常表示缺少 return。\n' +
    '4. 结果优先，假设其次。执行结果与预测不符时，相信结果，调整计划。\n' +
    '5. 用户插话是调整信号。先理解意图，再决定调整计划还是继续。\n' +
    '6. 连续同样错误 2 次 → 换方案。不要重复失败操作。操作后页面无变化也算失败。\n' +
    '7. 阻塞主动 ask。需要用户输入时停下来。\n' +
    '8. 模糊指代回顾上下文。历史对话和 planTracker 里有答案。\n' +
    '9. 所有决策基于数据，不假设页面状态。\n' +
    '10. 不假设元素类型。根据 elements[] 中的 tag 字段判断是什么元素，不要凭经验猜测。\n' +
    '11. **操作方式选择原则**：优先使用 dom_manipulate 在当前页面操作，这是最准确的方式。但当以下情况时，可以使用 navigate 工具：\n' +
    '   - 当前页面没有相关功能（如页面上没有搜索框，但用户要求搜索）\n' +
    '   - dom_manipulate 连续失败 3 次以上，确认当前页面无法完成该操作\n' +
    '   - 用户明确要求打开某个网站或 URL\n' +
    '   在 thought 中说明为什么选择 navigate 而不是 dom_manipulate。\n' +
    '12. 对书签、标签、窗口这类结构化资源，优先先用只读观察工具获取真实 id/path，再执行写操作。不要靠模糊猜测直接改数据。\n' +
    '13. 用户未明确要求创建、打开、删除时，不要自行调用 create/open/delete 类工具。找不到目标时先重新观察或 ask，不要自作主张补建对象。\n' +
    '14. **批量操作**：当需要执行多条同类操作时（如创建多个分组、关闭多个标签、静音多个标签、休眠多个标签、取消多个分组），先用 `tabs_observe` 等工具一次性收集所有需要的 ID/数据，然后用 `batch` 工具在一个调用中完成所有操作，不要逐条单独调用。这样可以大幅减少步骤数和时间。常见批量场景：关闭多个标签、静音/取消静音多个标签、休眠多个标签、创建多个分组、取消多个分组。\n' +
    '15. **颜色参数**：使用 `tabs_group` 时，`color` 只能使用以下值之一：`blue`, `cyan`, `green`, `grey`, `orange`, `pink`, `purple`, `red`, `yellow`。严禁使用其他颜色值。\n' +
    '16. **分组命名**：使用 `tabs_group` 时，如果创建新分组（无 groupId），必须同时传 `title` 参数作为分组名称，不能为空。`title` 和 `groupName` 都会显示给最终用户。\n\n' +
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
