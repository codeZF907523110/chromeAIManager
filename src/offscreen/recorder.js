/**
 * Offscreen 录制文档 — 使用 MediaRecorder 录制标签/桌面
 * 此文档运行在 offscreen context，Web API 可用但 chrome.* 仅限 runtime
 */

let mediaRecorder = null
let recordedChunks = []
let _stopResolve = null
let _currentStream = null

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_TAB_RECORDING') {
    startTabRecording(message.tabId, message.tabTitle).then(() => sendResponse({ success: true }))
    return true
  }
  if (message.type === 'START_DESKTOP_RECORDING') {
    startDesktopRecording().then(() => sendResponse({ success: true }))
    return true
  }
  if (message.type === 'STOP_RECORDING') {
    stopRecording(sendResponse)
    return true
  }
  // 未知消息静默忽略，避免干扰其他扩展上下文的 sendMessage
})

async function startTabRecording(tabId, tabTitle) {
  if (mediaRecorder?.state === 'recording') {
    stopCurrentRecording()
  }

  // 获取标签页的 media stream（含音频）
  let stream
  try {
    // 先尝试捕获标签页（含音频）
    stream = await chrome.tabCapture.capture({
      audio: true,
      video: true,
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: String(tabId),
      },
    })
  } catch (err) {
    // 如果 tabCapture 失败，尝试 useMediaDevices
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: String(tabId),
        },
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: String(tabId),
          },
        },
      })
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  _currentStream = stream
  startMediaRecorder(stream, 'tab')
  return { success: true, recording: 'tab', tabId }
}

async function startDesktopRecording() {
  if (mediaRecorder?.state === 'recording') {
    stopCurrentRecording()
  }

  // 弹出桌面共享选择器（含音频）
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
        },
      },
    })
  } catch (err) {
    return { success: false, error: err.message }
  }

  _currentStream = stream
  startMediaRecorder(stream, 'desktop')
  return { success: true, recording: 'desktop' }
}

function startMediaRecorder(stream, source) {
  recordedChunks = []

  // 尝试使用 VP9/webm (Chrome 支持)
  let mimeType = 'video/webm;codecs=vp9'
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
    }
  }

  let recorder
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2500000,
      audioBitsPerSecond: 128000,
    })
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop())
    throw err
  }

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data)
    }
  }

  recorder.onstop = () => {
    // 停止所有轨道
    stream.getTracks().forEach((t) => t.stop())
    _currentStream = null

    // 如果有等待中的 stopRecording 回调，执行它
    if (_stopResolve) {
      _stopResolve()
      _stopResolve = null
    }
  }

  mediaRecorder = recorder
  mediaRecorder.start(1000) // 每秒收集一次数据
}

function stopCurrentRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  mediaRecorder = null
  recordedChunks = []
}

async function stopRecording(sendResponse) {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    sendResponse({ success: false, error: '没有正在进行的录制' })
    return
  }

  return new Promise((resolve) => {
    _stopResolve = async () => {
      try {
        const blob = new Blob(recordedChunks, { type: 'video/webm' })
        const reader = new FileReader()

        reader.onloadend = () => {
          const dataUrl = reader.result
          sendResponse({
            success: true,
            dataUrl,
            size: blob.size,
          })
          resolve()
        }

        reader.onerror = () => {
          sendResponse({ success: false, error: '读取录制数据失败' })
          resolve()
        }

        reader.readAsDataURL(blob)
      } catch (err) {
        sendResponse({ success: false, error: err.message })
        resolve()
      }
    }

    mediaRecorder.stop()
  })
}
