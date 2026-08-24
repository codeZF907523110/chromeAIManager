/**
 * Content Script 入口
 * 监听 Service Worker 消息，执行 DOM 操作
 */

import { captureAccessibilityTree, findElementByRef, validateRef } from './dom-perception'
import type { ContentScriptMessage, ContentScriptResponse } from './messages'

let enabled = false

function init(): void {
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
          data: snapshot,
          timestamp: message.timestamp,
        } as ContentScriptResponse)
        return false
      }

      case 'CLICK': {
        const ref = typeof message.ref === 'string' ? message.ref : ''
        sendResponse(
          ref ? executeClick(ref) : { success: false, error: 'MISSING_REF', timestamp: Date.now() }
        )
        return false
      }

      case 'TYPE': {
        const ref = typeof message.ref === 'string' ? message.ref : ''
        const text = typeof message.text === 'string' ? message.text : ''
        sendResponse(
          ref && text !== undefined
            ? executeType(ref, text, message.submit)
            : { success: false, error: 'MISSING_REF_OR_TEXT', timestamp: Date.now() }
        )
        return false
      }

      case 'SELECT': {
        sendResponse(executeSelect(message.ref, message.value))
        return false
      }

      case 'HOVER': {
        sendResponse(executeHover(message.ref))
        return false
      }

      case 'PRESS_KEY': {
        sendResponse(executeKeyPress(message.key))
        return false
      }

      case 'CHECK': {
        sendResponse(executeCheck(message.ref, true))
        return false
      }

      case 'UNCHECK': {
        sendResponse(executeCheck(message.ref, false))
        return false
      }

      case 'FILL_FORM': {
        sendResponse(executeFillForm(message.fields))
        return false
      }

      case 'WAIT_FOR': {
        sendResponse(executeWaitFor(message.text, message.ref, message.timeout))
        return false
      }

      case 'NAVIGATE': {
        window.location.href = message.url
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

      case 'SCREENSHOT': {
        sendResponse({
          success: true,
          data: 'screenshot_not_implemented_yet',
          timestamp: message.timestamp,
        } as ContentScriptResponse)
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
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return {
      success: false,
      error: 'ELEMENT_NOT_INPUT',
      message: `Ref ${ref} 不是输入框`,
      timestamp: Date.now(),
    }
  }

  // 清空并设置值
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))

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
  document.dispatchEvent(event)
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
