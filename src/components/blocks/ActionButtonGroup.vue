<script setup lang="ts">
/**
 * ActionButtonGroup — 一组操作按钮
 *
 * props:
 *   - buttons: Array<{ label: string, intent: string, args?: Record<string, unknown> }>
 *   - onAction: (intent, args) => void
 *
 * 点击 → onAction(intent, args)。
 * onAction 由 MessageBubble 通过 createApp(props) 注入，回调 useSlashCommandRunner.dispatchToSW。
 *
 * 不走 emit：嵌入组件是 createApp 动态挂载，emit 事件在动态组件树上无法冒泡到宿主组件；
 * 用 props 函数更显式、可追踪，也避免循环依赖。
 */

interface ActionButton {
  label: string
  intent: string
  args?: Record<string, unknown>
}

const props = defineProps<{
  buttons: ActionButton[]
  onAction?: (intent: string, args?: Record<string, unknown>) => void
}>()

function click(b: ActionButton) {
  // 默认行为：什么都不做（防御 onAction 未注入）；由 props.onAction 实际派发命令
  props.onAction?.(b.intent, b.args)
}
</script>

<template>
  <div class="action-group">
    <button v-for="(b, i) in buttons" :key="i" class="action-btn" type="button" @click="click(b)">
      {{ b.label }}
    </button>
  </div>
</template>

<style scoped>
.action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0;
}

.action-btn {
  padding: 4px 12px;
  font-size: 12px;
  background: var(--app-picker-item-hover);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text-primary);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.action-btn:hover {
  background: var(--app-bg-card);
  border-color: var(--app-text-secondary);
}
</style>
