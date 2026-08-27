/**
 * 消息存储 — IndexedDB 封装
 *
 * 设计：
 *   - 每条消息一条记录（keyPath: id），按 createdAt 索引排序
 *   - 不做老数据迁移（chrome.storage.local 的 ai_message_log 直接丢弃；第一版干净）
 *   - 默认容量上限 100 条；超出按 createdAt 删除最早
 *   - 所有 API 异步；append/load 都不阻塞 UI 渲染
 *
 * 数据库版本：
 *   v1：messages + meta 两个 store
 *
 * 注意：Service Worker 与 side panel 都可访问同一个 IndexedDB。
 * 跨上下文并发写不做处理，最后写入获胜（第一版足够）。
 */

import type { Component } from 'vue'
import type { MessageLog, EmbeddedComponent } from '../types'
import { blockRegistry } from '../components/blocks/registry'

/**
 * 把 Component 对象反查为 blockRegistry 的 tagName。
 *
 * registry 用 tagName（占位符里的字符串）作为 key，但这里拿到的 component 是 Vue
 * Component 对象（来自工厂或 AI 拼装的模块级变量），需要遍历 registry 找到对应 tag。
 *
 * 找不到时返回空串——加载路径 toMessageBody 会跳过空 tagName，避免把空组件塞进消息体。
 */
function resolveTagName(component: Component): string {
  for (const [tag, entry] of blockRegistry) {
    if (entry.component === component) return tag
  }
  return ''
}

const DB_NAME = 'ai_commander'
const DB_VERSION = 1
const STORE_MESSAGES = 'messages'
const STORE_META = 'meta'

/** meta store key：消息容量上限 */
const META_MAX_KEY = 'maxMessages'
/** 默认消息容量上限 */
export const DEFAULT_MAX_MESSAGES = 100

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * 打开数据库（懒加载、单例）
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
  return dbPromise
}

/**
 * 持久化消息记录
 *
 * - createdAt 默认 Date.now()
 * - id 默认 crypto.randomUUID()
 * - 超出上限时删除最早的多余记录
 *
 * 注意：PersistedMessage.text 实际是 StorableMessageBody（components 被替换成 tagName）。
 * 这里沿用 MessageLog 形态声明类型是为了让 IndexedDB store key/序列化保持稳定；
 * 字段读写都通过 toStorable / toMessageBody 转换，外部调用方拿到的是 MessageLog。
 */
export interface PersistedMessage extends MessageLog {
  id: string
  createdAt: number
}

/**
 * 可落盘的组件描述（Vue Component 对象不能 structuredClone）
 * - tagName：与 markdown 占位符 <tag data-id="..." /> 的 tag 一致
 * - 加载时通过 blockRegistry.get(tagName) 还原成 Vue 组件
 */
interface StorableComponent {
  id: string
  tagName: string
  props: Record<string, unknown>
}

/**
 * 在持久化层使用的内部消息正文形态。
 *
 * 组件对象（Vue Component）无法直接 structuredClone；落盘前要转成 tagName 字符串，
 * 加载时再反查 blockRegistry 还原。text.markdown 中的占位符 <tag data-id="..." />
 * 本来就是按 tag 名识别的，所以 tagName 是天然的"组件主键"。
 */
interface StorableMessageBody {
  markdown: string
  components?: StorableComponent[]
}

/**
 * 把 MessageLog 转换为可落盘的形态。
 *
 * `text.components` 含 Vue 组件对象，IndexedDB 的 structured clone 无法处理
 * （function、Proxy、VNode 工厂都会触发 DataCloneError）。
 * 这里把每个 component 转成 { id, tagName, props } —— tagName 是 blockRegistry 的 key，
 * 加载时按 tagName 反查即可还原回 Vue 组件。这一步彻底解决了"重启后组件缺失"问题。
 *
 * 重要：props 里如果含函数（如 DataTableColumn.format），structured clone 也会失败。
 * 常见模式是 format 是工厂内联的箭头函数，重建组件时会用同一份工厂重新生成；这里直接剔除。
 *
 * 反向函数 toMessageBody 在 list() 阶段统一调用。
 */
function toStorable(msg: MessageLog): Omit<MessageLog, 'text'> & {
  text: StorableMessageBody
} {
  const storableBody: StorableMessageBody = {
    markdown: msg.text.markdown,
  }
  if (msg.text.components && msg.text.components.length > 0) {
    storableBody.components = msg.text.components.map((c) => ({
      id: c.id,
      tagName: resolveTagName(c.component),
      props: stripUncloneable(c.props),
    }))
  }
  return {
    ...msg,
    text: storableBody,
  }
}

/**
 * 深拷贝一个 props 对象，把所有 function 替换为 undefined 并删除对应 key。
 *
 * IndexedDB structured clone 不支持 function；组件工厂里常见的列定义
 * `format: (row) => ...` 必须从持久化的 props 里剔除（工厂重启后会重新生成
 * 同一份 format 函数，反查 Component 即可拿到原语义）。
 *
 * 仅做一层浅过滤：工厂的 props 形状是已知的，没有嵌套 function；数组内的对象
 * 也只过滤顶层 function key，足够覆盖 DataTableColumn[] 的场景。
 */
function stripUncloneable(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'function') continue
    if (Array.isArray(v)) {
      result[k] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripUncloneable(item as Record<string, unknown>)
          : item
      )
    } else if (v && typeof v === 'object') {
      result[k] = stripUncloneable(v as Record<string, unknown>)
    } else {
      result[k] = v
    }
  }
  return result
}

/**
 * 把 PersistedMessage 还原成可被 MessageBubble 使用的 MessageLog。
 *
 * 按 storable tagName 反查 blockRegistry 取回真实组件；找不到的组件（理论上不应发生，
 * 因为 toStorable 用的是同一份注册表）会被跳过——由 MessageBubble 走"组件缺失"兜底。
 */
