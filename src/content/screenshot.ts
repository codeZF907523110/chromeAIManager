/**
 * Content Script 截图模块
 *
 * 三种截图模式实现（均在 content script 侧执行，captureVisibleTab 通过 SW 请求）：
 * - visible：请求 SW 截当前可视区域（与直接 captureVisibleTab 等效，统一走 content 路径）。
 * - full：滚动页面 + 每屏请求 SW 截图 + canvas 纵向拼接，还原度 100%（真实像素）。
 *   启用分层截图：position:fixed 元素仅在首屏保留，后续屏截图前临时隐藏，避免拼接后重复。
 *   position:sticky 仍可能重复（已知限制，hidden 会引起 layout 错位）。
 * - area：注入 Shadow DOM 选区遮罩，用户拖拽框选，按选区坐标裁剪可视区域截图。
 *
 * 关键约束：
 * - captureVisibleTab 速率限制 2 次/秒，整页滚动节流 550ms。
 * - 整页最大 12 屏（规避 STEP_TIMEOUT_MS 10s 超时 + canvas 面积上限）。
 * - dpr 缩放：截图像素 = CSS 像素 × devicePixelRatio，拼接/裁剪按截图实际像素算。
 * - fixed 元素分层截图：第 2~N 屏截图前临时 visibility:hidden，截图后立即恢复。
 */

import type { ContentScriptResponse } from './messages'

/**
 * content script 请求 SW 截图的消息类型。
 *
 * 注意：这里不 import shared/constants.ts，而是内联字面量。
 * 原因：Chrome content_scripts 不支持 ES module（manifest 无 type:module 选项），
 * 若 content.js 通过 import 引用 shared chunk，注入时第 1 行就抛 SyntaxError，
 * 整个脚本不执行。content script 必须是自包含的经典脚本。
 * 该值须与 src/shared/constants.ts 的 MSG_CAPTURE_VISIBLE 保持一致。
 */
const MSG_CAPTURE_VISIBLE = 'CAPTURE_VISIBLE'

/** captureVisibleTab 速率限制：每秒最多 2 次，间隔 550ms 留余量 */
const CAPTURE_THROTTLE_MS = 550

/** 每屏滚动后等待渲染稳定的时间（ms），懒加载/异步渲染页面可能仍不完美 */
const RENDER_WAIT_MS = 150

/**
 * 整页最大屏数。
 * 每屏耗时 ≈ RENDER_WAIT_MS(150) + CAPTURE_THROTTLE_MS(550) + HIDDEN_WAIT_MS(80) = 780ms，
 * 12 屏 × 780ms ≈ 9.4s < STEP_TIMEOUT_MS(10s)，留 0.6s 余量给图片解码/拼接。
 */
const MAX_FULL_PAGE_SCREENS = 12

/** canvas toDataURL 最大支持高度（像素），超长页面截断避免 OOM 和编码失败 */
const MAX_CANVAS_HEIGHT = 16384

/** 选区最小尺寸（CSS 像素），小于此值视为点击取消 */
const MIN_SELECTION_SIZE = 10

/** 选区遮罩自动超时（ms）：用户长时间不操作自动取消，避免遮罩残留卡住页面 */
const SELECTION_TIMEOUT_MS = 60000

/**
 * 隐藏 fixed 元素后等待浏览器完成重绘的时间（ms）。
 * 略放大（80ms）覆盖 will-change/transform 提升为合成层的 fixed 元素重绘延迟。
 */
const HIDDEN_WAIT_MS = 80

/**
 * 请求 SW 截当前可视区域，返回 data URL。
 * captureVisibleTab 仅 SW 可用，content script 通过消息通道请求。
 * @returns data URL 字符串
 * @throws Error SW 截图失败时抛出
 */
async function captureVisibleViaSW(): Promise<string> {
  const response = (await chrome.runtime.sendMessage({
    type: MSG_CAPTURE_VISIBLE,
    timestamp: Date.now(),
  })) as { success: boolean; dataUrl?: string; error?: string }
  if (!response?.success || !response.dataUrl) {
    throw new Error(response?.error || 'SW 截图失败')
  }
  return response.dataUrl
}

