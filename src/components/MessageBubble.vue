<template>
  <div class="bubble" :class="`bubble-${msg.type}`">
    <div v-html="processedText"></div>
    <img v-if="msg.image" :src="msg.image" class="screenshot-img" />
    <div v-if="msg.video" class="recording-container">
      <video :src="msg.video" controls class="recording-video"></video>
      <a :href="msg.video" download="recording.webm" class="download-btn">⬇ 下载视频</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { MessageLog } from '../types'

const props = defineProps<{
  msg: MessageLog
}>()

const processedText = ref('')

// marked.parse() 在 v5+ 中返回 Promise，需要异步处理
watch(
  () => props.msg,
  async (msg) => {
    if (msg.type === 'ai-chat') {
      try {
        processedText.value = DOMPurify.sanitize(
          await marked.parse(msg.text, { breaks: true, gfm: true })
        )
      } catch {
        processedText.value = escapeHtml(msg.text)
      }
    } else {
      processedText.value = escapeHtml(msg.text)
    }
  },
  { immediate: true }
)

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
</script>

<style scoped>
.bubble {
  padding: 12px 16px;
  border-radius: 10px;
  max-width: 85%;
  word-wrap: break-word;
  font-size: 14px;
  line-height: 1.6;
  animation: bubbleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes bubbleIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bubble-user {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-left: auto;
  color: #e0e0e0;
  border-bottom-right-radius: 4px;
}

.bubble-ai-chat {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e0e0e0;
  border-bottom-left-radius: 4px;
}

.bubble-system {
  background: transparent;
  color: #666;
  font-size: 12px;
  padding: 8px 16px;
  max-width: 100%;
  text-align: center;
  border-radius: 20px;
}

.bubble-error {
  background: rgba(255, 100, 100, 0.08);
  border: 1px solid rgba(255, 100, 100, 0.2);
  color: #ff6b6b;
  border-left: 3px solid #ff6b6b;
}

.bubble :deep(strong) {
  color: #fff;
  font-weight: 600;
}

.bubble :deep(em) {
  color: #aaa;
  font-style: italic;
}

/* Marked 生成的 HTML 样式 */
.bubble :deep(p) {
  margin: 0 0 8px 0;
}

.bubble :deep(p:last-child) {
  margin-bottom: 0;
}

.bubble :deep(h1),
.bubble :deep(h2),
.bubble :deep(h3),
.bubble :deep(h4) {
  color: #fff;
  margin: 16px 0 8px 0;
  font-weight: 600;
}

.bubble :deep(h1) {
  font-size: 18px;
}
.bubble :deep(h2) {
  font-size: 16px;
}
.bubble :deep(h3) {
  font-size: 15px;
}
.bubble :deep(h4) {
  font-size: 14px;
}

.bubble :deep(ul),
.bubble :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.bubble :deep(li) {
  margin: 4px 0;
}

.bubble :deep(pre) {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0;
  overflow-x: auto;
}

.bubble :deep(code) {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
}

.bubble :deep(pre code) {
  background: none;
  padding: 0;
}

.bubble :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid rgba(255, 255, 255, 0.2);
  color: #888;
}

.bubble :deep(a) {
  color: #fff;
  text-decoration: underline;
}

.bubble :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 12px 0;
}

.bubble :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}

.bubble :deep(th),
.bubble :deep(td) {
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 6px 10px;
  text-align: left;
}

.bubble :deep(th) {
  background: rgba(0, 0, 0, 0.2);
}

.screenshot-img {
  max-width: 100%;
  border-radius: 8px;
  margin-top: 8px;
  display: block;
}

.recording-container {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recording-video {
  max-width: 100%;
  border-radius: 8px;
  background: #000;
}

.download-btn {
  display: inline-block;
  padding: 6px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #aaa;
  text-decoration: none;
  font-size: 13px;
  align-self: flex-start;
  transition: background 0.2s;
}

.download-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
</style>
