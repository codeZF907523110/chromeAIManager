/**
 * 浏览历史 SW 命令实现
 * 对应 swIntent: history_*
 */

import type { ExecutionResult } from '../../types/execution'

/**
 * 搜索浏览历史（默认展示今天全部；query 非空时按关键词过滤）
 * 返回 startTime/endTime 让前端知道这是当天结果。
 */
export async function search(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const query = ((payload.query as string) || '').trim()
  const maxResults = (payload.maxResults as number) || 50
  const startTime = new Date().setHours(0, 0, 0, 0)
  const endTime = Date.now()

  const items = await chrome.history.search({
    text: query,
    maxResults,
    startTime,
    endTime,
  })
  return {
    success: true,
    items: items.map((i) => ({
      title: i.title,
      url: i.url,
      lastVisitTime: i.lastVisitTime,
      visitCount: i.visitCount,
    })),
    found: items.length,
    timeRange: { start: startTime, end: endTime, label: '今天' },
  }
}

/**
 * 删除历史（dangerous — 由 dispatchTool 拦截）
 * 三种粒度：
 *   1. timeRange=today/yesterday/week/month/all → 删除该时间窗
 *   2. query：先 search 再逐个 deleteUrl
 *   3. selectedUrls：从前端 confirm 卡勾选后回传的子集 URL
 */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const range = payload.timeRange as string | undefined
  const selectedUrls = Array.isArray(payload.selectedUrls)
    ? (payload.selectedUrls as unknown[]).map((u) => String(u)).filter(Boolean)
    : []

  if (selectedUrls.length > 0) {
    for (const url of selectedUrls) {
      try {
        await chrome.history.deleteUrl(url)
      } catch (e: unknown) {
        console.warn('[removeHistory] 删除失败:', url, e)
      }
    }
    return { success: true, deleted: selectedUrls.length }
  }

  if (range === 'all') {
    await chrome.history.deleteAll()
    return { success: true }
  }
  const endTime = Date.now()
  const startTime =
    range === 'today'
      ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
      : range === 'yesterday'
        ? (() => {
            const start = new Date()
            start.setHours(0, 0, 0, 0)
            start.setDate(start.getDate() - 1)
            return start.getTime()
          })()
        : range === 'week'
          ? Date.now() - 7 * 86400000
          : range === 'month'
            ? Date.now() - 30 * 86400000
            : 0

  if (payload.query) {
    const items = await chrome.history.search({
      text: payload.query as string,
      maxResults: 10000,
      startTime,
      endTime,
    })
    for (const item of items) {
      if (item.url) await chrome.history.deleteUrl(item.url)
    }
    return { success: true, deleted: items.length }
  }

  const deleted = await chrome.history.deleteRange({ startTime, endTime })
  return { success: true, deleted }
}
