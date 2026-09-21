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
 * 展开/收起规则：
 *   - 默认全部收起。
 *   - 任务进行中（activeLoopId 非空）：最后一个块自动展开。
 *   - 用户手动 toggle 过的块状态**持久化到 IndexedDB**，跨任务、跨重启保留。
 *   - 任务结束（activeLoopId → null）：所有块按持久化状态收起/展开
 *     （未手动 toggle 过的块统一收起）。
 */

import { computed, reactive, type ComputedRef } from 'vue'
import type { MessageLog } from '../types'
import { isTaskSystemMessage } from '../utils/taskBlockPatterns'
import { blockExpandedStore } from '../shared/block-expanded-store'

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
  /** 切换块的展开/收起 */
  toggleExpanded: (blockId: string) => void
}

/**
 * 把 messageLog 切成 bubble / block 列表，并维护块的展开状态。
 *
 * 展开状态在 useTaskBlocks 组件实例的整个生命周期内有效；同时持久化到 IndexedDB，
 * 跨任务、跨重启都能记住用户的 toggle 选择。
 *
 * @param messagesRef MessageLog 列表（只读）
 * @param activeLoopIdRef 当前活动任务 ID（null/undefined 表示无活动任务）
 * @returns 渲染项 + 切换函数
 */
export function useTaskBlocks(
  messagesRef: ComputedRef<readonly MessageLog[]>,
  activeLoopIdRef: ComputedRef<string | null | undefined>
): UseTaskBlocksReturn {
  /**
   * 用户手动 toggle 过的块状态：blockId → expanded。
   * 初始化时从 IndexedDB 异步加载；加载完前视为空（默认收起）。
   */
  const manualExpanded = reactive<Record<string, boolean>>({})

  // 启动时加载持久化的展开状态
  void blockExpandedStore.loadAll().then((persisted) => {
    for (const [id, val] of Object.entries(persisted)) {
      manualExpanded[id] = val
    }
  })

  /**
   * 扫描 messageLog，把连续的 task system 段合并成 block，其余作为 bubble。
   *
   * 最后一个块的 expanded 取决于：
   *   - 用户手动 toggle 过（manualExpanded 中有记录）→ 用持久化的值
   *   - 否则：当前有活动任务（activeLoopId 非空）→ 展开
   *   - 否则：收起
   */
  const renderItems = computed<RenderItem[]>(() => {
    const list = messagesRef.value
    const out: RenderItem[] = []
    const blocks: Extract<RenderItem, { kind: 'block' }>[] = []
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
      // 非最后一个块：默认收起（除非用户手动 toggle 过）
      const manual = manualExpanded[blockId]
      const expanded = manual !== undefined ? manual : false
      const block: Extract<RenderItem, { kind: 'block' }> = {
        kind: 'block',
        blockId,
        messages: blockMsgs,
        indices: blockIdx,
        expanded,
      }
      blocks.push(block)
      out.push(block)
      i = j
    }
    // 最后一个块的自动展开逻辑：若未手动 toggle 过，且当前有活动任务 → 展开
    if (blocks.length > 0) {
      const lastBlock = blocks[blocks.length - 1]
      if (manualExpanded[lastBlock.blockId] === undefined && activeLoopIdRef.value) {
        lastBlock.expanded = true
      }
    }
    return out
  })

  /**
   * 切换块的展开/收起状态。记录到 manualExpanded 并持久化到 IndexedDB。
   *
   * @param blockId TaskBlock 的唯一 ID
   */
  function toggleExpanded(blockId: string): void {
    const current = manualExpanded[blockId]
    const baseline = current !== undefined ? current : false
    const next = !baseline
    manualExpanded[blockId] = next
    blockExpandedStore.set(blockId, next)
  }

  return { renderItems, toggleExpanded }
}
