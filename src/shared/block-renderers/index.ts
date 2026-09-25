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
import HistoryTable from '../../components/blocks/HistoryTable.vue'
import DataTable, { type DataTableColumn } from '../../components/blocks/DataTable.vue'
import { newBlockId } from '../../composables/useMarkdown'
import { i18n } from '../../locales'

interface HistoryItem {
  title?: string
  url: string
  lastVisitTime?: number
  visitCount?: number
}

/**
 * 罐头文案取词入口（非组件模块）：走 i18n 全局 composer，语言切换即时生效
 * @param key 词条 key
 * @param params 插值参数（可选）
 * @returns 当前语言的文案；词条缺失时由 fallbackLocale（en）兜底
 */
function t(key: string, params?: Record<string, unknown>): string {
  return params ? i18n.global.t(key, params) : i18n.global.t(key)
}

/**
 * /history 命令反馈：开篇 markdown + HistoryTable 组件 + markdown 表格兜底
 *
 * 第一次渲染：HistoryTable 富组件（hover/点击新窗口打开）
 * 持久化后：B1 路径下组件按 tagName 反查注册表，仍渲染富组件
 * 极端兜底：组件缺失时 markdown 表格仍可读
 */
function historyMarkdownBody(r: ExecutionResult): MessageBody {
  const items = ((r as Record<string, unknown>).items ?? []) as HistoryItem[]
  const timeRange = (r as Record<string, unknown>).timeRange as
    { label?: string; start?: number; end?: number } | undefined
  const count = (r.found as number | undefined) ?? items.length
  const label = timeRange?.label || t('factory.today')
  if (count === 0) {
    return { markdown: t('factory.historyEmpty') }
  }
  const id = newBlockId('hi')
  return {
    markdown:
      t('factory.historyHeader', { count, range: label }) +
      `\n\n<history-table data-id="${id}" />` +
      t('factory.historyTail'),
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
    return { markdown: `${header}${opts.empty ?? t('blocks.noData')}` }
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
    { key: 'name', title: t('factory.colName'), ellipsis: 24 },
    { key: 'value', title: t('factory.colValue'), ellipsis: 24 },
    { key: 'domain', title: t('factory.colDomain'), ellipsis: 24 },
    { key: 'path', title: t('factory.colPath'), width: 80 },
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
    title: t('factory.cookieTitle', { domain: domain || '?', count: cookies.length }),
    columns,
    rows: cookies,
    empty: t('factory.cookieEmpty', { domain }),
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
    { key: 'name', title: t('factory.colName'), ellipsis: 32 },
    { key: 'id', title: 'ID', ellipsis: 36 },
    { key: 'version', title: t('factory.colVersion'), width: 80 },
  ]
  return dataTableBody({
    title: t('factory.extTitle', { count: list.length }),
    columns,
    rows: list,
    empty: t('factory.extEmpty'),
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
    { key: 'title', title: t('blocks.colTitle'), ellipsis: 32 },
    { key: 'url', title: 'URL', ellipsis: 48 },
  ]
  return dataTableBody({
    title: t('factory.topSitesTitle', { count: rows.length }),
    columns,
    rows,
    empty: t('factory.topSitesEmpty'),
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
    { key: 'label', title: t('factory.colPermission'), width: 120 },
    {
      key: 'value',
      title: t('factory.colSetting'),
      width: 100,
      format: (row: Record<string, unknown>) => {
        const v = String(row.value || 'default')
        return v === 'allow'
          ? t('factory.permAllow')
          : v === 'block'
            ? t('factory.permBlock')
            : t('factory.permDefault')
      },
    },
    { key: 'key', title: t('factory.colIdentifier'), ellipsis: 24 },
  ]
  return dataTableBody({
    title: t('factory.sitePermsTitle', { domain: domain || '?', count: entries.length }),
    columns,
    rows: entries,
    empty: t('factory.sitePermsEmpty', { domain }),
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
      title: t('factory.storageSingleTitle', { key: rAny.key }),
      columns: [
        { key: 'key', title: t('factory.colKey'), width: 120 },
        { key: 'value', title: t('factory.colValue'), ellipsis: 60 },
      ],
      rows: [{ key: rAny.key, value: display }],
      empty: t('factory.valueEmpty'),
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
    title: t('factory.storageAllTitle', { count: rows.length }),
    columns: [
      { key: 'key', title: t('factory.colKey'), ellipsis: 32 },
      { key: 'value', title: t('factory.colValue'), ellipsis: 48 },
    ],
    rows,
    empty: t('factory.storageEmpty'),
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
    { key: 'title', title: t('blocks.colTitle'), ellipsis: 36 },
    { key: 'url', title: 'URL', ellipsis: 48 },
  ]
  return dataTableBody({
    title: t('factory.searchTitle', { count: tabs.length }),
    columns,
    rows: tabs as unknown as Record<string, unknown>[],
    empty: t('factory.searchEmpty'),
  })
}

/**
 * /list-groups 命令反馈：DataTable 表格
 *  - 数据来自 SW observeGroups 的 groups[]（id / color / title / windowId / tabs[]）
 *  - tabs[] 现含 id+title+url，展示标签数 + 首个标签 URL 摘要，便于识别分组内容
 */
function tabGroupsMarkdownBody(r: ExecutionResult): MessageBody {
  const groups = ((r as Record<string, unknown>).groups ?? []) as Array<Record<string, unknown>>
  const rows = groups.map((g) => {
    const tabs = Array.isArray(g.tabs) ? (g.tabs as Array<Record<string, unknown>>) : []
    // 取首个标签的 url 摘要做识别线索（无标题分组也能看出归属域名）
    const firstUrl = tabs[0]?.url as string | undefined
    return {
      id: g.id,
      color: g.color || 'grey',
      title: g.title || t('factory.groupFallback', { id: g.id }),
      tabs: tabs.length,
      sample: firstUrl || '',
    }
  })
  const columns: DataTableColumn[] = [
    { key: 'id', title: t('factory.colGroupId'), width: 80 },
    { key: 'title', title: t('blocks.colTitle'), ellipsis: 32 },
    { key: 'tabs', title: t('factory.colTabsCount'), width: 70 },
    { key: 'color', title: t('factory.colColor'), width: 70 },
    { key: 'sample', title: t('factory.colSampleUrl'), ellipsis: 28 },
  ]
  return dataTableBody({
    title: t('factory.groupsTitle', { count: rows.length }),
    columns,
    rows,
    empty: t('factory.groupsEmpty'),
  })
}

/**
 * /bookmarks 观察命令反馈：DataTable 表格
 *  - 数据来自 SW observeBookmarks 的 nodes[]（id / title / type / url / path / childCount）
 *  - 文件夹 / 书签用 type 列区分；id 列让用户/AI 对齐可见节点 id（移动/删除时需要）
 */
function bookmarksMarkdownBody(r: ExecutionResult): MessageBody {
  const nodes = ((r as Record<string, unknown>).nodes ?? []) as Array<Record<string, unknown>>
  const rows = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title || '',
    url: n.url || '',
    path: n.path || '',
    childCount: n.childCount || 0,
  }))
  const columns: DataTableColumn[] = [
    { key: 'id', title: 'ID', width: 64 },
    {
      key: 'type',
      title: t('factory.colType'),
      width: 56,
      format: (row: Record<string, unknown>) =>
        row.type === 'folder' ? t('step.folder') : t('step.bookmark'),
    },
    { key: 'title', title: t('blocks.colTitle'), ellipsis: 32 },
    { key: 'url', title: 'URL', ellipsis: 40 },
    { key: 'path', title: t('factory.colPath'), ellipsis: 24 },
    { key: 'childCount', title: t('factory.colChildCount'), width: 56 },
  ]
  return dataTableBody({
    title: t('factory.bookmarksTitle', { count: rows.length }),
    columns,
    rows,
    empty: t('factory.bookmarksEmpty'),
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
    { key: 'id', title: t('factory.colWindowId'), width: 80 },
    {
      key: 'focused',
      title: t('factory.colFocused'),
      width: 56,
      format: (row: Record<string, unknown>) => (row.focused ? '✓' : ''),
    },
    { key: 'type', title: t('factory.colType'), width: 80 },
    {
      key: 'incognito',
      title: t('factory.colIncognito'),
      width: 56,
      format: (row: Record<string, unknown>) => (row.incognito ? '✓' : ''),
    },
    { key: 'state', title: t('factory.colState'), width: 80 },
  ]
  return dataTableBody({
    title: t('factory.windowsTitle', { count: rows.length }),
    columns,
    rows,
    empty: t('factory.windowsEmpty'),
  })
}

/**
 * tabs_observe / 通用 tabs 列表反馈：开篇 + TabList 组件
 */
function tabsListMarkdownBody(r: ExecutionResult): MessageBody {
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
    markdown: t('factory.tabsHeader', { count }) + `\n\n<tab-list data-id="${id}" />`,
    components: [{ id, component: TabList, props: { tabs, variant: 'open-list' } }],
  }
}

