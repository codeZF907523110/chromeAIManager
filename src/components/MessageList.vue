<!--
  MessageList — 消息列表渲染入口

  通过 useTaskBlocks 把 messageLog 切成 bubble / block 两种渲染单元。
  - bubble: 单条 MessageBubble（user / ai / 块外独立 system）
  - block:  TaskBlock（一段连续 task system 消息，整块可折叠）
-->

<template>
  <div ref="containerRef" class="messages">
    <template v-for="item in renderItems" :key="renderKey(item)">
      <MessageBubble
        v-if="item.kind === 'bubble'"
        :msg="item.msg"
        :index="item.index"
        @delete="(idx) => emit('delete', idx)"
      />
      <TaskBlock
        v-else
        :block-id="item.blockId"
        :messages="item.messages"
        :indices="item.indices"
        :expanded="item.expanded"
        @toggle="toggleExpanded(item.blockId)"
        @delete="(idx) => emit('delete', idx)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from 'vue'
import type { MessageLog } from '../types'
import MessageBubble from './MessageBubble.vue'
import TaskBlock from './TaskBlock.vue'
import { useTaskBlocks, type RenderItem } from '../composables/useTaskBlocks'

const props = defineProps<{
  messages: readonly MessageLog[]
  /**
   * 当前活动任务 ID（用于在任务结束时自动收起最近一个任务块）。
   * 由 App.vue 从 useAIEngine().state.activeLoopId 透传。
   */
  activeLoopId?: string | null
}>()

const emit = defineEmits<{
  delete: [index: number]
}>()

const containerRef = ref<HTMLDivElement>()
let scrollTimer: ReturnType<typeof setTimeout> | null = null
// 首屏初始化阶段：父组件恢复历史消息时也会触发 watcher，此时应保持瞬时滚动不动画
let isInitializing = true

const messagesRef = computed<readonly MessageLog[]>(() => props.messages)
const loopRef = computed<string | null | undefined>(() => props.activeLoopId ?? null)
const { renderItems, toggleExpanded } = useTaskBlocks(messagesRef, loopRef)

/**
 * 给 v-for 用的 key：bubble 用 index，block 用稳定的 blockId。
 */
function renderKey(item: RenderItem): string | number {
  return item.kind === 'bubble' ? `b-${item.index}` : item.blockId
}

function scrollToBottom(smooth = true) {
  if (!containerRef.value) return
  containerRef.value.scrollTo({
    top: containerRef.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

// 延迟滚动，确保 DOM 渲染完成
function scheduleScroll(smooth = true) {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    nextTick(() => {
      scrollToBottom(smooth)
    })
  }, 50)
}

// 监听消息数组长度变化
watch(
  () => props.messages.length,
  () => {
    // 初始化阶段统一走瞬时滚动，避免历史消息恢复时还带动画
    scheduleScroll(!isInitializing)
  }
)

// 初始化时滚动到底部（侧边栏打开瞬间，不需要动画直接到位）
onMounted(() => {
  scheduleScroll(false)
  // 等异步恢复（读取持久化的 messageLog）结束再放开 watcher 的动画
  setTimeout(() => {
    isInitializing = false
  }, 500)
})
</script>

<style scoped>
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  z-index: 5;
}

.messages::-webkit-scrollbar {
  width: 4px;
}

.messages::-webkit-scrollbar-track {
  background: transparent;
}

.messages::-webkit-scrollbar-thumb {
  background: var(--app-border);
  border-radius: 2px;
}
</style>
