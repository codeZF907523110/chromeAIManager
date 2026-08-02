<template>
  <div ref="containerRef" class="messages">
    <MessageBubble v-for="(msg, index) in messages" :key="index" :msg="msg" />
    <div ref="bottomRef"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { MessageLog } from '../types'
import MessageBubble from './MessageBubble.vue'

const props = defineProps<{
  messages: readonly MessageLog[]
}>()

const containerRef = ref<HTMLDivElement>()
const bottomRef = ref<HTMLDivElement>()

watch(
  () => props.messages,
  async () => {
    await nextTick()
    scrollToBottom()
  }
)

function scrollToBottom() {
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}
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
