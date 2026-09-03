/**
 * 单步命令结果渲染器 — 中立工具
 *
 * 之前散落在 useAIEngine.ts：renderExecutionResult + formatResultDescription。
 * 改造后两边（slash / plan）共用此模块，通过回调注入 addAIChat / addSystem / showScreenshot，
 * 不再依赖具体的 composable 实例。
 *
 * 渲染规则：
 *   - 失败（success=false + code） → 错误提示文案
 *   - clientExec 路径（tabs_group_by_domain / tabs_ungroup_all）→ 前端执行 chrome.tabs.group / ungroup
 *   - 截图 → addAIChat + showScreenshot
 *   - 已有 markdownFactory → 富组件气泡（buildMarkdownBody）
 *   - 兜底 → formatResultDescription
 */

import { wrapCatReply } from './personality'
import { buildMarkdownBody } from './block-renderers'
import type { ExecutionResult, MessageBody } from '../types'

/** 渲染器依赖：由调用方注入，避免本模块反向依赖 composable / messageStore */
export interface RenderResultDeps {
  /** 写入 ai-chat 通道（用户面向） */
  addAIChat: (text: string | MessageBody) => void
  /** 写入 system 通道（异常兜底用，目前仅调试保留） */
  addSystem?: (text: string) => void
  /** 截图 dataUrl 渲染：默认 addAIChat + 占位文本，调用方可在 deps 里覆盖 */
  showScreenshot?: (dataUrl: string, tabTitle?: string) => void
}

/**
 * 渲染单步命令执行结果
 * @param intent - userIntent（commands.ts 中的 intent 名，非 swIntent）
 * @param response - SW 返回的 ExecutionResult
 * @param slots - 原始入参（intent 为 pin_tab / duplicate_tab 等需要回读 tab 字段时使用）
 * @param deps - 渲染依赖（消息写入、截图展示等）
 */
