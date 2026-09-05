<!--
  MessageBubble — 单条消息气泡

  渲染流程：
    1. msg.text.markdown 走 renderMarkdown（marked + 自定义块占位符 + DOMPurify）
    2. v-html 输出 HTML 到 contentEl
    3. mounted / updated 后扫描 [data-custom-block] 占位 DOM，按 data-id 找到对应组件挂载
    4. beforeUnmount 统一 unmount 动态创建的 Vue app，避免内存泄漏

  两种模式：
    - 纯 Markdown：msg.text.components 不填或为空
    - 嵌入组件：msg.text.components 提供组件列表，markdown 中含 <tag data-id="..." />
-->

<template>
  <div class="message-item" :class="{ 'message-item-user': msg.type === 'user' }">
    <button
      v-if="msg.type === 'user'"
      class="delete-btn"
      title="删除此条消息"
      @click="handleDelete"
    >
      <el-icon :size="14"><Delete /></el-icon>
    </button>
    <div class="bubble" :class="`bubble-${msg.type}`">
      <div class="bubble-content">
        <template v-if="msg.type === 'system' && isLongContent">
          <div class="thinking-content" :class="{ expanded: isExpanded }" @click="toggleExpand">
            <div ref="contentEl" class="thinking-text"></div>
          </div>
          <div class="expand-indicator" @click="toggleExpand">
            <ChevronDown v-if="!isExpanded" :size="12" />
            <ChevronUp v-else :size="12" />
            <span>{{ isExpanded ? '收起' : '展开' }}</span>
          </div>
        </template>
        <div v-else ref="contentEl"></div>
        <img v-if="msg.image" :src="msg.image" class="screenshot-img" />
        <video v-if="msg.video" :src="msg.video" controls class="recording-video" />
        <div v-if="msg.recordingFile" class="recording-file-card">
          <video
            v-if="msg.recordingFile.preview"
            :src="msg.recordingFile.preview"
            controls
            class="recording-video"
          />
          <span class="recording-file-name">{{ msg.recordingFile.name }}</span>
          <a
            :href="msg.recordingFile.url"
            :download="msg.recordingFile.name"
            class="recording-download-btn"
          >
            ⬇ 下载
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount, nextTick, createApp, type App as VueApp } from 'vue'
import { ElMessageBox, ElIcon } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import type { MessageLog, ExecutionResult } from '../types'
import { renderMarkdown } from '../composables/useMarkdown'
import { blockRegistry } from './blocks/registry'

const props = defineProps<{
  msg: MessageLog
  index: number
  onDispatchAction?: (
    intent: string,
    args?: Record<string, unknown>
  ) => Promise<ExecutionResult | null> | void
}>()

const emit = defineEmits<{
  delete: [index: number]
}>()

/**
 * 嵌入组件接收的"派发命令"回调。
 * MessageBubble 把 useSlashCommandRunner.dispatchToSW 注入到 createApp 的 props 里，
 * 嵌入组件（ActionButtonGroup）通过 props.onAction(intent, args) 派发。
 */
function dispatchAction(intent: string, args?: Record<string, unknown>): void {
  void props.onDispatchAction?.(intent, args ?? {})
}

const isExpanded = ref(false)

// 系统消息且内容长度超过阈值时，启用展开/收起
const LONG_CONTENT_THRESHOLD = 150
const isLongContent = computed(() => {
  return props.msg.type === 'system' && props.msg.text.markdown.length > LONG_CONTENT_THRESHOLD
})

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm('确定删除这条会话吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    emit('delete', props.index)
  } catch {
    // 用户取消
  }
}

const contentEl = ref<HTMLElement>()
const renderedHtml = ref('')

/**
 * B31: 把安全 HTML 写入容器，绕过 v-html 二次插值。
 * marked → DOMPurify 已经把 <>& 转义好，但 v-html 内部还会让 Vue 再做一次
 * HTML 字串解析（性能损耗小、风险低，但配合 mountEmbeddedComponents 时
 * 占位 [data-custom-block] 节点被 Vue 替换为 <!----> 注释节点，破坏后续 querySelector）。
 * 这里改成「建 detached <template>，innerHTML 注入安全 HTML，importNode 迁入真实容器」，
 * Vue 仍能看到渲染结果，但不会替换已存在的占位节点。
 */
function applyMarkdownHtml(el: HTMLElement, safeHtml: string): void {
  const tpl = document.createElement('template')
  tpl.innerHTML = safeHtml
  while (el.firstChild) el.removeChild(el.firstChild)
  el.appendChild(document.importNode(tpl.content, true))
}

/**
 * 跟踪每个占位 DOM 上挂载的 Vue app 实例
 * 卸载时统一调用 app.unmount() 释放资源
 *
 * B08 修复：WeakMap 在 v-html 替换 contentEl 后，原占位 DOM 节点会被回收，
 * 导致 mountedApps 不可枚举，泄漏 Vue app 实例。改用 Map<id, {ph, app}>；
 * 每次 watch 触发 mountEmbeddedComponents 之前先把所有旧 app unmount 并清空 Map，
 * 避免"同一个 ph 被新 app 顶替但旧 app 还活着"。
 */
