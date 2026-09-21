/**
 * IndexedDB 共享连接 — 整个扩展只有一个 dbPromise。
 *
 * 设计动机：
 *   早期各 store 模块（message-store、block-expanded-store）各自维护 dbPromise，
 *   而且 schema 版本不一致（一个 v1、一个 v2）。多个 store 第一次并发打开同一个
 *   数据库时会触发竞态：v1 的连接已经在事务里写 messages 了，v2 的 onupgradeneeded
 *   又想修改 schema，导致 IndexedDB 进入 versionchange 阻塞状态，UI 卡死。
 *
 * 修复：
 *   把 DB_NAME / DB_VERSION / onupgradeneeded 集中到本模块，所有 store 共用 openDB()。
 *   任何 store 第一次调用 openDB() 时，整个数据库一次性升级到最新版本，
 *   后续 store 拿到的是已经升级完成的同一份连接，不会再触发 versionchange。
 *
 * 版本演进：
 *   v1：messages + meta
 *   v2：在 v1 基础上新增 task_block_expanded
 */

export const DB_NAME = 'ai_commander'
export const DB_VERSION = 2

/** object store 名集中在这里导出，避免各 store 各自硬编码字符串 */
export const STORE_MESSAGES = 'messages'
export const STORE_META = 'meta'
export const STORE_BLOCK_EXPANDED = 'task_block_expanded'

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * 打开数据库（懒加载、模块级单例）。
 *
 * 整个扩展生命周期内只会触发一次 onupgradeneeded（从当前版本升到 DB_VERSION）。
 * 所有 store 共用这个连接，避免并发升级导致的 versionchange 阻塞。
 */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // v1 stores
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
      // v2 store
      if (!db.objectStoreNames.contains(STORE_BLOCK_EXPANDED)) {
        db.createObjectStore(STORE_BLOCK_EXPANDED, { keyPath: 'blockId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
  return dbPromise
}

/**
 * 把 IDBRequest 包装成 Promise。
 */
export function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/**
 * 关闭当前数据库连接并清空 dbPromise（供 _resetForTest 等场景使用）。
 * 下次 openDB() 会重新打开/升级。
 */
export async function closeDB(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}

/**
 * 删除整个数据库（供 _resetForTest 等场景使用）。
 */
export function resetDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'))
    req.onblocked = () => resolve()
  })
}
