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
    slash: 'close-url',
    intent: 'close_tabs_by_url',
    description: '按 URL 子串或关键词模糊匹配并关闭标签（支持勾选）',
    aliases: ['cu'],
    hasArg: true,
    placeholder: 'URL 子串或关键词',
  },
  {
    slash: 'bookmark',
    intent: 'add_bookmark',
    description: '添加书签（默认添加当前页）',
    aliases: ['bm', '收藏'],
    hasArg: true,
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
    description: '排序标签页（默认按域名字母升序；可选 title | domain）',
    aliases: ['s'],
    hasArg: false,
    placeholder: 'title | domain',
  },
  {
    slash: 'mute',
    intent: 'mute_tabs_by_domain',
    description: '静音指定域名标签',
    aliases: ['m', '静音'],
    hasArg: true,
    placeholder: '域名',
  },
  {
    slash: 'history',
    intent: 'search_history',
    description: '浏览历史（默认展示今天的记录；可传关键词过滤）',
    aliases: ['hi'],
    hasArg: false,
    placeholder: '关键词(可选)',
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
    aliases: ['保留当前'],
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
    aliases: ['取消静音'],
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
    slash: 'list-groups',
    intent: 'list_groups',
    description: '列出所有标签分组',
    aliases: ['lg', '分组列表'],
  },
  {
    slash: 'ungroup-all',
    intent: 'ungroup_all',
    description: '一键取消所有标签分组（保留标签本身）',
    aliases: ['uga', '解组所有', '取消分组'],
    hasArg: false,
  },
  {
    slash: 'group-domain',
    intent: 'group_by_domain',
    description: '按域名自动分组（同域名标签归到一组，不含 pinned）',
    aliases: ['gbd', '域名分组', '分组域名'],
    hasArg: false,
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
    aliases: ['清Cookie'],
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
    slash: 'help',
    intent: 'show_help',
    description: '显示所有可用命令',
    aliases: ['h', '?', '帮助'],
  },
  {
    slash: 'clear-chat',
    intent: 'clear_chat',
    description: '清空所有回话记录',
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
  // cmd.hasArg 控制 args 是否必传。sort_tabs 是参数可选：
  //   - 不传：precompute 默认按 domain
  //   - 传 domain / title：按指定键排序
  if (cmd.hasArg && args) {
    buildSlots(cmd.intent, args, slots)
  }

  return { intent: cmd.intent, slots, cmd }
}

function buildSlots(intent: string, args: string, slots: Record<string, unknown>): void {
  switch (intent) {
    case 'add_bookmark': {
      // 不传参数 = 当前页面（url 留空，SW 端取当前活动标签）
      // 传 https://xxx = 把指定 URL 加入书签
      // 传 "标题 URL" = 标题在前、URL 在后（第一个空格分隔）
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
      } else {
        // 只有一个非 URL 参数：当作 title（url 留空走当前页）
        ;(slots as Record<string, string>).title = argsText
      }
      break
    }
    case 'find_tab':
    case 'search_history':
      // /history 参数可选：不传 = 默认展示今天的全部历史；传值 = 按关键词过滤
      if (args.trim()) (slots as Record<string, string>).query = args
      break
    case 'remove_bookmark':
    case 'enable_extension':
    case 'disable_extension':
    case 'uninstall_extension':
      ;(slots as Record<string, string>).query = args
      break
    case 'close_tabs_by_url': {
      // 关闭命令的输入是 URL 子串或任意关键词，直接塞进 query。
      // SW 端按 url/title 子串匹配（不再匹配 hostname，避免和 mute_tabs_by_domain 语义重叠）。
      ;(slots as Record<string, string>).query = args
      break
    }
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
    case 'zoom_tab': {
      const validDirs = ['in', 'out', 'reset']
      const dir = args.toLowerCase()
      if (!validDirs.includes(dir)) {
        return
      }
      ;(slots as Record<string, string>).direction = dir
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
      // screenshot 命令不需要 query 参数，传了也会忽略
      // 实际截图由 chrome.tabs API 处理当前活动标签
      break
    case 'find_tab':
      // find_tab 的 query 必须非空
      if (!args.trim()) return
      ;(slots as Record<string, string>).query = args
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
      if (args) {
        // 验证 URL 格式和受保护页面
        const url = args.trim()
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return
        }
        if (url.startsWith('chrome://')) {
          return
        }
        ;(slots as Record<string, string>).url = url
      }
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