const mountedApps = new Map<string, { ph: HTMLElement; app: VueApp }>()

watch(
  () => props.msg,
  async () => {
    // B08: 每次 markdown 变化前先释放旧 app（v-html 会替换 contentEl，
    // 旧的占位节点已 GC，但 WeakMap 持有的 app 引用还在泄漏）。
    unmountAllApps()
    renderedHtml.value = renderMarkdown(props.msg.text.markdown)
    isExpanded.value = false
    await nextTick()
    // B31: 不用 v-html，避免 Vue 二次解析替换占位节点；改用 DOM API 注入安全 HTML。
    if (contentEl.value) applyMarkdownHtml(contentEl.value, renderedHtml.value)
    await nextTick()
    mountEmbeddedComponents()
  },
  { immediate: true }
)

// 在 watch 引用之前 hoist unmountAllApps 的函数声明会被自动提升；这里显式声明
// 是为了避免「Cannot access unmountAllApps before initialization」错误。
function unmountAllApps(): void {
  for (const [, entry] of mountedApps) {
    try {
      entry.app.unmount()
    } catch (e) {
      console.warn('[MessageBubble] 卸载嵌入组件失败:', e)
    }
  }
  mountedApps.clear()
}

/**
 * 扫描占位 DOM 并挂载对应的 Vue 组件
 * - 占位 DOM：<div data-custom-block data-tag="..." data-id="..."></div>
 * - 组件来源：props.msg.text.components
 * - 每个占位只挂一次（重复挂载会泄漏内存）
 */
function mountEmbeddedComponents() {
  if (!contentEl.value) return
  const placeholders = contentEl.value.querySelectorAll<HTMLElement>('[data-custom-block]')
  const components = props.msg.text.components ?? []
  const byId = new Map(components.map((c) => [c.id, c]))

  for (const ph of Array.from(placeholders)) {
    const id = ph.getAttribute('data-id') ?? ''
    if (!id) continue
    // 已挂载：跳过（数据未变化时 watch 触发也会走到这里）
    if (mountedApps.has(id)) continue
    const tag = ph.getAttribute('data-tag') ?? ''
    const target = byId.get(id)

    if (!target) {
      // 占位符出现在 markdown 里，但 MessageBody.components 没找到对应 id 的组件。
      // 不能沉默渲染：用户会看到一行空。把占位 DOM 替换成可观察的提示。
      renderMissingBlock(ph, tag, id)
      continue
    }

    const app = createApp(target.component, {
      ...target.props,
      ...(target.component === blockRegistry.get('action-group')?.component
        ? { onAction: dispatchAction }
        : {}),
    })
    app.config.errorHandler = (err: unknown) => {
      console.warn('[MessageBubble] 嵌入组件渲染失败:', err)
    }
    app.mount(ph)
    mountedApps.set(id, { ph, app })
  }
}

/**
 * B08: 统一释放所有挂载的 Vue app。
 * 必须在 v-html 重置 contentEl 之前调用，否则原占位节点被 GC 后
 * app 实例无法从 WeakMap 里枚举出来。
 *
 * 注：此函数被 watch 回调在初始化前引用；JS 函数声明会被 hoist，
 * 因此在 watch 之后再次声明是安全的（重复声明会被后者覆盖——这里删掉第二次声明）。
 */

/**
 * 渲染"组件缺失"占位符：用浅灰文字 + ⚠ 提示用户，AI 引用了未注册的 tag 也走这里。
 * 这条路径不会被 unmount 跟踪——因为没有真实 Vue app 实例挂载。
 */
function renderMissingBlock(host: HTMLElement, tag: string, id: string): void {
  // 用 innerHTML + escapeHtml 注入安全文本，绕过 v-html 上下文限制
  const text = tag ? `⚠ 组件缺失：<${tag} data-id="${id}" />` : `⚠ 组件缺失：data-id="${id}"`
  host.innerHTML = `<span class="missing-block">${escapeHtml(text)}</span>`
  // 标记已处理，避免后续重试再次覆盖
  host.setAttribute('data-missing', '1')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 组件销毁前释放所有动态挂载的 Vue app
 */
onBeforeUnmount(() => {
  unmountAllApps()
})
</script>

<style scoped>
.message-item {
  display: flex;
  align-items: center;
  animation: bubbleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.message-item-user {
  justify-content: flex-end;
}

.bubble {
  padding: 12px 16px;
  border-radius: 10px;
  max-width: 85%;
  word-wrap: break-word;
  font-size: 14px;
  line-height: 1.6;
  animation: none;
}

@keyframes bubbleIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-item:hover .delete-btn {
  opacity: 1;
}

/* 长内容折叠 - 固定显示3行 */
.thinking-content {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  position: relative;
  transition: all 0.3s ease;
}

.thinking-content.expanded {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}

/* 展开/收起指示器 - 居中显示 */
.expand-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
  margin-top: 4px;
  color: var(--app-text-muted);
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  user-select: none;
}

.expand-indicator:hover {
  color: var(--app-text-secondary);
  background: var(--app-picker-item-hover);
}

.expand-indicator svg {
  transition: transform 0.1s ease;
}

.expand-indicator:hover svg {
  transform: scale(1.1);
}

/* 收起状态的渐变遮罩 */
.thinking-content:not(.expanded)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 24px;
  background: linear-gradient(to bottom, transparent, var(--app-bg-card));
  pointer-events: none;
}

