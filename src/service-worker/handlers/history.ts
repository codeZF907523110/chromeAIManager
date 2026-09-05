import type { ExecutionResult } from '../../types/execution'

/**
 * 浏览历史 SW 命令实现
 * 对应 swIntent: history_*
 */

type HistoryRange = 'today' | 'yesterday' | 'week' | 'month' | 'all'

/** 计算历史查询的本地时间范围。 */
export function getTimeRange(
  range: unknown
): { startTime: number; endTime: number; label: string } | null {
  const now = new Date()
  const end = now.getTime()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  if (range === undefined || range === 'today')
    return { startTime: startOfToday.getTime(), endTime: end, label: '今天' }
  if (range === 'yesterday') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 1)
    return { startTime: start.getTime(), endTime: startOfToday.getTime(), label: '昨天' }
  }
  if (range === 'week') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 7)
    return { startTime: start.getTime(), endTime: end, label: '最近一周' }
  }
  if (range === 'month') {
    const start = new Date(startOfToday)
    start.setMonth(start.getMonth() - 1)
    return { startTime: start.getTime(), endTime: end, label: '最近一个月' }
  }
  if (range === 'all') return { startTime: 0, endTime: end, label: '全部' }
  return null
}

/**
 * 搜索浏览历史（默认展示今天全部；query 非空时按关键词过滤）
 * 返回 startTime/endTime 让前端知道这是当天结果。
 */
export async function search(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const query = typeof payload.query === 'string' ? payload.query.trim() : ''
  if (payload.query !== undefined && typeof payload.query !== 'string') {
    return { success: false, code: 'INVALID_PARAMS', message: 'query 必须是字符串' }
  }
  const maxResults = payload.maxResults === undefined ? 50 : payload.maxResults
  if (
    typeof maxResults !== 'number' ||
    !Number.isInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > 1000
  ) {
    return { success: false, code: 'INVALID_PARAMS', message: 'maxResults 必须是 1 到 1000 的整数' }
  }
  const timeRange = getTimeRange(payload.timeRange)
  if (!timeRange) return { success: false, code: 'INVALID_PARAMS', message: 'timeRange 无效' }
  const { startTime, endTime, label } = timeRange

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
    timeRange: { start: startTime, end: endTime, label },
  }
}

/** 缩短 URL 用于历史默认返回的最小化展示。 */
function minimizeUrl(value: string): string {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return value
  }
}

/** 历史搜索的最小化视图：去掉 query/fragment 与长路径细节。 */
export async function searchMin(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const result = await search(payload)
  if (!result.success) return result
  const items = (
    result.items as Array<{ url: string; title?: string; lastVisitTime?: number }>
  ).map((i) => ({ ...i, url: minimizeUrl(i.url) }))
  return { ...result, items }
}

/** 查询指定历史 URL 的访问明细。 */
export async function getVisits(payload: Record<string, unknown>): Promise<ExecutionResult> {
  if (typeof payload.url !== 'string' || !payload.url.trim()) {
    return { success: false, code: 'INVALID_PARAMS', message: 'url 必须是非空字符串' }
  }
  const visits = await chrome.history.getVisits({ url: payload.url.trim() })
  return {
    success: true,
    url: payload.url.trim(),
    visits: visits.map((visit) => ({
      id: visit.id,
      visitTime: visit.visitTime,
      referringVisitId: visit.referringVisitId,
      transition: visit.transition,
    })),
    found: visits.length,
  }
}
/** 删除单个历史 URL。 */
export async function deleteUrl(payload: Record<string, unknown>): Promise<ExecutionResult> {
  if (typeof payload.url !== 'string' || !payload.url.trim()) {
    return { success: false, code: 'INVALID_PARAMS', message: 'url 必须是非空字符串' }
  }
  const url = payload.url.trim()
  await chrome.history.deleteUrl(url)
  return { success: true, deletedUrl: url }
}

