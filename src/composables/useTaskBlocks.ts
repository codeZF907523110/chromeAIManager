/**
 * 任务块分组 composable
 *
 * 把 messageLog 切成 bubble / block 两种渲染单元，交给 MessageList 渲染。
 * 仅在渲染层做分组，不修改 MessageLog 类型、不修改 useAIEngine。
 *
 * 块识别策略：从 messageLog 任意位置开始，向后收集所有「连续的 task system 消息」
 * 作为一个 block。非 task system 消息（ai / user / 块外独立 system）作为 bubble
 * 独立渲染。
 *
 * 默认收起；任务进行中新增 task block 时自动展开，任务结束（activeLoopId → null）后自动收起。
 */

import { computed, reactive, watch, type ComputedRef } from 'vue'
import type { MessageLog } from '../types'
import { isTaskSystemMessage } from '../utils/taskBlockPatterns'

/**
 * 渲染项：要么是单条 bubble，要么是一个 TaskBlock。
 *
 * - bubble: 渲染 MessageBubble
 * - block: 渲染 TaskBlock，内部按 indices 顺序渲染多个 MessageBubble（带 disableFold）
 */
export type RenderItem =
  | { kind: 'bubble'; msg: MessageLog; index: number }
  | {
      kind: 'block'
      blockId: string
      messages: MessageLog[]
      indices: number[]
      expanded: boolean
    }

/**
 * useTaskBlocks 返回值
 */
export interface UseTaskBlocksReturn {
  /** 渲染项列表（按 messageLog 顺序） */
  renderItems: ComputedRef<RenderItem[]>
  /** 块展开状态表（blockId → expanded），运行时状态，不持久化 */
  expandedMap: Record<string, boolean>
  /** 切换块的展开/收起 */
  toggleExpanded: (blockId: string) => void
}

/**
 * 把 messageLog 切成 bubble / block 列表，并维护块的展开状态。
 *
 * @param messagesRef MessageLog 列表（只读）
 * @param activeLoopIdRef 当前活动任务 ID（null/undefined 表示无活动任务）
 * @returns 渲染项 + 展开状态 + 切换函数
 */
export function useTaskBlocks(
  messagesRef: ComputedRef<readonly MessageLog[]>,
  activeLoopIdRef: ComputedRef<string | null | undefined>
): UseTaskBlocksReturn {
  /** 块展开状态表：默认收起（false） */
  const expandedMap = reactive<Record<string, boolean>>({})

  /**
   * 扫描 messageLog，把连续的 task system 段合并成 block，其余作为 bubble。
   */
  const renderItems = computed<RenderItem[]>(() => {
    const list = messagesRef.value
    const out: RenderItem[] = []
    let i = 0
    while (i < list.length) {
      const msg = list[i]
      const isBlockStart = msg.type === 'system' && isTaskSystemMessage(msg.text.markdown)
      if (!isBlockStart) {
        out.push({ kind: 'bubble', msg, index: i })
        i++
        continue
      }
      // 收集从 i 起连续匹配的 task system 消息
      const start = i
      const blockMsgs: MessageLog[] = [msg]
      const blockIdx: number[] = [i]
      let j = i + 1
      while (
        j < list.length &&
        list[j].type === 'system' &&
        isTaskSystemMessage(list[j].text.markdown)
      ) {
        blockMsgs.push(list[j])
        blockIdx.push(j)
        j++
      }
      const blockId = `block-${start}-${blockMsgs.length}`
      out.push({
        kind: 'block',
        blockId,
        messages: blockMsgs,
        indices: blockIdx,
        expanded: expandedMap[blockId] ?? false,
      })
      i = j
    }
    return out
  })

  /**
   * 消息列表增长时，如果有新 task block 出现且当前有活动任务 → 自动展开。
   *
   * 为什么不用 watch(activeLoopId) 处理「任务开始」？
   *   useAIEngine 里是先 activeLoopId = loopId、再 addMessage('system', '思考中...')。
   *   watch(activeLoopId) 触发时，'思考中...' 还没进 messages，新块不在 renderItems 里，
   *   上一个版本的「watch activeLoopId 拿最后一个块展开」会落空。
   *   所以这里改成盯消息增长：消息一进、新块一形成、并且当前 activeLoopId 非空 → 展开。
   *
   * 只在「这个 blockId 还没人设过状态」(undefined) 时才默认展开；
   * 用户手动 toggle 过的（包括展开后自己收起的）保持原样，不被覆盖。
   */
  let prevMsgLen = messagesRef.value.length
  watch(messagesRef, () => {
    const currLen = messagesRef.value.length
    if (currLen <= prevMsgLen) {
      prevMsgLen = currLen
      return
    }
    prevMsgLen = currLen
    if (activeLoopIdRef.value == null) return

    const blocks = renderItems.value.filter(
      (r): r is Extract<RenderItem, { kind: 'block' }> => r.kind === 'block'
    )
    const last = blocks[blocks.length - 1]
    if (!last) return
    if (expandedMap[last.blockId] === undefined) {
      expandedMap[last.blockId] = true
    }
  })

  /**
   * 任务结束（activeLoopId: 非空 → null）时收起最后一个块。
   *
   * 「任务开始」一侧交由上面的 messagesRef watcher 处理。
   * 这里只看「非空 → null」这一个边界，避免误触。
   */
  let prevLoopId: string | null | undefined = activeLoopIdRef.value
  watch(activeLoopIdRef, (curr) => {
    if (prevLoopId != null && curr == null) {
      const blocks = renderItems.value.filter(
        (r): r is Extract<RenderItem, { kind: 'block' }> => r.kind === 'block'
      )
      const last = blocks[blocks.length - 1]
      if (last) {
        expandedMap[last.blockId] = false
      }
    }
    prevLoopId = curr
  })

  /**
   * 切换块的展开/收起状态。
   *
   * @param blockId TaskBlock 的唯一 ID
   */
  function toggleExpanded(blockId: string): void {
    expandedMap[blockId] = !(expandedMap[blockId] ?? false)
  }

  return { renderItems, expandedMap, toggleExpanded }
}
