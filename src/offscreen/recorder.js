/**
 * Offscreen Document — 录屏
 *
 * 根据 Chrome 官方文档，offscreen document 是唯一适合做媒体捕获的扩展上下文：
 * - Side Panel / popup 无法可靠地调用 getDisplayMedia
 * - Service Worker 没有 DOM，无法持有 MediaStream
 *
 * 架构：
 *   Side Panel → SW (MSG_RECORDING_START) → Offscreen (getDisplayMedia/MediaRecorder)
 *   Offscreen → SW (MSG_RECORDING_RESULT) → Side Panel (展示结果)
 */

let mediaRecorder = null
let recordedChunks = []

/** MIME 类型候选（按优先级） */
const MIME_CANDIDATES = ['video/webm;codecs=vp8', 'video/webm']

function pickMimeType() {
  for (const mime of MIME_CANDIDATES) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported(mime))
      continue
    return mime
  }
  return 'video/webm'
}

/** 解析 DOMException.name 到项目错误码 */
function domErrorToCode(e) {
  const name = e?.name || ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'RECORDING_PERMISSION_DENIED'
    case 'NotFoundError':
      return 'RECORDING_DEVICE_NOT_FOUND'
    case 'NotReadableError':
      return 'RECORDING_DEVICE_IN_USE'
    case 'OverconstrainedError':
      return 'RECORDING_CONSTRAINT_ERROR'
    case 'AbortError':
      return 'RECORDING_ABORTED'
    default:
      return 'RECORDING_ERROR'
  }
}

/** 通知 SW 结果 */
function sendResult(result) {
  try {
    chrome.runtime.sendMessage({
      type: 'RECORDING_RESULT',
      ...result,
    })
  } catch (e) {
    console.warn('[offscreen-rec] sendResult failed:', e)
  }
}

// ──── 录制状态处理 ────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type } = message

  if (type === 'START_RECORDING') {
    startRecording()
      .then((r) => sendResponse(r))
      .catch((e) =>
        sendResponse({ success: false, code: domErrorToCode(e), message: e?.message || String(e) })
      )
    return true // 异步
  }

  if (type === 'STOP_RECORDING') {
    stopRecording()
      .then((r) => sendResponse(r))
      .catch((e) =>
        sendResponse({ success: false, code: domErrorToCode(e), message: e?.message || String(e) })
      )
    return true
  }

  // 未知消息静默忽略
})

async function startRecording() {
  // 停掉已有录制
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
    mediaRecorder = null
    recordedChunks = []
  }

  let stream = null

  try {
    // getDisplayMedia 在 offscreen document 中可正常弹出系统选择器
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 15 },
    })
  } catch (e) {
    console.error('[offscreen-rec] getDisplayMedia failed:', e)
    return {
      success: false,
      code: domErrorToCode(e),
      message: formatPermissionMessage(e),
    }
  }

  // 校验轨道
  if (stream.getVideoTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    return {
      success: false,
      code: 'RECORDING_NO_VIDEO_TRACK',
      message: '未获取到视频，请选择要录制的内容',
    }
  }

  // 构造 MediaRecorder
  const mimeType = pickMimeType()
  let recorder
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
    })
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop())
    return { success: false, code: domErrorToCode(e), message: `无法创建录制器: ${e?.message}` }
  }

  recordedChunks = []
  let stopped = false

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data)
    }
  }

  recorder.onstop = () => {
    if (stopped) return
    stopped = true
    stream.getTracks().forEach((t) => t.stop())
    stream = null

    if (recordedChunks.length === 0) {
      sendResult({ success: true, empty: true })
      return
    }

    const blob = new Blob(recordedChunks, { type: mimeType })
    const reader = new FileReader()
    reader.onloadend = () => {
      sendResult({
        success: true,
        dataUrl: reader.result,
        size: blob.size,
        fileName: `screen_recording_${Date.now()}.webm`,
        mimeType,
      })
      recordedChunks = []
    }
    reader.onerror = () => {
      sendResult({
        success: false,
        code: 'RECORDING_READ_ERROR',
        message: '读取录制数据失败',
      })
      recordedChunks = []
    }
    reader.readAsDataURL(blob)
  }

  recorder.onerror = (e) => {
    console.error('[offscreen-rec] MediaRecorder error:', e)
    stream?.getTracks().forEach((t) => t.stop())
    sendResult({
      success: false,
      code: 'RECORDING_ERROR',
      message: `录制器错误: ${e?.type || '未知'}`,
    })
  }

  mediaRecorder = recorder
  mediaRecorder.start(1000) // 每秒收集一次数据
  return { success: true }
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    return { success: false, code: 'RECORDING_NOT_STARTED', message: '当前没有正在进行的录制' }
  }

  return new Promise((resolve) => {
    const origOnStop = mediaRecorder.onstop
    mediaRecorder.onstop = () => {
      if (origOnStop) origOnStop.call(mediaRecorder)
      resolve({ success: true, stopped: true })
    }
    mediaRecorder.stop()
  })
}

/** 生成对用户友好的错误消息 */
function formatPermissionMessage(e) {
  const name = e?.name || ''
  const msg = e?.message || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '录制权限被拒绝，请在弹出的系统选择器中选择要录制的内容'
  }
  if (name === 'NotFoundError') {
    return '未找到可录制的屏幕或窗口'
  }
  if (name === 'NotReadableError') {
    return '设备被其他应用占用，请关闭其他使用媒体设备的程序'
  }
  return msg || '录制请求失败'
}
