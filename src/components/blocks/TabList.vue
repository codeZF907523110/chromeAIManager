<script setup lang="ts">
/**
 * TabList — 标签页列表
 *
 * props:
 *   - tabs: Array<{ id?, title?, url, active?, pinned? }>
 *   - variant?: 'open-list' | 'closed-list' | 'sort-preview'  // 仅做语义标识
 *   - maxRows?: number  // 超过这个数折叠；默认 20
 */

interface TabItem {
  id?: number
  title?: string
  url: string
  active?: boolean
  pinned?: boolean
}

const props = withDefaults(
  defineProps<{
    tabs: TabItem[]
    variant?: 'open-list' | 'closed-list' | 'sort-preview'
    maxRows?: number
  }>(),
  { maxRows: 20 }
)

function truncateTitle(t: string, max = 60): string {
  return t.length > max ? t.slice(0, max) + '…' : t
}

function truncateUrl(u: string, max = 40): string {
  return u.length > max ? u.slice(0, max) + '…' : u
}
</script>

<template>
  <ul class="tab-list">
    <li
      v-for="(t, i) in tabs.slice(0, props.maxRows)"
      :key="i"
      :class="{ pinned: t.pinned, active: t.active }"
    >
      <span class="status">
        <template v-if="t.active">●</template>
        <template v-else-if="t.pinned">📌</template>
        <template v-else>·</template>
      </span>
      <span class="title" :title="t.title || t.url">{{ truncateTitle(t.title || t.url) }}</span>
      <a class="url" :href="t.url" :title="t.url" target="_blank" rel="noopener noreferrer">
        {{ truncateUrl(t.url) }}
      </a>
    </li>
    <li v-if="tabs.length > props.maxRows" class="more">
      还有 {{ tabs.length - props.maxRows }} 个未显示…
    </li>
    <li v-if="tabs.length === 0" class="empty">暂无标签</li>
  </ul>
</template>

<style scoped>
.tab-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  overflow: hidden;
}

.tab-list li {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  font-size: 13px;
  border-bottom: 1px solid var(--app-border);
}

.tab-list li:last-child {
  border-bottom: none;
}

.tab-list li.active {
  background: rgba(96, 165, 250, 0.08);
}

.tab-list li.pinned {
  background: rgba(251, 191, 36, 0.05);
}

.status {
  color: var(--app-text-muted);
  text-align: center;
}

.title {
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.url {
  color: var(--app-text-secondary);
  font-size: 12px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: underline;
}

.more,
.empty {
  color: var(--app-text-muted);
  text-align: center;
  font-size: 12px;
  padding: 10px;
}
</style>
