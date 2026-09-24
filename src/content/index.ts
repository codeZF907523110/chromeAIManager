/**
 * Content Script 入口
 * 监听 Service Worker 消息，执行 DOM 操作
 */

import {
  captureAccessibilityTree,
  findElementByRef,
  findNodesByText,
  toAISnapshot,
  validateRef,
} from './dom-perception'
import type { ContentScriptMessage, ContentScriptResponse } from './messages'
import { handleScreenshot } from './screenshot'

let enabled = false

/**
 * 动态注入幂等守卫标记。
 * executor 在 sendMessage 失败时会用 chrome.scripting.executeScript 兜底注入本脚本，
 * bundle 重执行会重建模块作用域（模块级变量无法防重），必须用 window 标记——
 * 同一扩展在同一 frame 的 isolated world 中 window 持久，可拦截重复注册 listener
 * （双 listener 会导致 click 等副作用执行两次）。
 */
const INJECTED_FLAG = '__chromeAIManagerInjected__'

function init(): void {
  const w = window as unknown as Record<string, unknown>
  if (w[INJECTED_FLAG]) return
  w[INJECTED_FLAG] = true

  setupMessageListener()
  setupMutationObserver()

  console.log(
    '[DOM感知] 初始化开始, readyState=',
    document.readyState,
    'URL=',
    window.location.href
  )

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        enabled = true
        console.log('[DOM感知] 页面已就绪，扫描已启用, URL=', window.location.href)
      }, 1500)
    })
  } else {
    setTimeout(() => {
      enabled = true
      console.log('[DOM感知] 页面已就绪，扫描已启用, URL=', window.location.href)
    }, 1000)
  }
}

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message: ContentScriptMessage, _sender, sendResponse) => {
    // 截图不依赖 DOM 感知扫描，且是异步长操作（整页滚动/选区框选耗时数秒），
    // 必须在 enabled 检查之前分流 + return true 保持 sendResponse 通道开启。
    if (message.type === 'SCREENSHOT') {
      handleScreenshot(message.mode || 'visible')
        .then((result) => sendResponse(result))
        .catch(() =>
          sendResponse({
            success: false,
            error: 'SCREENSHOT_FAILED',
            timestamp: Date.now(),
          } as ContentScriptResponse)
        )
      return true // 异步响应，保持 sendResponse 通道开启
    }

    if (!enabled) {
      sendResponse({
        success: false,
        error: 'DOM感知未启用',
        timestamp: Date.now(),
      } as ContentScriptResponse)
      return false
    }

    switch (message.type) {
      case 'SNAPSHOT': {
        const snapshot = captureAccessibilityTree({ includeIframes: true })
        console.log(
          '[DOM感知] SNAPSHOT 响应, 元素数量=',
          snapshot.nodes.length,
          'URL=',
          snapshot.url
        )
        sendResponse({
          success: true,
          // 回传瘦身副本（剥掉 xpath/rect/tagName）+ AI 逐行文本视图，本地 snapshotCache 保留全量供 ref 定位
          data: toAISnapshot(snapshot),
          timestamp: message.timestamp,
        } as ContentScriptResponse)
        return false
      }

      case 'FIND': {
        const query = typeof message.query === 'string' ? message.query : ''
        const role = typeof message.role === 'string' ? message.role : undefined
        sendResponse(
          query
            ? { success: true, data: findNodesByText(query, role), timestamp: message.timestamp }
            : { success: false, error: 'MISSING_QUERY', timestamp: Date.now() }
        )
        return false
      }

      case 'CLICK': {
        const ref = typeof message.ref === 'string' ? message.ref : ''
        sendActionResponse(
          ref ? executeClick(ref) : { success: false, error: 'MISSING_REF', timestamp: Date.now() },
          sendResponse
        )
        return true // 异步：等待稳定窗口后附操作后快照
      }

      case 'TYPE': {
        const ref = typeof message.ref === 'string' ? message.ref : ''
        const text = typeof message.text === 'string' ? message.text : ''
        sendActionResponse(
          ref && text !== undefined
            ? executeType(ref, text, message.submit)
            : { success: false, error: 'MISSING_REF_OR_TEXT', timestamp: Date.now() },
          sendResponse
        )
        return true // 异步：等待稳定窗口后附操作后快照
      }

      case 'SELECT': {
        const ref = typeof message.ref === 'string' ? message.ref : ''
        const value = typeof message.value === 'string' ? message.value : ''
        sendActionResponse(executeSelect(ref, value), sendResponse)
        return true // 异步：等待稳定窗口后附操作后快照
      }

      case 'HOVER': {
        const ref = typeof message.ref === 'string' ? message.ref : ''
        sendActionResponse(executeHover(ref), sendResponse)
        return true // 异步：等待稳定窗口后附操作后快照
      }

      case 'PRESS_KEY': {
        const key = typeof message.key === 'string' ? message.key : ''
        sendActionResponse(executeKeyPress(key), sendResponse)
        return true // 异步：等待稳定窗口后附操作后快照
      }

      case 'CHECK': {
        const ref = typeof message.ref === 'string' ? message.ref : ''
        sendActionResponse(executeCheck(ref, true), sendResponse)
        return true // 异步：等待稳定窗口后附操作后快照
      }

      case 'UNCHECK': {
        const ref = typeof message.ref === 'string' ? message.ref : ''
        sendActionResponse(executeCheck(ref, false), sendResponse)
        return true // 异步：等待稳定窗口后附操作后快照
      }

      case 'FILL_FORM': {
        const fields = Array.isArray(message.fields)
          ? (message.fields as Array<{ ref: string; value: string }>)
          : []
        sendActionResponse(executeFillForm(fields), sendResponse)
        return true // 异步：等待稳定窗口后附操作后快照
      }

      case 'WAIT_FOR': {
        const text = typeof message.text === 'string' ? message.text : undefined
        const ref = typeof message.ref === 'string' ? message.ref : undefined
        const timeout = typeof message.timeout === 'number' ? message.timeout : undefined
        sendResponse(executeWaitFor(text, ref, timeout))
        return false
      }

      case 'NAVIGATE': {
        const url = typeof message.url === 'string' ? message.url : ''
        window.location.href = url
        sendResponse({ success: true, timestamp: message.timestamp } as ContentScriptResponse)
        return false
      }

      case 'NAVIGATE_BACK': {
        window.history.back()
        sendResponse({ success: true, timestamp: message.timestamp } as ContentScriptResponse)
        return false
      }

      case 'NAVIGATE_FORWARD': {
        window.history.forward()
        sendResponse({ success: true, timestamp: message.timestamp } as ContentScriptResponse)
        return false
      }

      case 'RELOAD': {
        window.location.reload()
        sendResponse({ success: true, timestamp: message.timestamp } as ContentScriptResponse)
        return false
      }

      default: {
        sendResponse({
          success: false,
          error: 'UNKNOWN_MESSAGE_TYPE',
          timestamp: Date.now(),
        } as ContentScriptResponse)
        return false
      }
    }
  })
}

