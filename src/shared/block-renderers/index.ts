/**
 * 命令反馈 Markdown 工厂
 *
 * 把命令结果（ExecutionResult）转成 MessageBody：
 *   - 命令有对应的 markdownFactory → 生成带占位符的 markdown + components
 *   - 没注册的 → 走 fallback（纯 markdown 文本）
 *
 * 与 useAIEngine.ts 的 renderExecutionResult 是替代关系——
 * 每个命令调用对应的 xxxMarkdownBody() 即可。
 */

import type { MessageBody } from '../../types/message-block'
import type { ExecutionResult } from '../../types/execution'
import TabList from '../../components/blocks/TabList.vue'
import ActionButtonGroup from '../../components/blocks/ActionButtonGroup.vue'
import HistoryTable from '../../components/blocks/HistoryTable.vue'
import DataTable, { type DataTableColumn } from '../../components/blocks/DataTable.vue'
import { newBlockId } from '../../composables/useMarkdown'

interface HistoryItem {
  title?: string
  url: string
  lastVisitTime?: number
  visitCount?: number
}

/**
 * /history 命令反馈：开篇 markdown + HistoryTable 组件 + markdown 表格兜底
 *
 * 第一次渲染：HistoryTable 富组件（hover/点击新窗口打开）
 * 持久化后：B1 路径下组件按 tagName 反查注册表，仍渲染富组件
 * 极端兜底：组件缺失时 markdown 表格仍可读
 */
export function historyMarkdownBody(r: ExecutionResult): MessageBody {
  const items = ((r as Record<string, unknown>).items ?? []) as HistoryItem[]
  const timeRange = (r as Record<string, unknown>).timeRange as
    { label?: string; start?: number; end?: number } | undefined
  const count = (r.found as number | undefined) ?? items.length
  const label = timeRange?.label || '今天'
  if (count === 0) {
    return { markdown: `今天还没有浏览记录呢~` }
  }
  const id = newBlockId('hi')
  return {
    markdown: `为你找到 **${count}** 条**${label}**的浏览记录：\n\n<history-table data-id="${id}" />\n\n如需进一步筛选，请用 \`/history [关键词]\`。`,
    components: [
      {
        id,
        component: HistoryTable,
        props: { items, timeRange: timeRange ? { label } : undefined },
      },
    ],
  }
}

/**
 * 通用表格工厂：把 columns + rows 包成 data-table 组件
 * rows 为空时直接走 markdown "暂无数据"（不挂占位符）
 */
function dataTableBody(opts: {
  title?: string
  columns: DataTableColumn[]
  rows: Record<string, unknown>[]
  empty?: string
}): MessageBody {
  if (opts.rows.length === 0) {
    const header = opts.title ? `**${opts.title}**\n\n` : ''
    return { markdown: `${header}${opts.empty ?? '暂无数据'}` }
  }
  const id = newBlockId('dt')
  const header = opts.title ? `**${opts.title}**\n\n` : ''
  return {
    markdown: `${header}<data-table data-id="${id}" />`,
    components: [{ id, component: DataTable, props: { columns: opts.columns, rows: opts.rows } }],
  }
}

/**
 * /cookies 命令反馈：DataTable 表格
 */
function cookiesMarkdownBody(r: ExecutionResult): MessageBody {
  const cookies = ((r as Record<string, unknown>).cookies ?? []) as Array<Record<string, unknown>>
  const domain = ((r as Record<string, unknown>).domain as string | undefined) ?? ''
  const columns: DataTableColumn[] = [
    { key: 'name', title: '名称', ellipsis: 24 },
    { key: 'value', title: '值', ellipsis: 24 },
    { key: 'domain', title: '域名', ellipsis: 24 },
    { key: 'path', title: '路径', width: 80 },
    { key: 'sameSite', title: 'SameSite', width: 80 },
    {
      key: 'secure',
      title: 'Secure',
      width: 56,
      format: (row: Record<string, unknown>) => (row.secure ? '✓' : ''),
    },
    {
      key: 'httpOnly',
      title: 'HttpOnly',
      width: 70,
      format: (row: Record<string, unknown>) => (row.httpOnly ? '✓' : ''),
    },
  ]
  return dataTableBody({
    title: `Cookie 列表（域名 ${domain || '?'}，共 ${cookies.length}）`,
    columns,
    rows: cookies,
    empty: `${domain} 下暂无 Cookie`,
  })
}

