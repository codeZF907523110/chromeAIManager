/**
 * 斜杠命令注册表 + 本地匹配
 * 当 AI 不可用时，用户用精确命令直接操作插件。
 * 所有命令以 / 开头，支持别名和前缀模糊匹配。
 */

import type { SlashCommand } from '../../types'

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    slash: 'close-duplicates',
    intent: 'close_duplicate_tabs',
    description: '关闭所有重复标签页',
    aliases: ['cd', 'dedup', '去重'],
  },
  {
    slash: 'find',
    intent: 'find_tab',
    description: '查找标签页',
    aliases: ['f', 'search', '搜索'],
    hasArg: true,
    placeholder: '关键词',
  },
  {
    slash: 'close-domain',
    intent: 'close_tabs_by_domain',
    description: '关闭指定域名的所有标签',
    aliases: ['cdd'],
    hasArg: true,
    placeholder: '域名 (如 github.com)',
  },
  {
    slash: 'bookmark',
    intent: 'add_bookmark',
    description: '添加当前页为书签',
    aliases: ['bm', '收藏'],
    hasArg: false,
  },
  {
    slash: 'group',
    intent: 'group_tabs',
    description: '创建标签分组',
    aliases: ['g', '分组'],
    hasArg: true,
    placeholder: '组名 [域名/关键词]',
  },
  {
    slash: 'ungroup',
    intent: 'ungroup_tabs',
    description: '取消所有标签分组',
    aliases: ['ug', '解组'],
  },
  {
    slash: 'reopen',
    intent: 'reopen_closed_tab',
    description: '恢复最近关闭的标签',
    aliases: ['undo', '恢复'],
    hasArg: false,
  },
  {
    slash: 'sort',
    intent: 'sort_tabs',
    description: '排序标签页',
    aliases: ['s'],
    hasArg: true,
    placeholder: 'domain | title',
  },
  {
    slash: 'mute',
    intent: 'mute_tabs_by_domain',
    description: '静音指定域名标签',
    aliases: ['m'],
    hasArg: true,
    placeholder: '域名',
  },
  {
    slash: 'history',
    intent: 'search_history',
    description: '搜索浏览历史',
    aliases: ['hi'],
    hasArg: true,
    placeholder: '关键词',
  },
  {
    slash: 'pin',
    intent: 'pin_tab',
    description: '固定/取消固定当前标签',
    aliases: ['固定', 'p'],
  },
  {
    slash: 'reload',
    intent: 'reload_tab',
    description: '刷新当前标签（加 all 刷新所有）',
    aliases: ['r', '刷新'],
    hasArg: true,
    placeholder: 'all(可选)',
  },
  {
    slash: 'close-other',
    intent: 'close_other_tabs',
    description: '关闭其他标签（保留当前）',
    aliases: ['co', '保留当前'],
  },
  {
    slash: 'duplicate',
    intent: 'duplicate_tab',
    description: '复制当前标签页',
    aliases: ['dup', '复制'],
  },
  {
    slash: 'remove-bookmark',
    intent: 'remove_bookmark',
    description: '删除匹配的书签',
    aliases: ['rb', '删书签'],
    hasArg: true,
    placeholder: '关键词',
  },
  {
    slash: 'move',
    intent: 'move_tab',
    description: '移动当前标签到指定位置',
    aliases: ['mv', '移动'],
    hasArg: true,
    placeholder: '位置序号 (1-based)',
  },
  {
    slash: 'discard',
    intent: 'discard_tabs',
    description: '休眠标签页释放内存',
    aliases: ['dc', '休眠'],
    hasArg: true,
    placeholder: '域名 (或 all)',
  },
  {
    slash: 'unmute',
    intent: 'unmute_tabs_by_domain',
    description: '取消静音指定域名标签',
    aliases: ['um', '取消静音'],
    hasArg: true,
    placeholder: '域名',
  },
  {
    slash: 'screenshot',
    intent: 'screenshot',
    description: '截取页面截图',
    aliases: ['shot', '截图'],
    hasArg: true,
    placeholder: '标签关键词(可选)',
  },
  {
    slash: 'zoom',
    intent: 'zoom_tab',
    description: '缩放当前页面',
    aliases: ['z', '缩放'],
    hasArg: true,
    placeholder: 'in | out | reset',
  },
  {
    slash: 'downloads',
    intent: 'open_downloads',
    description: '打开下载管理页面',
    aliases: ['dl', '下载'],
    hasArg: false,
  },
  {
    slash: 'new-window',
    intent: 'new_window',
    description: '在新窗口打开 URL',
    aliases: ['nw', '新窗口'],
    hasArg: true,
    placeholder: 'URL (可选)',
  },
  {
    slash: 'group-by-domain',
    intent: 'group_by_domain',
    description: '按域名将所有标签页分组',
    aliases: ['gbd', '域名分组'],
  },
  {
    slash: 'list-groups',
    intent: 'list_groups',
    description: '列出所有标签分组',
    aliases: ['lg', '分组列表'],
  },
  {
    slash: 'rename-group',
    intent: 'rename_group',
    description: '重命名标签分组',
    aliases: ['rg', '重命名组'],
    hasArg: true,
    placeholder: '新名称',
  },
  {
    slash: 'theme',
    intent: 'get_theme',
    description: '查看/设置主题（dark/light/device color blue等）',
    aliases: ['主题'],
    hasArg: true,
    placeholder: '模式或颜色(可选)',
  },
  {
    slash: 'font-size',
    intent: 'get_font_size',
    description: '查看/设置字号（特小/小/中/大/特大）',
    aliases: ['fs', '字号'],
    hasArg: true,
    placeholder: '字号(可选)',
  },
  {
    slash: 'font',
    intent: 'get_font_family',
    description: '查看/设置浏览器字体',
    aliases: ['字体'],
    hasArg: true,
    placeholder: '字体名(可选)',
  },
  {
    slash: 'clear-history',
    intent: 'delete_history',
    description: '删除浏览历史记录',
    aliases: ['ch', '清历史'],
    hasArg: true,
    placeholder: 'today | week | month | all',
  },
  {
    slash: 'cookies',
    intent: 'get_cookies',
    description: '查看域名下的 Cookie',
    aliases: ['ck', 'Cookie'],
    hasArg: true,
    placeholder: '域名',
  },
  {
    slash: 'clear-cookies',
    intent: 'clear_cookies',
    description: '清除域名下的 Cookie',
    aliases: ['cc', '清Cookie'],
    hasArg: true,
    placeholder: '域名',
  },
  {
    slash: 'top-sites',
    intent: 'get_top_sites',
    description: '查看最常访问的网站',
    aliases: ['ts', '常用网站'],
  },
  {
    slash: 'extensions',
    intent: 'list_extensions',
    description: '查看所有扩展',
    aliases: ['ext', '扩展'],
  },
  {
    slash: 'enable-extension',
    intent: 'enable_extension',
    description: '启用扩展',
    aliases: ['ee', '启用扩展'],
    hasArg: true,
    placeholder: '扩展名称或ID',
  },
  {
    slash: 'disable-extension',
    intent: 'disable_extension',
    description: '禁用扩展',
    aliases: ['de', '禁用扩展'],
    hasArg: true,
    placeholder: '扩展名称或ID',
  },
  {
    slash: 'uninstall-extension',
    intent: 'uninstall_extension',
    description: '卸载扩展',
    aliases: ['ue', '卸载扩展'],
    hasArg: true,
    placeholder: '扩展名称或ID',
  },
  {
    slash: 'site-perms',
    intent: 'get_site_permissions',
    description: '查看网站权限设置',
    aliases: ['sp', '网站权限'],
    hasArg: true,
    placeholder: '域名',
  },
  {
    slash: 'set-site-perm',
    intent: 'set_site_permission',
    description: '设置网站权限（弹窗/摄像头/JS 等）',
    aliases: ['ssp', '设权限'],
    hasArg: true,
    placeholder: '域名 权限类型 值(allow/block)',
  },
  {
    slash: 'storage-get',
    intent: 'storage_get',
    description: '读取扩展本地存储',
    aliases: ['sg', '读存储'],
    hasArg: true,
    placeholder: 'key',
  },
  {
    slash: 'storage-set',
    intent: 'storage_set',
    description: '写入扩展本地存储',
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
    description: '录制屏幕/窗口/标签页画面',
    aliases: ['rs', '录屏'],
  },
  {
    slash: 'stop-recording',
    intent: 'stop_recording',
    description: '停止录制并保存',
    aliases: ['sr', '停录'],
  },
  {
    slash: 'dom',
    intent: 'dom_manipulate',
    description: 'DOM 操作（增删改查当前页面元素）',
    aliases: ['页面操作'],
    hasArg: true,
    placeholder: 'query/modify/remove/add/style 选择器 [值]',
  },
  {
    slash: 'help',
    intent: 'show_help',
    description: '显示所有可用命令',
    aliases: ['h', '?', '帮助'],
  },
] as const

