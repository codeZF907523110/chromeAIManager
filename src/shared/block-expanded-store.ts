/**
 * 任务块展开状态存储 — IndexedDB 封装
 *
 * 按 blockId 存储用户手动 toggle 过的展开状态（true / false）。
 * 用户未手动 toggle 的块不写入存储，渲染时按 activeLoopId 自动推断。
 *
 * 设计：
 *   - 单独一个 object store（与 messages / meta 隔离）
 *   - keyPath: blockId
 *   - 同步写入：UI 响应不阻塞在 IndexedDB，fire-and-forget
 *
 * 数据库连接由 ./db 统一管理，避免与 message-store 出现版本竞态。
 */

import { openDB, promisifyRequest, STORE_BLOCK_EXPANDED } from './db'

/**
 * 任务块展开状态存储
 */
export const blockExpandedStore = {
  /**
   * 读取所有手动 toggle 过的块的状态：blockId → expanded
   */
  async loadAll(): Promise<Record<string, boolean>> {
    try {
      const db = await openDB()
      const tx = db.transaction(STORE_BLOCK_EXPANDED, 'readonly')
      const all = await promisifyRequest<{ blockId: string; expanded: boolean }[]>(
        tx.objectStore(STORE_BLOCK_EXPANDED).getAll()
      )
      const map: Record<string, boolean> = {}
      for (const r of all ?? []) map[r.blockId] = r.expanded
      return map
    } catch (e) {
      console.warn('[blockExpandedStore] loadAll failed:', e)
      return {}
    }
  },

  /**
   * 设置某块的状态。fire-and-forget：UI 不阻塞。
   */
  set(blockId: string, expanded: boolean): void {
    openDB()
      .then((db) => {
        const tx = db.transaction(STORE_BLOCK_EXPANDED, 'readwrite')
        tx.objectStore(STORE_BLOCK_EXPANDED).put({ blockId, expanded })
      })
      .catch((e) => console.warn('[blockExpandedStore] set failed:', e))
  },
}
