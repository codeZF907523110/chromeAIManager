<template>
  <div class="bubble" :class="`bubble-${msg.type}`" v-html="processedText"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageLog } from '../types';

const props = defineProps<{
  msg: MessageLog;
}>();

const processedText = computed(() => {
  if (props.msg.type === 'ai-chat') {
    return mdToHtml(props.msg.text);
  }
  return props.msg.text;
});

function mdToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>');
}
</script>

<style scoped>
.bubble {
  padding: 12px 16px;
  margin-bottom: 12px;
  border-radius: 8px;
  max-width: 90%;
  word-wrap: break-word;
}

.bubble-user {
  background: #e3f2fd;
  margin-left: auto;
}

.bubble-system {
  background: #f5f5f5;
  font-size: 14px;
  color: #666;
}

.bubble-ai {
  background: #f0f4ff;
}

.bubble-error {
  background: #ffebee;
  color: #c62828;
}
</style>
