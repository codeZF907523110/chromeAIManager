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
  const maxDepth = (payload.maxDepth as number) || 3
  const maxResults = (payload.maxResults as number) || 100
  const nodeType = payload.nodeType as string | undefined
  const query = payload.query as string | undefined

  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[], depth: number) {
    if (results.length >= maxResults) return
    if (depth > maxDepth) return
    for (const node of nodes) {
      if (results.length >= maxResults) break
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
        dateGroupCreated: node.dateGroupCreated,
      })
      if (node.children) walk(node.children, depth + 1)
    }
  }

  walk(tree, 0)
  return { success: true, nodes: results, observed: results.length }
}

/** 按 nodeId 移动书签节点，支持 beforeId 转换为目标父节点和索引。 */
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
  const changes: chrome.bookmarks.BookmarkChangeInfo = {}
  if (payload.title !== undefined) changes.title = payload.title as string
  if (payload.url !== undefined) changes.url = payload.url as string
  const node = await chrome.bookmarks.update(payload.nodeId as string, changes)
  return { success: true, bookmark: node }
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
  const selectedIds = Array.isArray(payload.selectedIds) ? (payload.selectedIds as unknown[]) : []

  if (selectedIds.length > 0) {
    const idsToRemove = selectedIds
      .map((id) => (typeof id === 'number' ? id : Number(id)))
      .filter((id): id is number => Number.isFinite(id) && id > 0)
      .map((id) => String(id))
    for (const id of idsToRemove) {
      try {
        await chrome.bookmarks.remove(id)
      } catch (e: unknown) {
        console.warn('[removeBookmark] 删除失败:', id, e)
      }
    }
    if (!idsToRemove.length) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        message: '所选项目没有有效的 id',
      }
    }
    return { success: true, removed: idsToRemove.length }
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
