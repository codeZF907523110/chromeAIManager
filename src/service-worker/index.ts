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
import { dispatchTool, REGISTRY } from './handlers'
import { executePlan } from './plan-runner'
import {
  isAuthorizedSender,
  isPlainObject,
  isValidAIPlan,
  validateMessageEnvelope,
} from './message-validation'
import type { AIPlan } from '../shared/ai/plan-types'

const OFFSCREEN_URL = 'offscreen/recorder.html'

// ──── 消息路由 ────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const incomingType = (message as { type?: string } | null)?.type ?? '<no-type>'
  const senderSummary = {
    id: sender?.id,
    url: sender?.url ?? sender?.documentUrl,
    contextType: sender?.contextType,
    tabId: (sender as { tab?: { id?: number } } | null)?.tab?.id,
  }
  console.log(`[SW][rx] type=${incomingType}`, {
    sender: senderSummary,
    message: summarizeMessage(message),
  })
  handleMessage(message, sender)
    .then((result) => {
      console.log(`[SW][tx] type=${incomingType}`, summarizeResult(result))
      sendResponse(result)
    })
    .catch((err) => {
      console.error(`[SW][err] type=${incomingType}`, err)
      sendResponse({ error: err instanceof Error ? err.message : String(err) })
    })
  return true // 异步响应
})

/** 截断长 message 字段，避免日志爆炸。 */
function summarizeMessage(message: unknown): unknown {
  if (message == null || typeof message !== 'object') return message
  const m = message as Record<string, unknown>
  return {
    type: m.type,
    kind: m.kind,
    command: m.command ? JSON.parse(JSON.stringify(m.command)) : undefined,
    options: m.options ? JSON.parse(JSON.stringify(m.options)) : undefined,
  }
}

/** 把 SW 返回值压缩到前 2KB，避免 console 被超长 base64 截图撑爆。 */
function summarizeResult(result: unknown): unknown {
  if (result == null || typeof result !== 'object') return result
  try {
    const text = JSON.stringify(result)
    if (text.length <= 2000) return result
    return {
      __truncated: true,
      originalLength: text.length,
      preview: text.slice(0, 2000),
    }
  } catch {
    return '<unserializable result>'
  }
}

