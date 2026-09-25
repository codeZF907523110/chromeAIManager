<script setup lang="ts">
/**
 * KeyLinksBlock — 关键链接列表（智能页面理解 — 内容模式辅助块）
 *
 * props:
 *   - links: Array<{ text: string; href: string }>
 *
 * 行为：
 *   - 链接卡片：标题 + URL（hover 看完整）
 *   - target="_blank" 强制新窗口
 *   - href 截断到 60 字符，hover 通过 title 属性看完整
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface LinkItem {
  text: string
  href: string
}

const props = withDefaults(
  defineProps<{
    links: LinkItem[]
    maxHrefDisplay?: number
  }>(),
  { maxHrefDisplay: 60 }
)

function truncate(href: string): string {
  return href.length > props.maxHrefDisplay ? href.slice(0, props.maxHrefDisplay) + '…' : href
}
</script>

<template>
  <ul v-if="links.length > 0" class="key-links">
    <li v-for="(l, i) in links" :key="i" class="key-link-item">
      <a
        class="link-title"
        :href="l.href"
        :title="l.text"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ l.text || l.href }}
      </a>
      <a class="link-href" :href="l.href" :title="l.href" target="_blank" rel="noopener noreferrer">
        {{ truncate(l.href) }}
      </a>
    </li>
  </ul>
  <div v-else class="empty">{{ t('blocks.noKeyLinks') }}</div>
</template>

<style scoped>
.key-links {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.key-link-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
  background: var(--app-bg-card);
}

.key-link-item:hover {
  background: var(--app-picker-item-hover);
}

.link-title {
  color: var(--app-text-primary);
  font-weight: 500;
  text-decoration: none;
  word-break: break-word;
}

.link-title:hover {
  text-decoration: underline;
}

.link-href {
  color: var(--app-text-muted);
  text-decoration: none;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.empty {
  text-align: center;
  color: var(--app-text-muted);
  padding: 12px;
  font-size: 12px;
}
</style>
