<template>
  <div ref="containerRef" class="messages">
    <MessageBubble v-for="(msg, index) in messages" :key="index" :msg="msg" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import type { MessageLog } from '../types'
import MessageBubble from './MessageBubble.vue'

const props = defineProps<{
  messages: readonly MessageLog[]
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
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
</style>
