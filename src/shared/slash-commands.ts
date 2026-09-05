/**
 * 斜杠命令注册表 + 本地匹配
 * 当 AI 不可用时，用户用精确命令直接操作插件。
 * 所有命令以 / 开头，支持别名和前缀模糊匹配。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 红线豁免 / 测试驱动 baseline（不动 SLASH_COMMANDS 注册表的已有条目）：
 *   - /storage-get → intent: 'storage_get'    （tests/slash-commands.spec.ts:5-13）
 *   - /downloads   → intent: 'open_downloads' （tests/slash-commands.spec.ts:16-18）
 *   - /reload      → intent: 'reload_tab'     （tests/slash-commands.spec.ts:20-23）
 * 上述三处 baseline 改动把原 swIntent 名直接作为 intent 暴露给 ai plan 路径，
 * 避免 aiHidden=true 的命令在 system-prompt 工具清单里重复出现导致 AI 选错。
 * 后续如需再加条目，请保持「纯追加」语义，不要改动既有 registration 的
 * slash/intent/aliases/hasArg/placeholder。
 * ─────────────────────────────────────────────────────────────────────
 */

import type { SlashCommand } from '../types'

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    slash: 'close-duplicates',
    intent: 'close_duplicate_tabs',
    description: '关闭所有重复标签页（保留每组第一个）',
    aliases: ['cd', 'dedup', '去重'],
  },
  {
    slash: 'find',
    intent: 'find_tab',
    description: '按关键词查找标签页（匹配 title / URL）',
    aliases: ['f', 'search', '搜索'],
    hasArg: true,
    placeholder: '关键词',
  },
  {
    slash: 'close-url',
    intent: 'close_tabs_by_url',
    description: '按 URL 子串或关键词模糊匹配并关闭标签（支持勾选）',
    aliases: ['cu'],
    hasArg: true,
    placeholder: 'URL 子串或关键词',
  },
  {
    slash: 'close-domain',
    intent: 'close_tabs_by_domain',
    description: '关闭当前窗口指定域名下的所有标签页（危险，会二次确认）',
    aliases: ['cdm', '关域名'],
    hasArg: true,
    placeholder: '域名（如 baidu.com）',
  },
  {
    slash: 'bookmark',
    intent: 'add_bookmark',
    description:
      '添加书签。无参=当前页；https://xxx=指定URL；标题+URL 用空格分隔；github.com 自动补 https://',
    aliases: ['bm', '收藏'],
    hasArg: true,
    placeholder: '标题 | https://URL | github.com',
  },
  {
    slash: 'reopen',
    intent: 'reopen_closed_tab',
    description: '恢复最近关闭的标签（可带关键词匹配 title/URL）',
    aliases: ['undo', '恢复'],
    hasArg: true,
    placeholder: '关键词(可选)',
  },
  {
    slash: 'sort',
    intent: 'sort_tabs',
    description: '排序当前窗口标签。无参=按域名字母升序；title=按标题',
    aliases: ['s'],
    hasArg: true,
    placeholder: 'title | domain',
  },
  {
    slash: 'history',
    intent: 'search_history',
    description: '浏览历史。无参=展示今天全部；带关键词=按关键词过滤',
    aliases: ['hi'],
    hasArg: true,
    placeholder: '关键词(可选)',
  },
  {
    slash: 'pin',
    intent: 'pin_tab',
    description: '固定/取消固定当前标签（重复调用切换）',
    aliases: ['固定', 'p'],
  },
  {
    slash: 'duplicate',
    intent: 'duplicate_tab',
    description: '复制当前标签页（保留 URL/标题，插入到右侧）',
    aliases: ['dup', '复制'],
  },
  {
    slash: 'remove-bookmark',
    intent: 'remove_bookmark',
    description: '删除匹配的书签（按标题/URL 关键词）',
    aliases: ['rb', '删书签'],
    hasArg: true,
    placeholder: '关键词',
  },
  {
    slash: 'screenshot',
    intent: 'screenshot',
    description: '截取当前活动标签的可见区域（关键词过滤可选）',
    aliases: ['shot', '截图'],
    hasArg: true,
    placeholder: '标签关键词(可选)',
  },
  {
    slash: 'new-window',
    intent: 'new_window',
    description: '在新窗口打开 URL（无参=空白新窗口）',
    aliases: ['nw', '新窗口'],
    hasArg: true,
    placeholder: 'https://URL(可选)',
  },
  {
    slash: 'list-groups',
    intent: 'list_groups',
    description: '列出当前窗口所有标签分组',
    aliases: ['lg', '分组列表'],
  },
  {
    slash: 'ungroup-all',
    intent: 'ungroup_all',
    description: '一键取消所有标签分组（标签本身保留）',
    aliases: ['uga', '解组所有', '取消分组'],
  },
  {
    slash: 'group-domain',
    intent: 'group_by_domain',
    description: '按域名自动分组（同域名标签归到一组，不含 pinned）',
    aliases: ['gbd', '域名分组', '分组域名'],
  },
  {
    slash: 'clear-history',
    intent: 'delete_history',
    description: '删除浏览历史记录（按时间范围）',
    aliases: ['ch', '清历史'],
    hasArg: true,
    placeholder: 'today | week | month | all',
  },
  {
    slash: 'cookies',
    intent: 'get_cookies',
    description: '查看 Cookie。无参=当前页域名；带域名=指定域名（表格展示）',
    aliases: ['ck', 'Cookie'],
    hasArg: true,
    placeholder: '域名(可选)',
  },
  {
    slash: 'clear-cookies',
    intent: 'clear_cookies',
    description: '清除 Cookie。无参=当前页域名；带域名=指定域名（危险，会二次确认）',
    aliases: ['清Cookie'],
    hasArg: true,
    placeholder: '域名(可选)',
  },
  {
    slash: 'top-sites',
    intent: 'get_top_sites',
    description: '查看最常访问的网站（浏览器历史 top sites）',
    aliases: ['ts', '常用网站'],
  },
  {
    slash: 'extensions',
    intent: 'list_extensions',
    description: '查看所有已安装扩展（可带关键词过滤）',
    aliases: ['ext', '扩展'],
    hasArg: true,
    placeholder: '关键词(可选)',
  },
  {
    slash: 'enable-extension',
    intent: 'enable_extension',
    description: '启用指定扩展（按名称或 ID）',
    aliases: ['ee', '启用扩展'],
    hasArg: true,
    placeholder: '扩展名称或ID',
  },
  {
    slash: 'disable-extension',
    intent: 'disable_extension',
    description: '禁用指定扩展（按名称或 ID）',
    aliases: ['de', '禁用扩展'],
    hasArg: true,
    placeholder: '扩展名称或ID',
  },
  {
    slash: 'uninstall-extension',
    intent: 'uninstall_extension',
    description: '卸载指定扩展（危险，会二次确认）',
    aliases: ['ue', '卸载扩展'],
    hasArg: true,
    placeholder: '扩展名称或ID',
  },
  {
    slash: 'site-perms',
    intent: 'get_site_permissions',
    description: '查看网站权限设置（弹窗/通知/JS 等）。无参=当前页域名',
    aliases: ['sp', '网站权限'],
    hasArg: true,
    placeholder: '域名(可选)',
  },
  {
    slash: 'set-site-perm',
    intent: 'set_site_permission',
    description: '设置网站权限。例：/set-site-perm github.com popups block',
    aliases: ['ssp', '设权限'],
    hasArg: true,
    placeholder: '域名 权限类型 allow|block|default',
  },
  {
    slash: 'storage-get',
    intent: 'storage_get',
    description: '读取扩展本地存储。无参=列出 local 全部；带 key=单值（表格展示）',
    aliases: ['sg', '读存储'],
    hasArg: true,
    placeholder: 'key(可选)',
  },
  {
    slash: 'reload',
    intent: 'reload_tab',
    description: '刷新当前标签或当前窗口全部标签（带参数 all=刷新全部）',
    aliases: ['r', '刷新'],
    hasArg: true,
    placeholder: 'all(可选)',
  },
  {
    slash: 'downloads',
    intent: 'open_downloads',
    description: '打开 Chrome 下载管理页面（chrome://downloads）',
    aliases: ['dl', '下载'],
  },
  {
    slash: 'storage-set',
    intent: 'storage_set',
    description: '写入扩展本地存储。例：/storage-set myKey myValue',
    aliases: ['ss', '写存储'],
    hasArg: true,
    placeholder: 'key value',
  },
  {
    slash: 'storage-remove',
    intent: 'storage_remove',
    description: '删除扩展本地存储键值',
    aliases: ['srm', '删存储'],
    hasArg: true,
    placeholder: 'key',
  },
  {
    slash: 'record-screen',
    intent: 'record_screen',
    description: '录制屏幕/窗口/标签页画面（含系统音频）',
    aliases: ['rs', '录屏'],
  },
  {
    slash: 'stop-recording',
    intent: 'stop_recording',
    description: '停止录制并保存视频',
    aliases: ['sr', '停录'],
  },
  {
    slash: 'help',
    intent: 'show_help',
    description: '显示所有可用命令（markdown 表格）',
    aliases: ['h', '?', '帮助'],
  },
  {
    slash: 'clear-chat',
    intent: 'clear_chat',
    description: '清空所有聊天记录',
    aliases: ['清空'],
  },
  {
    slash: 'reset',
    intent: 'reset_context',
    description: '清除全部上下文并重新开始对话',
    aliases: ['重置'],
  },
] as const