export async function renderExecutionResult(
  intent: string,
  response: unknown,
  _slots: Record<string, unknown> | undefined,
  deps: RenderResultDeps
): Promise<void> {
  const result = response as ExecutionResult
  if (result.success === false && result.code) {
    const message = result.message || '失败'
    const suggestion = result.suggestion ? `（${result.suggestion}）` : ''
    deps.addAIChat(
      wrapCatReply(`抱歉，操作 "${message}" 失败喵${suggestion ? ' ' + suggestion : ''}`)
    )
    return
  }
  if (result.error) {
    deps.addAIChat(wrapCatReply('抱歉，操作失败了喵~'))
    return
  }

  const r = result as Record<string, unknown>

  if (r.clientExec === 'tabs_group_by_domain' && Array.isArray(r.groups)) {
    await runClientExecTabsGroupByDomain(
      r.groups as Array<{ title: string; tabIds: number[]; windowId: number }>,
      deps
    )
    return
  }

  if (r.clientExec === 'tabs_ungroup_all' && Array.isArray(r.groups)) {
    await runClientExecTabsUngroupAll(
      r.groups as Array<{ groupId: number; tabIds: number[] }>,
      deps
    )
    return
  }

  if (r.screenshot && typeof r.screenshot === 'string') {
    deps.showScreenshot?.(r.screenshot, r.tabTitle as string | undefined) ??
      defaultShowScreenshot(r.screenshot, r.tabTitle as string | undefined, deps)
    return
  }
  if (r.stopped) {
    return
  }

  if (intent === 'find_tab') {
    const tabs = (r.tabs as Array<{ id?: number; title?: string; url?: string }> | undefined) ?? []
    const body = buildMarkdownBody(intent, { success: true, tabs } as ExecutionResult)
    deps.addAIChat(body ?? { markdown: wrapCatReply(`找到 ${tabs.length} 个匹配的标签`) })
    return
  }

  if (intent === 'reopen_closed_tab') {
    const restored = r.restored as number | undefined
    if (restored && restored > 0) {
      deps.addAIChat({ markdown: wrapCatReply('已恢复最近关闭的标签') })
    } else {
      deps.addAIChat({ markdown: wrapCatReply('没有找到可恢复的标签') })
    }
    return
  }

  if (intent === 'pin_tab') {
    const pinned = (r.tab as { pinned?: boolean } | undefined)?.pinned
    deps.addAIChat({ markdown: wrapCatReply(pinned ? '已固定标签' : '已取消固定') })
    return
  }
  if (intent === 'duplicate_tab') {
    const title = (r.tab as { title?: string } | undefined)?.title
    const url = (r.tab as { url?: string } | undefined)?.url
    const label = title || url
    deps.addAIChat({
      markdown: wrapCatReply(label ? `已复制标签：${label}` : '已复制当前标签'),
    })
    return
  }
  if (intent === 'tabs_create') {
    const title = (r.tab as { title?: string } | undefined)?.title
    const url = (r.tab as { url?: string } | undefined)?.url
    const label = title || url
    deps.addAIChat({
      markdown: wrapCatReply(label ? `已创建标签：${label}` : '已创建标签'),
    })
    return
  }
  if (intent === 'add_bookmark') {
    const bm = r.bookmark as { title?: string; url?: string } | undefined
    const label = bm?.title || bm?.url
    deps.addAIChat({
      markdown: wrapCatReply(label ? `已添加书签：${label}` : '已添加书签'),
    })
    return
  }
  if (intent === 'clear_cookies') {
    const removed = r.removed as number | undefined
    if (removed !== undefined) {
      if (removed > 0) {
        deps.addAIChat({
          markdown: wrapCatReply(`已清除 ${r.domain || ''} 的 ${removed} 个 Cookie`),
        })
      } else {
        deps.addAIChat({
          markdown: wrapCatReply(`当前没有 ${r.domain || ''} 的 Cookie 可清除`),
        })
      }
    } else {
      deps.addAIChat({ markdown: wrapCatReply('已清除 Cookie') })
    }
    return
  }
  if (intent === 'delete_history') {
    // deletedAll: true 表示删除了所有历史
    if ((r as Record<string, unknown>).deletedAll === true) {
      deps.addAIChat({ markdown: wrapCatReply('已删除全部历史记录') })
      return
    }
    const deleted = r.deleted as number | undefined
    if (deleted !== undefined) {
      deps.addAIChat({ markdown: wrapCatReply(`已删除 ${deleted} 条历史记录`) })
    } else {
      deps.addAIChat({ markdown: wrapCatReply('已删除历史记录') })
    }
    return
  }
  if (intent === 'remove_bookmark') {
    const node = r.removedNode as { title?: string; url?: string; children?: unknown[] } | undefined
    const label = node?.title || node?.url
    const removed = typeof r.removed === 'number' ? r.removed : 1
    const isFolder = node && !node.url && Array.isArray(node?.children)
    deps.addAIChat({
      markdown: wrapCatReply(
        label && isFolder && removed > 1
          ? `已删除文件夹：${label}（含 ${removed} 项）`
          : label
            ? `已删除书签：${label}`
            : `已删除 ${removed} 个书签`
      ),
    })
    return
  }
  if (intent === 'set_theme' || intent === 'theme_update') {
    const tr = r as Record<string, unknown>
    const mode = tr.themeMode as string | undefined
    const color = tr.themeColor as string | undefined
    if (color) {
      deps.addAIChat({ markdown: wrapCatReply(`已设置主题颜色：${color}`) })
    } else if (mode) {
      const label: Record<string, string> = { light: '浅色', dark: '深色', device: '跟随设备' }
      deps.addAIChat({
        markdown: wrapCatReply(`已设置主题模式：${label[mode] || mode}`),
      })
    } else {
      deps.addAIChat({ markdown: wrapCatReply('已设置主题') })
    }
    return
  }
  if (intent === 'enable_extension' || intent === 'disable_extension') {
    const enabled = (r as Record<string, unknown>).enabled
    const disabled = (r as Record<string, unknown>).disabled
    if (typeof enabled === 'string') {
      deps.addAIChat({ markdown: wrapCatReply(`已启用扩展 *${enabled}*`) })
    } else if (typeof disabled === 'string') {
      deps.addAIChat({ markdown: wrapCatReply(`已禁用扩展 *${disabled}*`) })
    } else {
      deps.addAIChat({
        markdown: wrapCatReply(intent === 'enable_extension' ? '已启用扩展' : '已禁用扩展'),
      })
    }
    return
  }
  if (intent === 'uninstall_extension') {
    deps.addAIChat({ markdown: wrapCatReply('已卸载扩展') })
    return
  }
  if (intent === 'tabs_remove' || intent === 'close_tabs_by_domain') {
    const removed = typeof r.removed === 'number' ? r.removed : 0
    const target = (_slots as { domain?: string } | undefined)?.domain
    if (removed > 0) {
      const label = target ? `当前窗口 ${target} 的 ${removed} 个标签` : `${removed} 个标签`
      deps.addAIChat({ markdown: wrapCatReply(`已关闭${label}`) })
    } else {
      deps.addAIChat({
        markdown: wrapCatReply(target ? `当前窗口没有匹配的 ${target} 标签` : '没有可关闭的标签'),
      })
    }
    return
  }

  const body = buildMarkdownBody(intent, result)
  deps.addAIChat(body ?? { markdown: wrapCatReply(formatResultDescription(r) || '操作完成') })
}

/**
 * 渲染缺省实现：当 deps.showScreenshot 未提供时，回退到 ai-chat 占位提示
 */