/** 删除指定时间范围内的历史记录。 */
export async function deleteRange(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const startTime = payload.startTime
  const endTime = payload.endTime
  if (
    typeof startTime !== 'number' ||
    typeof endTime !== 'number' ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    startTime < 0 ||
    endTime <= startTime
  ) {
    return { success: false, code: 'INVALID_PARAMS', message: 'startTime/endTime 时间范围无效' }
  }
  await chrome.history.deleteRange({ startTime, endTime })
  return { success: true, startTime, endTime, deletedRange: true }
}

/** 删除全部历史记录，调用前必须通过最高级别确认。 */
export async function deleteAll(): Promise<ExecutionResult> {
  await chrome.history.deleteAll()
  return { success: true, deletedAll: true }
}

/** 删除历史兼容入口的参数说明。
 * 三种粒度：
 *   1. timeRange=today/yesterday/week/month/all → 删除该时间窗
 *   2. query：先 search 再逐个 deleteUrl
 *   3. selectedUrls：从前端 confirm 卡勾选后回传的子集 URL
 */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const range = payload.timeRange as HistoryRange | undefined
  if (payload.timeRange !== undefined && !getTimeRange(range)) {
    return { success: false, code: 'INVALID_PARAMS', message: 'timeRange 无效' }
  }
  const selectedUrls = Array.isArray(payload.selectedUrls)
    ? payload.selectedUrls.filter(
        (url): url is string => typeof url === 'string' && url.trim().length > 0
      )
    : []
  if (payload.selectedUrls !== undefined && !Array.isArray(payload.selectedUrls)) {
    return { success: false, code: 'INVALID_PARAMS', message: 'selectedUrls 必须是字符串数组' }
  }
  if (selectedUrls.length > 0) {
    const failures: string[] = []
    for (const url of selectedUrls) {
      try {
        await chrome.history.deleteUrl(url)
      } catch {
        failures.push(url)
      }
    }
    return {
      success: failures.length === 0,
      code: failures.length ? 'PARTIAL_SUCCESS' : undefined,
      deleted: selectedUrls.length - failures.length,
      failed: failures.length,
    }
  }
  // 注意：query 与 timeRange 同时存在时，query 永远是更窄的过滤器；
  // timeRange='all' 不能再吞掉 query 全部删除（之前会把 query 当作扩展语义忽略）。
  const query = typeof payload.query === 'string' ? payload.query.trim() : ''
  if (range === 'all' && !query) {
    await chrome.history.deleteAll()
    return { success: true, deletedAll: true }
  }
  const timeRange = range === 'all' ? { startTime: 0, endTime: Date.now() } : getTimeRange(range)
  if (!timeRange)
    return { success: false, code: 'INVALID_PARAMS', message: '必须指定有效的 timeRange' }
  const { startTime, endTime } = timeRange

  if (query) {
    // B34: 单次 history.search 最多 10000 条；超量截断为 truncated:true 让前端告诉用户「还有更多」。
    const SOFT_LIMIT = 10000
    const items = await chrome.history.search({
      text: query,
      maxResults: SOFT_LIMIT,
      startTime,
      endTime,
    })
    const truncated = items.length >= SOFT_LIMIT
    for (const item of items) {
      if (item.url) await chrome.history.deleteUrl(item.url)
    }
    return {
      success: true,
      deleted: items.length,
      query,
      truncated,
      ...(truncated
        ? {
            suggestion: '结果已达上限，可能仍有匹配项未删除；请缩小时间范围或细化关键词后再次执行',
          }
        : {}),
    }
  }

  // deleteRange 返回 void，需要先计数
  const items = await chrome.history.search({ text: '', maxResults: 10000, startTime, endTime })
  const urlsToDelete = items
    .filter((item) => item.url && !item.url.startsWith('chrome://'))
    .map((item) => item.url)
  for (const url of urlsToDelete) {
    await chrome.history.deleteUrl(url)
  }
  return { success: true, deleted: urlsToDelete.length }
}
