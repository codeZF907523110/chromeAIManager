/**
 * 斜杠命令注册表 + 本地匹配
 * 当 AI 不可用时，用户用精确命令直接操作插件。
 * 所有命令以 / 开头，支持别名和前缀模糊匹配。
 */

import type { SlashCommand } from '../types'

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    slash: 'close-duplicates',
    intent: 'close_duplicate_tabs',
    aliases: ['cd', 'dedup', '去重'],
  },
  {
    slash: 'find',
    intent: 'find_tab',
    aliases: ['f', 'search', '搜索'],
    hasArg: true,
  },
  {
    slash: 'close-url',
    intent: 'close_tabs_by_url',
    aliases: ['cu'],
    hasArg: true,
  },
  {
    slash: 'bookmark',
    intent: 'add_bookmark',
    aliases: ['bm', '收藏'],
    hasArg: true,
  },
  {
    slash: 'reopen',
    intent: 'reopen_closed_tab',
    aliases: ['undo', '恢复'],
    hasArg: true,
  },
  {
    slash: 'sort',
    intent: 'sort_tabs',
    aliases: ['s'],
    hasArg: true,
  },
  {
    slash: 'history',
    intent: 'search_history',
    aliases: ['hi'],
    hasArg: true,
  },
  {
    slash: 'pin',
    intent: 'pin_tab',
    aliases: ['固定', 'p'],
  },
  {
    slash: 'unpin',
    intent: 'unpin_tab',
    aliases: ['取消固定', 'up'],
  },
  {
    slash: 'duplicate',
    intent: 'duplicate_tab',
    aliases: ['dup', '复制'],
  },
  {
    slash: 'remove-bookmark',
    intent: 'remove_bookmark',
    aliases: ['rb', '删书签'],
    hasArg: true,
  },
  {
    slash: 'screenshot',
    intent: 'screenshot',
    aliases: ['shot', '截图'],
    hasArg: true,
  },
  {
    slash: 'new-window',
    intent: 'new_window',
    aliases: ['nw', '新窗口'],
    hasArg: true,
  },
  {
    slash: 'list-groups',
    intent: 'list_groups',
    aliases: ['lg', '分组列表'],
  },
  {
    slash: 'ungroup-all',
    intent: 'ungroup_all',
    aliases: ['uga', '解组所有', '取消分组'],
  },
  {
    slash: 'group-domain',
    intent: 'group_by_domain',
    aliases: ['gbd', '域名分组', '分组域名'],
  },
  {
    slash: 'clear-history',
    intent: 'delete_history',
    aliases: ['ch', '清历史'],
    hasArg: true,
  },
  {
    slash: 'cookies',
    intent: 'get_cookies',
    aliases: ['ck', 'Cookie'],
    hasArg: true,
  },
  {
    slash: 'clear-cookies',
    intent: 'clear_cookies',
    aliases: ['清Cookie'],
    hasArg: true,
  },
  {
    slash: 'top-sites',
    intent: 'get_top_sites',
    aliases: ['ts', '常用网站'],
  },
  {
    slash: 'extensions',
    intent: 'list_extensions',
    aliases: ['ext', '扩展'],
    hasArg: true,
  },
  {
    slash: 'enable-extension',
    intent: 'enable_extension',
    aliases: ['ee', '启用扩展'],
    hasArg: true,
  },
  {
    slash: 'disable-extension',
    intent: 'disable_extension',
    aliases: ['de', '禁用扩展'],
    hasArg: true,
  },
  {
    slash: 'uninstall-extension',
    intent: 'uninstall_extension',
    aliases: ['ue', '卸载扩展'],
    hasArg: true,
  },
  {
    slash: 'site-perms',
    intent: 'get_site_permissions',
    aliases: ['sp', '网站权限'],
    hasArg: true,
  },
  {
    slash: 'set-site-perm',
    intent: 'set_site_permission',
    aliases: ['ssp', '设权限'],
    hasArg: true,
  },
  {
    slash: 'storage-get',
    intent: 'storage_get',
    aliases: ['sg', '读存储'],
    hasArg: true,
  },
  {
    slash: 'storage-set',
    intent: 'storage_set',
    aliases: ['ss', '写存储'],
    hasArg: true,
  },
  {
    slash: 'storage-remove',
    intent: 'storage_remove',
    aliases: ['srm', '删存储'],
    hasArg: true,
  },
  {
    slash: 'record-screen',
    intent: 'record_screen',
    aliases: ['rs', '录屏'],
  },
  {
    slash: 'stop-recording',
    intent: 'stop_recording',
    aliases: ['sr', '停录'],
  },
  {
    slash: 'help',
    intent: 'show_help',
    aliases: ['h', '?', '帮助'],
  },
  {
    slash: 'clear-chat',
    intent: 'clear_chat',
    aliases: ['清空'],
  },
  {
    slash: 'reset',
    intent: 'reset_context',
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
  const args = parts.slice(1).join(' ')

  // 1. 精确匹配
  let cmd: SlashCommand | undefined = SLASH_COMMANDS.find((c) => c.slash === cmdName)
  // 2. 别名匹配
  if (!cmd) cmd = SLASH_COMMANDS.find((c) => c.aliases?.includes(cmdName))
  // 3. 前缀模糊匹配
  if (!cmd)
    cmd = SLASH_COMMANDS.find(
      (c) => c.slash.startsWith(cmdName) || c.aliases?.some((a) => a.startsWith(cmdName))
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
  if (args.trim()) {
    buildSlots(cmd.intent, args, slots)
  }

  return { intent: cmd.intent, slots, cmd }
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
      // /find /history 参数可选：不传走默认（find=全部 / history=今天），传值按关键词过滤
      if (args.trim()) (slots as Record<string, string>).query = args
      break
    case 'close_tabs_by_url':
      // /close-url 必须带关键词；透传到 query，供预览/SW 端做 title+url 模糊匹配
      if (args.trim()) (slots as Record<string, string>).query = args
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
      // 这几个命令 domain 可选；为空时由 SW 端取当前页面域名
      if (args.trim()) (slots as Record<string, string>).domain = args
      break
    case 'storage_get':
      // /storage-get 无 key 时返回全量
      if (args.trim()) (slots as Record<string, string>).key = args
      break
    case 'storage_remove':
      // /storage-remove 必须带 key
      if (!args.trim()) return
      ;(slots as Record<string, string>).key = args
      break
    case 'delete_history': {
      // /clear-history <时间范围> [关键词]：首 token 是 timeRange，剩余是可选 query
      // 校验 timeRange 合法性——非法值不填 slot，避免 SW 端 range 匹配失败导致 startTime=0 误删全部历史
      const parts = args.trim().split(/\s+/)
      const timeRange = parts[0]
      const validRanges = ['today', 'yesterday', 'week', 'month', 'all']
      if (!validRanges.includes(timeRange)) return
      ;(slots as Record<string, string>).timeRange = timeRange
      if (parts.length > 1) {
        ;(slots as Record<string, string>).query = parts.slice(1).join(' ')
      }
      break
    }
    case 'sort_tabs':
      ;(slots as Record<string, string>).order = args
      break
    case 'screenshot': {
      // /screenshot [full|area|visible] 或中文 整页/选区/可视，无参数默认可视区域
      const modeArg = args.trim().toLowerCase()
      const modeMap: Record<string, string> = {
        full: 'full',
        整页: 'full',
        全页: 'full',
        area: 'area',
        选区: 'area',
        选择: 'area',
        visible: 'visible',
        可视: 'visible',
        可见: 'visible',
      }
      if (modeArg && modeMap[modeArg]) {
        ;(slots as Record<string, string>).mode = modeMap[modeArg]
      }
      break
    }
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