/**
 * /extensions 命令反馈：DataTable 表格
 */
function extensionsMarkdownBody(r: ExecutionResult): MessageBody {
  const list = ((r as Record<string, unknown>).extensions ?? []) as Array<Record<string, unknown>>
  const columns: DataTableColumn[] = [
    {
      key: 'enabled',
      title: '',
      width: 40,
      format: (row: Record<string, unknown>) => (row.enabled ? '✓' : '✗'),
    },
    { key: 'name', title: '名称', ellipsis: 32 },
    { key: 'id', title: 'ID', ellipsis: 36 },
    { key: 'version', title: '版本', width: 80 },
  ]
  return dataTableBody({
    title: `已安装扩展（${list.length}）`,
    columns,
    rows: list,
    empty: '未安装扩展',
  })
}

/**
 * /top-sites 命令反馈：DataTable 表格
 *  - chrome.topSites.get() 返回 { title, url }[]
 *  - 顺序由 Chrome 维护（访问频次/最近访问混合排序），原样展示
 */
function topSitesMarkdownBody(r: ExecutionResult): MessageBody {
  const sites = ((r as Record<string, unknown>).sites ?? []) as Array<Record<string, unknown>>
  const rows = sites.map((s) => ({
    title: s.title || '',
    url: s.url || '',
  }))
  const columns: DataTableColumn[] = [
    { key: 'title', title: '标题', ellipsis: 32 },
    { key: 'url', title: 'URL', ellipsis: 48 },
  ]
  return dataTableBody({
    title: `最常访问网站（${rows.length}）`,
    columns,
    rows,
    empty: '暂无最常访问网站',
  })
}

/**
 * /site-perms 命令反馈：DataTable 表格
 *  - 数据来自 SW observePermissions 的 permissions[]（key / label / value）
 *  - domain 单独渲染到标题里
 */
function sitePermsMarkdownBody(r: ExecutionResult): MessageBody {
  const entries = ((r as Record<string, unknown>).permissions ?? []) as Array<
    Record<string, unknown>
  >
  const domain = ((r as Record<string, unknown>).domain as string | undefined) ?? ''
  const columns: DataTableColumn[] = [
    { key: 'label', title: '权限', width: 120 },
    {
      key: 'value',
      title: '设置',
      width: 100,
      format: (row: Record<string, unknown>) => {
        const v = String(row.value || 'default')
        return v === 'allow' ? '允许' : v === 'block' ? '阻止' : '默认'
      },
    },
    { key: 'key', title: '标识', ellipsis: 24 },
  ]
  return dataTableBody({
    title: `网站权限（${domain || '?'}，${entries.length} 项）`,
    columns,
    rows: entries,
    empty: `${domain} 下无可观察的权限项`,
  })
}

/**
 * /storage-get 命令反馈：DataTable 表格
 *  - 带 key：单行表格（Key / Value）
 *  - 无 key：多行表格（每个存储项一行）
 */
