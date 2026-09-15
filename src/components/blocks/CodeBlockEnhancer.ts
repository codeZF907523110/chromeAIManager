/**
 * 代码块增强器（DOM 工具，不挂 Vue 组件）
 *
 * 为气泡内的每个 <pre> 元素右上角附加「复制代码」按钮：
 *   - hover pre 时按钮淡入，离开时淡出
 *   - 点击后复制 code 文本，1.5s 内显示「✓ 已复制」反馈
 *   - 走 navigator.clipboard，失败时降级 textarea + execCommand
 *   - 用 dataset.enhanced 标记避免重复挂载
 *
 * 为什么走 DOM 不走 Vue 组件：
 *   每个代码块都 createApp 开销过大，且 v-html 渲染出的 pre 不是响应式数据，
 *   没有 Vue 生命周期需求，纯 DOM 操作更轻。
 */

const COPIED_RESET_MS = 1500

const COPY_ICON_SVG = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
</svg>`

const CHECK_ICON_SVG = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="20 6 9 17 4 12"></polyline>
</svg>`

/**
 * 把 SVG 字符串塞进 button，不引入图标库依赖。
 *
 * @param svg - 内联 SVG 字符串
 * @returns 新的 button 元素
 */
function makeButton(svg: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'code-copy-btn'
  btn.title = '复制代码'
  btn.innerHTML = svg
  return btn
}

/**
 * 复制文本到剪贴板。失败时降级为临时 textarea + execCommand。
 *
 * @param text - 要复制的文本
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    throw new Error('clipboard unavailable')
  } catch {
    // fallback：旧浏览器 / 非安全上下文
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

/**
 * 给单个 pre 元素挂载复制按钮。
 *
 * @param pre - 已渲染的 pre DOM 元素
 */
function enhanceOne(pre: HTMLPreElement): void {
  if (pre.dataset.enhanced === '1') return
  pre.dataset.enhanced = '1'

  // pre 自身可能没设 position；保证按钮绝对定位生效
  const computed = getComputedStyle(pre)
  if (computed.position === 'static') {
    pre.style.position = 'relative'
  }

  const btn = makeButton(COPY_ICON_SVG)
  let resetTimer: ReturnType<typeof setTimeout> | null = null

  btn.addEventListener('click', async () => {
    const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
    const ok = await copyText(code)
    if (ok) {
      btn.classList.add('copied')
      btn.innerHTML = CHECK_ICON_SVG
      btn.title = '已复制'
      if (resetTimer) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => {
        btn.classList.remove('copied')
        btn.innerHTML = COPY_ICON_SVG
        btn.title = '复制代码'
      }, COPIED_RESET_MS)
    } else {
      btn.title = '复制失败'
    }
  })

  pre.appendChild(btn)
}

/**
 * 扫描气泡容器内所有 pre，为每个挂载复制按钮。
 * 已被挂载的（data-enhanced='1'）会被跳过，可重复调用。
 *
 * @param bubbleEl - 气泡内容容器（含 [data-custom-block] / pre 等元素的根 DOM）
 */
export function enhanceCodeBlocks(bubbleEl: HTMLElement): void {
  const blocks = bubbleEl.querySelectorAll<HTMLPreElement>('pre')
  for (const pre of Array.from(blocks)) {
    enhanceOne(pre)
  }
}
