/**
 * 书签相关 SW 命令实现
 * 对应 swIntent: bookmarks_*
 */

import type { ExecutionResult } from '../../types/execution'

/** 观察书签树（按 nodeType / query / maxDepth / maxResults 过滤） */
export async function observeTree(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tree = await chrome.bookmarks.getTree()
  const results: Array<chrome.bookmarks.BookmarkTreeNode & { path?: string; childCount?: number }> =
    []
  // B20: maxDepth / maxResults 用 typeof === 'number' && Number.isInteger() 校验；
  //      0 必须被允许（表示"零深度/零结果"——少数清空场景），不能被 `|| 默认值` 覆盖。
  const maxDepth = parseIntegerParam(payload.maxDepth, 3, 0, 20)
  const maxResults = parseIntegerParam(payload.maxResults, 100, 0, 10000)
  if (!maxDepth.ok) {
    return { success: false, code: 'INVALID_PARAMS', message: maxDepth.error }
  }
  if (!maxResults.ok) {
    return { success: false, code: 'INVALID_PARAMS', message: maxResults.error }
  }
  const maxDepthValue = maxDepth.value
  const maxResultsValue = maxResults.value
  const nodeType = payload.nodeType as string | undefined
  const query = payload.query as string | undefined

  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[], depth: number) {
    if (results.length >= maxResultsValue) return
    if (depth > maxDepthValue) return
    for (const node of nodes) {
      if (results.length >= maxResultsValue) break
      const isFolder = !!node.children
      const isBookmark = !!node.url
      if (nodeType === 'folder' && !isFolder) continue
      if (nodeType === 'bookmark' && !isBookmark) continue
      if (query) {
        const match = (node.title || '').includes(query) || (node.url || '').includes(query)
        if (!match) {
          if (node.children) walk(node.children, depth + 1)
          continue
        }
      }
      const nodePath = node.parentId ? `.../${node.parentId}/${node.id}` : `/${node.id}`
      results.push({
        id: node.id,
        title: node.title,
        type: isFolder ? 'folder' : 'url',
        url: node.url,
        parentId: node.parentId,
        index: node.index,
        path: nodePath,
        childCount: node.children?.length || 0,
        dateAdded: node.dateAdded,
        dateGroupCreated: node.dateGroupModified,
      })
      if (node.children) walk(node.children, depth + 1)
    }
  }

  walk(tree, 0)
  return { success: true, nodes: results, observed: results.length }
}

/**
 * 整数参数解析：B20 修复。
 *  - undefined / null：使用默认值（向后兼容）
 *  - 非数字或非整数：返回错误（避免静默接受 0.5 / '5'）
 *  - 越界：返回错误（避免 0 / 负数破坏逻辑）
 */
function parseIntegerParam(
  raw: unknown,
  defaultValue: number,
  min: number,
  max: number
): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: defaultValue }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) {
    return {
      ok: false,
      error: `参数必须是 ${min} 到 ${max} 的整数`,
    }
  }
  return { ok: true, value: n }
}

/** 按 nodeId 获取单个书签节点。 */
export async function get(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const nodeId = parseNodeId(payload.nodeId)
  if (!nodeId) return invalidNodeId()
  const nodes = await chrome.bookmarks.get(nodeId)
  return { success: true, node: nodes[0] ?? null }
}

/** 获取指定书签文件夹的直接子节点；可限制返回数量。 */
export async function getChildren(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const nodeId = parseNodeId(payload.nodeId)
  if (!nodeId) return invalidNodeId()
  const limit = payload.limit === undefined ? 200 : payload.limit
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    return { success: false, code: 'INVALID_PARAMS', message: 'limit 必须是 1 到 500 的整数' }
  }
  const nodes = await chrome.bookmarks.getChildren(nodeId)
  return { success: true, nodes: nodes.slice(0, limit), found: Math.min(nodes.length, limit) }
}

/** 获取指定节点及其完整子树。 */
export async function getSubTree(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const nodeId = parseNodeId(payload.nodeId)
  if (!nodeId) return invalidNodeId()
  const nodes = await chrome.bookmarks.getSubTree(nodeId)
  return { success: true, nodes }
}

/** 按关键词搜索书签，过滤掉文件夹并保留原生字段；maxResults 限制结果数量。 */
export async function search(payload: Record<string, unknown>): Promise<ExecutionResult> {
  if (typeof payload.query !== 'string' || !payload.query.trim()) {
    return { success: false, code: 'INVALID_PARAMS', message: 'query 必须是非空字符串' }
  }
  const maxResults = payload.maxResults === undefined ? 50 : payload.maxResults
  if (
    typeof maxResults !== 'number' ||
    !Number.isInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > 200
  ) {
    return { success: false, code: 'INVALID_PARAMS', message: 'maxResults 必须是 1 到 200 的整数' }
  }
  const nodes = await chrome.bookmarks.search(payload.query.trim())
  const filtered = nodes.filter((node) => !!node.url).slice(0, maxResults)
  return { success: true, nodes: filtered, found: filtered.length }
}

