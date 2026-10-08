<!--
  MessageList — 消息列表渲染入口

  通过 useTaskBlocks 把 messageLog 切成 bubble / block 两种渲染单元。
  - bubble: 单条 MessageBubble（user / ai / 块外独立 system）
  - block:  TaskBlock（一段连续 task system 消息，整块可折叠）
-->

<template>
  <div class="messages-wrap">
    <div ref="containerRef" class="messages">
      <template v-for="item in renderItems" :key="renderKey(item)">
        <MessageBubble
          v-if="item.kind === 'bubble'"
          :msg="item.msg"
          :index="item.index"
          @delete="(idx) => emit('delete', idx)"
        />
        <TaskBlock
          v-else
          :block-id="item.blockId"
          :messages="item.messages"
          :indices="item.indices"
          :expanded="item.expanded"
          :live-thought="item.blockId === lastBlockId ? liveThought : ''"
          @toggle="toggleExpanded(item.blockId)"
          @delete="(idx) => emit('delete', idx)"
        />
      </template>
      <!-- 流式实时回复气泡：位于消息流末尾，正式消息落库后由 useAIEngine 清空 live 状态使其消失 -->
      <LiveBubble v-if="liveReplyActive" :text="liveReplyText" />
    </div>

    <!-- 回到本次提问：目标 user 气泡在视口上方时显示，点击平滑滚回当前对话的提问位置 -->
    <transition name="jump-fade">
      <button
        v-show="showJumpBtn"
        class="jump-to-user-btn"
        :title="t('list.jumpToQuestion')"
        @click="scrollToCurrentUser"
      >
        <ArrowUp :size="14" />
      </button>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUp } from 'lucide-vue-next'
import type { MessageLog } from '../types'
import type { LiveStreamState } from '../shared/agent-stream'
import MessageBubble from './MessageBubble.vue'
import TaskBlock from './TaskBlock.vue'
import LiveBubble from './LiveBubble.vue'
import { useTaskBlocks, type RenderItem } from '../composables/useTaskBlocks'

const { t } = useI18n()

const props = defineProps<{
  messages: readonly MessageLog[]
  /**
   * 当前活动任务 ID（用于在任务结束时自动收起最近一个任务块）。
   * 由 App.vue 从 useAIEngine().state.activeLoopId 透传。
   */
  activeLoopId?: string | null
  /**
   * 流式实时显示状态（reply / thought 的已显示前缀）。
   * 由 App.vue 从 useAIEngine().state.liveStream 透传；缺省时隐藏 LiveBubble 与实时思考行。
   */
  liveStream?: LiveStreamState
}>()

const emit = defineEmits<{
  delete: [index: number]
}>()

const containerRef = ref<HTMLDivElement>()
let scrollTimer: ReturnType<typeof setTimeout> | null = null
// 首屏初始化阶段：父组件恢复历史消息时也会触发 watcher，此时应保持瞬时滚动不动画
let isInitializing = true

const messagesRef = computed<readonly MessageLog[]>(() => props.messages)
const loopRef = computed<string | null | undefined>(() => props.activeLoopId ?? null)
const { renderItems, toggleExpanded } = useTaskBlocks(messagesRef, loopRef)

/**
 * 给 v-for 用的 key：bubble 用 index，block 用稳定的 blockId。
 */
function renderKey(item: RenderItem): string | number {
  return item.kind === 'bubble' ? `b-${item.index}` : item.blockId
}

// ──── 流式实时显示（docs/streaming-output.md §4.4）────

/** 实时回复气泡是否显示：live 状态里已有可显示的回复前缀 */
const liveReplyActive = computed(() => props.liveStream?.replyActive ?? false)

/** 实时回复文本（partial JSON 提取出的单调增长前缀） */
const liveReplyText = computed(() => props.liveStream?.replyText ?? '')

/** 实时思考文本（仅传入最后一个任务块，经 sanitizeThought 清洗） */
const liveThought = computed(() => props.liveStream?.thoughtText ?? '')

/** 最后一个任务块的 blockId：实时思考行只属于"当前进行中"的块 */
const lastBlockId = computed(() => {
  for (let i = renderItems.value.length - 1; i >= 0; i--) {
    const item = renderItems.value[i]
    if (item.kind === 'block') return item.blockId
  }
  return null
})