/* 用户消息样式 */
.bubble-user {
  background: var(--app-bg-card);
  border: 1px solid var(--app-border);
  color: var(--app-text-primary);
  border-bottom-right-radius: 4px;
}

.delete-btn {
  flex-shrink: 0;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border);
  border-radius: 50%;
  cursor: pointer;
  padding: 4px;
  color: var(--app-text-secondary);
  transition:
    color 0.2s,
    background 0.2s,
    opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  width: 24px;
  height: 24px;
}

.delete-btn:hover {
  color: var(--app-error);
  background: rgba(255, 100, 100, 0.1);
}

/* AI 聊天消息样式 */
.bubble-ai-chat {
  background: var(--app-bg-card);
  border: 1px solid var(--app-border);
  color: var(--app-text-primary);
  border-bottom-left-radius: 4px;
}

/* 系统消息样式 */
.bubble-system {
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 12px;
  padding: 8px 16px;
  max-width: 100%;
  text-align: center;
  border-radius: 20px;
}

.bubble-error {
  background: rgba(255, 100, 100, 0.08);
  border: 1px solid rgba(255, 100, 100, 0.2);
  color: var(--app-error);
  border-left: 3px solid var(--app-error);
}

.bubble :deep(strong) {
  color: var(--app-text-primary);
  font-weight: 600;
}

.bubble :deep(em) {
  color: var(--app-text-muted);
  font-style: italic;
}

/* Marked 生成的 HTML 样式 */
.bubble :deep(p) {
  margin: 0 0 8px 0;
}

.bubble :deep(p:last-child) {
  margin-bottom: 0;
}

.bubble :deep(h1),
.bubble :deep(h2),
.bubble :deep(h3),
.bubble :deep(h4) {
  color: var(--app-text-primary);
  margin: 16px 0 8px 0;
  font-weight: 600;
}

.bubble :deep(h1) {
  font-size: 18px;
}
.bubble :deep(h2) {
  font-size: 16px;
}
.bubble :deep(h3) {
  font-size: 15px;
}
.bubble :deep(h4) {
  font-size: 14px;
}

.bubble :deep(ul),
.bubble :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.bubble :deep(li) {
  margin: 4px 0;
}

.bubble :deep(pre) {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0;
  overflow-x: auto;
}

.bubble :deep(code) {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
}

.bubble :deep(pre code) {
  background: none;
  padding: 0;
}

.bubble :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid var(--app-border);
  color: var(--app-text-secondary);
}

.bubble :deep(a) {
  color: var(--app-text-primary);
  text-decoration: underline;
}

.bubble :deep(hr) {
  border: none;
  border-top: 1px solid var(--app-border);
  margin: 12px 0;
}

.bubble :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
  table-layout: fixed;
}

.bubble :deep(th),
.bubble :deep(td) {
  border: 1px solid var(--app-border);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
}

.bubble :deep(th) {
  background: rgba(0, 0, 0, 0.2);
}

/* 嵌入组件容器：去掉默认样式，让组件自己控制 */
.bubble :deep([data-custom-block]) {
  display: block;
  margin: 8px 0;
}

.bubble :deep([data-custom-block]) > * {
  width: 100%;
}

/* 缺失组件占位：浅灰文字 + ⚠ */
.bubble :deep(.missing-block) {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--app-text-muted);
  background: rgba(0, 0, 0, 0.08);
  border: 1px dashed var(--app-border);
  border-radius: 4px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}

.screenshot-img {
  max-width: 100%;
  border-radius: 8px;
  margin-top: 8px;
  display: block;
}

.recording-video {
  max-width: 100%;
  border-radius: 8px;
  margin-top: 8px;
  background: var(--app-video-bg);
  display: block;
}

.recording-file-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: var(--app-picker-item-hover);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.recording-file-card .recording-video {
  width: 100%;
  margin-top: 0;
}

.recording-file-card .recording-file-name {
  flex: 1;
  font-size: 12px;
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recording-download-btn {
  flex-shrink: 0;
  display: inline-block;
  padding: 4px 12px;
  background: var(--app-picker-item-hover);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text-primary);
  text-decoration: none;
  font-size: 13px;
  transition:
    background 0.2s,
    color 0.2s;
  white-space: nowrap;
}

.recording-download-btn:hover {
  background: var(--app-picker-item-hover);
  color: var(--app-text-primary);
}
</style>
