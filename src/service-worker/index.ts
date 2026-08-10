/**
 * Service Worker — AI 浏览器管家后台入口
 * 管理消息路由、上下文收集、命令执行、录制协调
 */
// @ts-nocheck

import {
  MSG_GET_CONTEXT,
  MSG_GET_BOOKMARKS,
  MSG_EXECUTE,
  MSG_SET_DISPLAY_MODE,
  MSG_GET_DISPLAY_MODE,
  MSG_RECORDING_START,
  MSG_RECORDING_STOP,
  MSG_RECORDING_RESULT,
} from '../shared/constants'
import { collectContext } from './context-collector'
import { executeCommand } from './executor'

const OFFSCREEN_URL = 'offscreen/recorder.html'

// ──── 消息路由 ────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }))
  return true // 异步响应
})

async function handleMessage(
  message: { type: string; command?: { intent: string; payload: unknown }; options?: unknown },
  _sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const { type } = message

  if (type === MSG_GET_CONTEXT) {
    return await collectContext(message.options as { mode?: string; query?: string })
  }

  if (type === MSG_GET_BOOKMARKS) {
    return await handleGetBookmarks(message.options as { query?: string })
  }

  if (type === MSG_EXECUTE) {
    const { intent, payload } = message.command!
    return await executeCommand(intent, payload as Record<string, unknown>)
  }

  if (type === MSG_SET_DISPLAY_MODE) {
    const { mode } = message as { type: string; mode: string }
    await chrome.storage.local.set({ displayMode: mode })
    return { success: true }
  }

  if (type === MSG_GET_DISPLAY_MODE) {
    const result = await chrome.storage.local.get('displayMode')
    return result.displayMode || 'sidepanel'
  }

  // ──── 录制协调 ────
  if (type === MSG_RECORDING_START) {
    return await handleRecordingStart()
  }
  if (type === MSG_RECORDING_STOP) {
    return await handleRecordingStop()
  }
  if (type === MSG_RECORDING_RESULT) {
    // RECORDING_RESULT 由 offscreen 直接发给所有 extension pages（包括 Vue popup 的 recordingExecutor）
    // SW 不需要转发，否则 native side panel 也会收到导致重复渲染
    return { received: true }
  }

  return { error: `Unknown message type: ${type}` }
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
    return { success: false, code: 'RECORDING_SW_ERROR', message: e?.message || String(e) }
  }
}

async function handleRecordingStop() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' })
    return result
  } catch (e) {
    return { success: false, code: 'RECORDING_SW_ERROR', message: e?.message || String(e) }
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
    await openPanelOrOverlay()
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

  const result = await chrome.storage.local.get('displayMode')
  const mode = result.displayMode || 'sidepanel'

  if (mode === 'overlay') {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/overlay.js'],
      })
    } catch {
      // ignore
    }
  }
})

// ──── 初始化 sidePanel 行为 ────

// 不使用 setPanelBehavior({ openPanelOnActionClick: true })。
// 该配置会让 Chrome 直接打开 side panel，跳过 onClicked，
// 导致权限上下文不完整。当前通过 onClicked + sidePanel.open() 的方式正常工作。

// ──── 统一打开逻辑 ────

async function openPanelOrOverlay() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  const result = await chrome.storage.local.get('displayMode')
  const mode = result.displayMode || 'sidepanel'

  if (mode === 'sidepanel') {
    if (tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId })
    }
  } else {
    // popup 模式：注入 overlay 打开弹窗
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/overlay.js'],
      })
    } catch {
      // ignore
    }
  }
}

// ──── 初始化 displayMode ────

async function ensureDisplayMode() {
  const result = await chrome.storage.local.get('displayMode')
  if (!result.displayMode) {
    await chrome.storage.local.set({ displayMode: 'sidepanel' })
  }
}

// ──── 开机时同步 displayMode ────

chrome.runtime.onStartup.addListener(async () => {
  await ensureDisplayMode()
})

// ──── 安装时同步 displayMode ────

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureDisplayMode()
  if (details.reason === 'install') {
    console.log('[AI管家] 首次安装')
  } else if (details.reason === 'update') {
    console.log('[AI管家] 更新到', chrome.runtime.getManifest().version)
  }
})
