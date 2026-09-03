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
    description:
      '查询标签页列表。可用 query、domain 过滤，默认返回当前窗口所有标签。返回结果包含 id(数字)、title、url、active、pinned、muted、discarded 等字段',
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
    intent: 'tabs_reload',
    description: '重新加载指定或当前活动标签页',
    dangerous: false,
    slots: { tabId: { type: 'number', optional: true, description: '目标标签 ID' } },
    swIntent: 'tabs_reload',
  },
  {
    intent: 'tabs_duplicate',
    description: '复制指定或当前活动标签页',
    dangerous: false,
    slots: { tabId: { type: 'number', optional: true, description: '目标标签 ID' } },
    swIntent: 'tabs_duplicate',
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
    description:
      '移动标签页位置。tabIds 为空移动当前标签，index 为目标位置(0-based)。返回结果包含 id、index 字段用于验证',
    dangerous: false,
    slots: {
      tabIds: { type: 'array', optional: true, description: '标签 ID 数组，元素为数字' },
      index: { type: 'number', description: '目标位置 (0-based)' },
    },
    swIntent: 'tabs_move',
  },
  {
    intent: 'tabs_remove',
    description:
      '关闭标签页。tabIds 关闭指定标签；domain 关闭当前窗口匹配域名的所有非固定标签（可与 tabIds 组合，重复会去重）',
    dangerous: true,
    slots: {
      tabIds: {
        type: 'array',
        optional: true,
        description: '要关闭的标签 ID 数组',
      },
      domain: {
        type: 'string',
        optional: true,
        description: '按域名过滤，仅关闭当前窗口匹配域名的非固定标签',
      },
      currentWindow: {
        type: 'boolean',
        optional: true,
        description: 'domain 模式下仅当前窗口（默认 true）',
      },
    },
    swIntent: 'tabs_remove',
  },
  {
    intent: 'tabs_observe_groups',
    description: '查询真实标签组及其成员，返回 groupId、title、color、collapsed、windowId、tabIds',
    dangerous: false,
    slots: {
      windowId: { type: 'number', optional: true, description: '窗口 ID' },
      collapsed: { type: 'boolean', optional: true, description: '是否折叠' },
      color: { type: 'string', optional: true, description: '标签组颜色' },
      title: { type: 'string', optional: true, description: '标签组标题' },
      maxResults: { type: 'number', optional: true, description: '最大数量' },
    },
    swIntent: 'tab_groups_query',
  },
  {
    intent: 'tab_groups_create',
    description: '将指定标签页创建为新的标签组，可设置标题和颜色',
    dangerous: false,
    slots: {
      tabIds: { type: 'number[]', description: '标签页 ID 数组' },
      title: { type: 'string', optional: true, description: '标签组标题' },
      color: { type: 'string', optional: true, description: '标签组颜色' },
    },
    swIntent: 'tab_groups_create',
  },
  {
    intent: 'tab_groups_update',
    description: '更新标签组标题、颜色或折叠状态',
    dangerous: false,
    slots: {
      groupId: { type: 'number', description: '标签组 ID' },
      title: { type: 'string', optional: true, description: '标题' },
      color: { type: 'string', optional: true, description: '颜色' },
      collapsed: { type: 'boolean', optional: true, description: '是否折叠' },
    },
    swIntent: 'tab_groups_update',
  },
  {
    intent: 'tab_groups_move_tabs',
    description: '将指定标签页加入已有标签组',
    dangerous: false,
    slots: {
      groupId: { type: 'number', description: '标签组 ID' },
      tabIds: { type: 'number[]', description: '标签页 ID 数组' },
    },
    swIntent: 'tab_groups_move_tabs',
  },
  {
    intent: 'tab_groups_ungroup_tabs',
    description: '将指定标签页移出标签组',
    dangerous: false,
    slots: {
      tabIds: { type: 'number[]', description: '标签页 ID 数组' },
    },
    swIntent: 'tab_groups_ungroup_tabs',
  },
  {
    intent: 'tab_groups_find_or_create_by_title',
    description: '按指定名称查找已有标签组；不存在则创建并把目标 tab 加入',
    dangerous: false,
    slots: {
      title: { type: 'string', description: '标签组名称' },
      tabIds: { type: 'number[]', description: '要加入的标签页 ID 数组' },
      windowId: { type: 'number', optional: true, description: '目标窗口 ID' },
      color: { type: 'string', optional: true, description: '标签组颜色' },
    },
    swIntent: 'tab_groups_find_or_create_by_title',
  },
  {
    intent: 'tabs_group_by_domain',
    description: '按域名将标签页分组，每个域名创建一个标签组',
    dangerous: false,
    slots: {},
    swIntent: 'tabs_group_by_domain',
  },
  {
    intent: 'ungroup_all',
    description: '一键取消所有标签分组（保留标签本身，支持勾选）',
    dangerous: true, // 批量操作，要求二次确认
    aiHidden: true,
    slots: {
      selectedGroupIds: {
        type: 'number[]',
        optional: true,
        description: '从二次确认卡勾选后回传的子集分组 ID 列表',
      },
    },
    swIntent: 'tabs_ungroup_all',
  },

  // ==================== BOOKMARKS (7) ====================
  {
    intent: 'bookmarks_observe_tree',
    description:
      '观察完整书签树结构，返回节点数组，每个节点包含 id(字符串)、title、type(folder|bookmark)、parentId(字符串)、index、path(完整路径)、url、childCount 等字段',
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
        description: '目标父节点 id (字符串)',
      },
      index: {
        type: 'number',
        optional: true,
        description: '目标位置 (0-based)',
      },
      beforeId: {
        type: 'string',
        optional: true,
        description: '插入到哪个节点前面 (字符串)',
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
    description: '搜索浏览历史（默认展示今天全部；带 query 按关键词过滤）',
    dangerous: false,
    slots: {
      query: { type: 'string', optional: true, description: '搜索关键词；缺省时不过滤' },
      timeRange: {
        type: 'string',
        optional: true,
        description: 'today（默认） | yesterday | week | month | all',
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
    intent: 'history_search_min',
    description: '历史搜索但返回最小化 URL（去除 query/fragment）',
    dangerous: false,
    slots: {
      query: { type: 'string', optional: true, description: '搜索关键词' },
      timeRange: {
        type: 'string',
        optional: true,
        description: 'today | yesterday | week | month | all',
      },
      maxResults: {
        type: 'number',
        optional: true,
        description: '最大返回数量 1-1000',
      },
    },
    swIntent: 'history_search_min',
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

  {
    intent: 'sessions_observe',
    description: '查询最近关闭的标签页和窗口',
    dangerous: false,
    slots: { maxResults: { type: 'number', optional: true, description: '返回数量，1-100' } },
    swIntent: 'sessions_observe',
  },
  {
    intent: 'sessions_restore_by_id',
    description: '按 sessionId 恢复最近关闭的标签页或窗口',
    dangerous: false,
    slots: { sessionId: { type: 'string', description: '会话 ID' } },
    swIntent: 'sessions_restore_by_id',
  },
  {
    intent: 'notifications_create',
    description: '创建浏览器通知',
    dangerous: false,
    slots: {
      title: { type: 'string', description: '通知标题' },
      message: { type: 'string', description: '通知内容' },
      iconUrl: { type: 'string', optional: true, description: '图标 URL' },
    },
    swIntent: 'notifications_create',
  },
  {
    intent: 'notifications_clear',
    description: '清除浏览器通知',
    dangerous: true,
    slots: { notificationId: { type: 'string', description: '通知 ID' } },
    swIntent: 'notifications_clear',
  },
  {
    intent: 'notifications_list',
    description: '查询当前通知 ID 列表',
    dangerous: false,
    slots: {},
    swIntent: 'notifications_list',
  },
  {
    intent: 'browsing_data_settings',
    description: '查看浏览数据清理能力和支持的数据类型',
    dangerous: false,
    slots: {},
    swIntent: 'browsing_data_settings',
  },

  {
    intent: 'browsing_data_remove',
    description: '清理指定时间范围内的浏览数据（必须明确数据类型和范围）',
    dangerous: true,
    slots: {
      since: { type: 'number', description: '起始时间戳' },
      dataToRemove: { type: 'object', description: '要清理的数据类型对象' },
    },
    swIntent: 'browsing_data_remove',
  },
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
      query: { type: 'string', optional: true, description: '按标题或 URL 匹配标签' },
    },
    requiresPrecompute: true,
    swIntent: 'screenshot',
  },

  {
    intent: 'downloads_download',
    description: '下载指定的 http/https URL',
    dangerous: false,
    slots: {
      url: { type: 'string', description: '下载 URL' },
      filename: { type: 'string', optional: true, description: '相对文件名' },
      saveAs: { type: 'boolean', optional: true, description: '是否显示另存为' },
    },
    swIntent: 'downloads_download',
  },
  {
    intent: 'downloads_open',
    description: '打开下载管理页面',
    dangerous: false,
    slots: {},
    swIntent: 'downloads_open',
  },
  {
    intent: 'downloads_erase',
    description: '从下载记录中删除下载项',
    dangerous: true,
    slots: { downloadId: { type: 'number', description: '下载 ID' } },
    swIntent: 'downloads_erase',
  },
  {
    intent: 'downloads_search',
    description: '查询下载记录（返回状态、URL和文件名等摘要）',
    dangerous: false,
    slots: {
      query: { type: 'string', optional: true, description: '搜索关键词' },
      limit: { type: 'number', optional: true, description: '返回数量，1-100' },
    },
    swIntent: 'downloads_search',
  },
  {
    intent: 'downloads_cancel',
    description: '取消指定下载任务',
    dangerous: true,
    slots: { downloadId: { type: 'number', description: '下载 ID' } },
    swIntent: 'downloads_cancel',
  },
  {
    intent: 'downloads_show',
    description: '在下载页面显示指定下载任务',
    dangerous: false,
    slots: { downloadId: { type: 'number', description: '下载 ID' } },
    swIntent: 'downloads_show',
  },
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
    description: '查询指定域名的 Cookie（无参则取当前页面域名）',
    dangerous: false,
    slots: {
      domain: {
        type: 'string',
        optional: true,
        description: '域名；缺省时取当前活动标签的域名',
      },
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
  {
    intent: 'cookies_set',
    description: '为指定 URL 设置 Cookie；value 不进入返回值',
    dangerous: true,
    slots: {
      url: { type: 'string', description: 'Cookie 所属 URL' },
      name: { type: 'string', description: 'Cookie 名称' },
      value: { type: 'string', description: 'Cookie 值（不回显到结果）' },
      domain: { type: 'string', optional: true, description: '可选显式域名' },
      path: { type: 'string', optional: true, description: '路径' },
      secure: { type: 'boolean', optional: true, description: '是否仅 HTTPS' },
      httpOnly: { type: 'boolean', optional: true, description: '是否禁止 JS 访问' },
      sameSite: { type: 'string', optional: true, description: 'no_restriction|lax|strict' },
      storeId: { type: 'string', optional: true, description: 'Cookie Store ID' },
      expirationDate: { type: 'number', optional: true, description: '过期时间' },
      partitionKey: { type: 'string', optional: true, description: '分区键' },
    },
    swIntent: 'cookies_set',
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

  {
    intent: 'content_settings_get',
    description: '查询指定网站内容设置',
    dangerous: false,
    slots: {
      primaryPattern: { type: 'string', description: '网站匹配模式' },
      resourceId: { type: 'string', description: '资源类型' },
    },
    swIntent: 'content_settings_get',
  },
  {
    intent: 'content_settings_set',
    description: '设置指定网站内容权限',
    dangerous: true,
    slots: {
      primaryPattern: { type: 'string', description: '网站匹配模式' },
      resourceId: { type: 'string', description: '资源类型' },
      setting: { type: 'string', description: 'allow | block | ask | default' },
    },
    swIntent: 'content_settings_set',
  },
  {
    intent: 'content_settings_clear',
    description: '清除指定网站内容设置',
    dangerous: true,
    slots: {
      primaryPattern: { type: 'string', description: '网站匹配模式' },
      resourceId: { type: 'string', optional: true, description: '资源类型' },
    },
    swIntent: 'content_settings_clear',
  },

  {
    intent: 'storage_get',
    description: '读取扩展存储键值（无 key 列出全部）',
    dangerous: false,
    slots: {
      key: {
        type: 'string',
        optional: true,
        description: '存储键名；缺省时返回整个 storage.local',
      },
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

  {
    intent: 'storage_area_get',
    description: '读取指定 storage area 的数据；managed 仅支持读取',
    dangerous: false,
    slots: {
      area: { type: 'string', optional: true, description: 'local | session | sync | managed' },
      key: { type: 'string', optional: true, description: '键名，不传则读取全部' },
    },
    swIntent: 'storage_area_get',
  },
  {
    intent: 'storage_area_set',
    description: '写入 local/session/sync storage 数据',
    dangerous: false,
    slots: {
      area: { type: 'string', optional: true, description: 'local | session | sync' },
      key: { type: 'string', description: '键名' },
      value: { type: 'any', description: '值' },
    },
    swIntent: 'storage_area_set',
  },
  {
    intent: 'storage_area_remove',
    description: '删除 local/session/sync storage 数据',
    dangerous: true,
    slots: {
      area: { type: 'string', optional: true, description: 'local | session | sync' },
      key: { type: 'string', description: '键名' },
    },
    swIntent: 'storage_area_remove',
  },
  {
    intent: 'storage_area_clear',
    description: '清空 local/session/sync storage 数据',
    dangerous: true,
    slots: { area: { type: 'string', optional: true, description: 'local | session | sync' } },
    swIntent: 'storage_area_clear',
  },
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
  // batch 已在 Plan-First 架构中废弃（AI 只会输出 plan 数组，不会调 batch）
  // 如需批量执行，让 AI 合并同类操作为单个 tool 的多参数形式即可。

  {
    intent: 'reload_tab',
    description: '刷新当前标签页或当前窗口全部标签页',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: { all: { type: 'boolean', optional: true, description: '是否刷新当前窗口全部标签页' } },
    swIntent: 'tabs_update',
  },
  {
    intent: 'move_tab',
    description: '将标签页移动到指定位置（位置从 1 开始）',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      index: { type: 'number', description: '目标位置（1-based）' },
      fromTabId: { type: 'number', optional: true, description: '源标签 ID' },
    },
    swIntent: 'tabs_move',
  },
  {
    intent: 'close_tabs_by_domain',
    description: '关闭当前窗口指定域名的所有标签页',
    dangerous: true,
    aiHidden: true,
    requiresPrecompute: true,
    slots: { domain: { type: 'string', description: '域名' } },
    swIntent: 'tabs_remove',
  },
  {
    intent: 'mute_tabs_by_domain',
    description: '静音当前窗口指定域名的所有标签页',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: { domain: { type: 'string', description: '域名' } },
    swIntent: 'tabs_update',
  },
  {
    intent: 'unmute_tabs_by_domain',
    description: '取消静音当前窗口指定域名的所有标签页',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: { domain: { type: 'string', description: '域名' } },
    swIntent: 'tabs_update',
  },
  {
    intent: 'discard_tabs',
    description: '休眠当前窗口的非活动标签页',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      domain: { type: 'string', optional: true, description: '域名' },
      all: { type: 'boolean', optional: true, description: '是否处理全部非活动标签页' },
    },
    swIntent: 'tabs_update',
  },
  {
    intent: 'find_tab',
    description: '根据关键词查找标签页并聚焦',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      query: { type: 'string', description: '搜索关键词' },
      tabId: { type: 'number', optional: true, description: '预计算的 tabId（来自 precompute）' },
      active: { type: 'boolean', optional: true, description: '是否激活' },
    },
    swIntent: 'tabs_update',
  },
  {
    intent: 'close_duplicate_tabs',
    description: '关闭 URL 重复的标签页',
    dangerous: true,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {
      url: { type: 'string', optional: true, description: '仅去重指定 URL' },
      tabIds: { type: 'number[]', optional: true, description: '预勾选的 tabIds（来自确认卡）' },
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
      query: { type: 'string', optional: true, description: 'URL 子串或关键词（匹配 url/title）' },
      tabIds: { type: 'number[]', optional: true, description: '预勾选的 tabIds（来自确认卡）' },
    },
    swIntent: 'tabs_remove_by_url',
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
    intent: 'duplicate_tab',
    description: '复制当前标签页',
    dangerous: false,
    aiHidden: true,
    requiresPrecompute: true,
    slots: {},
    swIntent: 'tabs_create',
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
    description: '搜索浏览历史（默认展示今天全部；带 query 按关键词过滤）',
    dangerous: false,
    aiHidden: true,
    slots: {
      query: { type: 'string', optional: true, description: '搜索关键词；缺省时不过滤' },
      timeRange: {
        type: 'string',
        optional: true,
        description: 'today（默认） | yesterday | week | month | all',
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
    description: '清除指定域名的 Cookie（无参则取当前页面域名）',
    dangerous: true,
    aiHidden: true,
    slots: {
      domain: {
        type: 'string',
        optional: true,
        description: '域名；缺省时取当前活动标签的域名',
      },
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
      selectedIds: {
        type: 'string[]',
        optional: true,
        description: '从确认卡勾选后回传的书签 ID 列表',
      },
    },
    swIntent: 'bookmarks_remove_node',
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
