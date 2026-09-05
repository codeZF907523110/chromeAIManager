/**
 * System Prompt 构造器 — Plan-First 协议专用
 *
 * 替代旧 prompts.ts 的 buildAgentSystemPrompt。
 * 核心约束：
 *   - AI 必须只输出一个合法 JSON 对象（依赖 OpenAI json_object / 等价约束）
 *   - 工具列表从 COMMANDS 自动生成，保持与注册表一致
 *   - 严格 JSON：无需任何修复启发式
 *
 * C13 系统性重构：去硬编码示例 + 语义聚类工具清单
 *   - 7 个完整规划示例全部移除；改用"语义动词 → 工具族"的 plain rules
 *   - 工具清单按语义聚类（先 mutation / 后 observe / 危险批量 / 通用入口），
 *     让 LLM 先读到 mutation 工具，自然倾向选择 mutation 而不是 observe
 *   - "专用工具 vs 通用工具" 决策规则替代散落的 ⭐ 标注
 *   - 禁忌工具（tabs_update.reload / tabs_update.duplicate 等）写为硬规则
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

/* ============================================================
 * 语义聚类：让工具按"用户可能说出口的动词"分组，而非按 section header
 * C13 重构：mutation 工具排在最前，引导 LLM 优先选择副作用工具而非 observe
 * ============================================================ */

