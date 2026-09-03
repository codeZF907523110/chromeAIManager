/**
 * AI 半成品 Plan 兜底 — 数据驱动 Verb → Intent 表 + 多步拆分 + 参数抽取
 *
 * 解决问题：当 AI 偶发只返回 observe/query 类只读工具而不追加真正要执行的 mutation，
 * 由 usePlanRunner 在 SW 返回后、消费前调用 detectHalfPlan(parsed, userText) 补齐缺失项。
 *
 * 设计原则：
 *   - Pure functions：无可变全局状态、不依赖 chrome.* API，方便单测
 *   - 双语：verbs 中英文并存，connector regex 中英双语
 *   - 单一事实源：dangerous 字段从 commands.ts 派生（getCommand(intent).dangerous），
 *     本表不重复定义；表只声明意图维度
 *   - 安全第一：拿不到必需参数（如 domain）→ 不合成 mutation，绝不"猜"
 *
 * 与斜杠命令路径完全解耦：本模块只服务于 usePlanRunner 的 run() 路径，
 * useSlashCommandRunner 不引用本模块。
 */

import type { AIPlan, PlanItem } from './plan-types'
import { getCommand } from '../commands'

// ──── Verb → Intent 表 ────────────────────────────────────────────────

/** argSlot: 参数来源优先级键（extractArgs 用） */
export type ArgSlot =
  | 'domain'
  | 'query'
  | 'url'
  | 'title'
  | 'text'
  | 'name'
  | 'pattern'
  | 'order'
  | 'index'
  | 'level'
  | 'zoomFactor'
  | 'state'
  | 'windowId'
  | 'timeRange'
  | 'color'
  | 'family'
  | 'size'
  | 'dataTypes'
  | 'message'
  | 'setting'
  | 'value'

export interface IntentRule {
  /** 唯一 id，便于日志追踪 */
  id: string
  /** COMMANDS 注册表中的 intent 名（userIntent，非 swIntent） */
  intent: string
  /** 触发该规则的动词正则片段（任一命中即匹配；正则按动词编译为 \b 边界） */
  verbs: string[]
  /** 参数抽取目标槽位 */
  argSlot?: ArgSlot
  /** 是否依赖前端 precompute（precompute.ts 已实现） */
  requiresPrecompute?: boolean
  /** 仅作为最终步骤追加（用于多步链末尾，如截图） */
  standalone?: boolean
}

/**
 * 18 域 verb 表。注意：dangerous 字段通过 getCommand(intent).dangerous 派生，
 * 不在本表重复声明，避免 commands.ts 与本表两处真相源脱节。
 */
