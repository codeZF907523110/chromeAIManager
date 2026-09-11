<!--
  TaskBlock — 单次任务的折叠容器

  把 MessageList 通过 useTaskBlocks 识别出的一段连续 task system 消息渲染为一个整体块。
  整块支持展开/收起；块内 MessageBubble 强制 disableFold（不再有单条折叠按钮）。
-->

<template>
  <div class="task-block" :data-expanded="expanded" :data-block-id="blockId">
    <header class="task-block__header" @click="emit('toggle')">
      <ChevronRight :size="14" class="task-block__chevron" />
      <span class="task-block__title">本次任务</span>
      <span class="task-block__count">{{ messages.length }} 条</span>
      <span v-if="!expanded" class="task-block__preview">— {{ lastPreview }}</span>
    </header>
    <Transition name="collapse">
      <div v-show="expanded" class="task-block__body">
        <MessageBubble
          v-for="(m, i) in messages"
          :key="indices[i]"
          :msg="m"
          :index="indices[i]"
          :disable-fold="true"
          @delete="(idx) => emit('delete', idx)"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import type { MessageLog } from '../types'
import MessageBubble from './MessageBubble.vue'

const props = defineProps<{
  blockId: string
  messages: MessageLog[]
  indices: number[]
  expanded: boolean
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

.collapse-enter-active,
.collapse-leave-active {
  transition: opacity 0.2s ease;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
}
</style>
