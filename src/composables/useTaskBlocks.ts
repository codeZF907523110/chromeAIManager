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
 * 默认展开；任务结束（activeLoopId: non-null → null）时把最近一个块自动收起。
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
  /** 块展开状态表：默认展开（true） */
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
        expanded: expandedMap[blockId] ?? true,
      })
      i = j
    }
    return out
  })

  /**
   * 任务结束（activeLoopId: non-null → null）时，把刚刚结束的块自动收起。
   *
   * 用闭包变量 prevLoopId 记录上一次的值，watch 触发时对比是否发生了
   * 「非空 → 空」转变（手动 stop / 正常完成 / 超时都属于此类）。
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
    expandedMap[blockId] = !(expandedMap[blockId] ?? true)
  }

  return { renderItems, expandedMap, toggleExpanded }
}
