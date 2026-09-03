/**
 * 工具策略与运行时参数校验。
 * 统一定义特权工具的风险元数据，避免单步执行和 plan 执行维护两套规则。
 */

import { COMMANDS } from './commands'

export type ToolRisk = 'L0' | 'L1' | 'L2'
export type ToolContext = 'service-worker' | 'extension-page' | 'content-script'

/** 调用方上下文，用于在特权入口执行统一授权检查。 */
export interface ToolCallContext {
  source?: ToolContext
  sender?: { tab?: { id?: number; active?: boolean; url?: string } }
}

export interface ToolPolicy {
  name: string
  requiredPermissions: string[]
  allowedContexts: ToolContext[]
  risk: ToolRisk
  requiresUserConfirmation: boolean
  hostAccess: 'none' | 'activeTab' | 'declared-host'
  sensitiveOutput: boolean
}

export interface ValidationError {
  code: 'INVALID_PARAMS'
  message: string
  suggestion?: string
}

/** 检查工具策略是否引用了声明的 Manifest 权限。 */
export function findPolicyPermissionIssues(manifestPermissions: string[]): string[] {
  const declared = new Set(manifestPermissions)
  return getCanonicalToolsArray().flatMap((tool) =>
    (getToolPolicy(tool)?.requiredPermissions ?? [])
      .filter((permission) => !declared.has(permission))
      .map((permission) => `${tool}: 缺少 Manifest 权限 ${permission}`)
  )
}

/** 返回当前命令表中的公开 canonical 工具。 */
function getCanonicalToolsArray(): string[] {
  return COMMANDS.filter((item) => !item.aiHidden && item.swIntent).map((item) => item.swIntent!)
}

const NUMBER_FIELDS = new Set([
  'tabId',
  'groupId',
  'windowId',
  'index',
  'maxResults',
  'limit',
  'since',
])
const BOOLEAN_FIELDS = new Set([
  'active',
  'currentWindow',
  'pinned',
  'muted',
  'discarded',
  'reload',
  'all',
  'collapsed',
  'incognito',
  'saveAs',
  'allowDuplicate',
])
const STRING_FIELDS = new Set([
  'url',
  'query',
  'domain',
  'title',
  'color',
  'nodeId',
  'sessionId',
  'filename',
  'key',
  'value',
  'order',
])

const RISKY_NAMES = new Set([
  'tabs_remove',
  'tabs_remove_by_url',
  'bookmarks_remove_node',
  'history_remove',
  'history_delete_url',
  'history_delete_range',
  'history_delete_all',
  'cookies_remove',
  'extensions_remove',
  'downloads_cancel',
  'downloads_erase',
  'downloads_remove_file',
  'browsing_data_remove',
  'notifications_clear',
  'storage_area_remove',
  'storage_area_set',
  'storage_area_remove',
  'storage_area_clear',
  'content_settings_set',
  'content_settings_clear',
])
const SENSITIVE_NAMES = new Set([
  'cookies_observe',
  'cookies_get',
  'cookies_get_all',
  'storage_get',
  'storage_area_get',
])

const PERMISSION_BY_TOOL_PREFIX: Array<[string, string]> = [
  ['bookmarks_', 'bookmarks'],
  ['history_', 'history'],
  ['sessions_', 'sessions'],
  ['downloads_', 'downloads'],
  ['browsing_data_', 'browsingData'],
  ['cookies_', 'cookies'],
  ['notifications_', 'notifications'],
  ['top_sites_', 'topSites'],
  ['extensions_', 'management'],
  ['content_settings_', 'contentSettings'],
  ['permissions_', 'contentSettings'],
  ['storage_', 'storage'],
  ['tabs_', 'tabs'],
  ['tab_groups_', 'tabGroups'],
  ['windows_', 'tabs'],
]

/** 根据工具名推导其所需 Manifest 权限。 */
function getRequiredPermissions(name: string): string[] {
  if (name === 'bookmarks_open_node' || name === 'bookmarks_add_current_page') {
    return ['bookmarks', 'tabs']
  }
  const permission = PERMISSION_BY_TOOL_PREFIX.find(([prefix]) => name.startsWith(prefix))?.[1]
  if (permission) return [permission]
  if (name === 'navigate' || name === 'screenshot' || name === 'zoom') return ['tabs']
  return []
}