function setupMutationObserver(): void {
  if (!document.body) return
  const observer = new MutationObserver((_mutations) => {
    // DOM 变化时清空缓存，下次扫描时重新采集
    // 暂时不自动刷新，由 Service Worker 按需触发
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/** 操作执行后、采集操作后快照前的稳定等待：click/submit 触发的 SPA 渲染是异步的，立即采集会拍到旧 DOM */
const ACTION_SETTLE_MS = 500

/**
 * DOM 操作完成后延迟采集操作后的最新快照并回传（对标 Playwright MCP：
 * mutation action 的返回自动附带操作后的 aria snapshot，一步顶"操作 + 快照验证"两步）。
 * - 失败响应立即返回（无需等待采集）；
 * - 成功响应等待 ACTION_SETTLE_MS 后采集，结果挂到 data.snapshot（AI 直接读它验证，
 *   不必再单独调 browser_snapshot，同时消除"快照早于渲染"的竞态）；
 * - 采集异常时降级为原响应，操作本身的成功状态不受影响。
 *
 * @param response 操作执行结果
 * @param sendResponse 消息通道回调（本 helper 保证只调用一次）
 */
function sendActionResponse(
  response: ContentScriptResponse,
  sendResponse: (r: ContentScriptResponse) => void
): void {
  if (!response.success) {
    sendResponse(response)
    return
  }
  setTimeout(() => {
    try {
      const snap = toAISnapshot(captureAccessibilityTree({ includeIframes: true }))
      sendResponse({
        ...response,
        data: {
          ...((response.data as Record<string, unknown> | undefined) ?? {}),
          snapshot: {
            url: snap.url,
            title: snap.title,
            totalElements: snap.totalElements,
            nodesText: snap.nodesText,
          },
        },
      })
    } catch {
      sendResponse(response)
    }
  }, ACTION_SETTLE_MS)
}

// ========== 操作执行函数 ==========

function executeClick(ref: string): ContentScriptResponse {
  const validation = validateRef(ref)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error!,
      message: `Ref ${ref} 无效`,
      suggestion: 'RESCAN',
      timestamp: Date.now(),
    }
  }

  const el = findElementByRef(ref)
  if (!el) {
    return {
      success: false,
      error: 'ELEMENT_NOT_FOUND',
      message: `Ref ${ref} 对应的元素未找到`,
      suggestion: 'RESCAN',
      timestamp: Date.now(),
    }
  }

  el.click()
  console.log(`[DOM感知] CLICK 成功: ${ref}`)
  return { success: true, timestamp: Date.now() }
}

function executeType(ref: string, text: string, submit?: boolean): ContentScriptResponse {
  const validation = validateRef(ref)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error!,
      message: `Ref ${ref} 无效`,
      suggestion: 'RESCAN',
      timestamp: Date.now(),
    }
  }

  const el = findElementByRef(ref)
  if (!el) {
    return {
      success: false,
      error: 'ELEMENT_NOT_FOUND',
      message: `Ref ${ref} 对应的元素未找到`,
      suggestion: 'RESCAN',
      timestamp: Date.now(),
    }
  }

  // 支持 input、textarea 和 contenteditable 元素
  const isInput =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable
  if (!isInput) {
    return {
      success: false,
      error: 'ELEMENT_NOT_INPUT',
      message: `Ref ${ref} 不是输入框`,
      timestamp: Date.now(),
    }
  }

  // 清空并设置值
  if (el.isContentEditable) {
    // contenteditable: 先清除再插入文本，触发 input 事件
    el.textContent = ''
    el.focus()
    document.execCommand('insertText', false, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } else {
    // input/textarea: 用各自原生 prototype 的 value setter 赋值（绕过框架对 setter 的劫持并触发响应）。
    // 必须按元素类型取 prototype：WebIDL 对 setter 做 brand check，
    // 用 HTMLInputElement 的 setter 写 textarea 会直接抛 Illegal invocation。
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  if (submit) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }

  console.log(`[DOM感知] TYPE 成功: ${ref}, text="${text.slice(0, 20)}..."`)
  return { success: true, timestamp: Date.now() }
}

