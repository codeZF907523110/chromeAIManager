/**
 * Cookie SW 命令实现
 * 对应 swIntent: cookies_observe / cookies_remove
 */

import type { ExecutionResult } from '../../types/execution'

/** 查询指定域名的 Cookie（无参取当前活动标签的域名） */
export async function observe(payload: Record<string, unknown>): Promise<ExecutionResult> {
  let domain = (payload.domain as string | undefined)?.trim()
  if (!domain) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) {
      return { success: false, code: 'NO_TABS_FOUND', message: '未找到当前标签' }
    }
    try {
      domain = new URL(tab.url).hostname
    } catch {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        message: '当前页面不是合法 URL',
      }
    }
  }
  const cookies = await chrome.cookies.getAll({ domain })
  return { success: true, cookies, found: cookies.length, domain }
}

/** 清除指定域名的 Cookie（dangerous — 由 dispatchTool 拦截） */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  let domain = (payload.domain as string | undefined)?.trim()
  if (!domain) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) {
      return { success: false, code: 'NO_TABS_FOUND', message: '未找到当前标签' }
    }
    try {
      domain = new URL(tab.url).hostname
    } catch {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        message: '当前页面不是合法 URL',
      }
    }
  }
  const cookies = await chrome.cookies.getAll({ domain })
  for (const c of cookies) {
    const url = `${c.secure ? 'https' : 'http'}://${c.domain}${c.path.startsWith('/') ? '' : '/'}${c.path}`
    await chrome.cookies.remove({ url, name: c.name })
  }
  return { success: true, removed: cookies.length, domain }
}