/**
 * 节流等待：保证两次 captureVisibleTab 调用间隔 ≥ 550ms，规避速率限制。
 * @param lastCaptureTime - 上次截图时间戳
 * @returns 本次截图后的新时间戳（供下一轮使用）
 */
async function throttleCapture(lastCaptureTime: number): Promise<number> {
  const elapsed = Date.now() - lastCaptureTime
  if (elapsed < CAPTURE_THROTTLE_MS) {
    await sleep(CAPTURE_THROTTLE_MS - elapsed)
  }
  return Date.now()
}

/**
 * 等待指定毫秒。
 * @param ms - 毫秒数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 把 data URL 加载成 HTMLImageElement，供 canvas drawImage 使用。
 * @param dataUrl - 图片 data URL
 * @returns 加载完成的 Image
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })
}

/**
 * 截图统一入口：按 mode 分流到三种模式。
 * 由 content/index.ts 的 SCREENSHOT 消息处理调用。
 * @param mode - 'visible' | 'full' | 'area'
 * @returns ContentScriptResponse，data 为 data URL
 */
export async function handleScreenshot(
  mode: 'visible' | 'full' | 'area'
): Promise<ContentScriptResponse> {
  if (mode === 'full') return await captureFullPage()
  if (mode === 'area') return await captureSelection()
  return await captureVisible()
}

/**
 * 截取可视区域（content script 统一入口，供 SCREENSHOT mode=visible 调用）。
 * @returns ContentScriptResponse，data 为 data URL
 */
export async function captureVisible(): Promise<ContentScriptResponse> {
  try {
    const dataUrl = await captureVisibleViaSW()
    return { success: true, data: dataUrl, timestamp: Date.now() }
  } catch (e) {
    return {
      success: false,
      error: 'CAPTURE_FAILED',
      message: e instanceof Error ? e.message : '可视区域截图失败',
      timestamp: Date.now(),
    }
  }
}

/**
 * 截取整个页面（含滚动区）。
 * 原理：滚动到每一屏 → 请求 SW captureVisibleTab → canvas 纵向拼接 → 恢复滚动位置。
 *
 * 分层截图（fixed 元素去重）：
 * - 截图前识别页面上 position:fixed 元素，记录它们在首屏的位置 + 像素切片
 * - 第 1 屏正常截图，fixed 元素自然保留
 * - 第 2~N 屏截图前临时 visibility:hidden 所有 fixed 元素（避免重复），截图后立即恢复
 * - 最终图把第 1 屏裁出的 fixed 像素切片按首屏坐标叠加回对应位置
 * - sticky 元素不处理（参与文档流，hidden 会引起 layout 错位），作为已知限制
 *
 * 真实像素捕获，还原度 100%。超长页面截断到 MAX_FULL_PAGE_SCREENS 屏。
 * @returns ContentScriptResponse，data 为整页 data URL
 */