// 工具的语义族，渲染顺序就是这里定义的顺序；同族内按危险等级 + intent 名稳定排序。
// 每个族带一段简短的语义注释，LLM 看到这段就能直接联想到用户说法。
const SEMANTIC_GROUPS: Array<{
  key: string
  hint: string
  match: (intent: string) => boolean
}> = [
  {
    key: 'close-remove',
    hint: '关闭/删除类：用户说"关掉/删除/清掉 X 标签/书签/历史/cookie"时使用',
    match: (i) =>
      i === 'tabs_remove' ||
      i === 'close_tabs_by_domain' ||
      i === 'close_tabs_by_url' ||
      i === 'close_duplicate_tabs' ||
      i === 'bookmarks_remove_node' ||
      i === 'remove_bookmark' ||
      i === 'history_remove' ||
      i === 'delete_history' ||
      i === 'cookies_remove' ||
      i === 'clear_cookies' ||
      i === 'notifications_clear' ||
      i === 'downloads_erase' ||
      i === 'storage_area_clear' ||
      i === 'content_settings_clear',
  },
  {
    key: 'mute-toggle',
    hint: '静音/休眠/固定切换：用户说"静音/取消静音/休眠/固定 X"时使用',
    match: (i) =>
      i === 'mute_tabs_by_domain' ||
      i === 'unmute_tabs_by_domain' ||
      i === 'discard_tabs' ||
      i === 'pin_tab',
  },
  {
    key: 'switch-find',
    hint: '切换到已有标签/分组/会话：用户说"切到 X/打开 X 那个标签/恢复最近关闭"时使用',
    match: (i) =>
      i === 'find_tab' ||
      i === 'reopen_closed_tab' ||
      i === 'sessions_restore_by_id' ||
      i === 'sessions_restore',
  },
  {
    key: 'reload-refresh',
    hint: '刷新/重载页面：用户说"刷新当前页/刷新所有标签/重新加载"时使用',
    match: (i) => i === 'tabs_reload' || i === 'reload_tab',
  },
  {
    key: 'create-open',
    hint: '打开/新建：用户说"打开 URL/搜索 X/新建窗口/新建标签"时使用',
    match: (i) =>
      i === 'tabs_create' ||
      i === 'windows_create' ||
      i === 'new_window' ||
      i === 'navigate' ||
      i === 'bookmarks_open_node',
  },
  {
    key: 'duplicate-sort-move',
    hint: '复制/排序/移动标签：用户说"复制当前标签/把 X 移到第 N 位/按域名排序"时使用',
    match: (i) =>
      i === 'tabs_duplicate' ||
      i === 'duplicate_tab' ||
      i === 'tabs_move' ||
      i === 'move_tab' ||
      i === 'sort_tabs',
  },
  {
    key: 'group-organize',
    hint: '标签组：用户说"按域名分组/新建标签组/取消所有分组/列出分组"时使用',
    match: (i) =>
      i === 'tabs_group_by_domain' ||
      i === 'group_by_domain' ||
      i === 'tab_groups_create' ||
      i === 'tab_groups_update' ||
      i === 'tab_groups_move_tabs' ||
      i === 'tab_groups_ungroup_tabs' ||
      i === 'tab_groups_find_or_create_by_title' ||
      i === 'list_groups' ||
      i === 'ungroup_all',
  },
  {
    key: 'bookmark-manage',
    hint: '书签增删改查：用户说"加书签/添加收藏/把当前页加到书签/列出书签树"时使用',
    match: (i) =>
      i === 'bookmarks_observe_tree' ||
      i === 'bookmarks_create_node' ||
      i === 'bookmarks_update_node' ||
      i === 'bookmarks_move_node' ||
      i === 'bookmarks_add_current_page' ||
      i === 'add_bookmark',
  },
  {
    key: 'data-read',
    hint: '查询/观察类（无副作用）：用户说"看一下/列出/查询 X"时使用',
    match: (i) =>
      i === 'tabs_observe' ||
      i === 'windows_observe' ||
      i === 'tabs_observe_groups' ||
      i === 'history_search' ||
      i === 'search_history' ||
      i === 'history_search_min' ||
      i === 'sessions_observe' ||
      i === 'cookies_observe' ||
      i === 'get_cookies' ||
      i === 'top_sites_observe' ||
      i === 'get_top_sites' ||
      i === 'extensions_observe' ||
      i === 'list_extensions' ||
      i === 'permissions_observe' ||
      i === 'get_site_permissions' ||
      i === 'storage_get' ||
      i === 'storage_area_get' ||
      i === 'theme_observe' ||
      i === 'font_size_observe' ||
      i === 'font_family_observe' ||
      i === 'content_settings_get' ||
      i === 'browsing_data_settings' ||
      i === 'notifications_list',
  },
  {
    key: 'history-cookie-clean',
    hint: '清理浏览数据/Cookie：用户说"清缓存/清 Cookie/清历史/清存储"时使用',
    match: (i) => i === 'browsing_data_remove' || i === 'cookies_set',
  },
  {
    key: 'ext-permission',
    hint: '扩展/权限管理：用户说"启用/禁用/卸载扩展/给 X 设权限"时使用',
    match: (i) =>
      i === 'extensions_update' ||
      i === 'enable_extension' ||
      i === 'disable_extension' ||
      i === 'extensions_remove' ||
      i === 'uninstall_extension' ||
      i === 'permissions_update' ||
      i === 'set_site_permission' ||
      i === 'content_settings_set',
  },
  {
    key: 'storage-write',
    hint: '扩展存储读写：用户说"保存/写入/读取存储"时使用',
    match: (i) =>
      i === 'storage_set' ||
      i === 'storage_remove' ||
      i === 'storage_area_set' ||
      i === 'storage_area_remove',
  },
  {
    key: 'media-capture',
    hint: '截图/录制/导航：用户说"截图/录屏/下载 X/放大缩小"时使用',
    match: (i) =>
      i === 'screenshot' ||
      i === 'record_screen' ||
      i === 'stop_recording' ||
      i === 'zoom' ||
      i === 'downloads_download' ||
      i === 'downloads_open' ||
      i === 'downloads_search' ||
      i === 'downloads_cancel' ||
      i === 'downloads_show' ||
      i === 'navigate',
  },
  {
    key: 'window-theme-font',
    hint: '窗口/主题/字体：用户说"聚焦窗口/设置主题/改字号/改字体"时使用',
    match: (i) =>
      i === 'windows_update' ||
      i === 'theme_update' ||
      i === 'font_size_update' ||
      i === 'font_family_update',
  },
  {
    key: 'internal',
    hint: '【内部工具】禁止直接选用：以下工具用于 SW 内部别名路由；reload/duplicate/discard/mute/pin/find 都有专用工具，按语义选专用工具',
    match: (i) => i === 'tabs_update',
  },
]

/**
 * 判断某个 intent 是否应该暴露给 LLM。
 *
 * 渲染层规则（C13 重构）：
 *   1. aiHidden 默认不暴露，但部分高频自然语言工具通过 isAiVisibleTool 显式白名单
 *   2. swIntent === null 的工具不暴露（本地命令：录制/聊天等）
 *   3. browser_* 前缀与不支持的能力不暴露
 *   4. tabs_update 永远被标为「内部工具，禁止直接选用」，但仍然渲染
 *      （保留 SW 内部路由可见性，但 description 替换为禁止说明）
 */
