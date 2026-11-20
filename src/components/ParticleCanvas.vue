<template>
  <canvas ref="canvasRef" class="particle-canvas"></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 星空背景（docs/starfield-background.md）
 * 星色取自品牌 sparkle 图标的渐变三色（青 → 蓝 → 紫）+ shadowBlur 同色光晕 +
 * 每星独立相位的正弦闪烁（异步「一闪一闪」）+ 缓慢太空漂移（无连线）。
 */

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animationId: number | null = null
let ctx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let width = 0
let height = 0
let resizeObserver: ResizeObserver | null = null

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** 星点半径（0.8–2px 随机，制造远近层次） */
  size: number
  /** 闪烁初相（随机，保证各星异步闪烁） */
  phase: number
  /** 闪烁角速度（rad/s，约 3–10 秒一闪） */
  speed: number
  /** 星色索引（STAR_COLORS 下标，创建时随机抽取） */
  colorIndex: number
}

/** 星色盘：品牌 sparkle 图标渐变的三色取样（青 #22d3ee → 蓝 #3b82f6 → 紫 #a78bfa） */
const STAR_COLORS = ['#22d3ee', '#3b82f6', '#a78bfa']

/** 主题亮度参数：闪烁中心/振幅、光晕强度 */
interface StarThemeConfig {
  base: number
  amp: number
  glowBase: number
  glowAmp: number
}
const THEME_CONFIG_DARK: StarThemeConfig = {
  base: 0.5,
  amp: 0.4,
  glowBase: 4,
  glowAmp: 6,
}
const THEME_CONFIG_LIGHT: StarThemeConfig = {
  base: 0.35,
  amp: 0.25,
  glowBase: 3,
  glowAmp: 4,
}

// 主题参数按 --app-bg 值缓存，避免逐帧重算
let themeCacheKey = ''
let starConfig: StarThemeConfig = THEME_CONFIG_DARK

function createParticle(): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.12,
    vy: (Math.random() - 0.5) * 0.12,
    size: Math.random() * 1.2 + 0.8,
    phase: Math.random() * Math.PI * 2,
    speed: Math.random() * 1.6 + 0.6,
    colorIndex: Math.floor(Math.random() * STAR_COLORS.length),
  }
}

function getBgColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--app-bg').trim() || '#0a0a0a'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 136, g: 136, b: 136 } // --app-text-muted fallback: #888
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * 读取当前主题的亮度参数（按 --app-bg 亮度判断明暗，缓存避免逐帧重算）
 * @returns 暗色/亮色主题对应配置
 */
function getStarTheme(): StarThemeConfig {
  const bg = getBgColor()
  if (bg !== themeCacheKey) {
    const { r, g, b } = hexToRgb(bg)
    const dark = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
    starConfig = dark ? THEME_CONFIG_DARK : THEME_CONFIG_LIGHT
    themeCacheKey = bg
  }
  return starConfig
}

function initCanvas() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }

  const canvas = canvasRef.value
  if (!canvas) return

  ctx = canvas.getContext('2d')
  if (!ctx) return

  // fixed 定位下 offsetWidth 可能为 0（side panel 刚打开时），用 window 尺寸兜底
  const w = canvas.offsetWidth || window.innerWidth
  const h = canvas.offsetHeight || window.innerHeight
  width = canvas.width = w
  height = canvas.height = h

  particles = []
  const count = Math.floor((width * height) / 10000)
  for (let i = 0; i < count; i++) {
    particles.push(createParticle())
  }
}

function draw() {
  if (!ctx) return

  ctx.clearRect(0, 0, width, height)

  // 填充背景色
  ctx.fillStyle = getBgColor()
  ctx.fillRect(0, 0, width, height)

  const config = getStarTheme()
  const t = performance.now() / 1000

  // 绘制星点：独立相位的正弦闪烁 + 同色光晕（品牌渐变色）
  for (const p of particles) {
    // 更新位置
    p.x += p.vx
    p.y += p.vy

    // 边界反弹
    if (p.x < 0 || p.x > width) p.vx *= -1
    if (p.y < 0 || p.y > height) p.vy *= -1

    // 闪烁亮度：base ± amp，随各自相位异步起伏
    const tw = Math.sin(t * p.speed + p.phase)
    const alpha = Math.max(config.base + config.amp * tw, 0.05)
    const color = STAR_COLORS[p.colorIndex]

    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    // 光晕随闪烁峰值增强，谷值时近乎熄灭
    ctx.shadowBlur = config.glowBase + config.glowAmp * Math.max(0, tw)
    ctx.shadowColor = color
    ctx.fillStyle = rgba(color, alpha)
    ctx.fill()
  }

  animationId = requestAnimationFrame(draw)
}

function handleResize() {
  initCanvas()
  // initCanvas 取消了 animationId，需要重新启动 draw
  if (!animationId) draw()
}

onMounted(() => {
  // 延迟一帧确保 side panel 布局完成
  requestAnimationFrame(() => {
    initCanvas()
    draw()
  })

  // 用 ResizeObserver 监听 canvas 尺寸变化（比 window resize 更可靠）
  if (canvasRef.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(canvasRef.value)
  }

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.particle-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1;
}
</style>
