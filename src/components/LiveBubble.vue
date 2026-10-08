<!--
  LiveBubble — 流式实时回复气泡（docs/streaming-output.md §4.4）

  渲染 AI 流式输出中尚未落库的回复前缀（liveStream.replyText），
  流结束后由 emitAIChat 的正式 ai-chat 消息或 finalizePartialLive 的转正消息取代，
  本组件随之消失。只做显示，不参与任务决策。

  与 MessageBubble 的差异：无消息 ID / 无操作按钮 / 不落库，文本随 delta 单调增长。
-->

<template>
  <div class="message-item message-item-ai-chat">
    <div class="bubble bubble-ai-chat">
      <div class="bubble-content">
        <span class="live-body" v-html="renderedHtml"></span><span class="live-caret"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../composables/useMarkdown'

const props = defineProps<{
  /** 已流式显示的回复文本（单调增长的前缀，经 partial JSON 提取） */
  text: string
}>()

/** 增量文本 → HTML（marked + DOMPurify，与正式气泡同一渲染管线，保证样式/安全一致） */
const renderedHtml = computed(() => renderMarkdown(props.text))
</script>

<style scoped>
.message-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.bubble {
  padding: 12px 16px;
  border-radius: 10px;
  max-width: 85%;
  word-wrap: break-word;
  font-size: 14px;
  line-height: 1.6;
}

/* 视觉对齐 MessageBubble 的 ai-chat 气泡（其样式为 scoped，无法直接复用） */
.bubble-ai-chat {
  background: var(--app-bg-card);
  border: 1px solid var(--app-border);
  color: var(--app-text-primary);
  border-bottom-left-radius: 4px;
}

.bubble :deep(p) {
  margin: 0 0 8px 0;
}

.bubble :deep(p:last-child) {
  margin-bottom: 0;
}

.bubble :deep(ul),
.bubble :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.bubble :deep(li) {
  margin: 4px 0;
}

.bubble :deep(code) {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  background: rgba(127, 127, 127, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--app-text-primary);
}

.bubble :deep(pre) {
  background: var(--hljs-bg);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 8px 0;
  overflow-x: auto;
  line-height: 1.5;
}

/* 流式光标：跟随文本尾部闪烁，提示"还在输出" */
.live-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--app-text-secondary);
  animation: live-caret-blink 0.9s steps(1) infinite;
}

@keyframes live-caret-blink {
  0%,
  60% {
    opacity: 1;
  }
  61%,
  100% {
    opacity: 0;
  }
}
</style>