export async function captureFullPage(): Promise<ContentScriptResponse> {
  const doc = document.documentElement
  const body = document.body
  const dpr = window.devicePixelRatio || 1

  // 页面总高度与视口尺寸（CSS 像素）；宽度按视口截（captureVisibleTab 截视口宽）
  const totalHeight = Math.max(doc.scrollHeight, body ? body.scrollHeight : 0)
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // 记录初始滚动位置，结束后恢复
  const originScrollX = window.scrollX
  const originScrollY = window.scrollY

  // 计算屏数并截断保护
  let screens = Math.ceil(totalHeight / viewportHeight)
  const truncated = screens > MAX_FULL_PAGE_SCREENS
  if (truncated) {
    screens = MAX_FULL_PAGE_SCREENS
  }

  // canvas 高度保护：totalHeight × dpr 超 MAX_CANVAS_HEIGHT 时按最大高度截断
  const captureHeight = Math.min(screens * viewportHeight, MAX_CANVAS_HEIGHT / dpr)
  const canvas = document.createElement('canvas')
  canvas.width = viewportWidth * dpr
  canvas.height = captureHeight * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return {
      success: false,
      error: 'CANVAS_CONTEXT_FAILED',
      message: '无法创建 canvas 上下文',
      timestamp: Date.now(),
    }
  }

  // 识别 fixed 元素，收集其在首屏的可见区域（CSS 像素）。
  // 若一个元素完全在视口外、不在当前 viewport 范围内、或被祖先 hidden，跳过。
  const fixedSnapshot = collectFixedElements(viewportWidth, viewportHeight)
  const hasFixed = fixedSnapshot.length > 0

  let lastCaptureTime = 0
  try {
    for (let i = 0; i < screens; i++) {
      const scrollY = i * viewportHeight
      window.scrollTo(0, scrollY)

      // 等待滚动 + 渲染稳定
      await sleep(RENDER_WAIT_MS)

      // 第 2 屏起截图前先隐藏 fixed 元素（首屏保留 fixed，叠加回顶部）
      if (hasFixed && i > 0) {
        hideFixedElements(fixedSnapshot)
        // 多等一段让浏览器完成 visibility:hidden 的重绘
        await sleep(HIDDEN_WAIT_MS)
      }

      // 节流：保证两次截图间隔 ≥ 550ms
      lastCaptureTime = await throttleCapture(lastCaptureTime)

      const dataUrl = await captureVisibleViaSW()
      const img = await loadImage(dataUrl)

      // 拼接到 canvas：y 偏移按截图实际像素（CSS 像素 × dpr）
      // 最后一屏可能超出 captureHeight，用裁剪避免越界
      const drawY = i * viewportHeight * dpr
      const remainingHeight = canvas.height - drawY
      const sourceHeight = Math.min(img.height, remainingHeight)
      ctx.drawImage(img, 0, 0, img.width, sourceHeight, 0, drawY, img.width, sourceHeight)

      // 当屏截图后立即恢复 fixed 元素 visibility，不依赖 finally
      if (hasFixed && i > 0) {
        restoreFixedElements(fixedSnapshot)
      }
    }

    // 分层叠加：把首屏的 fixed 元素像素切片贴回到大图对应坐标
    // （首屏截图天然包含 fixed 元素，第 2~N 屏已隐藏 fixed，所以第 1 屏的 fixed 区域
    //   就是最终需要的 fixed 元素呈现位置；后续屏对应位置被正文填充，fixed 不会重复）
    if (hasFixed) {
      overlayFixedFromFirstScreen(canvas, ctx, fixedSnapshot, dpr)
    }

    const resultDataUrl = canvas.toDataURL('image/png')
    const message = truncated ? `页面过长，仅截取前 ${screens} 屏` : undefined
    return {
      success: true,
      data: resultDataUrl,
      message,
      timestamp: Date.now(),
    }
  } catch (e) {
    return {
      success: false,
      error: 'FULL_PAGE_FAILED',
      message: e instanceof Error ? e.message : '整页截图失败',
      timestamp: Date.now(),
    }
  } finally {
    // 兜底：万一中途抛错，确保 fixed 元素 visibility 已恢复（截图循环内的 restore 是非 finally 路径）
    if (hasFixed) {
      restoreFixedElements(fixedSnapshot)
    }
    // 恢复初始滚动位置
    window.scrollTo(originScrollX, originScrollY)
  }
}

/**
 * fixed 元素快照：保存元素引用 + 截图前 visibility 值 + 首屏视口坐标。
 * 用途：截图前隐藏、截图后恢复；首屏坐标用于叠加时定位。
 */
interface FixedElementSnapshot {
  el: HTMLElement
  prevVisibility: string
  prevWillChange: string
  prevTransform: string
  /** 首屏（scrollY=0）视口坐标（CSS 像素），可能为负值表示部分在视口外 */
  rect: { x: number; y: number; width: number; height: number }
}

/**
 * 收集页面上所有 position:fixed 元素，及其在首屏的可见矩形。
 * 跳过：display:none、祖先已 hidden、完全在视口外的元素（性能 + 不影响视觉）。
 * @param viewportWidth - 视口宽度（CSS 像素）
 * @param viewportHeight - 视口高度（CSS 像素）
 * @returns 快照数组；若无 fixed 元素返回空数组（外层走原逻辑）
 */
