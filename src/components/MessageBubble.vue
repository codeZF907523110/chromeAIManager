<template>
  <div class="bubble" :class="`bubble-${msg.type}`">
    <div v-html="processedText"></div>
    <img v-if="msg.image" :src="msg.image" class="screenshot-img" />
    <video v-if="msg.video" :src="msg.video" controls class="recording-video" />
    <div v-if="msg.recordingFile" class="recording-file-card">
      <video
        v-if="msg.recordingFile.preview"
        :src="msg.recordingFile.preview"
        controls
        class="recording-video"
      />
      <span class="recording-file-name">{{ msg.recordingFile.name }}</span>
      <a
        :href="msg.recordingFile.url"
        :download="msg.recordingFile.name"
        class="recording-download-btn"
      >
        ⬇ 下载
      </a>
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

.recording-video {
  max-width: 100%;
  border-radius: 8px;
  margin-top: 8px;
  background: #000;
  display: block;
}

.recording-file-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.recording-file-card .recording-video {
  width: 100%;
  margin-top: 0;
}

.recording-file-card .recording-file-name {
  flex: 1;
  font-size: 12px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recording-download-btn {
  flex-shrink: 0;
  display: inline-block;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #ccc;
  text-decoration: none;
  font-size: 13px;
  transition:
    background 0.2s,
    color 0.2s;
  white-space: nowrap;
}

.recording-download-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
</style>