function scrollToBottom(smooth = true) {
  if (!containerRef.value) return
  containerRef.value.scrollTo({
    top: containerRef.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

/**
 * 找当前视口顶部可见的消息下标：按 DOM 顺序找第一个「底边越过容器顶边」的
 * [data-msg-index] 气泡。收起 TaskBlock 内的气泡 display:none（矩形为 0）会被自然跳过。
 *
 * @returns messageLog 下标；容器不存在或找不到时返回 -1
 */
function findVisibleMessageIndex(): number {
  const container = containerRef.value
  if (!container) return -1
  const cTop = container.getBoundingClientRect().top
  const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-msg-index]'))
  for (const node of nodes) {
    if (node.getBoundingClientRect().bottom > cTop) {
      const idx = Number(node.dataset.msgIndex)
      return Number.isFinite(idx) ? idx : -1
    }
  }
  return -1
}

/**
 * 找当前视口所属对话的 user 消息下标：从顶部可见消息往前扫描最近的 user 消息。
 * 可见消息是对话中间的 system / ai-chat 时，同样回溯到该对话的 user 气泡，
 * 保证「视图停在第 N 条对话 → 点击回到第 N 条对话的提问」。
 *
 * @returns user 消息下标；找不到返回 -1
 */
function findConversationUserIndex(): number {
  const visibleIdx = findVisibleMessageIndex()
  for (let i = visibleIdx; i >= 0; i--) {
    if (props.messages[i].type === 'user') return i
  }
  return -1
}

/** 「回到本次提问」按钮是否显示：目标 user 气泡在视口上方（需要回跳）时为 true */
const showJumpBtn = ref(false)

/**
 * 按当前滚动位置更新「回到本次提问」按钮显隐。
 * 目标 user 气泡顶边在容器顶边之上 → 显示；已可见则隐藏，保证「显示即可点、点了必有效」。
 * 显隐与点击共用 findConversationUserIndex 同一目标。
 */
function updateJumpBtn(): void {
  const container = containerRef.value
  if (!container || props.messages.length === 0) {
    showJumpBtn.value = false
    return
  }
  const userIdx = findConversationUserIndex()
  const bubble =
    userIdx >= 0 ? container.querySelector<HTMLElement>(`[data-msg-index="${userIdx}"]`) : null
  if (!bubble) {
    showJumpBtn.value = false
    return
  }
  showJumpBtn.value = bubble.getBoundingClientRect().top < container.getBoundingClientRect().top - 1
}

/**
 * 点击「回到本次提问」：平滑滚动到当前视口所属对话的 user 气泡位置。
 * 异常情况（无容器/找不到 user 消息/气泡未挂载）直接返回，不做任何滚动。
 */
function scrollToCurrentUser(): void {
  const container = containerRef.value
  if (!container) return
  const userIdx = findConversationUserIndex()
  if (userIdx < 0) return
  const bubble = container.querySelector<HTMLElement>(`[data-msg-index="${userIdx}"]`)
  if (!bubble) return
  bubble.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 容器 scroll 事件回调：passive 监听，仅刷新按钮显隐 */
function handleScroll(): void {
  updateJumpBtn()
}

// 延迟滚动，确保 DOM 渲染完成
function scheduleScroll(smooth = true) {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    nextTick(() => {
      scrollToBottom(smooth)
    })
  }, 50)
}

// 监听消息数组长度变化
watch(
  () => props.messages.length,
  () => {
    // 初始化阶段统一走瞬时滚动，避免历史消息恢复时还带动画
    scheduleScroll(!isInitializing)
    // DOM 渲染完成后刷新按钮显隐（新消息可能把 user 气泡顶出可视区）
    nextTick(() => updateJumpBtn())
  }
)

// 流式内容增长不改变 messages.length：仅当用户已接近底部时跟随滚动，
// 上翻阅读历史时不被流式输出不断拉回底部
watch(
  () => `${props.liveStream?.replyText ?? ''} ${props.liveStream?.thoughtText ?? ''}`,
  () => {
    const container = containerRef.value
    if (!container) return
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceToBottom < 80) scheduleScroll(true)
  }
)

// 初始化时滚动到底部（侧边栏打开瞬间，不需要动画直接到位）
onMounted(() => {
  scheduleScroll(false)
  containerRef.value?.addEventListener('scroll', handleScroll, { passive: true })
  // 等异步恢复（读取持久化的 messageLog）结束再放开 watcher 的动画
  setTimeout(() => {
    isInitializing = false
  }, 500)
})

onBeforeUnmount(() => {
  containerRef.value?.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped>
/* 消息区外层容器：承载滚动区和顶部浮动按钮（按钮不随内容滚动） */
.messages-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  z-index: 5;
}

.messages::-webkit-scrollbar {
  width: 4px;
}

.messages::-webkit-scrollbar-track {
  background: transparent;
}

.messages::-webkit-scrollbar-thumb {
  background: var(--app-border);
  border-radius: 2px;
}

/* 「回到本次提问」浮动按钮：顶部居中，仅 user 气泡滚出可视区时显示 */
.jump-to-user-btn {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--app-border);
  background: var(--app-bg-card);
  color: var(--app-text-secondary);
  cursor: pointer;
  z-index: 20;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.jump-to-user-btn:hover {
  color: var(--app-text-primary);
  background: var(--app-picker-item-hover);
}

/* 按钮显隐淡入淡出 */
.jump-fade-enter-active,
.jump-fade-leave-active {
  transition: opacity 0.2s ease;
}

.jump-fade-enter-from,
.jump-fade-leave-to {
  opacity: 0;
}
</style>
