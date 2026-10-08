<!--
  TaskBlock — 单次任务的折叠容器

  把 MessageList 通过 useTaskBlocks 识别出的一段连续 task system 消息渲染为一个整体块。
  整块支持展开/收起；块内 MessageBubble 强制 disableFold（不再有单条折叠按钮）。
-->

<template>
  <div class="task-block" :data-expanded="expanded" :data-block-id="blockId">
    <header class="task-block__header" @click="emit('toggle')">
      <ChevronRight :size="14" class="task-block__chevron" />
      <span class="task-block__title">{{ t('task.title') }}</span>
      <span class="task-block__count">{{ t('task.count', messages.length) }}</span>
      <span v-if="!expanded" class="task-block__preview">— {{ lastPreview }}</span>
    </header>
    <div v-show="expanded" class="task-block__body">
      <MessageBubble
        v-for="(m, i) in messages"
        :key="indices[i]"
        :msg="m"
        :index="indices[i]"
        :disable-fold="true"
        @delete="(idx) => emit('delete', idx)"
      />
      <!-- 流式进行中的实时思考行：位于块尾，thought 正式落库后由父级清空该 prop 消失 -->
      <div v-if="liveThought" class="task-block__live-thought">{{ liveThought }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight } from 'lucide-vue-next'
import type { MessageLog } from '../types'
import MessageBubble from './MessageBubble.vue'

const { t } = useI18n()

const props = defineProps<{
  blockId: string
  messages: MessageLog[]
  indices: number[]
  expanded: boolean
  /** 流式进行中的实时思考文本（仅当前活动块由父级传入；空串/缺省不渲染） */
  liveThought?: string
}>()

const emit = defineEmits<{
  toggle: []
  delete: [index: number]
}>()

/**
 * 收起状态下块头预览文案：取最后一条 system 的 markdown，去空白后截断到 40 字。
 */
const lastPreview = computed(() => {
  const last = props.messages[props.messages.length - 1]
  const txt = last?.text?.markdown ?? ''
  const flat = txt.replace(/\s+/g, ' ').trim()
  return flat.length > 40 ? flat.slice(0, 40) + '…' : flat
})
</script>

<style scoped>
.task-block {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border-left: 2px solid var(--app-text-secondary);
  /* overflow: hidden; 这儿不能加overflow: hidden，样式会有问题，必须去掉 */
}

.task-block__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--app-text-muted);
}

.task-block__chevron {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.task-block[data-expanded='true'] .task-block__chevron {
  transform: rotate(90deg);
}

.task-block__title {
  color: var(--app-text-secondary);
  font-weight: 500;
}

.task-block__count {
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.task-block__preview {
  color: var(--app-text-muted);
  font-size: 11px;
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}

.task-block__body {
  padding: 4px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 流式实时思考行：复用 system 气泡的弱化日志视觉（小字号 + 次要色） */
.task-block__live-thought {
  font-size: 12px;
  line-height: 1.6;
  color: var(--app-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