/** 获取最近新增的书签。 */
export async function getRecent(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const maxResults = payload.maxResults === undefined ? 10 : payload.maxResults
  if (
    typeof maxResults !== 'number' ||
    !Number.isInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > 100
  ) {
    return { success: false, code: 'INVALID_PARAMS', message: 'maxResults 必须是 1 到 100 的整数' }
  }
  const nodes = await chrome.bookmarks.getRecent(maxResults)
  return { success: true, nodes, found: nodes.length }
}

/** 解析并校验书签节点 ID。 */
function parseNodeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** 返回统一的无效书签节点 ID 错误。 */
function invalidNodeId(): ExecutionResult {
  return { success: false, code: 'INVALID_PARAMS', message: 'nodeId 必须是非空字符串' }
}

export async function moveNode(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId.trim() : ''
  if (!nodeId) {
    return { success: false, code: 'INVALID_PARAMS', message: '缺少 nodeId 参数' }
  }
  if (payload.index !== undefined && payload.beforeId !== undefined) {
    return { success: false, code: 'INVALID_PARAMS', message: 'index 与 beforeId 不能同时使用' }
  }

  const moveProps: chrome.bookmarks.MoveProperties = {}
  if (payload.beforeId !== undefined) {
    const beforeId = typeof payload.beforeId === 'string' ? payload.beforeId.trim() : ''
    if (!beforeId) return { success: false, code: 'INVALID_PARAMS', message: 'beforeId 无效' }
    const [before] = await chrome.bookmarks.get(beforeId)
    if (!before?.parentId || before.id === nodeId || before.index === undefined) {
      return { success: false, code: 'INVALID_PARAMS', message: 'beforeId 无效' }
    }
    moveProps.parentId = before.parentId
    moveProps.index = before.index
  } else {
    if (payload.parentId !== undefined) {
      if (typeof payload.parentId !== 'string' || !payload.parentId.trim()) {
        return { success: false, code: 'INVALID_PARAMS', message: 'parentId 必须是非空字符串' }
      }
      moveProps.parentId = payload.parentId.trim()
    }
    if (payload.index !== undefined) {
      const index = Number(payload.index)
      if (!Number.isInteger(index) || index < 0) {
        return { success: false, code: 'INVALID_PARAMS', message: 'index 必须是非负整数' }
      }
      moveProps.index = index
    }
  }

  try {
    const node = await chrome.bookmarks.move(nodeId, moveProps)
    return { success: true, node, moved: true, newIndex: node.index }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return {
      success: false,
      code: 'BOOKMARK_MOVE_FAILED',
      message: e?.message || '移动书签失败',
      suggestion: '请检查 nodeId、parentId 或 beforeId 是否正确',
    }
  }
}

/** 创建书签或文件夹，并校验 nodeType、必填字段和 URL。 */
export async function createNode(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const nodeType = payload.nodeType
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  const parentId = typeof payload.parentId === 'string' ? payload.parentId.trim() : ''
  if (nodeType !== 'folder' && nodeType !== 'bookmark') {
    return { success: false, code: 'INVALID_PARAMS', message: 'nodeType 必须是 folder 或 bookmark' }
  }
  if (!title || !parentId) {
    return { success: false, code: 'INVALID_PARAMS', message: 'title 和 parentId 不能为空' }
  }
  if (nodeType === 'bookmark') {
    if (typeof payload.url !== 'string' || !isBookmarkUrl(payload.url)) {
      return { success: false, code: 'INVALID_PARAMS', message: '书签 URL 无效' }
    }
  } else if (payload.url !== undefined) {
    return { success: false, code: 'INVALID_PARAMS', message: '文件夹不能包含 url' }
  }
  if (payload.index !== undefined) {
    const index = Number(payload.index)
    if (!Number.isInteger(index) || index < 0) {
      return { success: false, code: 'INVALID_PARAMS', message: 'index 必须是非负整数' }
    }
  }
  if (payload.allowDuplicate !== true) {
    const children = await chrome.bookmarks.getChildren(parentId)
    const duplicate = children.find((child) =>
      nodeType === 'folder'
        ? !child.url && child.title === title
        : child.url === payload.url && child.title === title
    )
    if (duplicate) {
      return { success: false, code: 'DUPLICATE_BOOKMARK', message: '目标位置已存在相同书签' }
    }
  }
  const opts: chrome.bookmarks.CreateDetails = { title, parentId }
  if (nodeType === 'bookmark') opts.url = payload.url as string
  if (payload.index !== undefined) opts.index = Number(payload.index)
  const node = await chrome.bookmarks.create(opts)
  return { success: true, bookmark: node }
}

function isBookmarkUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return ['http:', 'https:', 'ftp:'].includes(url.protocol)
  } catch {
    return false
  }
}

/** 判断 URL 是否允许作为书签保存。 */
function isAllowedBookmarkUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return ['http:', 'https:', 'ftp:'].includes(url.protocol)
  } catch {
    return false
  }
}

