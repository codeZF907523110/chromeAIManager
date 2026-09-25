/**
 * RecordingExecutor — 录制状态与 UI 协调层
 *
 * 新架构（Chrome 官方推荐）：
 *   Side Panel → Service Worker (MSG_RECORDING_START) → Offscreen (getDisplayMedia/MediaRecorder)
 *   Offscreen → SW (MSG_RECORDING_RESULT) → Side Panel (展示结果)
 *
 * Side Panel 只负责：
 * - 发起录制请求（发消息给 SW）
 * - 监听录制结果并渲染 UI
 * - 管理录制状态（idle/recording）
 *
 * 不再直接调用 getUserMedia / getDisplayMedia，避免权限和崩溃问题。
 */

import type { ExecutionResult } from '../types'
import { MSG_RECORDING_START, MSG_RECORDING_STOP, MSG_RECORDING_RESULT } from '../shared/constants'
import { i18n } from '../locales'

/**
 * 罐头文案取词入口（非组件模块）：走 i18n 全局 composer，语言切换即时生效
 * @param key 词条 key
 * @param params 插值参数（可选）
 * @returns 当前语言的文案；词条缺失时由 fallbackLocale（en）兜底
 */
function t(key: string, params?: Record<string, unknown>): string {
  return params ? i18n.global.t(key, params) : i18n.global.t(key)
}

// ──── 类型定义 ────

export type RecordingKind = 'screen'
export type RecordingState = 'idle' | 'recording' | 'disposed'

// ──── 依赖注入 ────

export interface RecordingExecutorDeps {
  addSystemMessage: (text: string) => void
  addAIChat: (
    text: string,
    recordingFile?: { url: string; name: string; size: number; preview: string }
  ) => void
  addErrorMessage: (text: string) => void
}

// ──── Factory ────

export interface RecordingExecutor {
  start: (kind: RecordingKind) => Promise<ExecutionResult>
  stop: () => Promise<ExecutionResult>
  dispose: () => void
  getState: () => RecordingState
}

export function createRecordingExecutor(deps: RecordingExecutorDeps): RecordingExecutor {
  const stateRef: { value: RecordingState } = { value: 'idle' }
  let messageListener: ((msg: unknown) => void) | null = null

  // ──── 监听 offscreen 返回的录制结果 ────
  function setupMessageListener() {
    if (messageListener) return
    messageListener = (msg: unknown) => {
      const m = msg as {
        type?: string
        success?: boolean
        dataUrl?: string
        size?: number
        kind?: string
        fileName?: string
        empty?: boolean
        code?: string
        message?: string
      }
      if (m.type !== MSG_RECORDING_RESULT) return
      handleRecordingResult(m)
    }
    chrome.runtime.onMessage.addListener(messageListener)
  }

  function removeMessageListener() {
    if (messageListener) {
      chrome.runtime.onMessage.removeListener(messageListener)
      messageListener = null
    }
  }

  function handleRecordingResult(result: {
    success?: boolean
    dataUrl?: string
    size?: number
    kind?: string
    fileName?: string
    empty?: boolean
    code?: string
    message?: string
  }) {
    if (!result.success) {
      const msg = result.message || t('rec.failed')
      deps.addErrorMessage(msg)
      stateRef.value = 'idle'
      return
    }

    if (result.empty) {
      deps.addSystemMessage(t('rec.empty'))
      stateRef.value = 'idle'
      return
    }

    if (result.dataUrl) {
      const sizeMB = result.size ? (result.size / 1024 / 1024).toFixed(1) : '?'
      deps.addAIChat(t('rec.stoppedSize', { size: sizeMB }), {
        url: result.dataUrl,
        name: result.fileName || 'recording.webm',
        size: result.size || 0,
        preview: result.dataUrl,
      })
    }
    stateRef.value = 'idle'
  }

  // ──── 启动录制 ────
  async function start(kind: RecordingKind): Promise<ExecutionResult> {
    if (stateRef.value !== 'idle') {
      return {
        success: false,
        code: 'RECORDING_BUSY',
        message: t('rec.busy', { state: stateRef.value }),
      }
    }

    setupMessageListener()
    stateRef.value = 'recording'

    try {
      const result = await chrome.runtime.sendMessage({
        type: MSG_RECORDING_START,
        kind,
      })

      if (!result) {
        stateRef.value = 'idle'
        return {
          success: false,
          code: 'RECORDING_SW_ERROR',
          message: t('rec.swNoResponse'),
        }
      }

      if (!result.success) {
        stateRef.value = 'idle'
        // 保留 offscreen 返回的精确错误码和消息
        return {
          success: false,
          code: result.code || 'RECORDING_FAILED',
          message: result.message || t('rec.failed'),
        }
      }

      deps.addSystemMessage(t('rec.started'))
      return { success: true, recording: kind }
    } catch (e) {
      stateRef.value = 'idle'
      return {
        success: false,
        code: 'RECORDING_EXCEPTION',
        message: t('rec.exception', {
          msg: e instanceof Error ? e.message : String(e),
        }),
      }
    }
  }

  // ──── 停止录制 ────
  async function stop(): Promise<ExecutionResult> {
    if (stateRef.value !== 'recording') {
      return {
        success: false,
        code: 'NOT_RECORDING',
        message: t('rec.notRecording'),
      }
    }

    // 状态切换为 idle，等待 offscreen 结果返回后 handleRecordingResult 更新 UI
    stateRef.value = 'idle'

    try {
      const result = await chrome.runtime.sendMessage({
        type: MSG_RECORDING_STOP,
      })
      if (!result?.success) {
        return {
          success: false,
          code: result?.code || 'STOP_FAILED',
          message: result?.message || t('rec.stopFailed'),
        }
      }
      return { success: true, stopped: true }
    } catch (e) {
      return {
        success: false,
        code: 'RECORDING_SW_ERROR',
        message: t('rec.stopException', {
          msg: e instanceof Error ? e.message : String(e),
        }),
      }
    }
  }

  // ──── dispose ────
  function dispose() {
    removeMessageListener()
    stateRef.value = 'disposed'
  }

  return { start, stop, dispose, getState: () => stateRef.value }
}