export async function handleMessage(
  message: {
    type: string
    command?: { intent?: string; plan?: AIPlan; payload?: unknown }
    options?: unknown
  },
  sender: { id?: string; url?: string; documentUrl?: string; contextType?: string }
): Promise<unknown> {
  if (!isAuthorizedSender(sender, chrome.runtime.id)) {
    console.warn('[SW] reject: UNAUTHORIZED_SENDER', { senderId: sender?.id })
    return { success: false, code: 'UNAUTHORIZED_SENDER', message: '消息来源未授权' }
  }
  if (!validateMessageEnvelope(message)) {
    console.warn('[SW] reject: INVALID_PARAMS (envelope)', {
      type: message?.type,
      keys: message && typeof message === 'object' ? Object.keys(message) : null,
      commandKeys:
        message && typeof message === 'object' && (message as Record<string, unknown>).command
          ? Object.keys((message as { command?: Record<string, unknown> }).command ?? {})
          : null,
    })
    return { success: false, code: 'INVALID_PARAMS', message: '消息结构无效' }
  }

  const { type } = message
  const allowedTypes = new Set([
    MSG_GET_CONTEXT,
    MSG_GET_BOOKMARKS,
    MSG_EXECUTE,
    MSG_EXECUTE_PLAN,
    MSG_RECORDING_START,
    MSG_RECORDING_STOP,
    MSG_RECORDING_RESULT,
  ])
  if (typeof type !== 'string' || !allowedTypes.has(type)) {
    console.warn('[SW] reject: unknown message type', { type })
    return { success: false, code: 'INVALID_PARAMS', message: '未知消息类型' }
  }

  if (type === MSG_EXECUTE) {
    const intent = message.command?.intent
    const payload = message.command?.payload ?? {}
    console.log(`[SW][MSG_EXECUTE] intent=${intent}`, JSON.stringify(payload))
    if (typeof intent !== 'string' || !intent.trim()) {
      console.warn('[SW][MSG_EXECUTE] reject: 缺少有效的 intent')
      return { success: false, code: 'INVALID_PARAMS', message: '缺少有效的 intent' }
    }
    if (!isPlainObject(payload)) {
      console.warn('[SW][MSG_EXECUTE] reject: payload 不是对象', {
        payloadType: typeof payload,
        isArray: Array.isArray(payload),
      })
      return { success: false, code: 'INVALID_PARAMS', message: 'payload 必须是对象' }
    }
    // REGISTRY 支持 slash intent（find_tab）和 canonical tool（tabs_update）
    if (!Object.prototype.hasOwnProperty.call(REGISTRY, intent)) {
      console.warn(`[SW][MSG_EXECUTE] reject: UNKNOWN_TOOL intent=${intent}`)
      return { success: false, code: 'UNKNOWN_TOOL', message: `未知工具: ${intent}` }
    }
    // __preConfirmed: true 表示前端已通过自己的确认卡二次确认过，直接跳过危险检查
    const skipDangerousCheck = payload.__preConfirmed === true
    console.log(`[SW][MSG_EXECUTE] dispatch intent=${intent}, __preConfirmed=${skipDangerousCheck}`)
    try {
      const result = skipDangerousCheck
        ? await dispatchTool(intent, payload as Record<string, unknown>)
        : await dispatchTool(intent, payload)
      console.log(
        `[SW][MSG_EXECUTE] done intent=${intent}, success=${result?.success !== false}, code=${result?.code ?? '-'}`
      )
      return result
    } catch (err) {
      console.error(`[SW][MSG_EXECUTE] threw intent=${intent}`, err)
      throw err
    }
  }

  if (type === MSG_GET_CONTEXT) {
    const opts = message.options as { mode?: string; query?: string } | undefined
    console.log(`[SW][MSG_GET_CONTEXT]`, opts)
    return await collectContext(opts)
  }

  if (type === MSG_GET_BOOKMARKS) {
    const opts = message.options as { query?: string } | undefined
    console.log(`[SW][MSG_GET_BOOKMARKS]`, opts)
    return await handleGetBookmarks(opts)
  }

  // ─── 新增：plan 路径（自然语言）───
  if (type === MSG_EXECUTE_PLAN) {
    const plan = message.command?.plan as AIPlan | undefined
    console.log(
      `[SW][MSG_EXECUTE_PLAN] plan.thought=${(plan?.thought ?? '').slice(0, 80)}`,
      `items=${plan?.plan?.length ?? 0}`
    )
    if (!plan || typeof plan.thought !== 'string' || !Array.isArray(plan.plan)) {
      console.warn('[SW][MSG_EXECUTE_PLAN] reject: plan 结构不合法', {
        hasPlan: !!plan,
        thoughtType: typeof plan?.thought,
        planIsArray: Array.isArray(plan?.plan),
        planKeys: plan && typeof plan === 'object' ? Object.keys(plan) : null,
      })
      return { success: false, code: 'INVALID_PARAMS', message: 'plan 必须包含 plan 数组' }
    }
    console.log(
      `[SW][MSG_EXECUTE_PLAN] plan items:`,
      plan.plan.map((it) => ({
        id: it.id,
        tool: it.tool,
        deps: it.deps,
        argsKeys: Object.keys(it.args || {}),
      }))
    )
    if (!isValidAIPlan(plan)) {
      const planItems = (plan as { plan?: unknown }).plan
      const items = Array.isArray(planItems) ? planItems : []
      console.warn('[SW][MSG_EXECUTE_PLAN] reject: INVALID_PLAN', {
        items: (items as Array<{ id: string; tool: string; deps: string[] }>).map((it) => ({
          id: it.id,
          tool: it.tool,
          deps: it.deps,
        })),
      })
      return { success: false, code: 'INVALID_PLAN', message: 'plan item 结构无效' }
    }
    try {
      const report = await executePlan(plan)
      console.log(
        `[SW][MSG_EXECUTE_PLAN] report items=${report.items.length}, success=${report.success}, needsConfirm=${!!report.needsConfirm}`,
        `itemCodes=${report.items.map((it) => `${it.tool}:${it.result?.code ?? it.result?.success ?? '?'}`).join(',')}`
      )
      return report
    } catch (err) {
      console.error('[SW][MSG_EXECUTE_PLAN] executePlan threw', err)
      throw err
    }
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