/** 更新书签节点（title / url） */
export async function updateNode(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId.trim() : ''
  if (!nodeId) return { success: false, code: 'INVALID_PARAMS', message: '缺少 nodeId 参数' }
  if (payload.title === undefined && payload.url === undefined) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '至少需要提供 title 或 url 之一',
    }
  }
  const changes: chrome.bookmarks.BookmarkChangeInfo = {}
  if (payload.title !== undefined) changes.title = payload.title as string
  if (payload.url !== undefined) {
    if (typeof payload.url !== 'string' || !isBookmarkUrl(payload.url)) {
      return { success: false, code: 'INVALID_PARAMS', message: '书签 URL 无效' }
    }
    changes.url = payload.url
  }
  try {
    const node = await chrome.bookmarks.update(nodeId, changes)
    return { success: true, bookmark: node }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return {
      success: false,
      code: 'BOOKMARK_UPDATE_FAILED',
      message: e?.message || '更新书签失败',
      suggestion: '请检查 nodeId 与权限后重试',
    }
  }
}

/** 按 nodeId 在新标签页打开书签 URL。 */
export async function openNode(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId.trim() : ''
  if (!nodeId) return { success: false, code: 'INVALID_PARAMS', message: '缺少 nodeId' }
  const [node] = await chrome.bookmarks.get(nodeId)
  if (!node?.url) return { success: false, code: 'NOT_A_BOOKMARK', message: '目标不是可打开的书签' }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = await chrome.tabs.create({
    url: node.url,
    windowId: active?.windowId,
    active: true,
  })
  return { success: true, navigated: node.url, tab, bookmark: node }
}

/**
 * 删除书签或文件夹（dangerous — 由 dispatchTool 拦截）
 * 支持两种粒度：
 *   - nodeId：删除节点本身（文件夹会带子项）
 *   - selectedIds：从二次确认卡勾选后回传的子集 id 列表
 */
export async function removeNode(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const nodeId = payload.nodeId as string | undefined
  const selectedIds = Array.isArray(payload.selectedIds)
    ? (payload.selectedIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  const query = typeof payload.query === 'string' ? payload.query.trim() : ''

  // selectedIds 优先：只删除勾选的书签
  if (selectedIds.length > 0) {
    let removed = 0
    for (const id of selectedIds) {
      try {
        await chrome.bookmarks.remove(id)
        removed++
      } catch (e: unknown) {
        console.warn('[removeBookmark] 删除失败:', id, e)
      }
    }
    return { success: true, removed }
  }

  // query 模式：按 URL 或标题搜索并删除匹配的书签
  if (query) {
    try {
      const results = await chrome.bookmarks.search(query)
      if (results.length === 0) {
        return { success: true, removed: 0, message: '没有找到匹配的书签' }
      }
      // B35: 全文本匹配会把文件夹也搜出来，必须先过滤到 node.url !== undefined，
      // 只删书签不删文件夹；否则误删文件夹会牵连整棵子树。
      const bookmarkOnly = results.filter((n) => !!n.url)
      if (bookmarkOnly.length === 0) {
        return { success: true, removed: 0, message: '没有匹配的书签（仅匹配到文件夹）' }
      }
      // 删除所有匹配的书签
      const idsToRemove: string[] = []
      for (const node of bookmarkOnly) {
        try {
          await chrome.bookmarks.remove(node.id)
          idsToRemove.push(node.id)
        } catch (e: unknown) {
          console.warn('[removeBookmark] 删除失败:', node.id, e)
        }
      }
      return { success: true, removed: idsToRemove.length }
    } catch (e: unknown) {
      return {
        success: false,
        code: 'BOOKMARK_SEARCH_FAILED',
        message: `搜索书签失败: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }

  if (!nodeId) {
    return { success: false, code: 'INVALID_PARAMS', message: '缺少 nodeId' }
  }
  let removedNode: chrome.bookmarks.BookmarkTreeNode | undefined
  let totalRemoved = 1
  try {
    const nodes = await chrome.bookmarks.get(nodeId)
    removedNode = nodes[0]
    if (removedNode && !removedNode.url && Array.isArray(removedNode.children)) {
      totalRemoved = 1 + removedNode.children.length
    }
  } catch {
    // 拿不到节点信息不影响删除
  }
  await chrome.bookmarks.remove(nodeId)
  return { success: true, removedNode, removed: totalRemoved }
}

/** 将当前标签页（或指定 URL）添加为书签 */
export async function addCurrentPage(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const url = payload.url as string | undefined
  const title = payload.title as string | undefined
  let targetUrl: string
  let targetTitle: string

  if (url) {
    if (!isAllowedBookmarkUrl(url)) {
      return { success: false, code: 'PAGE_BLOCKED', message: '只允许保存 http/https/ftp 网页书签' }
    }
    targetUrl = url
    targetTitle = title || url
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url || !isAllowedBookmarkUrl(tab.url)) {
      return { success: false, code: 'PAGE_BLOCKED', message: '当前页面不是可保存的网页' }
    }
    targetUrl = tab.url
    targetTitle = title || tab.title || targetUrl
  }

  const bookmark = await chrome.bookmarks.create({
    title: targetTitle,
    url: targetUrl,
  })
  return { success: true, bookmark }
}
