/**
 * AI 浏览器管家 — 内容脚本
 * 注入全屏覆盖层 + 居中 iframe 弹窗
 * 每次执行自动切换开/关
 */

;(function () {
  if (!document.body) return

  // 方式 1: 用 data 属性标记是否已注入（更可靠）
  if (document.body.dataset.__aiOverlayOpen === '1') {
    // 已在当前注入周期打开，关闭
    closeExisting()
    return
  }

  // 方式 2: 查找已有的 overlay DOM（兜底）
  const existing = document.getElementById('__ai_commander_overlay__')
  if (existing) {
    closeExisting()
    return
  }

  // ── 打开弹窗 ──

  document.body.dataset.__aiOverlayOpen = '1'

  const overlay = document.createElement('div')
  overlay.id = '__ai_commander_overlay__'

  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    background: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: '__ai_fade_in__ 0.2s ease',
  })

  // 居中弹窗容器
  const dialog = document.createElement('div')
  Object.assign(dialog.style, {
    width: '860px',
    height: '600px',
    borderRadius: '14px',
    overflow: 'hidden',
    boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
    animation: '__ai_dialog_in__ 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  })

  // iframe 加载扩展页面
  const iframe = document.createElement('iframe')
  iframe.src = chrome.runtime.getURL('sidepanel.html')
  Object.assign(iframe.style, {
    width: '100%',
    height: '100%',
    border: 'none',
    background: '#0a0a14',
  })
  dialog.appendChild(iframe)
  overlay.appendChild(dialog)

  // 动画关键帧
  const style = document.createElement('style')
  style.textContent = `
    @keyframes __ai_fade_in__  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes __ai_fade_out__ { from { opacity: 1; } to { opacity: 0; } }
    @keyframes __ai_dialog_in__  { from { opacity:0; transform:scale(0.92) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes __ai_dialog_out__ { from { opacity:1; transform:scale(1) translateY(0); } to { opacity:0; transform:scale(0.92) translateY(12px); } }
  `
  overlay.appendChild(style)
  document.body.appendChild(overlay)

  // 命名函数：onMessage 回调
  function onOverlayMessage(msg) {
    if (msg.type === 'CLOSE_OVERLAY') {
      closeOverlay()
      return true
    }
    return false
  }

  chrome.runtime.onMessage.addListener(onOverlayMessage)

  // 命名函数：keydown 回调
  function onKeydown(e) {
    if (e.key === 'Escape') {
      closeOverlay()
    }
  }

  document.addEventListener('keydown', onKeydown)

  const onWindowMessage = async (e) => {
    // 只允许来自扩展自身 iframe 的消息
    if (e.origin !== EXTENSION_ORIGIN) return
    if (e.data?.type === 'COPY_SCREENSHOT' && e.data.dataUrl) {
      try {
        const response = await fetch(e.data.dataUrl)
        const blob = await response.blob()
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        console.log('[AI管家] 截图已复制到剪贴板')
      } catch (err) {
        console.warn('[AI管家] 复制截图失败:', err.message)
      }
    }
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById('__ai_commander_overlay__')) {
      chrome.runtime.onMessage.removeListener(onOverlayMessage)
      document.removeEventListener('keydown', onKeydown)
      window.removeEventListener('message', onWindowMessage)
      observer.disconnect()
      if (document.body) document.body.dataset.__aiOverlayOpen = '0'
    }
  })

  // 关闭方法
  function closeOverlay() {
    chrome.runtime.onMessage.removeListener(onOverlayMessage)
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('message', onWindowMessage)
    observer.disconnect()
    overlay.style.animation = '__ai_fade_out__ 0.2s ease forwards'
    dialog.style.animation = '__ai_dialog_out__ 0.2s ease forwards'
    setTimeout(() => {
      overlay.remove()
      if (document.body) document.body.dataset.__aiOverlayOpen = '0'
    }, 200)
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay()
  })

  // 监听 iframe 的 postMessage（截图复制等）
  const EXTENSION_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '')
  window.addEventListener('message', onWindowMessage)

  // 兜底：DOM 被外部移除时清理标记
  observer.observe(document.body, { childList: true })
})()

// 关闭已存在的 overlay（带动画）
function closeExisting() {
  const el = document.getElementById('__ai_commander_overlay__')
  if (!el) return
  const dialog = el.querySelector('div')
  el.style.animation = '__ai_fade_out__ 0.2s ease forwards'
  if (dialog) dialog.style.animation = '__ai_dialog_out__ 0.2s ease forwards'
  setTimeout(() => {
    el.remove()
    if (document.body) document.body.dataset.__aiOverlayOpen = '0'
  }, 200)
}

// 监听来自 sidepanel iframe 的关闭请求（切换到侧边栏模式时）
const EXT_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '')
window.addEventListener('message', (e) => {
  if (e.origin !== EXT_ORIGIN) return
  if (e.data?.type === 'CLOSE_OVERLAY') {
    closeExisting()
  }
})
