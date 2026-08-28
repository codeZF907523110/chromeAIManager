/**
 * Service Worker — AI 浏览器管家后台入口
 * 管理消息路由、上下文收集、命令执行、录制协调
 */

import {
  MSG_GET_CONTEXT,
  MSG_GET_BOOKMARKS,
  MSG_EXECUTE,
  MSG_EXECUTE_PLAN,
  MSG_RECORDING_START,
  MSG_RECORDING_STOP,
  MSG_RECORDING_RESULT,
} from '../shared/constants'
import { collectContext } from './context-collector'
import { dispatchTool } from './handlers'
import { executePlan } from './plan-runner'
import type { AIPlan } from '../shared/ai/plan-types'

const OFFSCREEN_URL = 'offscreen/recorder.html'

// ──── 消息路由 ────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }))
  return true // 异步响应
})

async function handleMessage(message: {
  type: string
  command?: { intent?: string; plan?: AIPlan; payload?: unknown }
  options?: unknown
}): Promise<unknown> {
  const { type } = message

  if (type === MSG_EXECUTE) {
    const intent = message.command?.intent
    const payload = message.command?.payload
    if (typeof intent !== 'string' || !intent.trim()) {
      return { success: false, code: 'INVALID_PARAMS', message: '缺少有效的 intent' }
    }
    if (!isPlainObject(payload)) {
      return { success: false, code: 'INVALID_PARAMS', message: 'payload 必须是对象' }
    }
    return await dispatchTool(intent, payload)
  }

  if (type === MSG_GET_CONTEXT) {
    return await collectContext(message.options as { mode?: string; query?: string })
  }

  if (type === MSG_GET_BOOKMARKS) {
    return await handleGetBookmarks(message.options as { query?: string })
  }

  // ─── 新增：plan 路径（自然语言）───
  if (type === MSG_EXECUTE_PLAN) {
    const plan = message.command?.plan as AIPlan | undefined
    if (!plan || !Array.isArray(plan.plan)) {
      return { success: false, code: 'INVALID_PARAMS', message: 'plan 必须包含 plan 数组' }
    }
    return await executePlan(plan)
  }

  // ──── 录制协调 ────
  if (type === MSG_RECORDING_START) {
    return await handleRecordingStart()
  }
  if (type === MSG_RECORDING_STOP) {
    return await handleRecordingStop()
  }
  if (type === MSG_RECORDING_RESULT) {
    // RECORDING_RESULT 由 offscreen 直接发给 extension pages
    return { received: true }
  }

  return { error: `Unknown message type: ${type}` }
}

/** 判断值是否为可安全传给 handler 的普通对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// ──── Offscreen Document 管理 ────

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  })
  if (existing.length > 0) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['DISPLAY_MEDIA'],
    justification: 'Recording via getDisplayMedia/MediaRecorder',
  })
}

async function handleRecordingStart() {
  try {
    await ensureOffscreenDocument()
    const result = await chrome.runtime.sendMessage({ type: 'START_RECORDING' })
    return result
  } catch (e) {
    const err = e as { message?: string }
    return { success: false, code: 'RECORDING_SW_ERROR', message: err?.message || String(e) }
  }
}

async function handleRecordingStop() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' })
    return result
  } catch (e) {
    const err = e as { message?: string }
    return { success: false, code: 'RECORDING_SW_ERROR', message: err?.message || String(e) }
  }
}

// ──── 书签搜索 ────

async function handleGetBookmarks(
  options: { query?: string } = {}
): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const { query } = options
  if (!query) return []

  try {
    const results = await chrome.bookmarks.search(query)
    // 过滤掉文件夹
    return results.filter((r) => r.url)
  } catch {
    return []
  }
}

// ──── 快捷键触发侧边栏 ────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === '_execute_action') {
    await openSidePanel()
  }
})

// ──── 点击图标触发 ────

// action: {} 在 manifest 中声明，无 popup
// 点击图标触发 onClicked → 授予 activeTab 权限给当前标签页
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return

  try {
    await chrome.sidePanel.open({ tabId: tab.id })
  } catch {
    // ignore
  }
})

// ──── 打开侧边栏 ────

async function openSidePanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  try {
    await chrome.sidePanel.open({ windowId: tab.windowId })
  } catch {
    // ignore
  }
}

// ──── 安装时日志 ────

chrome.runtime.onInstalled.addListener((details: { reason: string }) => {
  if (details.reason === 'install') {
    console.log('[AI管家] 首次安装')
  } else if (details.reason === 'update') {
    console.log('[AI管家] 更新到', (chrome.runtime.getManifest() as { version: string }).version)
  }
})
