<template>
  <div class="message-item" :class="{ 'message-item-user': msg.type === 'user' }">
    <button
      v-if="msg.type === 'user'"
      class="delete-btn"
      title="删除此条消息"
      @click="handleDelete"
    >
      <el-icon :size="14"><Delete /></el-icon>
    </button>
    <div class="bubble" :class="`bubble-${msg.type}`">
      <div class="bubble-content">
        <!-- 系统消息：长内容支持展开/收起 -->
        <template v-if="msg.type === 'system' && isLongContent">
          <div class="thinking-content" :class="{ expanded: isExpanded }" @click="toggleExpand">
            <div class="thinking-text" v-html="processedText"></div>
          </div>
          <div class="expand-indicator" @click="toggleExpand">
            <ChevronDown v-if="!isExpanded" :size="12" />
            <ChevronUp v-else :size="12" />
            <span>{{ isExpanded ? '收起' : '展开' }}</span>
          </div>
        </template>
        <!-- 其他消息：正常显示 -->
        <div v-else v-html="processedText"></div>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ElMessageBox, ElIcon } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import type { MessageLog } from '../types'

const props = defineProps<{
  msg: MessageLog
  index: number
}>()

const emit = defineEmits<{
  delete: [index: number]
}>()

const isExpanded = ref(false)

// 系统消息且内容长度超过阈值时，启用展开/收起
const LONG_CONTENT_THRESHOLD = 150
const isLongContent = computed(() => {
  return props.msg.type === 'system' && props.msg.text.length > LONG_CONTENT_THRESHOLD
})

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm('确定删除这条会话吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    emit('delete', props.index)
  } catch {
    // 用户取消
  }
}

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
    // 重置展开状态
    isExpanded.value = false
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
.message-item {
  display: flex;
  align-items: center;
  animation: bubbleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.message-item-user {
  justify-content: flex-end;
}

.bubble {
  padding: 12px 16px;
  border-radius: 10px;
  max-width: 85%;
  word-wrap: break-word;
  font-size: 14px;
  line-height: 1.6;
  animation: none;
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

.message-item:hover .delete-btn {
  opacity: 1;
}

/* 长内容折叠 - 固定显示3行 */
.thinking-content {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  position: relative;
  transition: all 0.3s ease;
}

.thinking-content.expanded {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}

/* 展开/收起指示器 - 居中显示 */
.expand-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
  margin-top: 4px;
  color: var(--app-text-muted);
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  user-select: none;
}

.expand-indicator:hover {
  color: var(--app-text-secondary);
  background: var(--app-picker-item-hover);
}

.expand-indicator svg {
  transition: transform 0.2s ease;
}

.expand-indicator:hover svg {
  transform: scale(1.1);
}

/* 收起状态的渐变遮罩 */
.thinking-content:not(.expanded)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 24px;
  background: linear-gradient(to bottom, transparent, var(--app-bg-card));
  pointer-events: none;
}

/* 用户消息样式 */
.bubble-user {
  background: var(--app-bg-card);
  border: 1px solid var(--app-border);
  color: var(--app-text-primary);
  border-bottom-right-radius: 4px;
}

.delete-btn {
  flex-shrink: 0;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border);
  border-radius: 50%;
  cursor: pointer;
  padding: 4px;
  color: var(--app-text-secondary);
  transition:
    color 0.2s,
    background 0.2s,
    opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  width: 24px;
  height: 24px;
}

.delete-btn:hover {
  color: var(--app-error);
  background: rgba(255, 100, 100, 0.1);
}

/* AI 聊天消息样式 */
.bubble-ai-chat {
  background: var(--app-bg-card);
  border: 1px solid var(--app-border);
  color: var(--app-text-primary);
  border-bottom-left-radius: 4px;
}

/* 系统消息样式 */
.bubble-system {
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 12px;
  padding: 8px 16px;
  max-width: 100%;
  text-align: center;
  border-radius: 20px;
}

.bubble-error {
  background: rgba(255, 100, 100, 0.08);
  border: 1px solid rgba(255, 100, 100, 0.2);
  color: var(--app-error);
  border-left: 3px solid var(--app-error);
}

.bubble :deep(strong) {
  color: var(--app-text-primary);
  font-weight: 600;
}

.bubble :deep(em) {
  color: var(--app-text-muted);
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
  color: var(--app-text-primary);
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
  border: 1px solid var(--app-border);
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
  border-left: 3px solid var(--app-border);
  color: var(--app-text-secondary);
}

.bubble :deep(a) {
  color: var(--app-text-primary);
  text-decoration: underline;
}

.bubble :deep(hr) {
  border: none;
  border-top: 1px solid var(--app-border);
  margin: 12px 0;
}

.bubble :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
  table-layout: fixed;
}

.bubble :deep(th),
.bubble :deep(td) {
  border: 1px solid var(--app-border);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
}

.bubble :deep(th) {
  background: rgba(0, 0, 0, 0.2);
}

/* history 表格列宽：时间列固定宽度，标题列自适应，链接列占剩余并可截断 */
.bubble :deep(table th:nth-child(1)),
.bubble :deep(table td:nth-child(1)) {
  width: 56px;
  white-space: nowrap;
}
.bubble :deep(table th:nth-child(3)),
.bubble :deep(table td:nth-child(3)) {
  word-break: break-all;
  overflow-wrap: anywhere;
}
.bubble :deep(table td:nth-child(3) a) {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
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
  background: var(--app-video-bg);
  display: block;
}

.recording-file-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: var(--app-picker-item-hover);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.recording-file-card .recording-video {
  width: 100%;
  margin-top: 0;
}

.recording-file-card .recording-file-name {
  flex: 1;
  font-size: 12px;
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recording-download-btn {
  flex-shrink: 0;
  display: inline-block;
  padding: 4px 12px;
  background: var(--app-picker-item-hover);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text-primary);
  text-decoration: none;
  font-size: 13px;
  transition:
    background 0.2s,
    color 0.2s;
  white-space: nowrap;
}

.recording-download-btn:hover {
  background: var(--app-picker-item-hover);
  color: var(--app-text-primary);
}
</style>
