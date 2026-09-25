<script setup lang="ts">
/**
 * OutlineBlock — 标题大纲渲染（智能页面理解 — 内容模式辅助块）
 *
 * props:
 *   - headings: Array<{ level: 1|2|3|4|5|6; text: string }>
 *
 * 行为：
 *   - 按 level 缩进（每级 12px），level 1 加粗高亮
 *   - 单元素扁平列表，无嵌套折叠（大纲本身已是线性）
 *   - 空数据时显示提示文案
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  headings: Array<{ level: 1 | 2 | 3 | 4 | 5 | 6; text: string }>
}>()
</script>

<template>
  <ul v-if="headings.length > 0" class="outline-list">
    <li
      v-for="(h, i) in headings"
      :key="i"
      class="outline-item"
      :class="`level-${h.level}`"
      :style="{ paddingLeft: `${(h.level - 1) * 12 + 4}px` }"
    >
      <span class="level-tag">H{{ h.level }}</span>
      <span class="text">{{ h.text }}</span>
    </li>
  </ul>
  <div v-else class="empty">{{ t('blocks.noOutline') }}</div>
</template>

<style scoped>
.outline-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  font-size: 13px;
  line-height: 1.6;
}

.outline-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 4px;
}

.outline-item:hover {
  background: var(--app-picker-item-hover);
}

.level-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--app-text-muted);
  background: rgba(0, 0, 0, 0.18);
  padding: 0 5px;
  border-radius: 3px;
  flex-shrink: 0;
  font-family: ui-monospace, monospace;
}

.level-1 .text {
  font-weight: 600;
  color: var(--app-text-primary);
}

.text {
  color: var(--app-text-secondary);
  word-break: break-word;
}

.empty {
  text-align: center;
  color: var(--app-text-muted);
  padding: 12px;
  font-size: 12px;
}
</style>
