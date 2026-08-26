/**
 * 命令定义注册表
 * intent：用户意图名；swIntent：SW executor 中的命令名；requiresPrecompute：是否需要 SP 预计算
 * aiHidden：对 AI 隐藏（仅用于斜杠命令向后兼容）
 */

import type { Command } from '../types'

export const COMMANDS: Command[] = [
  // ==================== TABS (9) ====================
  {
    intent: 'tabs_observe',
    description: '查询标签页列表。可用 query、domain 过滤，默认返回当前窗口所有标签。返回结果包含 id(数字)、title、url、active、pinned、muted、discarded 等字段',
    dangerous: false,
    slots: {
      query: { type: 'string', optional: true, description: '搜索关键词' },
      domain: { type: 'string', optional: true, description: '按域名过滤' },
      currentWindow: {
        type: 'boolean',
        optional: true,
        description: '仅当前窗口',
      },
      pinned: { type: 'boolean', optional: true, description: '仅固定标签' },
      muted: { type: 'boolean', optional: true, description: '仅静音标签' },
      discarded: { type: 'boolean', optional: true, description: '仅休眠标签' },
      maxResults: {
        type: 'number',
        optional: true,
        description: '最大返回数量',
      },
    },
    swIntent: 'tabs_observe',
  },
  {
    intent: 'tabs_create',
    description: '创建新标签页。url 为空则打开空白新标签',
    dangerous: false,
    slots: {
      url: { type: 'string', optional: true, description: '目标 URL' },
      active: { type: 'boolean', optional: true, description: '是否激活' },
      windowId: { type: 'number', optional: true, description: '目标窗口 ID' },
      index: {
        type: 'number',
        optional: true,
        description: '插入位置 (0-based)',
      },
    },
    swIntent: 'tabs_create',
  },
  {
    intent: 'tabs_update',
    description:
      '更新标签页属性。tabId 为空则操作当前标签。可更新 url、active、muted、pinned、discarded；reload=true 刷新页面。注意：tabId 是数字类型',
    dangerous: false,
    slots: {
      tabId: { type: 'number', optional: true, description: '目标标签 ID (数字)' },
      url: { type: 'string', optional: true, description: '更新 URL' },
      active: { type: 'boolean', optional: true, description: '是否激活' },
      muted: { type: 'boolean', optional: true, description: '是否静音' },
      pinned: { type: 'boolean', optional: true, description: '是否固定' },
      discarded: { type: 'boolean', optional: true, description: '是否休眠' },
      reload: { type: 'boolean', optional: true, description: '是否刷新' },
    },
    swIntent: 'tabs_update',
  },
  {
    intent: 'tabs_move',
    description: '移动标签页位置。tabIds 为空移动当前标签，index 为目标位置(0-based)。返回结果包含 id、index 字段用于验证',
    dangerous: false,
    slots: {
      tabIds: { type: 'array', optional: true, description: '标签 ID 数组，元素为数字' },
      index: { type: 'number', description: '目标位置 (0-based)' },
    },
    swIntent: 'tabs_move',
  },
  {
    intent: 'tabs_remove',
    description: '关闭标签页。tabIds 为空关闭当前标签',
    dangerous: true,
    slots: {
      tabIds: {
        type: 'array',
        optional: true,
        description: '要关闭的标签 ID 数组',
      },
    },
    swIntent: 'tabs_remove',
  },
  {
    intent: 'tabs_observe_groups',
    description: '列出标签分组信息',
    dangerous: false,
    slots: {
      maxResults: {
        type: 'number',
        optional: true,
        description: '最大返回数量',
      },
    },
    swIntent: 'tabs_observe_groups',
  },
  {
    intent: 'tabs_group_by_domain',
    description: '按域名将标签页分组，每个域名创建一个标签组',
    dangerous: false,
    slots: {},
    swIntent: 'tabs_group_by_domain',
  },

  // ==================== BOOKMARKS (7) ====================
  {
    intent: 'bookmarks_observe_tree',
    description: '观察完整书签树结构，返回节点数组，每个节点包含 id(字符串)、title、type(folder|bookmark)、parentId(字符串)、index、path(完整路径)、url、childCount 等字段',
    dangerous: false,
    slots: {
      query: { type: 'string', optional: true, description: '可选过滤关键词' },
      nodeType: {
        type: 'string',
        optional: true,
        description: 'folder | bookmark',
      },
      maxDepth: {
        type: 'number',
        optional: true,
        description: '返回的最大层级深度',
      },
      maxResults: {
        type: 'number',
        optional: true,
        description: '最多返回多少个节点',
      },
    },
    swIntent: 'bookmarks_observe_tree',
  },
  {
    intent: 'bookmarks_move_node',
    description: '按 nodeId 移动书签节点。nodeId 是字符串类型。移动成功后返回新位置信息',
    dangerous: false,
    slots: {
      nodeId: { type: 'string', description: '要移动的节点 id (字符串)' },
      parentId: {
        type: 'string',
        optional: true,
        description: '目标父节点 id (字符串)' ,
      },
      index: {
        type: 'number',
        optional: true,
        description: '目标位置 (0-based)' ,
      },
      beforeId: {
        type: 'string',
        optional: true,
        description: '插入到哪个节点前面 (字符串)' ,
      },
    },
    swIntent: 'bookmarks_move_node',
  },
  {
    intent: 'bookmarks_create_node',
    description: '创建书签或文件夹。nodeType=folder|bookmark, parentId 指定父节点',
    dangerous: false,
    slots: {
      nodeType: { type: 'string', description: 'folder | bookmark' },
      title: { type: 'string', description: '节点标题' },
      parentId: { type: 'string', description: '父节点 id' },
      url: {
        type: 'string',
        optional: true,
        description: '仅 nodeType=bookmark 时需要',
      },
      index: {
        type: 'number',
        optional: true,
        description: '可选位置 (0-based)',
      },
      allowDuplicate: {
        type: 'boolean',
        optional: true,
        description: '是否允许在同一父级下创建同名节点，默认 false',
      },
    },
    swIntent: 'bookmarks_create_node',
  },
  {
    intent: 'bookmarks_update_node',
    description: '按 nodeId 更新书签节点属性（title/url）',
    dangerous: false,
    slots: {
      nodeId: { type: 'string', description: '节点 id' },
      title: { type: 'string', optional: true, description: '新标题' },
      url: { type: 'string', optional: true, description: '新 URL' },
    },
    swIntent: 'bookmarks_update_node',
  },
  {
    intent: 'bookmarks_open_node',
    description: '按 nodeId 在新标签页打开书签 url',
    dangerous: false,
    slots: {
      nodeId: { type: 'string', description: '书签节点 id' },
    },
    swIntent: 'bookmarks_open_node',
  },
  {
    intent: 'bookmarks_remove_node',
    description: '按 nodeId 删除书签或文件夹',
    dangerous: true,
    slots: {
      nodeId: { type: 'string', description: '要删除的书签/文件夹节点 id', optional: true },
      selectedIds: {
        type: 'string[]',
        description: '从二次确认卡勾选后回传的子集 id 列表',
        optional: true,
      },
    },
    swIntent: 'bookmarks_remove_node',
  },
  {
    intent: 'bookmarks_add_current_page',
    description: '将当前标签页添加为书签',
    dangerous: false,
    slots: {
      title: { type: 'string', optional: true, description: '书签标题' },
    },
    swIntent: 'bookmarks_add_current_page',
  },

  // ==================== WINDOWS (3) ====================
  {
    intent: 'windows_observe',
    description: '获取窗口列表或当前窗口信息',
    dangerous: false,
    slots: {
      includeTabs: {
        type: 'boolean',
        optional: true,
        description: '是否包含标签页信息',
      },
    },
    swIntent: 'windows_observe',
  },
  {
    intent: 'windows_create',
    description: '创建新窗口。url 为空创建空白窗口',
    dangerous: false,
    slots: {
      url: { type: 'string', optional: true, description: '目标 URL' },
      incognito: {
        type: 'boolean',
        optional: true,
        description: '是否隐身窗口',
      },
    },
    swIntent: 'windows_create',
  },
  {
    intent: 'windows_update',
    description: '更新窗口属性（focused/maximized 等）',
    dangerous: false,
    slots: {
      windowId: { type: 'number', description: '窗口 ID' },
      focused: { type: 'boolean', optional: true, description: '是否聚焦' },
      state: { type: 'string', optional: true, description: '窗口状态' },
    },
    swIntent: 'windows_update',
  },

  // ==================== HISTORY (2) ====================
  {
    intent: 'history_search',
    description: '搜索浏览历史',
    dangerous: false,
    slots: {
      query: { type: 'string', description: '搜索关键词' },
      timeRange: {
        type: 'string',
        optional: true,
        description: 'today | yesterday | week | month | all',
      },
      maxResults: {
        type: 'number',
        optional: true,
        description: '最大返回数量',
      },
    },
    swIntent: 'history_search',
  },
  {
    intent: 'history_remove',
    description: '删除历史记录。支持按时间段或关键词删除',
    dangerous: true,
    slots: {
      timeRange: {
        type: 'string',
        optional: true,
        description: 'today | yesterday | week | month | all',
      },
      query: {
        type: 'string',
        optional: true,
        description: '仅删除匹配关键词的记录',
      },
      selectedUrls: {
        type: 'string[]',
        optional: true,
        description: '从二次确认卡勾选后回传的子集 URL 列表',
      },
    },
    swIntent: 'history_remove',
  },

  // ==================== NAVIGATION (2) ====================
  {
    intent: 'navigate',
    description: '导航到指定 URL。受保护页面(chrome://等)会被拒绝',
    dangerous: false,
    slots: {
      url: { type: 'string', description: '目标 URL' },
      newTab: {
        type: 'boolean',
        optional: true,
        description: '是否新标签打开',
      },
    },
    swIntent: 'navigate',
  },
  {
    intent: 'screenshot',
    description: '截取页面可见区域截图',
    dangerous: false,
    slots: {
      tabId: { type: 'number', optional: true, description: '目标标签 ID' },
    },
    swIntent: 'screenshot',
  },

  // ==================== PAGE (2) ====================
  {
    intent: 'zoom',
    description: '缩放当前页面。direction: in|out|reset',
    dangerous: false,
    slots: {
      direction: { type: 'string', description: 'in | out | reset' },
      tabId: { type: 'number', optional: true, description: '目标标签 ID' },
    },
    swIntent: 'zoom',
  },
  {
    intent: 'downloads_open',
    description: '打开下载管理页面',
    dangerous: false,
    slots: {},
    swIntent: 'downloads_open',
  },

  // ==================== THEME (2) ====================
  {
    intent: 'theme_observe',
    description: '查看当前 Chrome 主题设置',
    dangerous: false,
    slots: {},
    swIntent: 'theme_observe',
  },
  {
    intent: 'theme_update',
    description: '设置主题模式(light/dark/device)或颜色',
    dangerous: false,
    slots: {
      mode: {
        type: 'string',
        optional: true,
        description: 'light | dark | device',
      },
      color: {
        type: 'string',
        optional: true,
        description: '颜色名或 #RRGGBB',
      },
    },
    swIntent: 'theme_update',
  },

  // ==================== FONT (4) ====================
  {
    intent: 'font_size_observe',
    description: '查看浏览器默认字号',
    dangerous: false,
    slots: {},
    swIntent: 'font_size_observe',
  },
  {
    intent: 'font_size_update',
    description: '设置浏览器默认字号(small|medium|large|xlarge)',
    dangerous: false,
    slots: {
      size: { type: 'string', description: 'small | medium | large | xlarge' },
    },
    swIntent: 'font_size_update',
  },
  {
    intent: 'font_family_observe',
    description: '查看浏览器默认字体',
    dangerous: false,
    slots: {
      genericFamily: {
        type: 'string',
        optional: true,
        description: 'standard | serif | sansserif | fixed | math',
      },
    },
    swIntent: 'font_family_observe',
  },
  {
    intent: 'font_family_update',
    description: '设置浏览器默认字体',
    dangerous: false,
    slots: {
      family: { type: 'string', description: '字体名称' },
      genericFamily: {
        type: 'string',
        optional: true,
        description: '字体类别',
      },
    },
    swIntent: 'font_family_update',
  },

  // ==================== COOKIES (2) ====================
  {
    intent: 'cookies_observe',
    description: '查询指定域名的 Cookie',
    dangerous: false,
    slots: {
      domain: { type: 'string', optional: true, description: '域名' },
    },
    swIntent: 'cookies_observe',
  },
  {
    intent: 'cookies_remove',
    description: '清除指定域名的 Cookie',
    dangerous: true,
    slots: {
      domain: { type: 'string', optional: true, description: '域名' },
    },
    swIntent: 'cookies_remove',
  },

  // ==================== TOP_SITES (1) ====================
  {
    intent: 'top_sites_observe',
    description: '查看最常访问的网站',
    dangerous: false,
    slots: {},
    swIntent: 'top_sites_observe',
  },

  // ==================== EXTENSIONS (3) ====================
  {
    intent: 'extensions_observe',
    description: '列出已安装扩展',
    dangerous: false,
    slots: {
      query: { type: 'string', optional: true, description: '可选过滤关键词' },
    },
    swIntent: 'extensions_observe',
  },
  {
    intent: 'extensions_update',
    description: '启用或禁用扩展',
    dangerous: false,
    slots: {
      id: { type: 'string', description: '扩展 ID' },
      enabled: { type: 'boolean', description: '是否启用' },
    },
    swIntent: 'extensions_update',
  },
  {
    intent: 'extensions_remove',
    description: '卸载扩展',
    dangerous: true,
    slots: {
      id: { type: 'string', description: '扩展 ID' },
    },
    swIntent: 'extensions_remove',
  },

  // ==================== PERMISSIONS (2) ====================
  {
    intent: 'permissions_observe',
    description: '查看指定域名在 Chrome 中的权限设置',
    dangerous: false,
    slots: {
      domain: { type: 'string', optional: true, description: '域名' },
    },
    swIntent: 'permissions_observe',
  },
  {
    intent: 'permissions_update',
    description: '设置指定域名的权限',
    dangerous: false,
    slots: {
      domain: { type: 'string', description: '域名' },
      setting: {
        type: 'string',
        description: '权限类型：popups/camera/javascript/images/notifications 等',
      },
      value: { type: 'string', description: 'allow | block | default' },
    },
    swIntent: 'permissions_update',
  },

  // ==================== STORAGE (3) ====================
  {
    intent: 'storage_get',
    description: '读取扩展存储中的键值',
    dangerous: false,
    slots: {
      key: { type: 'string', description: '存储键名' },
    },
    swIntent: 'storage_get',
  },
  {
    intent: 'storage_set',
    description: '写入扩展存储键值对',
    dangerous: false,
    slots: {
      key: { type: 'string', description: '存储键名' },
      value: { type: 'any', description: '存储值' },
    },
    swIntent: 'storage_set',
  },
  {
    intent: 'storage_remove',
    description: '删除扩展存储中的指定键',
    dangerous: false,
    slots: {
      key: { type: 'string', description: '存储键名' },
    },
    swIntent: 'storage_remove',
  },

  // ==================== SESSIONS (1) ====================
  {
    intent: 'sessions_restore',
    description: '恢复最近关闭的标签页',
    dangerous: false,
    slots: {
      query: { type: 'string', optional: true, description: '匹配标题/URL' },
    },
    swIntent: 'sessions_restore',
  },

  // ==================== RECORDING (2) ====================
  // 这二个 intent 在 sidepanel 端处理，由 recordingExecutor 接管
  // swIntent: null + clientIntent 非空 = 客户端路由
  {
    intent: 'record_screen',
    description: '开始录制屏幕/窗口/标签页画面（含系统音频）',
    dangerous: false,
    slots: {},
    swIntent: null,
    clientIntent: 'record_screen',
  },
  {
    intent: 'stop_recording',
    description: '停止当前录制并保存视频',
    dangerous: false,
    slots: {},
    swIntent: null,
    clientIntent: 'stop_recording',
  },

  // ==================== BATCH (1) ====================
  {
    intent: 'batch',
    description: '批量执行多个工具调用，一次性返回所有结果。适合同类操作的合并执行',
    dangerous: false,
    slots: {
      calls: {
        type: 'array',
        description: "子调用数组，每项 { tool: '工具名', args: {...} }",
      },
    },
    swIntent: 'batch',
  },

  // ==================== 向后兼容：斜杠命令（对 AI 隐藏） ====================
  {
    intent: 'find_tab',
    description: '根据关键词查找标签页并聚焦',
    dangerous: false,
    aiHidden: true,
    slots: {
      query: { type: 'string', description: '搜索关键词' },
    },
    swIntent: 'tabs_observe',
  },
  {
    intent: 'close_duplicate_tabs',
    description: '关闭 URL 重复的标签页',
    dangerous: true,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      url: { type: 'string', optional: true, description: '仅去重指定 URL' },
    },
    swIntent: 'tabs_remove',
  },
  {
    intent: 'close_tabs_by_url',
    description: '按 URL 子串或关键词模糊匹配关闭标签',
    dangerous: true,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      query: { type: 'string', description: 'URL 子串或关键词（匹配 url/title）' },
    },
    swIntent: 'tabs_remove_by_url',
  },
  {
    intent: 'mute_tabs_by_domain',
    description: '静音指定域名标签',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      domain: { type: 'string', description: '域名' },
    },
    swIntent: 'tabs_update',
  },
  {
    intent: 'unmute_tabs_by_domain',
    description: '取消静音指定域名标签',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      domain: { type: 'string', description: '域名' },
    },
    swIntent: 'tabs_update',
  },
  {
    intent: 'sort_tabs',
    description: '按域名/标题排序当前窗口标签',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      order: { type: 'string', optional: true, description: 'domain | title' },
    },
    swIntent: 'tabs_move',
  },
  {
    intent: 'pin_tab',
    description: '固定/取消固定当前标签',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {},
    swIntent: 'tabs_update',
  },
  {
    intent: 'reload_tab',
    description: '刷新当前标签页',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      all: {
        type: 'boolean',
        optional: true,
        description: '刷新窗口内所有标签',
      },
    },
    swIntent: 'tabs_update',
  },
  {
    intent: 'close_other_tabs',
    description: '关闭当前窗口内除当前标签外的其他标签',
    dangerous: true,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {},
    swIntent: 'tabs_remove',
  },
  {
    intent: 'duplicate_tab',
    description: '复制当前标签页',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {},
    swIntent: 'tabs_create',
  },
  {
    intent: 'move_tab',
    description: '移动标签到指定位置',
    dangerous: false,
    aiHidden: true,
    slots: {
      index: { type: 'number', description: '目标位置 (1-based)' },
      fromTabId: { type: 'number', optional: true, description: '源标签 ID' },
    },
    swIntent: 'tabs_move',
  },
  {
    intent: 'discard_tabs',
    description: '休眠标签页释放内存',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      domain: { type: 'string', optional: true, description: '域名' },
      all: { type: 'boolean', optional: true, description: '休眠全部' },
    },
    swIntent: 'tabs_update',
  },
  {
    intent: 'list_groups',
    description: '列出当前窗口所有标签分组',
    dangerous: false,
    aiHidden: true,
    slots: {},
    swIntent: 'tabs_observe_groups',
  },
  {
    intent: 'group_by_domain',
    description: '按域名自动分组同域名的标签页（不含 pinned）',
    dangerous: false,
    aiHidden: true,
    slots: {
      allWindows: {
        type: 'boolean',
        optional: true,
        description: 'true=所有窗口；默认只处理当前窗口',
      },
    },
    swIntent: 'tabs_group_by_domain',
  },
  {
    intent: 'reopen_closed_tab',
    description: '恢复最近关闭的标签',
    dangerous: false,
    aiHidden: true,
    slots: {
      query: { type: 'string', optional: true, description: '匹配标题/URL' },
    },
    swIntent: 'sessions_restore',
  },
  {
    intent: 'search_history',
    description: '搜索浏览历史',
    dangerous: false,
    aiHidden: true,
    slots: {
      query: { type: 'string', description: '搜索关键词' },
      timeRange: {
        type: 'string',
        optional: true,
        description: 'today | week | month',
      },
    },
    swIntent: 'history_search',
  },
  {
    intent: 'delete_history',
    description: '删除浏览历史记录',
    dangerous: true,
    aiHidden: true,
    slots: {
      timeRange: {
        type: 'string',
        description: 'today | yesterday | week | month | all',
      },
      query: {
        type: 'string',
        optional: true,
        description: '仅删除匹配关键词的记录',
      },
    },
    swIntent: 'history_remove',
  },
  {
    intent: 'new_window',
    description: '在新窗口打开页面',
    dangerous: false,
    aiHidden: true,
    slots: {
      url: {
        type: 'string',
        optional: true,
        description: 'URL，不传则空白窗口',
      },
    },
    swIntent: 'windows_create',
  },
  {
    intent: 'open_downloads',
    description: '打开下载管理页面',
    dangerous: false,
    aiHidden: true,
    slots: {},
    swIntent: 'downloads_open',
  },
  {
    intent: 'zoom_tab',
    description: '缩放当前页面',
    dangerous: false,
    aiHidden: true,
    slots: {
      direction: { type: 'string', description: 'in | out | reset' },
    },
    swIntent: 'zoom',
  },
  {
    intent: 'get_theme',
    description: '查看当前主题模式与颜色设置',
    dangerous: false,
    aiHidden: true,
    slots: {},
    swIntent: 'theme_observe',
  },
  {
    intent: 'set_theme',
    description: '设置主题模式（light/dark/device）或主题颜色（blue/gray/pink等或#RRGGBB）',
    dangerous: false,
    aiHidden: true,
    slots: {
      mode: {
        type: 'string',
        optional: true,
        description: 'light | dark | device',
      },
      color: { type: 'string', optional: true, description: '颜色名或#RRGGBB' },
    },
    swIntent: 'theme_update',
  },
  {
    intent: 'get_font_size',
    description: '查看当前浏览器字号设置',
    dangerous: false,
    aiHidden: true,
    slots: {},
    swIntent: 'font_size_observe',
  },
  {
    intent: 'set_font_size',
    description: '设置浏览器字号（特小/小/中/大/特大）',
    dangerous: false,
    aiHidden: true,
    slots: {
      size: {
        type: 'string',
        description: 'very_small | small | medium | large | very_large',
      },
    },
    swIntent: 'font_size_update',
  },
  {
    intent: 'get_font_family',
    description: '查看当前浏览器字体设置',
    dangerous: false,
    aiHidden: true,
    slots: {},
    swIntent: 'font_family_observe',
  },
  {
    intent: 'set_font_family',
    description: '设置浏览器字体（如 微软雅黑、Arial 等），会自动检测是否支持',
    dangerous: false,
    aiHidden: true,
    slots: {
      family: { type: 'string', description: '字体名称' },
    },
    swIntent: 'font_family_update',
  },
  {
    intent: 'get_cookies',
    description: '查看指定域名的 Cookie',
    dangerous: false,
    aiHidden: true,
    slots: {
      domain: { type: 'string', description: '域名' },
    },
    swIntent: 'cookies_observe',
  },
  {
    intent: 'clear_cookies',
    description: '清除指定域名的 Cookie',
    dangerous: true,
    aiHidden: true,
    slots: {
      domain: { type: 'string', description: '域名' },
    },
    swIntent: 'cookies_remove',
  },
  {
    intent: 'get_top_sites',
    description: '查看最常访问的网站',
    dangerous: false,
    aiHidden: true,
    slots: {},
    swIntent: 'top_sites_observe',
  },
  {
    intent: 'list_extensions',
    description: '列出所有已安装扩展',
    dangerous: false,
    aiHidden: true,
    slots: {
      query: { type: 'string', optional: true, description: '可选过滤关键词' },
    },
    swIntent: 'extensions_observe',
  },
  {
    intent: 'enable_extension',
    description: '启用指定扩展',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      query: { type: 'string', description: '扩展名称或 ID' },
    },
    swIntent: 'extensions_update',
  },
  {
    intent: 'disable_extension',
    description: '禁用指定扩展',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      query: { type: 'string', description: '扩展名称或 ID' },
    },
    swIntent: 'extensions_update',
  },
  {
    intent: 'uninstall_extension',
    description: '卸载指定扩展',
    dangerous: true,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      query: { type: 'string', description: '扩展名称或 ID' },
    },
    swIntent: 'extensions_remove',
  },
  {
    intent: 'get_site_permissions',
    description: '查看网站的权限设置（弹窗、摄像头、JS 等）',
    dangerous: false,
    aiHidden: true,
    slots: {
      domain: { type: 'string', description: '域名' },
    },
    swIntent: 'permissions_observe',
  },
  {
    intent: 'set_site_permission',
    description: '设置网站权限（如 popups/camera/javascript 等）',
    dangerous: false,
    aiHidden: true,
    slots: {
      domain: { type: 'string', description: '域名' },
      setting: {
        type: 'string',
        description: '权限类型：popups/camera/javascript/images/notifications 等',
      },
      value: { type: 'string', description: 'allow | block | default' },
    },
    swIntent: 'permissions_update',
  },
  {
    intent: 'add_bookmark',
    description: '添加书签（默认为当前页）',
    dangerous: false,
    aiHidden: true,
    slots: {
      title: { type: 'string', optional: true, description: '书签标题' },
      url: {
        type: 'string',
        optional: true,
        description: 'URL，不传则用当前标签',
      },
    },
    swIntent: 'bookmarks_add_current_page',
  },
  {
    intent: 'remove_bookmark',
    description: '删除匹配的书签或文件夹',
    dangerous: true,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      query: { type: 'string', description: '书签关键词' },
    },
    swIntent: 'bookmarks_remove_node',
  },

  // ==================== TASK_PLAN (1) ====================
  {
    intent: 'task_plan',
    description:
      '任务规划执行器。五阶段流程：①分析意图（识别任务类型和必需数据）→ ②扫描DOM（获取页面结构）→ ③规划流程（AI 拆解步骤）→ ④执行+审查（每步验证，失败重试）→ ⑤最终审查（确认任务完成）。action 指定当前阶段操作',
    dangerous: false,
    slots: {
      action: {
        type: 'string',
        description:
          '阶段操作：analyze（分析意图）| scan（扫描DOM）| setPlan（设置步骤序列）| executeStep（执行下一步）| provideData（填入用户数据）| finalReview（最终审查）| abort（中断任务）| getState（查询状态）',
      },
      userText: {
        type: 'string',
        optional: true,
        description: '用户目标描述，用于 analyze 阶段',
      },
      providedData: {
        type: 'object',
        optional: true,
        description: '用户已提供的数据键值对，用于 analyze 阶段',
      },
      steps: {
        type: 'array',
        optional: true,
        description: '操作步骤序列，用于 setPlan 阶段',
      },
      planStatus: {
        type: 'string',
        optional: true,
        description: 'READY | PARTIAL',
      },
      userDataKey: {
        type: 'string',
        optional: true,
        description: '用户数据键名，用于 provideData 阶段',
      },
      userDataValue: {
        type: 'string',
        optional: true,
        description: '用户数据值，用于 provideData 阶段',
      },
      reason: {
        type: 'string',
        optional: true,
        description: '中断原因，用于 abort 阶段',
      },
    },
    swIntent: 'task_plan',
  },

  // ==================== BROWSER DOM 操作（Playwright MCP 兼容）====================
  {
    intent: 'browser_snapshot',
    description: '扫描当前页面，获取所有可交互元素的 Accessibility Tree 快照',
    dangerous: false,
    slots: {
      maxElements: { type: 'number', optional: true, description: '最大元素数量，默认500' },
      includeIframes: { type: 'boolean', optional: true, description: '是否包含iframe，默认true' },
    },
    swIntent: 'browser_snapshot',
  },
  {
    intent: 'browser_click',
    description: '点击页面元素，使用 [ref=eN] 引用',
    dangerous: false,
    slots: {
      ref: { type: 'string', description: '元素引用，格式 [ref=eN]' },
    },
    swIntent: 'browser_click',
  },
  {
    intent: 'browser_type',
    description: '向输入框输入文本，使用 [ref=eN] 引用',
    dangerous: false,
    slots: {
      ref: { type: 'string', description: '元素引用，格式 [ref=eN]' },
      text: { type: 'string', description: '要输入的文本' },
      submit: { type: 'boolean', optional: true, description: '输入后是否按Enter提交' },
    },
    swIntent: 'browser_type',
  },
  {
    intent: 'browser_select_option',
    description: '选择下拉框选项',
    dangerous: false,
    slots: {
      ref: { type: 'string', description: 'select 元素引用' },
      value: { type: 'string', description: '要选择的值' },
    },
    swIntent: 'browser_select_option',
  },
  {
    intent: 'browser_hover',
    description: '悬停在元素上',
    dangerous: false,
    slots: {
      ref: { type: 'string', description: '元素引用' },
    },
    swIntent: 'browser_hover',
  },
  {
    intent: 'browser_press_key',
    description: '按键操作（如 Enter, Tab, Escape）',
    dangerous: false,
    slots: {
      key: { type: 'string', description: '按键名称，如 Enter, Tab, Escape' },
    },
    swIntent: 'browser_press_key',
  },
  {
    intent: 'browser_check',
    description: '勾选复选框或单选框',
    dangerous: false,
    slots: {
      ref: { type: 'string', description: 'checkbox/radio 元素引用' },
    },
    swIntent: 'browser_check',
  },
  {
    intent: 'browser_uncheck',
    description: '取消勾选复选框',
    dangerous: false,
    slots: {
      ref: { type: 'string', description: 'checkbox 元素引用' },
    },
    swIntent: 'browser_uncheck',
  },
  {
    intent: 'browser_fill_form',
    description: '批量填写表单字段',
    dangerous: false,
    slots: {
      fields: { type: 'array', description: '字段列表，每个包含 ref 和 value' },
    },
    swIntent: 'browser_fill_form',
  },
  {
    intent: 'browser_wait_for',
    description: '等待条件满足（文本出现或元素可见）',
    dangerous: false,
    slots: {
      text: { type: 'string', optional: true, description: '等待出现的文本' },
      ref: { type: 'string', optional: true, description: '等待出现的元素引用' },
      timeout: { type: 'number', optional: true, description: '超时时间(ms)，默认5000' },
    },
    swIntent: 'browser_wait_for',
  },
  {
    intent: 'browser_take_screenshot',
    description: '截取当前页面截图',
    dangerous: false,
    slots: {
      path: { type: 'string', optional: true, description: '保存路径' },
      fullPage: { type: 'boolean', optional: true, description: '是否全页截图' },
    },
    swIntent: 'browser_take_screenshot',
  },
  {
    intent: 'browser_navigate',
    description: '导航到指定 URL',
    dangerous: false,
    slots: {
      url: { type: 'string', description: '目标 URL' },
    },
    swIntent: 'browser_navigate',
  },
  {
    intent: 'browser_navigate_back',
    description: '浏览器后退',
    dangerous: false,
    slots: {},
    swIntent: 'browser_navigate_back',
  },
  {
    intent: 'browser_navigate_forward',
    description: '浏览器前进',
    dangerous: false,
    slots: {},
    swIntent: 'browser_navigate_forward',
  },
  {
    intent: 'browser_reload',
    description: '刷新当前页面',
    dangerous: false,
    slots: {},
    swIntent: 'browser_reload',
  },

  // ==================== 内置命令 ====================
  {
    intent: 'clear_chat',
    description: '清空所有回话记录',
    dangerous: false,
    aiHidden: true,
    slots: {},
    swIntent: null,
  },
  {
    intent: 'show_help',
    description: '显示所有可用命令',
    dangerous: false,
    slots: {},
    swIntent: null,
  },
  {
    intent: 'unknown',
    description: '无法识别的命令',
    dangerous: false,
    slots: {},
    swIntent: null,
  },
  {
    intent: 'chat',
    description: '闲聊/问候/一般对话',
    dangerous: false,
    slots: {
      reply: { type: 'string', description: 'AI 自然语言回复' },
    },
    swIntent: null,
  },
]

/**
 * 命令映射表（只读）
 */
export const COMMAND_MAP: ReadonlyMap<string, Command> = new Map(COMMANDS.map((c) => [c.intent, c]))

/**
 * 根据 intent 获取命令定义
 */
export function getCommand(intent: string): Command | undefined {
  return COMMAND_MAP.get(intent)
}

/**
 * 检查命令是否存在
 */
export function hasCommand(intent: string): boolean {
  return COMMAND_MAP.has(intent)
}