function toMessageBody(record: PersistedMessage): MessageLog {
  // PersistedMessage.text 实际是 StorableMessageBody（components 项不带 component 字段）
  // 我们这里把它当作 StorableMessageBody 来读，由 IndexedDB 序列化反序列化保证形状稳定。
  const storableBody = record.text as unknown as StorableMessageBody
  if (!storableBody.components) return record
  const restored: EmbeddedComponent[] = []
  for (const sc of storableBody.components) {
    const entry = blockRegistry.get(sc.tagName)
    if (!entry) continue
    restored.push({
      id: sc.id,
      component: entry.component,
      props: sc.props,
    })
  }
  return {
    ...record,
    text: {
      markdown: storableBody.markdown,
      components: restored.length > 0 ? restored : undefined,
    },
  }
}

type IDBValidResult = PersistedMessage[]

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

async function getMaxFromDB(db: IDBDatabase): Promise<number> {
  try {
    const tx = db.transaction(STORE_META, 'readonly')
    const result = await promisifyRequest<{ value: number } | undefined>(
      tx.objectStore(STORE_META).get(META_MAX_KEY)
    )
    return result?.value ?? DEFAULT_MAX_MESSAGES
  } catch {
    return DEFAULT_MAX_MESSAGES
  }
}

async function setMaxInDB(db: IDBDatabase, n: number): Promise<void> {
  const tx = db.transaction(STORE_META, 'readwrite')
  await promisifyRequest(
    tx.objectStore(STORE_META).put({ key: META_MAX_KEY, value: n, updatedAt: Date.now() })
  )
}

/**
 * 删除最早的多余记录，保持总数不超过 max
 */
async function trimOldest(db: IDBDatabase, max: number): Promise<void> {
  if (max <= 0) return
  const tx = db.transaction(STORE_MESSAGES, 'readwrite')
  const store = tx.objectStore(STORE_MESSAGES)
  const index = store.index('createdAt')
  const all = await promisifyRequest<PersistedMessage[]>(index.getAll())
  if (all.length <= max) return
  const toDelete = all.slice(0, all.length - max)
  for (const m of toDelete) {
    store.delete(m.id)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('trim failed'))
  })
}

/**
 * 消息存储：append/list/remove/clear/trim + 容量上限读写
 */
export const messageStore = {
  /**
   * 追加一条消息，自动分配 id 与 createdAt，超出容量时裁剪最早
   *
   * 落盘字段类型用 `as unknown as PersistedMessage` 强制收敛：toStorable 返回的 text
   * 是 StorableMessageBody 形态（components 项不带 component 字段），
   * PersistedMessage 接口的 text 字段按 MessageLog 形态声明是为了让 IndexedDB store
   * key/序列化保持稳定。运行时 IndexedDB 用结构化克隆不检查 TS 类型，
   * 所以这里是必要的、显式的类型断言。
   */
  async append(msg: MessageLog): Promise<PersistedMessage> {
    const db = await openDB()
    const storable = toStorable(msg)
    const record = {
      ...storable,
      id: msg.id ?? crypto.randomUUID(),
      createdAt: msg.createdAt ?? Date.now(),
    } as unknown as PersistedMessage
    {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite')
      await promisifyRequest(tx.objectStore(STORE_MESSAGES).put(record))
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('append failed'))
      })
    }
    const max = await getMaxFromDB(db)
    await trimOldest(db, max)
    return record
  },

  /**
   * 按时间升序返回全部消息（已还原 MessageBody.components）
   *
   * 调用方拿到的是 MessageLog 形态，可直接传给 MessageBubble 渲染。
   * toMessageBody 在每条记录上独立执行，单条失败不影响其他消息。
   */
  async list(): Promise<MessageLog[]> {
    const db = await openDB()
    const tx = db.transaction(STORE_MESSAGES, 'readonly')
    const index = tx.objectStore(STORE_MESSAGES).index('createdAt')
    const items = (await promisifyRequest<IDBValidResult>(index.getAll())) ?? []
    return items.map(toMessageBody)
  },

  /**
   * 按 id 删除单条
   */
  async remove(id: string): Promise<void> {
    const db = await openDB()
    const tx = db.transaction(STORE_MESSAGES, 'readwrite')
    await promisifyRequest(tx.objectStore(STORE_MESSAGES).delete(id))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('remove failed'))
    })
  },

  /**
   * 清空全部消息
   */
  async clear(): Promise<void> {
    const db = await openDB()
    const tx = db.transaction(STORE_MESSAGES, 'readwrite')
    await promisifyRequest(tx.objectStore(STORE_MESSAGES).clear())
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('clear failed'))
    })
  },

  /**
   * 读取当前容量上限（不存在则返回默认）
   */
  async getMax(): Promise<number> {
    const db = await openDB()
    return getMaxFromDB(db)
  },

  /**
   * 设置容量上限，立即 trim 多余记录
   */
  async setMax(n: number): Promise<void> {
    const db = await openDB()
    await setMaxInDB(db, n)
    await trimOldest(db, n)
  },

  /**
   * 删除 id 列表外的所有消息（批量清理）
   */
  async removeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const db = await openDB()
    const tx = db.transaction(STORE_MESSAGES, 'readwrite')
    const store = tx.objectStore(STORE_MESSAGES)
    for (const id of ids) {
      store.delete(id)
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('removeMany failed'))
    })
  },
}

/**
 * 仅在测试或调试时使用：重置整个数据库（删除所有 store）
 */
export async function _resetForTest(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'))
    req.onblocked = () => resolve()
  })
}
