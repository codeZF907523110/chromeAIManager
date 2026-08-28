import type { ExecutionResult } from '../../types/execution'

/** 查询下载记录，限制返回字段和数量避免把本地路径暴露给 AI。 */
export async function search(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const limit = payload.limit === undefined ? 20 : Number(payload.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { success: false, code: 'INVALID_PARAMS', message: 'limit 必须是 1 到 100 的整数' }
  }
  const query: chrome.downloads.DownloadQuery = { limit }
  if (typeof payload.query === 'string') query.query = [payload.query]
  if (typeof payload.orderBy === 'string') query.orderBy = [payload.orderBy]
  const items = await chrome.downloads.search(query)
  return {
    success: true,
    downloads: items.map((item) => ({
      id: item.id,
      url: item.url,
      filename: item.filename,
      state: item.state,
      bytesReceived: item.bytesReceived,
      totalBytes: item.totalBytes,
      exists: item.exists,
      paused: item.paused,
    })),
    found: items.length,
  }
}

/** 取消指定下载任务。 */
export async function cancel(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = Number(payload.downloadId)
  if (!Number.isInteger(id) || id < 0) {
    return { success: false, code: 'INVALID_PARAMS', message: 'downloadId 必须是非负整数' }
  }
  await chrome.downloads.cancel(id)
  const [item] = await chrome.downloads.search({ id })
  return { success: true, downloadId: id, state: item?.state ?? 'interrupted' }
}

/** 在 Chrome 下载页面中显示指定下载项。 */
export async function show(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = Number(payload.downloadId)
  if (!Number.isInteger(id) || id < 0) {
    return { success: false, code: 'INVALID_PARAMS', message: 'downloadId 必须是非负整数' }
  }
  await chrome.downloads.show(id)
  return { success: true, downloadId: id }
}
