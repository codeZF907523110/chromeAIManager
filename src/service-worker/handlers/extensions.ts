/**
 * 扩展管理 SW 命令实现
 * 对应 swIntent: extensions_observe / extensions_update / extensions_remove
 */

import type { ExecutionResult } from '../../types/execution'

/** 列出已安装扩展（可选 query 过滤） */
export async function observe(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const all = await chrome.management.getAll()
  let filtered = all.filter((e) => !e.isApp && !e.isComponent)
  if (payload.query) {
    const q = (payload.query as string).toLowerCase()
    filtered = filtered.filter((e) => e.name.toLowerCase().includes(q) || e.id.includes(q))
  }
  return { success: true, extensions: filtered, found: filtered.length }
}

/** 启用 / 禁用扩展 */
export async function update(payload: Record<string, unknown>): Promise<ExecutionResult> {
  await chrome.management.setEnabled(payload.id as string, payload.enabled as boolean)
  return { success: true }
}

/** 卸载扩展（dangerous — 由 dispatchTool 拦截） */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  await chrome.management.uninstall(payload.id as string)
  return { success: true }
}