export const INTENT_RULES: readonly IntentRule[] = [
  // ─── Tab close / remove ───
  {
    id: 'tab-close-by-domain',
    intent: 'close_tabs_by_domain',
    verbs: [
      '关闭',
      '关掉',
      '关闭所有',
      '关掉所有',
      '全部关闭',
      '关闭全部',
      'close',
      'kill',
      'remove',
    ],
    argSlot: 'domain',
    requiresPrecompute: true,
  },
  {
    id: 'tab-close-duplicate',
    intent: 'close_duplicate_tabs',
    verbs: ['关闭重复', '去重', '重复标签', 'close duplicates', 'dedup'],
    argSlot: 'query',
    requiresPrecompute: true,
  },
  {
    id: 'tab-close-by-url',
    intent: 'close_tabs_by_url',
    verbs: ['关闭匹配', '关闭含', '关掉搜索', '关闭标题', 'close matching'],
    argSlot: 'query',
    requiresPrecompute: true,
  },

  // ─── Tab state ───
  {
    id: 'tab-mute-by-domain',
    intent: 'mute_tabs_by_domain',
    verbs: ['静音', '设为静音', '安静下来', 'mute'],
    argSlot: 'domain',
    requiresPrecompute: true,
  },
  {
    id: 'tab-unmute-by-domain',
    intent: 'unmute_tabs_by_domain',
    verbs: ['取消静音', '解除静音', '恢复声音', '取消安静', 'unmute'],
    argSlot: 'domain',
    requiresPrecompute: true,
  },
  {
    id: 'tab-pin',
    intent: 'pin_tab',
    verbs: ['固定', '钉住', '取消固定', '取消钉住', 'pin', 'unpin'],
  },
  {
    id: 'tab-duplicate',
    intent: 'duplicate_tab',
    verbs: ['复制标签', '克隆标签', 'duplicate tab'],
  },
  {
    id: 'tab-reload',
    intent: 'reload_tab',
    verbs: ['刷新', '重载', 'reload'],
    requiresPrecompute: true,
  },
  {
    id: 'tab-discard',
    intent: 'discard_tabs',
    verbs: ['休眠', '冻结', 'discard'],
    argSlot: 'domain',
    requiresPrecompute: true,
  },
  {
    id: 'tab-move',
    intent: 'move_tab',
    verbs: ['移到第', '移动到第', 'move tab to'],
    argSlot: 'index',
    requiresPrecompute: true,
  },
  {
    id: 'tab-sort',
    intent: 'sort_tabs',
    verbs: ['排序', '排列', '按域名排序', '按标题排序', 'sort'],
    argSlot: 'order',
    requiresPrecompute: true,
  },
  {
    id: 'tab-find',
    intent: 'find_tab',
    verbs: ['查找', '搜索标签', 'find tab', 'locate tab'],
    argSlot: 'query',
    requiresPrecompute: true,
  },

  // ─── Tab navigation ───
  {
    id: 'tab-navigate',
    intent: 'navigate',
    verbs: ['打开', '访问', '跳转', 'navigate', 'go to'],
    argSlot: 'url',
  },
  {
    id: 'tab-screenshot',
    intent: 'screenshot',
    verbs: ['截图', '截屏', '截个图', 'screenshot', 'snapshot'],
    argSlot: 'query',
    requiresPrecompute: true,
    standalone: true,
  },
  {
    id: 'tab-zoom',
    intent: 'zoom',
    verbs: ['放大', '缩小', '缩放', 'zoom'],
    argSlot: 'level',
  },
  {
    id: 'tab-reopen',
    intent: 'reopen_closed_tab',
    verbs: ['重新打开', '恢复关闭的', 'reopen', 'undo close'],
    argSlot: 'query',
  },

  // ─── Tab grouping ───
  {
    id: 'group-by-domain',
    intent: 'group_by_domain',
    verbs: ['按域名分组', '按域分组', 'group by domain'],
  },
  {
    id: 'group-create',
    intent: 'tab_groups_find_or_create_by_title',
    verbs: ['创建分组', '建个组', '分到名为', 'group named'],
    argSlot: 'title',
  },
  {
    id: 'group-rename',
    intent: 'tab_groups_update',
    verbs: ['改名为', '把组改名', 'rename group'],
    argSlot: 'title',
  },
  {
    id: 'group-color',
    intent: 'tab_groups_update',
    verbs: ['改颜色', '染成蓝色', 'recolor'],
    argSlot: 'color',
  },
  {
    id: 'group-ungroup',
    intent: 'ungroup_all',
    verbs: ['解组', '取消分组', '取消所有分组', 'ungroup'],
  },

  // ─── Window ───
  {
    id: 'window-new',
    intent: 'new_window',
    verbs: ['新开窗口', '开个新窗口', 'new window'],
    argSlot: 'url',
  },
  {
    id: 'window-close',
    intent: 'windows_remove',
    verbs: ['关闭窗口', '关闭所有窗口', 'close window'],
  },
  {
    id: 'window-minimize',
    intent: 'windows_update',
    verbs: ['最小化', '最大化', '全屏', 'minimize', 'maximize', 'fullscreen'],
    argSlot: 'state',
  },

  // ─── Bookmark ───
  {
    id: 'bookmark-add',
    intent: 'add_bookmark',
    verbs: ['加书签', '加入收藏', '收藏一下', 'bookmark', 'save page'],
    argSlot: 'url',
  },
  {
    id: 'bookmark-remove',
    intent: 'remove_bookmark',
    verbs: ['删除书签', '移除书签', '取消收藏', 'remove bookmark', 'delete bookmark'],
    argSlot: 'query',
    requiresPrecompute: true,
  },

  // ─── History ───
  {
    id: 'history-view',
    intent: 'search_history',
    verbs: ['看历史', '翻历史', '今天看了什么', 'show history', 'view history'],
    argSlot: 'timeRange',
  },
  {
    id: 'history-delete',
    intent: 'delete_history',
    verbs: ['清历史', '清空历史', '删历史', 'clear history', 'delete history'],
    argSlot: 'timeRange',
    requiresPrecompute: true,
  },
  {
    id: 'history-search-keyword',
    intent: 'search_history',
    verbs: ['查找历史', '搜历史', 'search history'],
    argSlot: 'query',
  },

  // ─── Cookies / permissions ───
  {
    id: 'cookie-view',
    intent: 'get_cookies',
    verbs: ['看 cookie', '查看 cookie', '查 cookie', 'show cookies', 'view cookies'],
    argSlot: 'domain',
  },
  {
    id: 'cookie-clear',
    intent: 'clear_cookies',
    verbs: [
      '清 cookie',
      '清除 cookie',
      '删 cookie',
      '清掉 cookie',
      'cookie 都清掉',
      'cookie 清掉',
      'cookie 删除',
      'cookie 清除',
      'cookie 全部清掉',
      'cookies 都清掉',
      'cookies 清掉',
      'clear cookies',
      'delete cookies',
    ],
    argSlot: 'domain',
  },
  {
    id: 'permission-set',
    intent: 'set_site_permission',
    verbs: ['设置权限', '关闭弹窗', '屏蔽通知', 'set permission', 'block popups'],
    argSlot: 'setting',
  },
  {
    id: 'permission-allow',
    intent: 'set_site_permission',
    verbs: ['允许通知', '允许权限', 'allow permission'],
    argSlot: 'setting',
  },

  // ─── Storage ───
  {
    id: 'storage-get',
    intent: 'storage_area_get',
    verbs: ['读存储', '取存储', 'read storage'],
    argSlot: 'name',
  },
  {
    id: 'storage-set',
    intent: 'storage_set',
    verbs: ['写存储', '存', 'write storage', 'save to storage'],
    argSlot: 'value',
  },
  {
    id: 'storage-remove',
    intent: 'storage_remove',
    verbs: ['删存储键', '清存储', 'remove storage key', 'delete storage'],
    argSlot: 'name',
  },

  // ─── Cleanup ───
  {
    id: 'cleanup-cache',
    intent: 'browsing_data_remove',
    verbs: ['清缓存', '清除缓存', 'clear cache'],
    argSlot: 'dataTypes',
  },
  {
    id: 'cleanup-cookies-cache',
    intent: 'browsing_data_remove',
    verbs: ['清 cookie 和缓存', 'clear cookies and cache'],
    argSlot: 'dataTypes',
  },
  {
    id: 'cleanup-downloads',
    intent: 'downloads_erase',
    verbs: ['清下载', '删除下载', 'clear downloads', 'delete downloads'],
  },

  // ─── Extension ───
  {
    id: 'extension-list',
    intent: 'list_extensions',
    verbs: ['看扩展', '列出扩展', 'list extensions', 'show extensions'],
    argSlot: 'query',
  },
  {
    id: 'extension-enable',
    intent: 'enable_extension',
    verbs: ['启用扩展', '打开扩展', 'enable extension'],
    argSlot: 'query',
    requiresPrecompute: true,
  },
  {
    id: 'extension-disable',
    intent: 'disable_extension',
    verbs: ['禁用扩展', '关闭扩展', 'disable extension'],
    argSlot: 'query',
    requiresPrecompute: true,
  },
  {
    id: 'extension-uninstall',
    intent: 'uninstall_extension',
    verbs: ['卸载扩展', '删扩展', 'uninstall extension'],
    argSlot: 'query',
  },

  // ─── Theme / Font ───
  {
    id: 'theme-dark',
    intent: 'set_theme',
    verbs: ['深色模式', '切换到深色', 'dark mode'],
  },
  {
    id: 'theme-light',
    intent: 'set_theme',
    verbs: ['浅色模式', '切换到浅色', 'light mode'],
  },
  {
    id: 'theme-follow',
    intent: 'set_theme',
    verbs: ['主题跟随系统', 'follow system theme'],
  },
  {
    id: 'font-size',
    intent: 'font_size_update',
    verbs: ['调整字号', '调大字号', '调小字号', '字号恢复默认', 'font size'],
    argSlot: 'size',
  },
  {
    id: 'font-family',
    intent: 'font_family_update',
    verbs: ['换字体', '调整字体', 'change font'],
    argSlot: 'family',
  },

  // ─── Recording ───
  {
    id: 'recording-start',
    intent: 'record_screen',
    verbs: ['开始录屏', '录屏', '录制屏幕', 'start recording', 'record screen'],
  },
  {
    id: 'recording-stop',
    intent: 'stop_recording',
    verbs: ['停止录屏', '结束录制', 'stop recording'],
    standalone: true,
  },

  // ─── Downloads ───
  {
    id: 'download-file',
    intent: 'downloads_download',
    verbs: ['下载', 'download'],
    argSlot: 'url',
  },
  {
    id: 'download-search',
    intent: 'downloads_search',
    verbs: ['看下载记录', '搜索下载', 'show downloads', 'search downloads'],
    argSlot: 'query',
  },
  {
    id: 'download-erase',
    intent: 'downloads_erase',
    verbs: ['删下载', '删除下载文件', 'erase download', 'delete downloaded'],
    argSlot: 'query',
  },

  // ─── Notifications ───
  {
    id: 'notification-create',
    intent: 'notifications_create',
    verbs: ['发通知', '创建通知', 'send notification', 'create notification'],
    argSlot: 'message',
  },
  {
    id: 'notification-clear',
    intent: 'notifications_clear',
    verbs: ['清除所有通知', '清通知', 'clear notifications', 'dismiss notifications'],
  },
]