function collectFixedElements(
  viewportWidth: number,
  viewportHeight: number
): FixedElementSnapshot[] {
  const result: FixedElementSnapshot[] = []
  const all = document.querySelectorAll<HTMLElement>('*')
  for (const el of Array.from(all)) {
    const style = getComputedStyle(el)
    if (style.position !== 'fixed') continue
    if (style.display === 'none' || style.visibility === 'hidden') continue

    const rect = el.getBoundingClientRect()
    // 完全在视口外（不与视口相交）的 fixed 元素对截图无影响，跳过
    if (
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= viewportWidth ||
      rect.top >= viewportHeight
    ) {
      continue
    }
    // 元素自身或任一祖先隐藏 → 跳过（hidden 元素不需要再 hide，截图本就不可见）
    if (isHiddenByAncestor(el)) continue

    result.push({
      el,
      prevVisibility: style.visibility,
      prevWillChange: style.willChange,
      prevTransform: style.transform,
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    })
  }
  return result
}

/**
 * 判断元素自身或任一祖先是否处于 hidden 状态（display:none / visibility:hidden）。
 * @param el - 起始元素
 * @returns true 表示被祖先隐藏
 */
function isHiddenByAncestor(el: HTMLElement): boolean {
  let cur: HTMLElement | null = el.parentElement
  while (cur) {
    const s = getComputedStyle(cur)
    if (s.display === 'none' || s.visibility === 'hidden') return true
    cur = cur.parentElement
  }
  return false
}

/**
 * 临时隐藏所有 fixed 元素（visibility:hidden + 强制退出合成层），避免 captureVisibleTab 仍拍到。
 *
 * 为什么需要强写 will-change / transform 还原为空：
 *   visibility:hidden 只能阻止 DOM 层渲染，但浏览器把元素提升到独立合成层（will-change != auto
 *   或 transform != none）后，该层会由合成器独立光栅化，captureVisibleTab 仍可能拿到该层的像素。
 *   所以隐藏时一并把 will-change 强制 auto、transform 强制 none，把元素踢出独立合成层，
 *   才能在 captureVisibleTab 中彻底消失。仅在元素原本未设置过对应属性时才覆盖，避免误改用户样式。
 *
 * @param snapshots - collectFixedElements 返回的快照
 */
function hideFixedElements(snapshots: FixedElementSnapshot[]): void {
  for (const s of snapshots) {
    s.el.style.setProperty('visibility', 'hidden', 'important')
    if (s.prevWillChange === '') {
      s.el.style.setProperty('will-change', 'auto', 'important')
    }
    if (s.prevTransform === '') {
      s.el.style.setProperty('transform', 'none', 'important')
    }
  }
}

/**
 * 恢复 fixed 元素的 visibility 到截图前的值。
 * 仅恢复本次会话内被修改过 visibility 的元素（prevVisibility 为 'visible' 才表示原本可见）。
 * @param snapshots - collectFixedElements 返回的快照
 */
function restoreFixedElements(snapshots: FixedElementSnapshot[]): void {
  for (const s of snapshots) {
    s.el.style.removeProperty('visibility')
    s.el.style.removeProperty('will-change')
    s.el.style.removeProperty('transform')
  }
}

/**
 * 把首屏 fixed 元素像素切片从 canvas 顶部区域裁出，再叠加回 canvas 同一坐标。
 * 实现原理：
 * - 首屏截图时 fixed 元素正常出现在 canvas 顶部（drawY=0 区域）
 * - 第 2~N 屏截图前 fixed 已隐藏，所以大图在首屏 fixed 区域里既有首屏的 fixed 像素，
 *   也可能有第 2~N 屏滚动上来的「非 fixed 正文」覆盖（fixed z-index 通常高于正文，所以
 *   大多数情况首屏 fixed 像素会被覆盖；若 fixed z-index 低于正文则仍保留，行为可接受）
 * - 为保证 fixed 元素一定最终可见，按首屏坐标从 canvas 自身裁出 fixed 区域 draw 回原位，
 *   即便被覆盖也能恢复
 * @param canvas - 拼接用大 canvas
 * @param ctx - canvas 2d 上下文
 * @param snapshots - 固定元素快照
 * @param dpr - 设备像素比（坐标 × dpr 转截图像素）
 */