interface SlashMatchResult {
  intent: string
  slots: Record<string, unknown>
  cmd: SlashCommand
  error?: string
  hint?: string
}

interface SlashError {
  error: string
  raw: string
}

/**
 * 解析斜杠命令输入
 * @param input - 用户输入
 * @returns 匹配结果或错误信息
 */
export function matchSlashCommand(input: string): SlashMatchResult | SlashError | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null

  const parts = trimmed.slice(1).split(/\s+/)
  const cmdName = parts[0].toLowerCase()
  if (!cmdName) return { error: 'UNKNOWN_SLASH', raw: trimmed }
  const args = parts.slice(1).join(' ')

  // 1. 精确匹配
  let cmd: SlashCommand | undefined = SLASH_COMMANDS.find((c) => c.slash.toLowerCase() === cmdName)
  // 2. 别名匹配（统一大小写，兼容 /Cookie 等历史输入）
  if (!cmd)
    cmd = SLASH_COMMANDS.find((c) => c.aliases?.some((alias) => alias.toLowerCase() === cmdName))
  // 3. 前缀模糊匹配
  if (!cmd)
    cmd = SLASH_COMMANDS.find(
      (c) =>
        c.slash.toLowerCase().startsWith(cmdName) ||
        c.aliases?.some((a) => a.toLowerCase().startsWith(cmdName))
    )

  if (!cmd) return { error: 'UNKNOWN_SLASH', raw: trimmed }

  // help 命令特殊处理：直接返回所有命令列表
  if (cmd.intent === 'show_help') {
    return { intent: 'show_help', slots: { commands: SLASH_COMMANDS }, cmd }
  }

  // 构建参数 slots
  const slots: Record<string, unknown> = {}
  // 不论 hasArg 与否，args 非空就解析 slots；hasArg 仅控制"MISSING_ARG"提示，
  // 不应阻断参数写入。search_history / sort_tabs 这类"参数可选"命令就是这种用法。
  //
  // /history /cookies /site-perms /clear-cookies 这类"无参=默认"命令，由 buildSlots
  // 在 args 为空时显式写入哨兵或默认值（timeRange='today' / domain=CURRENT_TAB_DOMAIN），
  // 不依赖 SW 端隐式分支——这样 SW handler 看到的 payload 字段始终非空，AI plan 路径
  // 也不会因为"未传"而出错。
  if (args.trim()) {
    buildSlots(cmd.intent, args, slots)
  } else {
    applyDefaults(cmd.intent, slots)
  }

  return { intent: cmd.intent, slots, cmd }
}