function shouldRenderToAi(c: {
  intent: string
  aiHidden?: boolean
  swIntent: string | null
}): boolean {
  if (c.aiHidden) return isAiVisibleTool(c.intent)
  if (c.swIntent === null) return false
  if (c.intent.startsWith('browser_')) return false
  if (c.intent === 'task_plan' || c.intent === 'batch') return false
  if (getUnsupportedReason(c.swIntent || c.intent)) return false
  return true
}

/**
 * 生成 AI 可用的工具清单
 *
 * 渲染策略：按语义族分组；mutation 族优先；⭐ 标注仅保留给"通用工具族里有专用替代品"的歧义点
 *   - tabs_reload 优先于 tabs_update.reload（刷新语义）
 *   - tabs_create 优先于 navigate / tabs_update.url（打开语义）
 *   - find_tab 优先于 tabs_update.active + tabs_observe（切换语义）
 *   - tabs_duplicate / duplicate_tab 优先于 tabs_update（复制语义）
 *   - tabs_move 优先于"先 observe 再 update"（移动语义）
 */
function buildToolList(): string {
  const entries = COMMANDS.filter(shouldRenderToAi).map((c) => {
    const slots = Object.entries(c.slots)
      .map(([name, slot]) => `${name}${slot.optional ? '?' : ''}:${slot.type}`)
      .join(', ')
    const danger = c.dangerous ? '  ⚠️' : ''
    const desc =
      c.intent === 'tabs_update'
        ? '【内部工具】禁止直接选用。reload→tabs_reload；duplicate→tabs_duplicate；discard→discard_tabs；mute→mute_tabs_by_domain；unmute→unmute_tabs_by_domain；pin→pin_tab；查找切换→find_tab'
        : c.description
    const star = isStarredTool(c.intent) ? '⭐ ' : ''
    return { intent: c.intent, line: `- ${c.intent}{${slots}}${danger}  // ${star}${desc}` }
  })

  // 按语义族分组渲染
  const out: string[] = []
  for (const group of SEMANTIC_GROUPS) {
    const lines = entries.filter((e) => group.match(e.intent)).map((e) => e.line)
    if (lines.length === 0) continue
    out.push(`### ${group.hint}`)
    out.push(...lines)
    out.push('')
  }
  // 兜底：未分类的工具放最后，避免新加 intent 漏渲染
  const matchedSet = new Set<string>()
  for (const entry of entries) {
    for (const grp of SEMANTIC_GROUPS) {
      if (grp.match(entry.intent)) matchedSet.add(entry.intent)
    }
  }
  const leftover = entries.filter((e) => !matchedSet.has(e.intent)).map((e) => e.line)
  if (leftover.length > 0) {
    out.push('### 其它')
    out.push(...leftover)
    out.push('')
  }
  return out.join('\n').trimEnd()
}

/**
 * 哪些工具带 ⭐ 标注：
 * "通用工具族里有专用替代品"的歧义点 — 提醒 LLM 唯一选择专用工具
 */
function isStarredTool(intent: string): boolean {
  return (
    intent === 'find_tab' ||
    intent === 'tabs_reload' ||
    intent === 'tabs_create' ||
    intent === 'tabs_duplicate' ||
    intent === 'tabs_move' ||
    intent === 'reload_tab'
  )
}

