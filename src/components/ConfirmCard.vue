<template>
  <div class="confirm-card">
    <div class="confirm-card-title">{{ title }}</div>
    <div v-if="description" class="confirm-card-desc">{{ description }}</div>
    <div v-if="items.length" class="confirm-card-items">
      <div v-for="(item, i) in items" :key="i" class="confirm-card-item">
        <span class="primary">{{ item.primary }}</span>
        <span class="secondary">{{ item.secondary }}</span>
      </div>
    </div>
    <div class="confirm-card-actions">
      <button class="btn-cancel" :disabled="loading" @click="handleCancel">取消</button>
      <button class="btn-confirm" :disabled="loading" @click="handleConfirm">
        {{ loading ? '执行中...' : '确认执行' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  title: string
  description?: string
  items: Array<{ primary: string; secondary: string }>
  onConfirm: () => Promise<void>
}>()

const emit = defineEmits<{
  cancel: []
}>()

const loading = ref(false)

async function handleConfirm() {
  loading.value = true
  try {
    await props.onConfirm()
  } catch (e: unknown) {
    console.error('[AI管家] 确认操作失败:', e)
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.confirm-card {
  margin: 0 20px 12px;
  padding: 16px;
  background: rgba(255, 200, 50, 0.06);
  border: 1px solid rgba(255, 200, 50, 0.3);
  border-radius: 10px;
}

.confirm-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffc832;
  margin-bottom: 6px;
}

.confirm-card-desc {
  font-size: 12px;
  color: #999;
  margin-bottom: 10px;
}

.confirm-card-items {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.confirm-card-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 12px;
}

.confirm-card-item:last-child {
  border-bottom: none;
}

.confirm-card-item .primary {
  color: #ddd;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}

.confirm-card-item .secondary {
  color: #666;
  flex-shrink: 0;
}

.confirm-card-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-cancel,
.btn-confirm {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: #ccc;
}

.btn-cancel:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.btn-confirm {
  background: #ffc832;
  color: #111;
  font-weight: 600;
}

.btn-confirm:hover:not(:disabled) {
  opacity: 0.85;
}

.btn-cancel:disabled,
.btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
