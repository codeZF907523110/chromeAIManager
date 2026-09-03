/**
 * 窗口相关 SW 命令实现
 * 对应 swIntent: windows_*
 */

import type { ExecutionResult } from '../../types/execution'

/** 获取窗口列表（可选 populate=includeTabs） */
export async function observe(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const opts: chrome.windows.QueryOptions = { windowTypes: ['normal', 'popup', 'app'] }
  if (payload.includeTabs) opts.populate = true
  const wins = await chrome.windows.getAll(opts)
  return { success: true, windows: wins, observed: wins.length }
}

/** 根据 ID 获取指定窗口。 */
export async function get(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = parseWindowId(payload.windowId)
  if (id === null)
    return { success: false, code: 'INVALID_PARAMS', message: 'windowId 必须是非负整数' }
  const window = await chrome.windows.get(id, { populate: payload.includeTabs === true })
  return { success: true, window }
}

/** 获取当前窗口。 */
export async function getCurrent(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const window = await chrome.windows.getCurrent({ populate: payload.includeTabs === true })
  return { success: true, window }
}

/** 获取最近聚焦的窗口。 */
export async function getLastFocused(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const window = await chrome.windows.getLastFocused({ populate: payload.includeTabs === true })
  return { success: true, window }
}

/** 获取全部窗口。 */
export async function getAll(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return observe({ ...payload, includeTabs: payload.includeTabs === true })
}

/** 关闭指定窗口。该工具由统一危险策略负责确认。 */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = parseWindowId(payload.windowId)
  if (id === null)
    return { success: false, code: 'INVALID_PARAMS', message: 'windowId 必须是非负整数' }
  await chrome.windows.remove(id)
  return { success: true, windowId: id, removed: true }
}

/** 解析窗口 ID。 */
function parseWindowId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

export async function create(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const opts: chrome.windows.CreateData = {}
  if (payload.url) opts.url = payload.url as string
  if (payload.incognito) opts.incognito = true
  const win = await chrome.windows.create(opts)
  return { success: true, window: win }
}

/** 更新窗口属性（focused / state） */
export async function update(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const changes: chrome.windows.UpdateInfo = {}
  if (payload.focused !== undefined) changes.focused = payload.focused as boolean
  if (payload.state) changes.state = payload.state as chrome.windows.WindowState
  const win = await chrome.windows.update(payload.windowId as number, changes)
  return { success: true, window: win }
}