function defaultShowScreenshot(
  dataUrl: string,
  tabTitle: string | undefined,
  deps: RenderResultDeps
): void {
  deps.addAIChat(wrapCatReply(`[截图: ${tabTitle || '页面'}]`))
  // 注：截图复制到剪贴板的能力由 slash runner 自行实现（需要写副作用）
  // 此处只兜底输出气泡，避免静默丢失 dataUrl；调用方（slash runner）的 showScreenshot
  // 会负责把 dataUrl 注入到 MessageLog.image 字段。
  // eslint-disable-next-line no-console
  console.warn(
    '[render-result] showScreenshot 未注入，截图 dataUrl 已写入 ai-chat 气泡（未持久化到 image 字段）'
  )
  void dataUrl
}

/**
 * clientExec: 按域名分组 — MV3 SW 不在用户激活上下文，
 * chrome.tabs.group / ungroup 在 SW 中会被静默挂起，所以由 side panel 直接调 API。
 */
async function runClientExecTabsGroupByDomain(
  groups: Array<{ title: string; tabIds: number[]; windowId: number }>,
  deps: RenderResultDeps
): Promise<void> {
  let created = 0
  const failed: Array<{ title: string; reason: string }> = []
  for (const g of groups) {
    try {
      const validIds: number[] = []
      for (const id of g.tabIds) {
        try {
          await chrome.tabs.get(id)
          validIds.push(id)
        } catch {
          /* tab 已不存在 */
        }
      }
      if (validIds.length < 2) {
        failed.push({ title: g.title, reason: '有效 tab 数 < 2' })
        continue
      }
      const resultGroupId = await chrome.tabs.group({
        tabIds: validIds,
        createProperties: { windowId: g.windowId },
      })
      try {
        await chrome.tabGroups.update(resultGroupId, { title: g.title })
      } catch (e) {
        console.warn('[clientExec] 设置分组标题失败:', g.title, e)
      }
      created++
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : String(e)
      failed.push({ title: g.title, reason })
    }
  }
  if (created > 0) {
    let msg = `已创建 ${created} 个分组`
    if (failed.length > 0)
      msg += `（${failed.length} 个失败: ${failed.map((f) => `${f.title}(${f.reason})`).join(', ')}）`
    deps.addAIChat(wrapCatReply(msg))
  } else {
    deps.addAIChat(
      wrapCatReply(
        failed.length > 0
          ? `分组失败: ${failed.map((f) => `${f.title}(${f.reason})`).join('; ')}`
          : '没有需要分组的标签'
      )
    )
  }
}

/**
 * clientExec: 一键取消所有分组
 */
async function runClientExecTabsUngroupAll(
  groups: Array<{ groupId: number; tabIds: number[] }>,
  deps: RenderResultDeps
): Promise<void> {
  let cleared = 0
  const failed: Array<{ groupId: number; reason: string }> = []
  for (const g of groups) {
    try {
      const validIds: number[] = []
      for (const id of g.tabIds) {
        try {
          await chrome.tabs.get(id)
          validIds.push(id)
        } catch {
          /* tab 已不存在 */
        }
      }
      if (validIds.length === 0) {
        failed.push({ groupId: g.groupId, reason: '组内 tab 都不存在' })
        continue
      }
      await chrome.tabs.ungroup(validIds)
      cleared++
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : String(e)
      failed.push({ groupId: g.groupId, reason })
    }
  }
  if (cleared > 0) {
    let msg = `已取消 ${cleared} 个分组`
    if (failed.length > 0) msg += `（${failed.length} 个失败）`
    deps.addAIChat(wrapCatReply(msg))
  } else {
    deps.addAIChat(
      wrapCatReply(
        failed.length > 0
          ? `取消分组失败: ${failed.map((f) => f.reason).join('; ')}`
          : '当前没有任何标签分组'
      )
    )
  }
}

/**
 * 结果字段解析 → 通用描述模板
 * Markdown-factory 未覆盖时的 fallback；不依赖 DOM 脚本结果。
 */
