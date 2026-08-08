<template>
  <canvas ref="canvasRef" class="particle-canvas"></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

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
  size: number
  opacity: number
  opacityDir: number
}

function createParticle(): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    size: Math.random() * 1.5 + 0.5,
    opacity: Math.random() * 0.5 + 0.1,
    opacityDir: Math.random() > 0.5 ? 1 : -1,
  }
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
  const count = Math.floor((width * height) / 15000)
  for (let i = 0; i < count; i++) {
    particles.push(createParticle())
  }
}

function draw() {
  if (!ctx) return

  ctx.clearRect(0, 0, width, height)

  // 绘制粒子
  for (const p of particles) {
    // 更新位置
    p.x += p.vx
    p.y += p.vy

    // 边界反弹
    if (p.x < 0 || p.x > width) p.vx *= -1
    if (p.y < 0 || p.y > height) p.vy *= -1

    // 呼吸效果
    p.opacity += p.opacityDir * 0.005
    if (p.opacity > 0.6 || p.opacity < 0.1) p.opacityDir *= -1

    // 绘制
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`
    ctx.fill()
  }

  // 绘制连线
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x
      const dy = particles[i].y - particles[j].y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 100) {
        const alpha = (1 - dist / 100) * 0.15
        ctx.beginPath()
        ctx.moveTo(particles[i].x, particles[i].y)
        ctx.lineTo(particles[j].x, particles[j].y)
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }
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
  z-index: 0;
}
</style>