function storageGetMarkdownBody(r: ExecutionResult): MessageBody {
  const rAny = r as Record<string, unknown>
  const value = rAny.value
  if (typeof rAny.key === 'string' && rAny.key) {
    // 单 key：单行展示
    const display =
      value === null || value === undefined
        ? ''
        : typeof value === 'string'
          ? value
          : JSON.stringify(value)
    return dataTableBody({
      title: `存储 ${rAny.key}`,
      columns: [
        { key: 'key', title: '键', width: 120 },
        { key: 'value', title: '值', ellipsis: 60 },
      ],
      rows: [{ key: rAny.key, value: display }],
      empty: '值为空',
    })
  }
  // 全量：多行表格
  const obj =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const rows = Object.entries(obj).map(([k, v]) => ({
    key: k,
    value: typeof v === 'string' ? v : JSON.stringify(v),
  }))
  return dataTableBody({
    title: `扩展存储全部键值（${rows.length} 项）`,
    columns: [
      { key: 'key', title: '键', ellipsis: 32 },
      { key: 'value', title: '值', ellipsis: 48 },
    ],
    rows,
    empty: '扩展存储为空',
  })
}

/**
 * /find /search-history 等关键词搜索标签反馈：DataTable 表格
 *  - /find、/history 关键词搜索会过滤 tabs，输出匹配项
 *  - 同一份 tabs 字段，列定义针对"搜索结果"定制：高亮 title / 短 URL
 */
function tabsSearchMarkdownBody(r: ExecutionResult): MessageBody {
  const tabs = ((r as Record<string, unknown>).tabs ?? []) as Array<{
    id?: number
    title?: string
    url: string
    active?: boolean
    pinned?: boolean
  }>
  const columns: DataTableColumn[] = [
    { key: 'title', title: '标题', ellipsis: 36 },
    { key: 'url', title: 'URL', ellipsis: 48 },
  ]
  return dataTableBody({
    title: `搜索结果（${tabs.length} 个匹配标签）`,
    columns,
    rows: tabs as unknown as Record<string, unknown>[],
    empty: '没有匹配的标签',
  })
}

/**
 * /list-groups 命令反馈：DataTable 表格
 *  - 数据来自 SW observeGroups 的 groups[]（id / color / title / tabs[]）
 *  - tabs[] 折叠显示数量
 */
function tabGroupsMarkdownBody(r: ExecutionResult): MessageBody {
  const groups = ((r as Record<string, unknown>).groups ?? []) as Array<Record<string, unknown>>
  const rows = groups.map((g) => {
    const tabs = Array.isArray(g.tabs) ? (g.tabs as unknown[]).length : 0
    return {
      id: g.id,
      color: g.color || 'grey',
      title: g.title || `分组 ${g.id}`,
      tabs,
    }
  })
  const columns: DataTableColumn[] = [
    { key: 'id', title: '分组 ID', width: 80 },
    { key: 'title', title: '标题', ellipsis: 32 },
    { key: 'tabs', title: '标签数', width: 70 },
    { key: 'color', title: '颜色', width: 70 },
  ]
  return dataTableBody({
    title: `当前窗口标签分组（${rows.length}）`,
    columns,
    rows,
    empty: '当前窗口没有标签分组',
  })
}

/**
 * /bookmarks 观察命令反馈：DataTable 表格
 *  - 数据来自 SW observeBookmarks 的 nodes[]（id / title / type / url / path / childCount）
 *  - 文件夹 / 书签用 type 列区分
 */
function bookmarksMarkdownBody(r: ExecutionResult): MessageBody {
  const nodes = ((r as Record<string, unknown>).nodes ?? []) as Array<Record<string, unknown>>
  const rows = nodes.map((n) => ({
    type: n.type,
    title: n.title || '',
    url: n.url || '',
    path: n.path || '',
    childCount: n.childCount || 0,
  }))
  const columns: DataTableColumn[] = [
    {
      key: 'type',
      title: '类型',
      width: 56,
      format: (row: Record<string, unknown>) => (row.type === 'folder' ? '文件夹' : '书签'),
    },
    { key: 'title', title: '标题', ellipsis: 32 },
    { key: 'url', title: 'URL', ellipsis: 40 },
    { key: 'path', title: '路径', ellipsis: 24 },
    { key: 'childCount', title: '子项', width: 56 },
  ]
  return dataTableBody({
    title: `书签节点（${rows.length}）`,
    columns,
    rows,
    empty: '未匹配到书签节点',
  })
}

