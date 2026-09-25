<script setup lang="ts">
/**
 * PageStatsBlock — 交互元素统计 + meta（智能页面理解 — 结构模式辅助块）
 *
 * props:
 *   - buttons: Array<{ text: string }>
 *   - inputs: Array<{ type: string; name?: string; placeholder?: string }>
 *   - formsCount: number
 *   - headingsCount?: number       全页面标题数量
 *   - meta?: { description?: string|null; viewport?: string|null; charset?: string|null }
 *
 * 行为：
 *   - 顶部一行统计：按钮数 / 输入数 / 表单数 / 标题数
 *   - meta 折叠区（默认展开），过长用 tooltip
 *   - 空数据不渲染该行
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface ButtonItem {
  text: string
}

interface InputItem {
  type: string
  name?: string
  placeholder?: string
}

interface Meta {
  description?: string | null
  viewport?: string | null
  charset?: string | null
}

withDefaults(
  defineProps<{
    buttons: ButtonItem[]
    inputs: InputItem[]
    formsCount: number
    headingsCount?: number
    meta?: Meta
  }>(),
  { headingsCount: 0 }
)

function describeInput(it: InputItem): string {
  const parts: string[] = []
  if (it.name) parts.push(`name=${it.name}`)
  if (it.placeholder) parts.push(`placeholder=${it.placeholder}`)
  return parts.length > 0 ? `${it.type} (${parts.join(', ')})` : it.type
}
</script>

<template>
  <div class="page-stats">
    <div class="stats-row">
      <span v-if="buttons.length > 0" class="stat-chip">
        {{ t('stats.buttons', { count: buttons.length }) }}
      </span>
      <span v-if="inputs.length > 0" class="stat-chip">
        {{ t('stats.inputs', { count: inputs.length }) }}
      </span>
      <span v-if="formsCount > 0" class="stat-chip">
        {{ t('stats.forms', { count: formsCount }) }}
      </span>
      <span v-if="headingsCount > 0" class="stat-chip">
        {{ t('stats.headings', { count: headingsCount }) }}
      </span>
      <span v-if="buttons.length === 0 && inputs.length === 0 && formsCount === 0" class="empty">
        {{ t('stats.noInteractive') }}
      </span>
    </div>

    <details v-if="inputs.length > 0" class="details-block" open>
      <summary>{{ t('stats.inputsSummary') }}</summary>
      <ul class="input-list">
        <li v-for="(it, i) in inputs" :key="i">{{ describeInput(it) }}</li>
      </ul>
    </details>

    <details
      v-if="meta && (meta.description || meta.viewport || meta.charset)"
      class="details-block"
    >
      <summary>{{ t('stats.metaSummary') }}</summary>
      <ul class="meta-list">
        <li v-if="meta.charset">
          <span>charset</span><b>{{ meta.charset }}</b>
        </li>
        <li v-if="meta.viewport">
          <span>viewport</span><b>{{ meta.viewport }}</b>
        </li>
        <li v-if="meta.description">
          <span>description</span><b>{{ meta.description }}</b>
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.page-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stat-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--app-picker-item-hover);
  border: 1px solid var(--app-border);
  color: var(--app-text-primary);
  font-size: 11px;
}

.details-block {
  border: 1px solid var(--app-border);
  border-radius: 4px;
  padding: 4px 8px;
  background: var(--app-bg-card);
}

.details-block summary {
  cursor: pointer;
  color: var(--app-text-secondary);
  font-weight: 500;
  user-select: none;
}

.input-list,
.meta-list {
  margin: 4px 0 2px;
  padding-left: 16px;
  color: var(--app-text-secondary);
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.input-list li {
  word-break: break-word;
  font-family: ui-monospace, monospace;
}

.meta-list li {
  display: flex;
  gap: 8px;
}

.meta-list li span {
  color: var(--app-text-muted);
  min-width: 70px;
}

.meta-list li b {
  color: var(--app-text-primary);
  font-weight: 500;
  word-break: break-word;
}

.empty {
  color: var(--app-text-muted);
  font-style: italic;
}
</style>