/**
 * 为"无参=默认"命令写入显式默认值 / 哨兵值。
 *
 * 哨兵字符串 CURRENT_TAB_DOMAIN 由 SW 端识别后走"取当前活动标签 hostname"分支；
 * 不让 SW 端用"参数 undefined ⇒ 走默认"这种隐式行为。
 */
function applyDefaults(intent: string, slots: Record<string, unknown>): void {
  const CURRENT_TAB_DOMAIN = '__current__'
  switch (intent) {
    case 'search_history':
    case 'search_history_min':
      // /history 无参：展示今天全部
      slots.timeRange = 'today'
      break
    case 'delete_history':
      // /clear-history 无参：清空今天（与历史默认值一致）
      slots.timeRange = 'today'
      break
    case 'get_cookies':
    case 'clear_cookies':
    case 'get_site_permissions':
      // /cookies /clear-cookies /site-perms 无参：取当前页域名
      slots.domain = CURRENT_TAB_DOMAIN
      break
  }
}

function buildSlots(intent: string, args: string, slots: Record<string, unknown>): void {
  // 单 token 像域名（含 . 且至少有一段字母数字）：自动补 https:// 作为 url
  // 例：github.com / www.example.cn / intranet.local
  function looksLikeDomain(s: string): boolean {
    if (!s || /\s/.test(s)) return false
    if (!s.includes('.')) return false
    // 不含协议前缀；末尾不是 .；首尾是字母数字或连字符
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(s)
  }
  /**
   * "无参默认当前页"哨兵值。
   *
   * cookies / clear-cookies / site-perms 这类命令无参时本应默认取当前活动标签的域名，
   * 直接留空字段会让 SW 端走隐式分支（行为可读性差，也容易在 AI plan 路径上被误传）。
   * 这里显式写一个不会与真实域名冲突的哨兵字符串，SW 端识别后走"取当前 active tab"分支。
   */
  const CURRENT_TAB_DOMAIN = '__current__'
  switch (intent) {
    case 'add_bookmark': {
      // 不传参数 = 当前页面（url 留空，SW 端取当前活动标签）
      // 传 https://xxx = 把指定 URL 加入书签
      // 传 "标题 URL" = 标题在前、URL 在后（第一个空格分隔）
      // 单 token 且像域名（如 github.com / www.example.cn）→ 当 url，自动补 https://
      const argsText = args.trim()
      if (!argsText) {
        // 不传参数：不设置 url，让 SW 端走"当前页"分支
        break
      }
      if (/^https?:\/\//i.test(argsText)) {
        ;(slots as Record<string, string>).url = argsText
      } else if (argsText.includes(' ')) {
        // "标题 URL" 形式：前半为 title、后半为 url
        const idx = argsText.indexOf(' ')
        ;(slots as Record<string, string>).title = argsText.slice(0, idx).trim()
        ;(slots as Record<string, string>).url = argsText.slice(idx + 1).trim()
      } else if (looksLikeDomain(argsText)) {
        // 单 token 且像域名（github.com / www.example.cn）
        ;(slots as Record<string, string>).url = `https://${argsText}`
      } else {
        // 只有一个非 URL / 非域名 token：当作 title（url 留空走当前页）
        ;(slots as Record<string, string>).title = argsText
      }
      break
    }
    case 'find_tab':
    case 'search_history':
    case 'close_tabs_by_url':
      // /find /history 参数可选：不传走默认（find=全部 / history=今天），传值按关键词过滤
      // /close-url 需要 query 参数
      if (args.trim()) (slots as Record<string, string>).query = args
      break
    case 'close_tabs_by_domain':
      // /close-domain 参数格式：domain（必填）
      if (args.trim()) (slots as Record<string, string>).domain = args.trim()
      break
    case 'reopen_closed_tab':
    case 'remove_bookmark':
    case 'enable_extension':
    case 'disable_extension':
    case 'uninstall_extension':
    case 'list_extensions':
      // 这几个命令 args 透传到 query；找不到匹配走 INVALID_PARAMS
      if (args.trim()) (slots as Record<string, string>).query = args
      break
    case 'get_cookies':
    case 'clear_cookies':
    case 'get_site_permissions':
      // domain 可选；无参时显式写 CURRENT_TAB_DOMAIN 哨兵，SW 端识别后取当前活动标签的 hostname
      if (args.trim()) (slots as Record<string, string>).domain = args.trim()
      else (slots as Record<string, string>).domain = CURRENT_TAB_DOMAIN
      break
    case 'storage_remove':
      // /storage-remove 的参数是 key
      if (args.trim()) (slots as Record<string, string>).key = args.trim()
      break
    case 'storage_get':
      // /storage-get 参数格式：key（可选）
      // 无参 = 列出 local 全部（handler 默认 area=local）
      // 仅 key = 读取指定 key（handler 默认 area=local）
      // area key = 兼容旧语法：第一个 token 是 area 名称
      if (args.trim()) {
        const parts = args.trim().split(/\s+/)
        if (['local', 'session', 'sync', 'managed'].includes(parts[0]) && parts[1]) {
          ;(slots as Record<string, string>).area = parts[0]
          ;(slots as Record<string, string>).key = parts[1]
        } else {
          // 单 token 当 key，area 留给 handler 默认
          ;(slots as Record<string, string>).key = parts[0]
        }
      }
      break
    case 'storage_area_get':
      // /storage-area-get 旧语义保留：必须传 area
      if (args.trim()) {
        const parts = args.trim().split(/\s+/)
        if (['local', 'session', 'sync', 'managed'].includes(parts[0])) {
          ;(slots as Record<string, string>).area = parts[0]
          if (parts[1]) (slots as Record<string, string>).key = parts[1]
        }
      }
      break
    case 'search_history_min':
      // 内部命令：从 history_search 透传 timeRange
      ;(slots as Record<string, string>).timeRange = 'today'
      break
    case 'reload_tab':
      if (args.trim()) (slots as Record<string, boolean>).all = args.trim().toLowerCase() === 'all'
      break
    case 'sort_tabs':
      ;(slots as Record<string, string>).order = args
      break
    case 'screenshot':
      if (args.trim()) (slots as Record<string, string>).query = args.trim()
      break
    case 'new_window':
      if (args) {
        const url = args.trim()
        if (!url.startsWith('http://') && !url.startsWith('https://')) return
        if (url.startsWith('chrome://')) return
        ;(slots as Record<string, string>).url = url
      }
      break
    case 'set_site_permission': {
      // 域名 权限类型 allow|block|default
      if (!args.trim()) return
      const permParts = args.split(/\s+/)
      ;(slots as Record<string, string>).domain = permParts[0] || ''
      ;(slots as Record<string, string>).setting = permParts[1] || ''
      ;(slots as Record<string, string>).value = permParts[2] || 'allow'
      break
    }
    case 'storage_set': {
      if (!args.trim()) return
      const idx = args.indexOf(' ')
      if (idx > 0) {
        ;(slots as Record<string, string>).key = args.slice(0, idx)
        ;(slots as Record<string, string>).value = args.slice(idx + 1)
      } else {
        ;(slots as Record<string, string>).key = args
        ;(slots as Record<string, string>).value = ''
      }
      break
    }
  }
}
