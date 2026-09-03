<script setup lang="ts">
/**
 * DataTable — 通用数据表格组件
 *
 * 复用：
 *   - cookies_observe / extensions_observe / storage_get 等命令工厂
 *   - AI 通过 richReply 自由产出（块注册表 aiUsable: true）
 *
 * 列定义 + 行数据解耦，运行时只取字符串 key。
 * URL 列使用 ElLink 组件，支持省略号和 Tooltip 展示。
 */
import { ElTooltip, ElLink } from 'element-plus'
import type { DataTableColumn } from '../../types'

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn[]
    rows: Record<string, unknown>[]
    empty?: string
  }>(),
  { empty: '暂无数据' }
)

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function getCell(row: Record<string, unknown>, col: DataTableColumn): string {
  if (col.format) return col.format(row)
  const v = row[col.key]
  return v === null || v === undefined ? '' : String(v)
}

function isUrl(key: string): boolean {
  return key === 'url'
}

function isLong(s: string, col: DataTableColumn): boolean {
  return Boolean(col.ellipsis) && s.length > (col.ellipsis as number)
}
</script>

<template>
  <table class="data-table">
    <thead>
      <tr>
        <th v-for="c in props.columns" :key="c.key" :style="{ width: c.width }">
          {{ c.title }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="props.rows.length === 0">
        <td :colspan="props.columns.length" class="empty">{{ props.empty }}</td>
      </tr>
      <tr v-for="(row, i) in props.rows" :key="i">
        <td v-for="c in props.columns" :key="c.key">
          <!-- URL 列使用 ElLink + Tooltip -->
          <el-tooltip
            v-if="isUrl(c.key) && isLong(getCell(row, c), c)"
            :content="getCell(row, c)"
            placement="top"
            :show-after="200"
          >
            <el-link type="primary" :href="getCell(row, c)" target="_blank" :underline="false">
              {{ truncate(getCell(row, c), c.ellipsis!) }}
            </el-link>
          </el-tooltip>
          <el-link
            v-else-if="isUrl(c.key)"
            type="primary"
            :href="getCell(row, c)"
            target="_blank"
            :underline="false"
          >
            {{ getCell(row, c) }}
          </el-link>
          <!-- 其他列：ellipsis + tooltip -->
          <el-tooltip
            v-else-if="c.ellipsis && isLong(getCell(row, c), c)"
            :content="getCell(row, c)"
            placement="top"
            :show-after="200"
          >
            <span class="ellipsis">{{ truncate(getCell(row, c), c.ellipsis!) }}</span>
          </el-tooltip>
          <span v-else>{{ getCell(row, c) }}</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.data-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}

.data-table th,
.data-table td {
  border: 1px solid var(--app-border);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}

.data-table th {
  background: rgba(0, 0, 0, 0.2);
  color: var(--app-text-secondary);
  font-weight: 600;
}

.data-table .empty {
  text-align: center;
  color: var(--app-text-muted);
  padding: 16px;
}

.data-table .ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  word-break: break-all;
}
</style>