// ──── 多步连接词正则（中英双语） ────────────────────────────────────

const CONNECTOR_REGEX =
  /然后|接着|随后|之后|再|并|plus|then(?:after)?|after that|finally|and then|next/i

/** 把单段用户输入按 connector 切成多步；保留顺序；剔除空段 */
export function extractStepsFromText(userText: string): string[] {
  if (!userText) return []
  const normalized = userText
    .replace(/帮我|请|please/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return []
  const parts = normalized
    .split(CONNECTOR_REGEX)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts
}

// ──── 参数抽取（按优先级链） ─────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s]+/i
const DOMAIN_REGEX = /\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)\b/i
const BARE_TARGET_REGEX = /(?:^|\s)([a-z][a-z0-9-]{1,})(?=\s|$)/gi
const QUOTED_REGEX = /"([^"]+)"|「([^」]+)」|'([^']+)'/g
const ALL_WINDOWS_REGEX = /所有|全部|all|every|across/i
const TIME_RANGE_REGEX = /今天|昨天|最近一周|最近一个月|全部|today|yesterday|week|month|all/i
const BARE_TARGET_STOPWORDS = new Set([
  'a',
  'an',
  'all',
  'and',
  'close',
  'delete',
  'every',
  'find',
  'for',
  'go',
  'kill',
  'open',
  'remove',
  'search',
  'show',
  'take',
  'the',
  'then',
  'to',
])