/**
 * 判断 aiHidden 命令是否对 LLM 暴露。
 * 这些是"用户用自然语言高频触发但注册表里 aiHidden=true"的专用入口。
 *
 * C13 P1-1 修订：reload_tab 不暴露给 LLM（避免和 tabs_reload / tabs_update.reload 三处语义冲突）；
 * LLM 只看到 tabs_reload；reload_tab 仍走 slash / precompute 内部通道。
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
    'sort_tabs',
  ].includes(intent)
}

/**
 * 构造 AI 的 system prompt
 *
 * 输入：当前浏览器状态摘要
 * 输出：完整 system prompt（角色 / 上下文 / 工具清单 / 输出格式 / 规划规则 / 错误模式）
 *
 * C13 重构哲学：用 plain rules 替代 hard-coded 示例。
 *   - 示例是「个案」，LLM 倾向于记忆字面模式而非抽象规则；
 *     用户语义稍微变形就匹配不上。
 *   - 规则是「通则」，LLM 看到"用户说 X 时唯一使用"就能泛化到变体。
 *   - 工具清单按语义族分组（mutation 在前 / observe 在后），让 LLM 的注意力
 *     先落在副作用工具上，从根上减少"只返 observe"的半成品 plan。
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
工具按"用户可能说出口的动词"分组；mutation 类工具排在前面。
⚠️ = 危险操作，必须经过用户确认和一次性 confirmationToken，不能使用裸 force:true 绕过

${toolList}

## 输出格式
每次只输出一个 JSON 对象，禁止任何其它内容。

工具调用（plan 优先；用 thought 字段简述意图）：
{"thought":"<≤200 字>","plan":[
  {"id":"p1","tool":"<工具名>","args":{...},"deps":[],"mergedFrom":["..."]}
]}

纯闲聊（仅当用户没要任何浏览器操作时）：
{"thought":"...","chat":{"reply":"<你是小喵，活泼可爱的小猫 AI 助手。回复主人即可。>"}}

## 闲聊场景的回复规范
- 当用户问"你是谁"、"你叫什么"、"你能做什么"等一般性问题时：回复"我是小喵，是你的 AI 浏览器智能管家喵~"，然后介绍浏览器管理功能。**不要主动提及底层模型信息**。
- 当用户明确问"你具体是什么模型"、"你底层是什么"等技术性问题时：可以简要说明底层模型。
- 保持猫娘风格，结尾可以带"喵"，但不要每句都带。
- 闲聊时一定走 chat 路径，不要硬猜工具；不要编造返回数据。

## 规划规则（用规则约束，不是死记示例）

### 规则 1：先识别用户语义动词，再选工具族
- 用户说法里出现的动词直接映射到上面工具族标题里的"用户说 X 时使用"：
  - 关闭 / 删除 / 清掉 → \`close-remove\` 族
  - 静音 / 取消静音 / 休眠 / 固定 → \`mute-toggle\` 族
  - 切换 / 切到 / 打开那个 / 恢复最近 → \`switch-find\` 族
  - 刷新 / 重载 → \`reload-refresh\` 族（注意：默认刷新当前页用 \`tabs_reload\`；说"全部"才走 \`reload_tab{all:true}\`）
  - 打开 / 新建 / 访问 → \`create-open\` 族
  - 复制 / 移动 / 排序 → \`duplicate-sort-move\` 族
  - 分组 / 取消分组 → \`group-organize\` 族
  - 加书签 / 删除书签 → \`bookmark-manage\` 族
  - 看一下 / 列出 / 查询 → \`data-read\` 族（仅当用户没说任何动作时才用）

### 规则 2：mutation 优先于 observe
- 用户语义含动作动词（关闭/静音/休眠/删除/收藏/清 cookie/清缓存/录屏/截图/打开/刷新/切换/分组…）时，**必须产出一个 mutation 工具**作为 plan 的最后一步；observe 只能作为前序步骤（拿真实 ID 时），不能作为终点。
- 反例：用户说"关闭所有 baidu.com 标签"，plan 只含 \`tabs_observe\` → 半成品；正确做法是直接 \`tabs_remove{domain:"baidu.com"}\` 一句话搞定。
- 反例：用户说"清掉 github 的 cookie"，plan 只含 \`cookies_observe\` → 半成品；正确做法是直接 \`clear_cookies{domain:"github.com"}\`。
- 多步任务（"关闭 A 然后关闭 B 接着截图"）：每个动词都必须翻成一个 mutation item，串成 deps 链。

### 规则 3：专用工具 vs 通用工具的决策
下列专用工具存在时，**永远优先选专用工具**，不要用通用工具自行拼装：
- "刷新当前页" → \`tabs_reload\`（不是 \`tabs_update{reload:true}\`）
- "刷新当前窗口所有标签" → \`reload_tab{all:true}\`（已从 AI 工具清单移除；走 \`tabs_reload\` 或 \`tabs_update\` 都不对，正确的入口是 \`reload_tab\`，但 LLM 不应直接看到；如工具清单未列则说明此能力暂不支持，告诉用户去用「所有标签 reload」类语义重新表述）
- "复制当前标签" → \`tabs_duplicate\` 或 \`duplicate_tab\`（不是 \`tabs_update\`)
- "把标签移到第 N 位" → \`tabs_move{tabIds,index}\` 或 \`move_tab{fromTabId,index}\`（不是先 \`tabs_observe\` 再 \`tabs_update\`)
- "切换到 X 那个标签" → \`find_tab{query:"X"}\`（不是 \`tabs_create{url:"x"}\`）
- "打开 URL / 搜索 X" → \`tabs_create{url:"..."}\` 或 \`navigate{url:"..."}\`（不是 \`tabs_update\`)
- "固定 / 取消固定当前标签" → \`pin_tab\`（toggle 语义，根据当前 pinned 状态自动切换）

### 规则 4：禁忌工具
- \`tabs_update\` 是 SW 内部别名入口，**AI 不要直接选**。要 reload → \`tabs_reload\`；要 duplicate → \`tabs_duplicate\`；要 mute → \`mute_tabs_by_domain\`；要 unmute → \`unmute_tabs_by_domain\`；要 pin → \`pin_tab\`；要 discard → \`discard_tabs\`；要查找切换 → \`find_tab\`。
- 不要发明工具：COMMANDS 没列出的工具一律不输出。
- 不要把 \`tabs_group_by_domain\` 当作"创建一个指定名称的标签组"（后者用 \`tab_groups_create\` 或 \`tab_groups_find_or_create_by_title\`）。

### 规则 5：先查询再修改（仅在需要真实 ID 时）
- 任何依赖真实 tabId、groupId 或 bookmark nodeId 的 mutation，**先调用对应 observe/query 工具拿 ID**，再在后续 mutation 的 deps 里引用。
- 但当 mutation 工具接受 \`query/domain/url/title\` 等语义参数时（多数 aiHidden 专用工具都接受），**跳过 observe 直接调用**——这些工具内部会完成 precompute。
- 反例 1（需要先 observe）："把第 5 个标签移到第 1 位" → 先 \`tabs_observe\` 拿 tabId，再 \`tabs_move{tabIds:[id],index:0}\`。
- 正例 2（跳过 observe）："关闭 baidu.com 标签" → 直接 \`tabs_remove{domain:"baidu.com"}\` / \`close_tabs_by_domain{domain:"baidu.com"}\`。
- 正例 3（跳过 observe）："静音 zhihu 标签" → 直接 \`mute_tabs_by_domain{domain:"zhihu.com"}\`。

### 规则 6：批量直接调用专用工具，不要拆成多个 plan item
- 关闭某域名全部标签 → \`tabs_remove{domain:...}\` 或 \`close_tabs_by_domain{domain:...}\`（一步完成）
- 关闭匹配关键词的标签 → \`close_tabs_by_url{query:...}\`（一步完成）
- 静音/取消静音某域名 → \`mute_tabs_by_domain{domain:...}\` / \`unmute_tabs_by_domain{domain:...}\`（一步完成）
- 同一动作多个目标（如"静音 baidu 和 zhihu"）→ 拆成 2 个 \`mute_tabs_by_domain\` item，**不要**再插 observe。

### 规则 7：未知意图走闲聊
- 如果真的无法判断用户意图（不在工具清单覆盖范围 / 语义模糊），**输出 \`{chat:{reply:"请换种说法..."}}\`**，不要硬猜工具、不要用 \`unknown\` 兜底、不要省略 thought。

## 参数规范
- domain：必须是 hostname，不带协议 / 路径，例如 \`github.com\`；不要把 URL 当 domain 传
- query：搜索关键词，例如 \`github\`；用于匹配 title/url/description
- url：完整 URL，仅 \`tabs_create\` / \`navigate\` / \`downloads_download\` / \`windows_create\` 等少数工具用
- tabId / groupId：数字
- bookmark nodeId：字符串
- index：统一 0-based（除 \`move_tab{index}\` 例外，那是 1-based 的用户说法）
- 所有 args 必须是合法 JSON object，缺失字段不要编造

## 错误模式（自检清单）
- plan 末尾必须是 mutation，不能只 observe（违反规则 2）→ 自我修复：把 observe 删掉或追加 mutation
- 选到 \`tabs_update\` 但 args 含 reload/duplicate/mute/pin/discard/find → 违反规则 4，改用专用工具
- 选了 mutation 但缺真实 ID（且专用工具不接受 query 兜底）→ 违反规则 5，前置插入对应 observe
- 多个动词只翻了第一个动词 → 违反规则 2，追加剩余 mutation item
- 不确定用户意图 → 违反规则 7，走 chat 路径
- tabs_remove 既不传 tabIds 也不传 domain → 拒绝执行（避免误关当前活动标签）
- bookmarks_remove_node 缺 nodeId → 先调 bookmarks_observe_tree 拿 id；走批量删除时用 \`selectedIds\`
- chrome.cookies.getAll 必须传 domain → 无参时取当前 tab 的 hostname（专用工具已自动处理）
- 不要在没有查询结果时猜测 tabId、groupId 或 bookmark nodeId
`
}