function executeSelect(ref: string, value: string): ContentScriptResponse {
  const validation = validateRef(ref)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error!,
      message: `Ref ${ref} 无效`,
      suggestion: 'RESCAN',
      timestamp: Date.now(),
    }
  }

  const el = findElementByRef(ref)
  if (!el || !(el instanceof HTMLSelectElement)) {
    return { success: false, error: 'ELEMENT_NOT_SELECT', timestamp: Date.now() }
  }

  el.value = value
  el.dispatchEvent(new Event('change', { bubbles: true }))
  console.log(`[DOM感知] SELECT 成功: ${ref}, value="${value}"`)
  return { success: true, timestamp: Date.now() }
}

function executeHover(ref: string): ContentScriptResponse {
  const validation = validateRef(ref)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error!,
      message: `Ref ${ref} 无效`,
      suggestion: 'RESCAN',
      timestamp: Date.now(),
    }
  }

  const el = findElementByRef(ref)
  if (!el) {
    return { success: false, error: 'ELEMENT_NOT_FOUND', timestamp: Date.now() }
  }

  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  console.log(`[DOM感知] HOVER 成功: ${ref}`)
  return { success: true, timestamp: Date.now() }
}

function executeKeyPress(key: string): ContentScriptResponse {
  const event = new KeyboardEvent('keydown', { key, bubbles: true })
  document.body.dispatchEvent(event)
  console.log(`[DOM感知] PRESS_KEY: ${key}`)
  return { success: true, timestamp: Date.now() }
}

function executeCheck(ref: string, check: boolean): ContentScriptResponse {
  const validation = validateRef(ref)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error!,
      message: `Ref ${ref} 无效`,
      suggestion: 'RESCAN',
      timestamp: Date.now(),
    }
  }

  const el = findElementByRef(ref)
  if (!el || !(el instanceof HTMLInputElement) || (el.type !== 'checkbox' && el.type !== 'radio')) {
    return { success: false, error: 'ELEMENT_NOT_CHECKBOX', timestamp: Date.now() }
  }

  el.checked = check
  el.dispatchEvent(new Event('change', { bubbles: true }))
  console.log(`[DOM感知] CHECK ${check}: ${ref}`)
  return { success: true, timestamp: Date.now() }
}

function executeFillForm(fields: Array<{ ref: string; value: string }>): ContentScriptResponse {
  for (const field of fields) {
    const result = executeType(field.ref, field.value)
    if (!result.success) return result
  }
  console.log('[DOM感知] FILL_FORM 完成, 字段数=', fields.length)
  return { success: true, timestamp: Date.now() }
}

function executeWaitFor(text?: string, ref?: string, timeout?: number): ContentScriptResponse {
  const ms = timeout || 5000
  console.log(`[DOM感知] WAIT_FOR text="${text}" ref=${ref} timeout=${ms}ms`)
  return { success: true, timestamp: Date.now() }
}

// 启动
init()