/**
 * 抽取参数。
 *
 * @param slot 期望的槽位（来自 IntentRule.argSlot）
 * @param planItems 原 plan 的 items（首选来源）
 * @param userText 用户原始文本（fallback）
 * @returns 抽取到的值；拿不到返回 undefined
 */
export function extractArgs(
  slot: ArgSlot | undefined,
  planItems: readonly PlanItem[],
  userText: string
): Record<string, unknown> | undefined {
  if (!slot) return undefined

  // 1) 从 planItems 中按 slot 名查找 args（首选）
  for (const it of planItems) {
    const candidate = (it.args as Record<string, unknown> | undefined)?.[slot]
    if (typeof candidate === 'string' && candidate.trim()) {
      return buildArg(slot, candidate.trim())
    }
  }

  // 通用兜底键（domain / query / url 等不一定正好等于 slot 名）
  const genericKeys = ['domain', 'query', 'url', 'hostname', 'title', 'text', 'name', 'pattern']
  for (const it of planItems) {
    const args = (it.args as Record<string, unknown> | undefined) ?? {}
    for (const key of genericKeys) {
      const candidate = args[key]
      if (typeof candidate === 'string' && candidate.trim()) {
        return buildArg(slot, candidate.trim())
      }
    }
  }

  if (!userText) return undefined

  // 2) URL 正则
  const urlMatch = userText.match(URL_REGEX)
  if (urlMatch) {
    const url = urlMatch[0].replace(/[，。,.；;]+$/, '')
    if (matchesSlot(slot, 'url')) return buildArg(slot, url)
  }

  // 3) Domain 正则
  const domainMatch = userText.match(DOMAIN_REGEX)
  if (domainMatch) {
    const candidate = domainMatch[0].toLowerCase()
    if (looksLikeDomain(candidate) && matchesSlot(slot, 'domain')) {
      return buildArg(slot, candidate)
    }
  }

  // 3b) Bare hostname fallback（baidu / youtube / github 等无点的目标词）
  if (slot === 'domain' || slot === 'url') {
    const bareMatches = Array.from(userText.matchAll(BARE_TARGET_REGEX))
    for (const m of bareMatches) {
      const candidate = (m[1] ?? '').toLowerCase()
      if (!candidate || BARE_TARGET_STOPWORDS.has(candidate)) continue
      // 跳过已经被 DOMAIN_REGEX 匹配的（带点的）
      if (userText.includes(`${candidate}.`)) continue
      // 至少 3 字符才认为是合法裸主机名
      if (candidate.length >= 3) {
        return buildArg(slot, candidate)
      }
    }
  }

  // 4) 引号内容
  const quotedMatches = Array.from(userText.matchAll(QUOTED_REGEX))
  if (quotedMatches.length > 0) {
    const quoted = quotedMatches[0][1] ?? quotedMatches[0][2] ?? quotedMatches[0][3] ?? ''
    if (quoted && matchesSlot(slot, 'title')) {
      return buildArg(slot, quoted)
    }
    if (quoted && matchesSlot(slot, 'query')) {
      return buildArg(slot, quoted)
    }
  }

  // 5) 剩余文本（去 URL / domain / 引号 / 停用词）
  let remainder = userText
    .replace(URL_REGEX, ' ')
    .replace(DOMAIN_REGEX, ' ')
    .replace(QUOTED_REGEX, ' ')
    .replace(ALL_WINDOWS_REGEX, ' ')
    .replace(TIME_RANGE_REGEX, ' ')
    .replace(CONNECTOR_REGEX, ' ')
    .replace(/帮我|请|please|一下|的|了|把/gi, ' ')
    .replace(/[，。,.；;！!？?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (remainder && matchesSlot(slot, 'query')) {
    return buildArg(slot, remainder)
  }
  if (remainder && matchesSlot(slot, 'title')) {
    return buildArg(slot, remainder)
  }

  // 6) 特殊槽位默认值
  if (slot === 'dataTypes') {
    return { dataTypes: ['cache'] }
  }
  if (slot === 'order' && /标题|title/i.test(userText)) {
    return { order: 'title' }
  }
  if (slot === 'order') {
    return { order: 'domain' }
  }
  if (slot === 'state') {
    if (/最大|maximize/i.test(userText)) return { state: 'maximized' }
    if (/最小|minimize/i.test(userText)) return { state: 'minimized' }
    if (/全屏|fullscreen/i.test(userText)) return { state: 'fullscreen' }
  }

  return undefined
}

function matchesSlot(slot: ArgSlot, kind: 'url' | 'domain' | 'title' | 'query'): boolean {
  if (slot === kind) return true
  if (slot === 'query' && (kind === 'domain' || kind === 'title')) return true
  if (slot === 'domain' && kind === 'url') return true
  return false
}

function buildArg(slot: ArgSlot, value: string): Record<string, unknown> {
  return { [slot]: value }
}

function looksLikeDomain(candidate: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(candidate)
}

// ──── 半成品 Plan 检测（主导入） ──────────────────────────────────────

const OBSERVE_TOOLS = new Set([
  'tabs_observe',
  'tabs_observe_groups',
  'tab_groups_query',
  'tab_groups_get',
  'bookmarks_observe_tree',
  'bookmarks_get',
  'bookmarks_get_children',
  'bookmarks_search',
  'history_search',
  'history_search_min',
  'history_get_visits',
  'sessions_observe',
  'sessions_get_devices',
  'windows_observe',
  'cookies_observe',
  'cookies_get',
  'cookies_get_all',
  'top_sites_observe',
  'extensions_observe',
  'permissions_observe',
  'theme_observe',
  'font_size_observe',
  'font_family_observe',
  'storage_get',
  'storage_area_get',
  'content_settings_get',
  'downloads_search',
  'notifications_get_all',
  'notifications_list',
  'browsing_data_settings',
  'get_cookies',
  'list_extensions',
  'list_groups',
  'get_top_sites',
  'get_site_permissions',
  'find_tab',
  'search_history',
  'view_history',
])

export interface HalfPlanResult {
  completed: boolean
  newPlan?: NonNullable<AIPlan['plan']>
  /** 调试日志 */
  diagnostics?: {
    matchedRule?: string
    segments?: string[]
    reason?: string
  }
}

/**
 * 主入口：检测半成品 plan 并补齐。
 *
 * @param parsed   AI 返回的 plan
 * @param userText 用户原始输入（多步拆分 + 参数抽取 fallback）
 * @param existingResults 第一轮 SW report.items 数组（用于 seededResults 优化；可选）
 */
export function detectHalfPlan(
  parsed: AIPlan,
  userText: string,
  existingResults?: readonly PlanItem[]
): HalfPlanResult {
  const items = parsed.plan ?? []

  // 早退：chat-only / empty plan / 已含 mutation → 不处理
  if (items.length === 0) return { completed: false, diagnostics: { reason: 'empty-plan' } }
  const hasObserve = items.some((it) => OBSERVE_TOOLS.has(it.tool))
  const hasMutation = items.some((it) => !OBSERVE_TOOLS.has(it.tool))
  if (!hasObserve || hasMutation) {
    return {
      completed: false,
      diagnostics: { reason: hasMutation ? 'has-mutation' : 'no-observe' },
    }
  }

  // 多步拆分
  const segments = userText ? extractStepsFromText(userText) : []
  if (segments.length === 0) {
    // 单段：用 userText 整体做一次匹配
    const single = matchIntentSegment(userText, items)
    if (!single) return { completed: false, diagnostics: { reason: 'no-segment-match' } }
    return buildAugmentedPlan(items, [single], existingResults)
  }
  if (segments.length === 1) {
    const single = matchIntentSegment(segments[0], items)
    if (!single) return { completed: false, diagnostics: { reason: 'single-segment-no-match' } }
    return buildAugmentedPlan(items, [single], existingResults)
  }

  // 多段：每段独立匹配；任一段失败 → fall through
  const matches = segments.map((s) => matchIntentSegment(s, items)).filter(Boolean) as Array<{
    rule: IntentRule
    args: Record<string, unknown> | undefined
  }>
  if (matches.length !== segments.length) {
    return { completed: false, diagnostics: { reason: 'multi-step-inconclusive', segments } }
  }
  return buildAugmentedPlan(items, matches, existingResults)
}

function isHistoryReadPhrase(segment: string): boolean {
  const hasHistoryMarker = /历史|浏览记录|今天|昨天|最近一周|最近一个月|访问过|浏览过|看过/i.test(segment)
  const hasReadMarker = /看看|查看|查询|查一下|找一下|列出|显示|show|view|search/i.test(segment)
  const hasExplicitNavigation = /打开|跳转|前往|navigate|go to/i.test(segment)
  return hasHistoryMarker && hasReadMarker && !hasExplicitNavigation
}

/** 把单段文本匹配到 verb 表的一条规则 + 抽出参数 */
function matchIntentSegment(
  segment: string,
  planItems: readonly PlanItem[]
): { rule: IntentRule; args: Record<string, unknown> | undefined } | null {
  if (!segment) return null
  for (const rule of INTENT_RULES) {
    // “看看我今天访问的页面”中的“访问”描述历史记录，不是导航动作。
    // 仅在存在明确的历史查询语境时屏蔽 navigate，保留“访问 github”这类导航表达。
    if (rule.intent === 'navigate' && isHistoryReadPhrase(segment)) continue
    for (const verb of rule.verbs) {
      // 简单子串匹配：verb 长度 > 1 强制边界；verb 单字符需 \b 包裹
      const escaped = verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = verb.length === 1 ? `\\b${escaped}\\b` : escaped
      const re = new RegExp(pattern, 'i')
      if (re.test(segment)) {
        // 立刻在本段文本上抽取参数（多步链每段独立抽取）
        const args = rule.argSlot ? extractArgs(rule.argSlot, planItems, segment) : undefined
        return { rule, args }
      }
    }
  }
  return null
}

// interface AugmentOptions {
//   /** 第一轮 SW report 收集的结果，作为 seededResults 来源 */
//   existingResults?: readonly PlanItem[]
// }

/**
 * 把 match 结果追加到原 plan 之后，构造 augmented plan。
 */
function buildAugmentedPlan(
  items: NonNullable<AIPlan['plan']>,
  matches: Array<{ rule: IntentRule; args: Record<string, unknown> | undefined }>,
  existingResults?: readonly PlanItem[]
): HalfPlanResult {
  if (matches.length === 0) {
    return { completed: false, diagnostics: { reason: 'no-matches' } }
  }

  const observeId = items[0].id
  const newItems: PlanItem[] = []
  let prevSynthId: string | null = null

  // 收集第一轮已执行的 observe 结果，用于 seededResults
  const seededMap: Record<string, unknown> = {}
  if (existingResults) {
    for (const r of existingResults) {
      seededMap[r.id] = r
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const { rule, args: providedArgs } = matches[i]
    const extractedArgs = providedArgs ?? extractArgs(rule.argSlot, items, '') ?? {}
    // 关键防御：拿不到必需参数 → 跳过这条（绝不猜）
    const command = getCommand(rule.intent)
    if (!command) {
      // intent 不在 COMMANDS 注册表 → 静默跳过
      continue
    }
    const requiredSlots = Object.entries(command.slots)
      .filter(([, def]) => !def.optional)
      .map(([key]) => key)
    if (rule.argSlot && requiredSlots.includes(rule.argSlot)) {
      if (!extractedArgs[rule.argSlot]) {
        // 必需槽位为空 → 跳过该 mutation（不强行合成）
        continue
      }
    }

    const synthId = `${rule.id}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`
    // deps：首个合成 mutation 依赖 observeId；后续依赖上一个合成 mutation；standalone 不依赖
    const deps: string[] = []
    if (rule.standalone) {
      // standalone 步骤可与前面的 mutation 并行
      deps.push(observeId)
    } else if (prevSynthId) {
      deps.push(prevSynthId)
    } else {
      deps.push(observeId)
    }

    const newItem: PlanItem = {
      id: synthId,
      tool: rule.intent,
      args: { ...extractedArgs },
      deps,
      mergedFrom: ['half-plan'],
      ...(Object.keys(seededMap).length > 0 ? { seededResults: seededMap } : {}),
    }
    newItems.push(newItem)
    prevSynthId = synthId
  }

  if (newItems.length === 0) {
    return { completed: false, diagnostics: { reason: 'all-extractions-empty' } }
  }

  const newPlan: NonNullable<AIPlan['plan']> = [...items, ...newItems]
  return {
    completed: true,
    newPlan,
    diagnostics: {
      matchedRule: matches[0].rule.id,
    },
  }
}