/**
 * /downloads-search 命令反馈：DataTable 表格
 *  - 数据来自 SW searchDownloads 的 downloads[]（id/filename/url/state/totalBytes/startTime）
 *  - state 做本地化映射，totalBytes 转 KB/MB 可读单位
 */
function downloadsMarkdownBody(r: ExecutionResult): MessageBody {
  const downloads = ((r as Record<string, unknown>).downloads ?? []) as Array<
    Record<string, unknown>
  >
  const columns: DataTableColumn[] = [
    { key: 'filename', title: t('factory.colFilename'), ellipsis: 40 },
    { key: 'state', title: t('factory.colState'), width: 90, format: formatDownloadState },
    { key: 'totalBytes', title: t('factory.colSize'), width: 80, format: formatDownloadBytes },
    { key: 'url', title: t('factory.colSource'), ellipsis: 36 },
  ]
  return dataTableBody({
    title: t('factory.downloadsTitle', { count: downloads.length }),
    columns,
    rows: downloads,
    empty: t('factory.downloadsEmpty'),
  })
}

/**
 * 下载状态本地化映射
 * @param row - 下载记录行（含 state 字段）
 * @returns 当前语言的状态文案；未知状态原样返回
 */
function formatDownloadState(row: Record<string, unknown>): string {
  const s = String(row.state || '')
  if (s === 'in_progress') return t('factory.stateInProgress')
  if (s === 'complete') return t('factory.stateComplete')
  if (s === 'interrupted') return t('factory.stateInterrupted')
  return s
}

/**
 * 字节数转可读单位（KB/MB）
 * @param row - 下载记录行（含 totalBytes 字段）
 * @returns 可读的大小字符串；无有效字节数时返回 "-"
 */
function formatDownloadBytes(row: Record<string, unknown>): string {
  const bytes = Number(row.totalBytes) || 0
  if (bytes <= 0) return '-'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/**
 * 命令反馈工厂表
 * key = SW intent 名
 */
type FactoryFn = (r: ExecutionResult) => MessageBody

const markdownFactories: Record<string, FactoryFn> = {
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
  downloads_search: downloadsMarkdownBody,
}

/**
 * 按 intent 查找并调用对应的 markdown 工厂
 * @param intent - SW intent 名
 * @param result - 命令执行结果
 * @returns MessageBody；未注册的 intent 返回 null（调用方走纯 markdown 兜底）
 */
export function buildMarkdownBody(intent: string, result: ExecutionResult): MessageBody | null {
  const fn = markdownFactories[intent]
  return fn ? fn(result) : null
}
