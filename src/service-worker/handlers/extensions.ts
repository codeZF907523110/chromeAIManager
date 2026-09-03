/**
 * 扩展管理 SW 命令实现
 * 对应 swIntent: extensions_observe / extensions_update / extensions_remove
 */

import type { ExecutionResult } from '../../types/execution'

/** 校验扩展 ID 并拒绝针对自身的危险操作。 */
function parseExtensionId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^[a-z0-9]{32}$/i.test(trimmed)) return null
  return trimmed
}

async function isSelfExtension(id: string): Promise<boolean> {
  try {
    const self = chrome.runtime?.id
    return self === id
  } catch {
    return false
  }
}

/** 列出已安装扩展（可选 query 过滤），不返回本扩展。 */
export async function observe(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const all = await chrome.management.getAll()
  const selfId = chrome.runtime?.id
  let filtered = all.filter((e) => !e.isApp && !e.isComponent && e.id !== selfId)
  if (payload.query) {
    const q = (payload.query as string).toLowerCase()
    filtered = filtered.filter((e) => e.name.toLowerCase().includes(q) || e.id.includes(q))
  }
  return { success: true, extensions: filtered, found: filtered.length }
}

/** 启用 / 禁用扩展；禁止操作自身。 */
export async function update(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = parseExtensionId(payload.id)
  if (!id) return { success: false, code: 'INVALID_PARAMS', message: 'id 必须是合法扩展 id' }
  if (await isSelfExtension(id))
    return { success: false, code: 'ACCESS_DENIED', message: '禁止修改本扩展' }
  if (typeof payload.enabled !== 'boolean')
    return { success: false, code: 'INVALID_PARAMS', message: 'enabled 必须是 boolean' }
  await chrome.management.setEnabled(id, payload.enabled)
  return { success: true }
}

/** 卸载扩展（dangerous — 由 dispatchTool 拦截）；禁止操作自身。
 *
 * 注意：chrome.management.uninstall 需要用户激活上下文（user gesture），
 * 在 Service Worker 中调用会被拒绝。本实现返回 NOT_SUPPORTED 错误，
 * 引导用户到 chrome://extensions 页面手动卸载。
 */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const id = parseExtensionId(payload.id)
  if (!id) return { success: false, code: 'INVALID_PARAMS', message: 'id 必须是合法扩展 id' }
  if (await isSelfExtension(id))
    return { success: false, code: 'ACCESS_DENIED', message: '禁止卸载本扩展' }
  return {
    success: false,
    code: 'UNSUPPORTED_IN_SW',
    message:
      '卸载扩展需要用户激活上下文，请前往 chrome://extensions 页面手动卸载（可先禁用该扩展）',
    suggestion: '请打开 chrome://extensions/，找到该扩展后点击"移除"',
  }
}
