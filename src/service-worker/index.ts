/**
 * Service Worker — AI 浏览器管家后台入口
 * 管理消息路由、上下文收集、命令执行
 */
// @ts-nocheck

import {
  MSG_GET_CONTEXT,
  MSG_GET_BOOKMARKS,
  MSG_EXECUTE,
  MSG_SET_DISPLAY_MODE,
  MSG_GET_DISPLAY_MODE,
} from '../shared/constants'
import { collectContext } from './context-collector'
import { executeCommand } from './executor'

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
    const mode = (message as unknown as { mode: string }).mode
    await chrome.storage.local.set({ displayMode: mode })
    return { success: true }
  }

  if (type === MSG_GET_DISPLAY_MODE) {
    const result = await chrome.storage.local.get('displayMode')
    return result.displayMode || 'sidepanel'
  }

  return { error: `Unknown message type: ${type}` }
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

// ──── 安装 / 更新 ────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[AI管家] 首次安装')
  } else if (details.reason === 'update') {
    console.log('[AI管家] 更新到', chrome.runtime.getManifest().version)
  }
})

// ──── 快捷键触发侧边栏 ────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === '_execute_action') {
    await openPanelOrOverlay()
  }
})

// ──── 点击图标触发 ────

// 注意：action.onClicked 只在没有 default_popup 时触发
chrome.action.onClicked.addListener(async (tab) => {
  const result = await chrome.storage.local.get('displayMode')
  const mode = result.displayMode || 'sidepanel'

  if (mode === 'overlay') {
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
  // sidepanel 模式：Chrome 会通过 setPanelBehavior 自动打开
})

// ──── 初始化 sidePanel 行为 ────

// 必须在同步上下文中调用，Chrome 自动在用户点击图标时打开 sidepanel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

// ──── 统一打开逻辑 ────

async function openPanelOrOverlay() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
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
