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
      const msg = result.message || '录制失败'
      deps.addErrorMessage(msg)
      stateRef.value = 'idle'
      return
    }

    if (result.empty) {
      deps.addSystemMessage('录制内容为空')
      stateRef.value = 'idle'
      return
    }

    if (result.dataUrl) {
      const sizeMB = result.size ? (result.size / 1024 / 1024).toFixed(1) : '?'
      const kindLabel = '录屏'
      deps.addAIChat(`${kindLabel}已停止 (${sizeMB}MB)`, {
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
        message: `当前状态: ${stateRef.value}，请等待当前操作完成`,
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
          message: '录制服务无响应，请重新尝试',
        }
      }

      if (!result.success) {
        stateRef.value = 'idle'
        // 保留 offscreen 返回的精确错误码和消息
        return {
          success: false,
          code: result.code || 'RECORDING_FAILED',
          message: result.message || '录制失败',
        }
      }

      deps.addSystemMessage('已开始录屏，输入 /stop-recording 停止')
      return { success: true, recording: kind }
    } catch (e) {
      stateRef.value = 'idle'
      return {
        success: false,
        code: 'RECORDING_EXCEPTION',
        message: `录制异常: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }

  // ──── 停止录制 ────
  async function stop(): Promise<ExecutionResult> {
    if (stateRef.value !== 'recording') {
      return {
        success: false,
        code: 'NOT_RECORDING',
        message: '当前没有正在进行的录制',
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
          message: result?.message || '停止录制失败',
        }
      }
      return { success: true, stopped: true }
    } catch (e) {
      return {
        success: false,
        code: 'RECORDING_SW_ERROR',
        message: `停止录制异常: ${e instanceof Error ? e.message : String(e)}`,
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