/**
 * /windows 观察命令反馈：DataTable 表格
 *  - 数据来自 SW observeWindows 的 windows[]（id / focused / type / incognito / state）
 */
function windowsMarkdownBody(r: ExecutionResult): MessageBody {
  const wins = ((r as Record<string, unknown>).windows ?? []) as Array<Record<string, unknown>>
  const rows = wins.map((w) => ({
    id: w.id,
    focused: w.focused,
    type: w.type,
    incognito: w.incognito,
    state: w.state,
  }))
  const columns: DataTableColumn[] = [
    { key: 'id', title: '窗口 ID', width: 80 },
    {
      key: 'focused',
      title: '聚焦',
      width: 56,
      format: (row: Record<string, unknown>) => (row.focused ? '✓' : ''),
    },
    { key: 'type', title: '类型', width: 80 },
    {
      key: 'incognito',
      title: '隐身',
      width: 56,
      format: (row: Record<string, unknown>) => (row.incognito ? '✓' : ''),
    },
    { key: 'state', title: '状态', width: 80 },
  ]
  return dataTableBody({
    title: `窗口（${rows.length}）`,
    columns,
    rows,
    empty: '未找到窗口',
  })
}

/**
 * tabs_observe / 通用 tabs 列表反馈：开篇 + TabList 组件
 */
export function tabsListMarkdownBody(r: ExecutionResult): MessageBody {
  const tabs = ((r as Record<string, unknown>).tabs ?? []) as Array<{
    id?: number
    title?: string
    url: string
    active?: boolean
    pinned?: boolean
  }>
  const id = newBlockId('tabs')
  const count = (r.observed as number | undefined) ?? tabs.length
  return {
    markdown: `当前有 **${count}** 个标签页：\n\n<tab-list data-id="${id}" />`,
    components: [{ id, component: TabList, props: { tabs, variant: 'open-list' } }],
  }
}

/**
 * 命令反馈工厂表
 * key = SW intent 名
 */
type FactoryFn = (r: ExecutionResult) => MessageBody

export const markdownFactories: Record<string, FactoryFn> = {
  history_search: historyMarkdownBody,
  search_history: historyMarkdownBody,
  tabs_observe: tabsListMarkdownBody,
  find_tab: tabsSearchMarkdownBody,
  cookies_observe: cookiesMarkdownBody,
  get_cookies: cookiesMarkdownBody,
  extensions_observe: extensionsMarkdownBody,
  list_extensions: extensionsMarkdownBody,
  top_sites_observe: topSitesMarkdownBody,
  get_top_sites: topSitesMarkdownBody,
  permissions_observe: sitePermsMarkdownBody,
  get_site_permissions: sitePermsMarkdownBody,
  tabs_observe_groups: tabGroupsMarkdownBody,
  list_groups: tabGroupsMarkdownBody,
  bookmarks_observe_tree: bookmarksMarkdownBody,
  windows_observe: windowsMarkdownBody,
  storage_get: storageGetMarkdownBody,
}

export function buildMarkdownBody(intent: string, result: ExecutionResult): MessageBody | null {
  const fn = markdownFactories[intent]
  return fn ? fn(result) : null
}

/**
 * 命令执行失败的统一反馈（Markdown）
 */
export function errorMarkdownBody(result: ExecutionResult): MessageBody {
  const message = result.message || '操作失败'
  const suggestion = result.suggestion ? `（${result.suggestion}）` : ''
  return { markdown: `抱歉，操作 "${message}" 失败喵${suggestion ? ' ' + suggestion : ''}` }
}

/**
 * 用于操作的简单按钮组工厂：失败时给"重试"
 */
export function retryActionButton(retryIntent: string) {
  const id = newBlockId('act')
  return {
    markdown: `\n\n<action-group data-id="${id}" />`,
    components: [
      {
        id,
        component: ActionButtonGroup,
        props: { buttons: [{ label: '重试', intent: retryIntent }] },
      },
    ],
  }
}