/** 根据 canonical 工具名生成稳定策略。 */
export function getToolPolicy(name: string): ToolPolicy | undefined {
  // 查找命令契约：优先匹配 intent（slash 命令），fallback 到 swIntent（canonical 命令）
  const command =
    COMMANDS.find((item) => item.intent === name) ??
    COMMANDS.find((item) => item.swIntent === name && !item.aiHidden) ??
    COMMANDS.find((item) => item.swIntent === name)
  if (!command) return undefined
  const risky = command.dangerous || RISKY_NAMES.has(name)
  return {
    name,
    requiredPermissions: getRequiredPermissions(name),
    allowedContexts: ['service-worker', 'extension-page'],
    risk: risky ? 'L2' : SENSITIVE_NAMES.has(name) ? 'L1' : 'L0',
    requiresUserConfirmation: risky,
    hostAccess:
      name.startsWith('cookies_') ||
      name.startsWith('content_settings_') ||
      name.startsWith('permissions_') ||
      name.startsWith('storage_')
        ? 'declared-host'
        : SENSITIVE_NAMES.has(name)
          ? 'declared-host'
          : 'none',
    sensitiveOutput: SENSITIVE_NAMES.has(name),
  }
}

/** 返回所有已声明的 canonical 工具名。 */
export function getCanonicalTools(): Set<string> {
  return new Set(
    COMMANDS.filter((item) => !item.aiHidden && item.swIntent).map((item) => item.swIntent!)
  )
}

/** 对工具参数执行保守的运行时校验；非法值不会被静默转换。 */
export function validateToolArgs(tool: string, args: unknown): ValidationError | undefined {
  if (!isPlainObject(args)) return { code: 'INVALID_PARAMS', message: '工具参数必须是对象' }
  // 查找命令契约：优先匹配 intent（slash 命令用自己的 slots），fallback 到 swIntent（canonical 命令）
  // aiHidden 命令（如 enable_extension / disable_extension / uninstall_extension）的 intent 是 slash 别名，
  // 找到后 fallback 到 swIntent 的 slots（因为 precompute 后参数会变成 id/enabled 等）
  let command =
    COMMANDS.find((item) => item.intent === tool) ??
    COMMANDS.find((item) => item.swIntent === tool && !item.aiHidden) ??
    COMMANDS.find((item) => item.swIntent === tool)
  if (!command) return { code: 'INVALID_PARAMS', message: `工具未声明参数契约: ${tool}` }

  // aiHidden slash 命令用 query 作为入参，precompute 后会输出 id/enabled 等 swIntent 字段；
  // 这里强制使用 swIntent 对应的 slots 做校验，避免 aiHidden 命令的 query 字段被识别为"不支持参数"。
  const useSwIntentSlots = command.intent === tool && command.aiHidden && command.swIntent
  if (useSwIntentSlots) {
    const swCommand = COMMANDS.find((c) => c.swIntent === command!.swIntent)
    if (swCommand) command = swCommand
  }

  const slots = command.slots
  for (const [name, value] of Object.entries(args)) {
    if (
      name === 'force' ||
      name === 'confirmationToken' ||
      name === '__preConfirmed' ||
      name === 'selectedNames' ||
      name === 'selectedIds' ||
      name === 'query' // precompute 后 slots 里残留的 query 字段（aiHidden slash 命令）
    )
      continue
    const slot = slots[name]
    if (!slot) return { code: 'INVALID_PARAMS', message: `不支持参数: ${name}` }
    if (value === undefined || value === null)
      return { code: 'INVALID_PARAMS', message: `${name} 不能为空` }
    const expected = slot.type
    // 数组类型（number[] / string[]）单独处理
    if (expected.includes('[]') || expected === 'array') {
      if (!Array.isArray(value)) return { code: 'INVALID_PARAMS', message: `${name} 必须是数组` }
      continue
    }
    if (expected.includes('number') && (typeof value !== 'number' || !Number.isFinite(value))) {
      return { code: 'INVALID_PARAMS', message: `${name} 必须是 number` }
    }
    if (expected === 'boolean' && typeof value !== 'boolean') {
      return { code: 'INVALID_PARAMS', message: `${name} 必须是 boolean` }
    }
    if (expected === 'string' && typeof value !== 'string') {
      return { code: 'INVALID_PARAMS', message: `${name} 必须是 string` }
    }
  }
  for (const [name, slot] of Object.entries(slots)) {
    if (!slot.optional && !(name in args))
      return { code: 'INVALID_PARAMS', message: `缺少必填参数: ${name}` }
  }
  for (const [name, value] of Object.entries(args)) {
    if (
      NUMBER_FIELDS.has(name) &&
      (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    ) {
      return { code: 'INVALID_PARAMS', message: `${name} 必须是非负整数` }
    }
    if (BOOLEAN_FIELDS.has(name) && typeof value !== 'boolean')
      return { code: 'INVALID_PARAMS', message: `${name} 必须是 boolean` }
    if (STRING_FIELDS.has(name) && typeof value !== 'string')
      return { code: 'INVALID_PARAMS', message: `${name} 必须是 string` }
  }
  if (typeof args.url === 'string' && !isAllowedUrl(args.url)) {
    return { code: 'INVALID_PARAMS', message: 'url 必须是合法的 http/https URL' }
  }
  return undefined
}

/** 判断 URL 是否为可交给浏览器导航 API 的安全网页地址。 */
function isAllowedUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** 判断值是否为普通对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
