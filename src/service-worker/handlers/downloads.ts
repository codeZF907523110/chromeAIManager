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

/** 下载 http/https URL，返回下载 ID。 */
export async function download(payload: Record<string, unknown>): Promise<ExecutionResult> {
  if (typeof payload.url !== 'string') {
    return { success: false, code: 'INVALID_PARAMS', message: 'url 必须是字符串' }
  }
  let url: URL
  try {
    url = new URL(payload.url)
  } catch {
    return { success: false, code: 'INVALID_PARAMS', message: 'url 格式无效' }
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { success: false, code: 'INVALID_PARAMS', message: '只允许 http/https URL' }
  }
  const options: Record<string, unknown> = { url: url.href }
  if (payload.filename !== undefined) {
    if (
      typeof payload.filename !== 'string' ||
      !payload.filename.trim() ||
      payload.filename.includes('..')
    ) {
      return { success: false, code: 'INVALID_PARAMS', message: 'filename 不合法' }
    }
    options.filename = payload.filename.trim()
  }
  if (typeof payload.saveAs === 'boolean') options.saveAs = payload.saveAs
  const id = await chrome.downloads.download(options)
  return { success: true, downloadId: id, url: url.href, started: true }
}

/** 打开已完成的下载文件；路径由 Chrome 自身解析，不接受任意路径。 */
export async function open(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = parseDownloadId(payload.downloadId)
  if (id === null)
    return { success: false, code: 'INVALID_PARAMS', message: 'downloadId 必须是非负整数' }
  await chrome.downloads.open(id)
  return { success: true, downloadId: id, opened: true }
}

/** 从下载记录中删除指定项，不删除磁盘文件。 */
export async function erase(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = parseDownloadId(payload.downloadId)
  if (id === null)
    return { success: false, code: 'INVALID_PARAMS', message: 'downloadId 必须是非负整数' }
  const erased = await chrome.downloads.erase({ id })
  return { success: true, downloadId: id, erased: erased > 0 }
}

/** 删除已完成下载对应的磁盘文件。 */
export async function removeFile(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = parseDownloadId(payload.downloadId)
  if (id === null)
    return { success: false, code: 'INVALID_PARAMS', message: 'downloadId 必须是非负整数' }
  await chrome.downloads.removeFile(id)
  return { success: true, downloadId: id, removed: true }
}

/** 解析下载 ID。 */
function parseDownloadId(value: unknown): number | null {
  const id =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : NaN
  return Number.isInteger(id) && id >= 0 ? id : null
}

export async function show(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = Number(payload.downloadId)
  if (!Number.isInteger(id) || id < 0) {
    return { success: false, code: 'INVALID_PARAMS', message: 'downloadId 必须是非负整数' }
  }
  await chrome.downloads.show(id)
  return { success: true, downloadId: id }
}