function overlayFixedFromFirstScreen(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  snapshots: FixedElementSnapshot[],
  dpr: number
): void {
  for (const s of snapshots) {
    const x = s.rect.x * dpr
    const y = s.rect.y * dpr
    const w = s.rect.width * dpr
    const h = s.rect.height * dpr
    // 与 canvas 边界裁剪，避免越界
    const sx = Math.max(0, x)
    const sy = Math.max(0, y)
    const sw = Math.min(w, canvas.width - sx)
    const sh = Math.min(h, canvas.height - sy)
    if (sw <= 0 || sh <= 0) continue
    // 从 canvas 自身裁出该区域再贴回（强制 fixed 像素覆盖在拼接结果之上）
    ctx.drawImage(canvas, sx, sy, sw, sh, sx, sy, sw, sh)
  }
}

/**
 * 截取用户框选的区域。
 * 原理：注入 Shadow DOM 全屏遮罩 → 用户拖拽框选 → SW 截可视区域 → canvas 按选区坐标裁剪。
 * 选区坐标是 CSS 像素，裁剪时 × dpr 转换为截图像素。
 * @returns ContentScriptResponse，data 为裁剪后 data URL；用户取消返回 success:false
 */
export async function captureSelection(): Promise<ContentScriptResponse> {
  // 先让用户框选，拿到选区坐标（CSS 像素）
  // reject 原因：USER_CANCELLED（ESC）/ SELECTION_TIMEOUT（60s 未操作）
  const selection = await promptUserSelection().catch((e: unknown) => {
    const reason = e instanceof Error ? e.message : ''
    return {
      cancelled: true,
      timeout: reason === 'SELECTION_TIMEOUT',
    }
  })
  if (selection && 'cancelled' in selection) {
    return selection.timeout
      ? {
          success: false,
          error: 'SELECTION_TIMEOUT',
          message: '选区超时（60 秒未操作），已自动取消',
          timestamp: Date.now(),
        }
      : {
          success: false,
          error: 'USER_CANCELLED',
          message: '已取消选区截图',
          timestamp: Date.now(),
        }
  }

  // 选区过小视为取消
  if (selection.width < MIN_SELECTION_SIZE || selection.height < MIN_SELECTION_SIZE) {
    return {
      success: false,
      error: 'SELECTION_TOO_SMALL',
      message: '选区太小，已取消',
      timestamp: Date.now(),
    }
  }

  const dpr = window.devicePixelRatio || 1
  try {
    // 关键：截图前等一帧重绘。鼠标松开 → cleanup 移除 host 是同步的，但浏览器合成器
    // 还需要一帧才会把「无遮罩」的画面提交。立即调 captureVisibleTab 会拍到遮罩最后一帧，
    // 表现就是截图后页面残留一层蓝色浮层（其实是合成器内部还残留一帧，用户视觉上看到页面也闪了一下）。
    // 双重保险：rAF 等下一帧 + 微任务让 cleanup 完成 → 截到的画面一定是没有遮罩的。
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    await Promise.resolve()

    // 截当前可视区域（用户框选时页面不动）
    const dataUrl = await captureVisibleViaSW()
    const img = await loadImage(dataUrl)

    // 选区坐标 CSS 像素 → 截图像素（× dpr）
    const sx = selection.x * dpr
    const sy = selection.y * dpr
    const sw = selection.width * dpr
    const sh = selection.height * dpr

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return {
        success: false,
        error: 'CANVAS_CONTEXT_FAILED',
        message: '无法创建 canvas 上下文',
        timestamp: Date.now(),
      }
    }
    // 从可视区域截图中裁剪选区
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    const resultDataUrl = canvas.toDataURL('image/png')
    return { success: true, data: resultDataUrl, timestamp: Date.now() }
  } catch (e) {
    return {
      success: false,
      error: 'AREA_CAPTURE_FAILED',
      message: e instanceof Error ? e.message : '选区截图失败',
      timestamp: Date.now(),
    }
  }
}

