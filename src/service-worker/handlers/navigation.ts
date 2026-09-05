/**
 * 导航与页面相关 SW 命令实现
 * 对应 swIntent: navigate / screenshot / zoom / downloads_open
 */

import type { ExecutionResult } from '../../types/execution'

/** 导航到指定 URL（受保护页面 chrome:// 等会被拒绝） */
export async function navigate(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const url = payload.url as string
  if (!url) return { success: false, code: 'INVALID_PARAMS', message: 'URL 为空' }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { success: false, code: 'INVALID_PARAMS', message: 'URL 格式无效' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { success: false, code: 'PAGE_BLOCKED', message: '无法导航到受保护页面' }
  }
  if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) {
    return { success: false, code: 'PAGE_BLOCKED', message: '无法导航到 Web Store' }
  }
  // B28: chromewebstore.google.com 是新版 Web Store 域名，老黑名单漏掉了它。
  const isWebStore =
    parsed.hostname === 'chromewebstore.google.com' ||
    (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore'))
  if (isWebStore) {
    return { success: false, code: 'PAGE_BLOCKED', message: '无法导航到 Web Store' }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
  if (payload.newTab) {
    await chrome.tabs.create({ url: parsed.href })
  } else {
    await chrome.tabs.update(tab.id, { url: parsed.href })
  }
  return { success: true, navigated: parsed.href }
}

/** 截取活动标签可见区域（PNG dataUrl） */
export async function screenshot(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const tabId = payload.tabId as number | undefined
  let targetTab: chrome.tabs.Tab | undefined
  if (tabId) {
    try {
      targetTab = await chrome.tabs.get(tabId)
    } catch {
      /* ignore */
    }
  }
  if (!targetTab) {
    ;[targetTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  }
  if (!targetTab?.windowId)
    return { success: false, code: 'ELE_NOT_FOUND', message: '未找到活动标签' }
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'png' })
    return { success: true, screenshot: dataUrl }
  } catch {
    return { success: false, code: 'ACT_BLOCKED', message: '截图被拒绝' }
  }
}

/** 缩放当前页面（direction: in | out | reset，每次步进 0.25） */
export async function zoom(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { success: false, code: 'NO_TABS_FOUND', message: '未找到活动标签' }
  const currentZoom = await chrome.tabs.getZoom(tab.id)
  const direction = payload.direction as string
  let zoomFactor = currentZoom

  if (direction === 'in') zoomFactor = Math.min(currentZoom + 0.25, 3)
  else if (direction === 'out') zoomFactor = Math.max(currentZoom - 0.25, 0.25)
  else if (direction === 'reset') zoomFactor = 1

  await chrome.tabs.setZoom(tab.id, zoomFactor)
  return { success: true, zoomFactor }
}

/** 打开下载管理页面。 */
export async function downloadsOpen(): Promise<ExecutionResult> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = await chrome.tabs.create({
    url: 'chrome://downloads',
    windowId: active?.windowId,
    active: true,
  })
  return { success: true, navigated: 'chrome://downloads', tab }
}