interface SlashMatchResult {
  intent: string
  slots: Record<string, unknown>
  cmd: SlashCommand
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
  if (cmd.hasArg && args) {
    buildSlots(cmd.intent, args, parts, slots)
  }

  return { intent: cmd.intent, slots, cmd }
}

function buildSlots(
  intent: string,
  args: string,
  parts: string[],
  slots: Record<string, unknown>
): void {
  switch (intent) {
    case 'find_tab':
    case 'search_history':
    case 'remove_bookmark':
    case 'enable_extension':
    case 'disable_extension':
    case 'uninstall_extension':
    case 'dom_manipulate':
      ;(slots as Record<string, string>).query = args
      break
    case 'close_tabs_by_domain':
    case 'mute_tabs_by_domain':
    case 'unmute_tabs_by_domain':
    case 'get_cookies':
    case 'clear_cookies':
    case 'get_site_permissions':
    case 'storage_get':
    case 'storage_remove':
      ;(slots as Record<string, string>).domain = args
      break
    case 'delete_history':
      ;(slots as Record<string, string>).timeRange = args
      break
    case 'sort_tabs':
      ;(slots as Record<string, string>).order = args
      break
    case 'zoom_tab':
      ;(slots as Record<string, string>).direction = args
      break
    case 'rename_group':
      ;(slots as Record<string, string>).name = args
      break
    case 'group_tabs': {
      const [groupName, ...patternParts] = parts.slice(1)
      ;(slots as Record<string, string>).groupName = groupName || '新分组'
      if (patternParts.length > 0)
        (slots as Record<string, string>).pattern = patternParts.join(' ')
      break
    }
    case 'reload_tab':
      slots.all = args.toLowerCase() === 'all'
      break
    case 'move_tab':
      slots.index = parseInt(args, 10) || 0
      break
    case 'discard_tabs':
      if (args.toLowerCase() === 'all') slots.all = true
      else (slots as Record<string, string>).domain = args
      break
    case 'screenshot':
      if (args) (slots as Record<string, string>).query = args
      break
    case 'get_theme':
      if (args) {
        if (args.startsWith('color ')) (slots as Record<string, string>).color = args.slice(6)
        else (slots as Record<string, string>).mode = args
      }
      break
    case 'get_font_size':
      if (args) (slots as Record<string, string>).size = args
      break
    case 'get_font_family':
      if (args) (slots as Record<string, string>).family = args
      break
    case 'new_window':
      if (args) (slots as Record<string, string>).url = args
      break
    case 'list_extensions':
      if (args) (slots as Record<string, string>).query = args
      break
    case 'set_site_permission': {
      const permParts = args.split(/\s+/)
      ;(slots as Record<string, string>).domain = permParts[0] || ''
      ;(slots as Record<string, string>).setting = permParts[1] || ''
      ;(slots as Record<string, string>).value = permParts[2] || 'allow'
      break
    }
    case 'storage_set': {
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