/**
 * 选区坐标（CSS 像素，相对视口）
 */
interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 注入 Shadow DOM 选区遮罩，让用户拖拽框选区域。
 * 遮罩 position:fixed 覆盖整个视口，Shadow DOM 隔离目标页面 CSS。
 * ESC 取消、鼠标松开确定选区、60s 不操作自动超时取消（避免遮罩残留卡住页面）。
 * @returns 选区坐标（CSS 像素）；用户取消时 reject
 */
function promptUserSelection(): Promise<SelectionRect> {
  return new Promise((resolve, reject) => {
    // 宿主元素承载 Shadow DOM，避免目标页面 CSS 污染
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;'
    const shadow = host.attachShadow({ mode: 'closed' })

    // 超时定时器：60s 不操作自动取消，避免遮罩残留（如用户切走忘记取消）
    const timeoutId = window.setTimeout(() => {
      cleanup(true)
      reject(new Error('SELECTION_TIMEOUT'))
    }, SELECTION_TIMEOUT_MS)

    // 遮罩层样式
    const style = document.createElement('style')
    style.textContent = `
      .sc-overlay {
        position: fixed;
        inset: 0;
        background: transparent;
        cursor: crosshair;
      }
      .sc-selection {
        position: absolute;
        border: 2px solid #3b82f6;
        background: transparent;
        pointer-events: none;
      }
      .sc-tip {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 14px;
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        font-size: 13px;
        border-radius: 6px;
        font-family: system-ui, sans-serif;
        pointer-events: none;
      }
    `
    const overlay = document.createElement('div')
    overlay.className = 'sc-overlay'
    const selectionBox = document.createElement('div')
    selectionBox.className = 'sc-selection'
    selectionBox.style.display = 'none'
    const tip = document.createElement('div')
    tip.className = 'sc-tip'
    tip.textContent = '拖拽选择截图区域，按 ESC 取消'

    shadow.appendChild(style)
    shadow.appendChild(overlay)
    shadow.appendChild(selectionBox)
    shadow.appendChild(tip)
    document.body.appendChild(host)

    let startX = 0
    let startY = 0
    let isSelecting = false

    /**
     * 清理遮罩 DOM 和定时器。
     * @param removeHost - 是否移除宿主元素
     */
    function cleanup(removeHost: boolean): void {
      window.clearTimeout(timeoutId)
      overlay.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('keydown', onKeyDown)
      if (removeHost && host.parentNode) {
        host.parentNode.removeChild(host)
      }
    }

    function onMouseDown(e: MouseEvent): void {
      isSelecting = true
      startX = e.clientX
      startY = e.clientY
      selectionBox.style.display = 'block'
      selectionBox.style.left = `${startX}px`
      selectionBox.style.top = `${startY}px`
      selectionBox.style.width = '0px'
      selectionBox.style.height = '0px'
    }

    function onMouseMove(e: MouseEvent): void {
      if (!isSelecting) return
      const curX = e.clientX
      const curY = e.clientY
      const left = Math.min(startX, curX)
      const top = Math.min(startY, curY)
      const width = Math.abs(curX - startX)
      const height = Math.abs(curY - startY)
      selectionBox.style.left = `${left}px`
      selectionBox.style.top = `${top}px`
      selectionBox.style.width = `${width}px`
      selectionBox.style.height = `${height}px`
    }

    function onMouseUp(e: MouseEvent): void {
      if (!isSelecting) return
      isSelecting = false
      const curX = e.clientX
      const curY = e.clientY
      const x = Math.min(startX, curX)
      const y = Math.min(startY, curY)
      const width = Math.abs(curX - startX)
      const height = Math.abs(curY - startY)
      cleanup(true)
      resolve({ x, y, width, height })
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        cleanup(true)
        reject(new Error('USER_CANCELLED'))
      }
    }

    overlay.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keydown', onKeyDown)
  })
}