export function formatResultDescription(r: Record<string, unknown>): string {
  if (r.code === 'NEEDS_CONFIRM') return `⚠️ ${r.message}`
  if (r.code) return `[${r.code}] ${r.message || '操作失败'}`
  if (r.error) return `失败: ${typeof r.error === 'object' ? JSON.stringify(r.error) : r.error}`
  if (r.tabs) return `列出 ${r.observed || (r.tabs as unknown[]).length} 个标签`
  if (r.tab && r.active !== undefined)
    return r.active
      ? `切换到标签 *${(r.tab as { title?: string }).title || ''}*`
      : `更新标签 *${(r.tab as { title?: string }).title || ''}*`
  if (r.tab)
    return `创建标签 *${(r.tab as { title?: string }).title || (r.tab as { url?: string }).url || ''}*`
  if (r.moved !== undefined) return `移动 ${r.moved} 个标签`
  if (r.removed !== undefined) return `关闭 ${r.removed} 个标签`
  if (r.groupedTabs) return `创建分组 *${r.title || r.groupName}* (${r.groupedTabs} 个标签)`
  if (r.groupId && !r.groupedTabs) return `更新分组 *${r.title || r.groupId}*`
  if (r.ungrouped !== undefined) return `取消 ${r.ungrouped} 个分组`
  if (r.groups) return `列出 ${(r.groups as unknown[]).length} 个标签组`
  if (r.reloaded) return '刷新标签'
  if (r.pinned !== undefined) return r.pinned ? '固定标签' : '取消固定'
  if (r.discarded !== undefined) return `休眠 ${r.discarded} 个标签`
  if (r.duplicated !== undefined) return '复制标签'
  if (r.nodes) return `观察到 ${r.observed || (r.nodes as unknown[]).length} 个书签节点`
  if (r.movedNode)
    return `移动 ${(r.movedNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.movedNode as { title: string }).title}*`
  if (r.createdNode)
    return `创建 ${(r.createdNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.createdNode as { title: string }).title}*`
  if (r.existingNode)
    return `目标已存在，复用 ${(r.existingNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.existingNode as { title: string }).title}*`
  if (r.updatedNode)
    return `更新 ${(r.updatedNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.updatedNode as { title: string }).title}*`
  if (r.openedNode) return `打开书签 *${(r.openedNode as { title: string }).title}*`
  if (r.removedNode)
    return `删除 ${(r.removedNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.removedNode as { title: string }).title}*`
  if (r.bookmark) return `添加书签 *${(r.bookmark as { title: string }).title}*`
  if (r.windows) return `列出 ${(r.windows as unknown[]).length} 个窗口`
  if (r.window) return '创建窗口'
  if (r.items) return `搜索到 ${r.found} 条历史`
  if (r.deleted !== undefined && r.timeRange) return `删除 ${r.deleted} 条历史 (${r.timeRange})`
  if (r.deleted !== undefined) return `删除 ${r.deleted} 条记录`
  if (r.navigated) return `导航至 ${r.navigated}`
  if (r.dataUrl && !r.stopped && !r.pendingRecording) return '截图已捕获'
  if (r.zoomFactor !== undefined) return `缩放至 ${Math.round((r.zoomFactor as number) * 100)}%`
  if (r.opened) return '打开下载页面'
  if (r.themeMode !== undefined) return `主题: ${r.themeMode}`
  if (r.fontSize !== undefined) return `字号: ${r.fontSizeLabel || r.fontSize + 'px'}`
  if (r.font) return `字体: ${r.font}`
  if (r.cookies) return `查看 ${r.found || 0} 个 Cookie (${r.domain})`
  if (r.domain && r.deleted !== undefined) return `清除 ${r.domain} 的 ${r.deleted} 个 Cookie`
  if (r.sites) return `展示 ${r.found || 0} 个常用网站`
  if (r.extensions) return `列出 ${r.found || 0} 个扩展`
  if (r.id && r.enabled !== undefined) return r.enabled ? '启用扩展' : '禁用扩展'
  if (r.id && (r as { uninstalled?: string }).uninstalled) return `卸载扩展`
  if (r.permissions) return `查看 ${r.domain} 的权限设置`
  if (r.setting && r.value) return `设置 ${r.domain} 的 ${r.setting} 权限`
  if (r.key && r.value !== undefined)
    return `存储 *${r.key}* = ${typeof r.value === 'object' ? JSON.stringify(r.value) : r.value}`
  if (r.storageRemoved) return `删除存储 *${r.storageRemoved}*`
  if (r.recording === 'screen') return `开始录制屏幕`
  if (r.recording) return `开始录制 ${r.recording}`
  if (r.saved) return `录制已保存为 ${r.saved}`
  if (r.stopped) {
    const size = r.size as number | undefined
    return size ? `录制已停止 (${(size / 1024 / 1024).toFixed(1)}MB)` : '录制已停止'
  }
  if (r.restored) return `恢复标签 ${r.restored}`
  if (r.enabled) return `启用扩展 *${r.enabled}*`
  if (r.disabled) return `禁用扩展 *${r.disabled}*`
  if (r.moved && r.to) return `移动 *${r.moved}* → ${r.to}`
  if (r.reordered) return `调整 *${r.reordered}* 位置`
  if (r.sortedBookmarks) return `整理 *${r.folder}* 中 ${r.sortedBookmarks} 个书签`
  if ((r.folder as { title?: string })?.title)
    return `创建文件夹 *${(r.folder as { title: string }).title}*`
  if (r.renamed && r.to) return `重命名 *${r.renamed}* -> *${r.to}*`
  if (r.renamed) return `重命名 *${r.renamed}*`
  return JSON.stringify(r).slice(0, 100)
}
