<script setup lang="ts">
import { ElTooltip } from 'element-plus'

/**
 * HistoryTable — 浏览历史表格
 *
 * props：
 *   - items: Array<{ title?, url, lastVisitTime?, visitCount? }>
 *   - timeRange?: { label?: string }   // 时间窗标签，显示在标题处
 *   - maxUrlDisplay?: number          // 链接单元格截断长度，默认 24
 *
 * 行为：
 *   - 链接自动 title=完整 URL（hover 看完整地址）
 *   - target="_blank" rel="noopener noreferrer" 强制新窗口打开
 *   - 长 URL 自动截断到 maxUrlDisplay + …
 */

interface HistoryItem {
  title?: string
  url: string
  lastVisitTime?: number
  visitCount?: number
}

const props = withDefaults(
  defineProps<{
    items: HistoryItem[]
    timeRange?: { label?: string }
    maxUrlDisplay?: number
  }>(),
  { maxUrlDisplay: 24 }
)

function formatTime(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function truncate(url: string): string {
  return url.length > props.maxUrlDisplay ? url.slice(0, props.maxUrlDisplay) + '…' : url
}
</script>

<template>
  <table class="history-table">
    <thead>
      <tr>
        <th class="col-time">时间</th>
        <th class="col-title">标题</th>
        <th class="col-link">链接</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(it, i) in items" :key="i">
        <td class="col-time">{{ formatTime(it.lastVisitTime) }}</td>
        <td class="col-title">
          {{ it.title || it.url }}
          <span v-if="it.visitCount && it.visitCount > 1" class="visits"
            >· {{ it.visitCount }}次</span
          >
        </td>
        <td class="col-link">
          <el-tooltip
            :content="it.url"
            placement="top"
            :show-after="200"
            :disabled="it.url.length <= props.maxUrlDisplay"
          >
            <a :href="it.url" :title="it.url" target="_blank" rel="noopener noreferrer">
              {{ truncate(it.url) }}
            </a>
          </el-tooltip>
        </td>
      </tr>
      <tr v-if="items.length === 0">
        <td colspan="3" class="empty">还没有浏览记录呢~</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.history-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}

.history-table th,
.history-table td {
  border: 1px solid var(--app-border);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
}

.history-table th {
  background: rgba(0, 0, 0, 0.2);
  color: var(--app-text-secondary);
  font-weight: 600;
}

.col-time {
  width: 56px;
  white-space: nowrap;
}

.col-title {
  word-break: break-word;
}

.col-link {
  word-break: break-all;
  overflow-wrap: anywhere;
}

.col-link a {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  color: var(--app-text-primary);
  text-decoration: underline;
}

.visits {
  color: var(--app-text-muted);
  font-size: 11px;
  margin-left: 4px;
}

.empty {
  text-align: center;
  color: var(--app-text-muted);
  padding: 16px;
}
</style>
