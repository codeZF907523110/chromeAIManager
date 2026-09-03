<template>
  <div class="confirm-card">
    <div class="confirm-card-title">{{ title }}</div>
    <div v-if="description" class="confirm-card-desc">{{ description }}</div>
    <div v-if="items.length" class="confirm-card-items">
      <label v-for="(item, i) in items" :key="i" class="confirm-card-item">
        <input
          v-if="item.tabId !== undefined"
          type="checkbox"
          :checked="localItems[i]?.selected !== false"
          :disabled="loading"
          class="confirm-card-checkbox"
          @change="toggleItem(i, ($event.target as HTMLInputElement).checked)"
        />
        <!-- label 优先显示（如书签的标题+URL合并） -->
        <span v-if="item.label" class="label">{{ item.label }}</span>
        <template v-else>
          <span class="primary">{{ item.primary }}</span>
          <span class="secondary">{{ item.secondary }}</span>
        </template>
      </label>
    </div>
    <div v-if="selectableCount > 0" class="confirm-card-summary">
      已选 {{ selectedCount }} / {{ selectableCount }}
      <button class="btn-link" :disabled="loading" @click="toggleAll(false)">全不选</button>
      <button class="btn-link" :disabled="loading" @click="toggleAll(true)">全选</button>
    </div>
    <div class="confirm-card-actions">
      <button class="btn-cancel" :disabled="loading" @click="handleCancel">取消</button>
      <button
        class="btn-confirm"
        :disabled="loading || (selectableCount > 0 && selectedCount === 0)"
        @click="handleConfirm"
      >
        {{ loading ? '执行中...' : '确认执行' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ConfirmCard — 危险操作二次确认卡
 *
 * 由 App.vue 直接渲染（pendingConfirm.value）。
 * 数据来源：useSlashCommandRunner.prepareConfirmation / usePlanRunner.showConfirmCard，
 * 都返回统一的 ConfirmCardData（types/ui.ts）。
 */
import { ref, computed, watch } from 'vue'
import type { ConfirmCardItem } from '../types'

const props = defineProps<{
  title: string
  description?: string
  items: ConfirmCardItem[]
  /**
   * 预计算的批量 tabIds（如 close_duplicate_tabs）。
   * 存在时，点击确认直接使用此数组，不从 checkbox 收集。
   */
  allTabIds?: number[]
  onConfirm: (selectedTabIds: number[]) => Promise<void>
}>()

const emit = defineEmits<{
  cancel: []
}>()

const loading = ref(false)

// 本地维护 items 选中状态，避免直接 mutate props
const localItems = ref<ConfirmCardItem[]>(props.items.map((it) => ({ ...it })))
const selectableCount = computed(
  () => localItems.value.filter((it) => it.tabId !== undefined).length
)
const selectedCount = computed(
  () => localItems.value.filter((it) => it.tabId !== undefined && it.selected !== false).length
)

// 如果父组件重新传 items（例如任务恢复场景），同步本地状态
watch(
  () => props.items,
  (newItems) => {
    localItems.value = newItems.map((it) => ({ ...it }))
  }
)

function toggleItem(index: number, checked: boolean) {
  // 整体替换为新对象，确保 Vue 响应式追踪到变化
  localItems.value = localItems.value.map((it, i) =>
    i === index ? { ...it, selected: checked } : it
  )
}

function toggleAll(checked: boolean) {
  // 整体替换为新对象数组，确保 checkbox 重新渲染
  localItems.value = localItems.value.map((it) =>
    it.tabId !== undefined ? { ...it, selected: checked } : it
  )
}

async function handleConfirm() {
  loading.value = true
  try {
    // 如果存在预计算的 allTabIds（如 close_duplicate_tabs），直接使用
    const selectedTabIds = props.allTabIds
      ? props.allTabIds
      : localItems.value
          .filter((it) => it.tabId !== undefined && it.selected !== false)
          .map((it) => it.tabId as number)
    await props.onConfirm(selectedTabIds)
  } catch (e: unknown) {
    console.error('[AI管家] 确认操作失败:', e)
    emit('cancel')
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
  position: relative;
  z-index: 1;
}

.confirm-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffc832;
  margin-bottom: 6px;
}

.confirm-card-desc {
  font-size: 12px;
  color: var(--app-text-secondary);
  margin-bottom: 10px;
}

.confirm-card-items {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.confirm-card-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--app-border-light);
  font-size: 12px;
  cursor: pointer;
}

.confirm-card-item:last-child {
  border-bottom: none;
}

.confirm-card-checkbox {
  flex-shrink: 0;
  cursor: pointer;
}

.confirm-card-item .primary {
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}

.confirm-card-item .label {
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}

.confirm-card-item .secondary {
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.confirm-card-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--app-text-muted);
  margin-bottom: 8px;
}

.btn-link {
  background: none;
  border: none;
  color: var(--app-text-secondary);
  cursor: pointer;
  padding: 0 4px;
  font-size: 11px;
  text-decoration: underline;
}

.btn-link:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
  background: var(--app-bg-input);
  color: var(--app-text-secondary);
}

.btn-cancel:hover:not(:disabled) {
  background: var(--app-border);
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
