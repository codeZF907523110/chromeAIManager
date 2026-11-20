<!--
  ChatEmptyGuide — 空对话引导页（首次使用指引）

  对话记录为空时由 MessageList 渲染：品牌 sparkle + 问候标题 + 能力描述 +
  「去选择模型」入口 + 案例标签。案例点击只回填输入框并聚焦，不自动发送。
  交互通过事件上抛，设置开关与输入框状态由 App.vue 处理（见 docs/empty-state-guide.md）。
-->

<template>
  <div class="empty-guide">
    <!-- 品牌 sparkle：与 header 品牌动画同一星形与渐变，静态展示 -->
    <div class="guide-logo">
      <span class="guide-spark"></span>
    </div>
    <h1 class="guide-title">{{ t('empty.title') }}</h1>
    <p class="guide-desc">{{ t('empty.desc') }}</p>

    <button class="guide-setup" @click="emit('open-settings')">
      <Settings :size="14" />
      <span>{{ t('empty.setupModel') }}</span>
      <ChevronRight :size="14" class="guide-setup-arrow" />
    </button>

    <div class="guide-try-label">{{ t('empty.tryLabel') }}</div>
    <div class="guide-examples">
      <button
        v-for="(item, i) in examples"
        :key="i"
        class="guide-example"
        :style="{ animationDelay: `${0.25 + i * 0.07}s` }"
        @click="emit('use-example', item.text)"
      >
        <component :is="item.icon" :size="14" class="guide-example-icon" />
        <span>{{ item.text }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  History,
  Layers,
  Copy,
  Camera,
  Cookie,
  Clock3,
  Settings,
  ChevronRight,
} from 'lucide-vue-next'
import { computed, type Component } from 'vue'

const { t } = useI18n()

const emit = defineEmits<{
  /** 点击案例标签：把案例文案回填到输入框 */
  'use-example': [text: string]
  /** 点击「去选择模型」：打开设置抽屉 */
  'open-settings': []
}>()

/**
 * 案例标签列表：每个案例对应一条真实可用链路（专用命令或 chrome_api 兜底）。
 * computed 包裹保证切换语言时文案随之更新（t() 的响应性依赖 locale ref）。
 */
const examples = computed<{ icon: Component; text: string }[]>(() => [
  { icon: History, text: t('empty.example1') },
  { icon: Layers, text: t('empty.example2') },
  { icon: Copy, text: t('empty.example3') },
  { icon: Camera, text: t('empty.example4') },
  { icon: Cookie, text: t('empty.example5') },
  { icon: Clock3, text: t('empty.example6') },
])
</script>

<style scoped>
/* 居中容器：滚动区内 min-height:100% + flex center，内容不撑出滚动条 */
.empty-guide {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px 12px;
  animation: guide-in 0.5s ease both;
}

/* 品牌 sparkle：与 header 同一 mask 星形与渐变，静态 + 柔光 */
.guide-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--app-accent) 22%, transparent) 0%,
    transparent 70%
  );
  animation: guide-in 0.5s ease both;
}

.guide-spark {
  --spark-shape: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 0C8.6 4.6 11.4 7.4 16 8C11.4 8.6 8.6 11.4 8 16C7.4 11.4 4.6 8.6 0 8C4.6 7.4 7.4 4.6 8 0Z'/%3E%3C/svg%3E");
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #22d3ee, #3b82f6 50%, #a78bfa);
  -webkit-mask: var(--spark-shape) center / contain no-repeat;
  mask: var(--spark-shape) center / contain no-repeat;
}

/* 标题：渐变文字（品牌渐变） */
.guide-title {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(120deg, #22d3ee, #3b82f6 55%, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: guide-in 0.5s ease 0.08s both;
}

.guide-desc {
  margin: 0 0 20px;
  max-width: 300px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--app-text-secondary);
  animation: guide-in 0.5s ease 0.16s both;
}

/* 「去选择模型」入口：描边胶囊按钮，hover 浮起 */
.guide-setup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--app-accent) 45%, transparent);
  background: color-mix(in srgb, var(--app-accent) 10%, transparent);
  color: var(--app-text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.15s ease,
    border-color 0.15s ease;
  animation: guide-in 0.5s ease 0.24s both;
}

.guide-setup:hover {
  background: color-mix(in srgb, var(--app-accent) 20%, transparent);
  border-color: var(--app-accent);
  transform: translateY(-1px);
}

.guide-setup-arrow {
  color: var(--app-accent);
}

/* 案例区标签 */
.guide-try-label {
  margin: 22px 0 10px;
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--app-text-muted);
  animation: guide-in 0.5s ease 0.3s both;
}

/* 案例标签网格：窄侧边栏下自动单列 */
.guide-examples {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  max-width: 320px;
}

.guide-example {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid var(--app-border);
  background: var(--app-bg-input);
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
  animation: guide-in 0.5s ease both;
}

.guide-example:hover {
  border-color: color-mix(in srgb, var(--app-accent) 50%, transparent);
  background: color-mix(in srgb, var(--app-accent) 8%, transparent);
  color: var(--app-text-primary);
  transform: translateY(-1px);
}

.guide-example-icon {
  flex-shrink: 0;
  color: var(--app-accent);
}

/* 入场：fade-up；案例标签的 delay 由内联 animationDelay 逐个递进 */
@keyframes guide-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .empty-guide,
  .guide-logo,
  .guide-title,
  .guide-desc,
  .guide-setup,
  .guide-try-label,
  .guide-example {
    animation: none;
  }
}
</style>
