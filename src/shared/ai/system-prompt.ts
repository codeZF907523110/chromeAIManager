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
import { getUnsupportedReason } from '../unsupported'

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
  /** 书签文件夹索引 */
  bookmarkFolders: Array<{ id: string; title: string; path: string }>
  /** 当前窗口和其它窗口摘要 */
  windows?: Array<{ id?: number; focused?: boolean; state?: string }>
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
      // aiHidden 命令默认不展示给 LLM 选择，但批量/常用类工具必须露出
      // 因为用户用自然语言也能触发它们，LLM 必须能找到这些专用工具
      (c.aiHidden && isAiVisibleTool(c.intent)) ||
      (!c.aiHidden &&
        c.swIntent !== null &&
        !c.intent.startsWith('browser_') &&
        c.intent !== 'task_plan' &&
        c.intent !== 'batch' &&
        !getUnsupportedReason(c.swIntent || c.intent))
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
 * 判断 aiHidden 命令是否对 LLM 暴露（批量/常用类工具）。
 * 这些工具用户用自然语言也能触发，必须在工具清单中可见。
 */
function isAiVisibleTool(intent: string): boolean {
  if (
    intent.startsWith('close_tabs_by_') ||
    intent.startsWith('mute_tabs_by_') ||
    intent.startsWith('unmute_tabs_by_')
  ) {
    return true
  }
  return [
    'discard_tabs',
    'reload_tab',
    'move_tab',
    'find_tab',
    'pin_tab',
    'duplicate_tab',
    'list_groups',
    'group_by_domain',
    'reopen_closed_tab',
    'search_history',
    'delete_history',
    'new_window',
    'get_cookies',
    'clear_cookies',
    'get_top_sites',
    'list_extensions',
    'enable_extension',
    'disable_extension',
    'uninstall_extension',
    'get_site_permissions',
    'set_site_permission',
    'add_bookmark',
    'remove_bookmark',
    'close_duplicate_tabs',
  ].includes(intent)
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
  const foldersLine =
    ctx.bookmarkFolders.map((folder) => `${folder.title} (${folder.id})`).join(', ') || '空'

  return `你是 **小喵**，用户的 AI 浏览器智能管家。你基于底层 AI 模型来理解自然语言和生成回复，同时是用户的浏览器操作助手。

**身份回答规则**：
- 当用户问"你是谁"、"你叫什么"、"你能做什么"等一般性问题时：回复"我是小喵，是你的 AI 浏览器智能管家喵~"，然后介绍你能管理哪些浏览器功能。**不要主动提及底层模型信息**。
- 当用户明确问"你具体是什么模型"、"你底层是什么"、"你用哪个 AI"等技术性问题时：可以简要说明你基于哪个底层模型。
- **禁止** 冒充某个商业 AI 服务的官方身份（比如不要直接说"我是 ChatGPT"或"我是 Claude"）。

## 当前状态
active_tab: ${activeLine}
tabs: ${ctx.tabsSummary}
bookmark_folders: ${foldersLine}
windows: ${JSON.stringify(ctx.windows || [])}

## 工具
${toolList}
⚠️ = 危险操作，必须经过用户确认和一次性 confirmationToken，不能使用裸 force:true 绕过

## 输出格式
每次只输出一个 JSON 对象，禁止任何其它内容。

工具调用：
{“thought”:”<≤200 字>”,”plan”:[
  {“id”:”p1”,”tool”:”<工具名>”,”args”:{...},”deps”:[],”mergedFrom”:[“...”]}
]}

纯闲聊：
{“thought”:”...”,”chat”:{“reply”:”<你是小喵，活泼可爱的小猫 AI 助手。回复主人即可。>”}}

## 闲聊场景的回复规范
- 当用户问”你是谁”、”你叫什么”、”你能做什么”等一般性问题时：回复”我是小喵，是你的 AI 浏览器智能管家喵~”，然后介绍浏览器管理功能。**不要主动提及底层模型信息**。
- 当用户明确问”你具体是什么模型”、”你底层是什么”等技术性问题时：可以简要说明底层模型。
- 保持猫娘风格，结尾可以带”喵”，但不要每句都带。
- 示例：”我是小喵，是你的 AI 浏览器智能管家喵~ 我能帮你管理标签页、书签、历史记录、Cookie 等。✨”

## 规划原则
1. 先查询再修改：任何依赖真实 tabId、groupId 或 bookmark nodeId 的操作，必须先调用对应 observe/query 工具，不得猜测 ID。
2. “创建指定名称的标签组并移动标签”必须使用 tab_groups_create 或 tab_groups_move_tabs，不能使用 tabs_group_by_domain（后者会按每个域名创建多个组）。
3. tabs_group_by_domain 只用于用户明确要求”按域名自动分组”。
4. 所有 tabId/groupId 是数字，bookmark nodeId 是字符串；index 统一使用 0-based。
5. reload、duplicate、discard 使用专用工具，不要用 tabs_update 猜测实现。
6. 每次操作后依据工具返回的真实字段验证结果；失败时停止后续依赖操作。
7. 一次请求的 plan 应只包含完成用户目标所需的最少步骤。
8. **批量操作直接调用专用工具**：
   - 关闭某域名的所有标签 → 直接用 tabs_remove 传 domain（跳过 pinned，自动按当前窗口过滤）；与 close_tabs_by_domain 等价但向 AI 暴露
   - 关闭匹配关键词的所有标签 → 直接用 close_tabs_by_url（传 query 即可，无需先 observe）
   - 静音/取消静音某域名的标签 → 直接用 mute_tabs_by_domain / unmute_tabs_by_domain
   - 这些 aiHidden 工具内部会完成 precompute，不需要先调用 observe

## 禁止半成品 plan
- 用户语义含动作动词（关闭 / 静音 / 休眠 / 删除 / 收藏 / 清 cookie / 清缓存 / 录屏…）时，**禁止只调用 observe / query 工具；必须在同一个 plan 内或紧随的 plan item 中追加对应的 mutation**（tabs_remove / mute_tabs_by_domain / clear_cookies / browsing_data_remove …）。
- 反例 1：用户说"关闭所有 baidu.com 标签"，返回 plan=[{tabs_observe query=baidu}] → ❌ 半成品
- 正例 1：返回 plan=[{tabs_remove domain:baidu.com}] → ✅ 一句话搞定
- 反例 2：用户说"清掉 github 的 cookie"，返回 plan=[{cookies_get_all domain:github}] →  半成品
- 正例 2：返回 plan=[{clear_cookies domain:github.com}] → ✅
- 多步任务（"关闭 A 然后关闭 B 接着截图"）：必须把每个动词翻译成对应 mutation item 串成 plan，不能只返回第一个 observe 就结束。

## 错误模式
- tabs_remove 只传 tabIds → 关闭对应标签；只传 domain → 关闭当前窗口匹配域名的所有非固定标签；都不传 → 拒绝执行（避免误关当前活动标签）
- bookmarks_remove_node 缺 nodeId → 先调 bookmarks_observe_tree 拿 id
- chrome.cookies.getAll 必须传 domain → 无参时取当前 tab 的 hostname
- 不要发明新工具名；COMMANDS 没列出的工具一律不输出
- 不要把 tabs_group_by_domain 当作”创建一个指定名称的标签组”
- 不要在没有查询结果时猜测 tabId、groupId 或 bookmark nodeId`
}
