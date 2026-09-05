<template>
  <div ref="containerRef" class="messages">
    <MessageBubble
      v-for="(msg, index) in messages"
      :key="index"
      :msg="msg"
      :index="index"
      :on-dispatch-action="onDispatchAction"
      @delete="emit('delete', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { MessageLog, ExecutionResult } from '../types'
import MessageBubble from './MessageBubble.vue'

const props = defineProps<{
  messages: readonly MessageLog[]
  onDispatchAction?: (
    intent: string,
    args?: Record<string, unknown>
  ) => Promise<ExecutionResult | null> | void
}>()

const emit = defineEmits<{
  delete: [index: number]
}>()

const containerRef = ref<HTMLDivElement>()
let scrollTimer: ReturnType<typeof setTimeout> | null = null

function scrollToBottom() {
  if (!containerRef.value) return
  containerRef.value.scrollTo({
    top: containerRef.value.scrollHeight,
    behavior: 'smooth',
  })
}

// 延迟滚动，确保 DOM 渲染完成
function scheduleScroll() {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    scrollTimer = null
    nextTick(() => {
      scrollToBottom()
    })
  }, 50)
}

// 监听消息数组长度变化
watch(
  () => props.messages.length,
  () => {
    scheduleScroll()
  }
)

// 初始化时滚动
onMounted(() => {
  scheduleScroll()
})

// B32: 组件卸载时清掉未触发的 setTimeout，避免在已销毁实例上调用 nextTick / scrollToBottom。
// 旧实现只 watch messages.length + onMounted 触发滚动，组件被卸载后 timer 仍可能排队；
// HMR / 路由切换 / side panel 关闭瞬间触发的 scrollToBottom 会访问 null 容器或重复 setter。
onBeforeUnmount(() => {
  if (scrollTimer) {
    clearTimeout(scrollTimer)
    scrollTimer = null
  }
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
