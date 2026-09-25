/**
 * Service Worker 侧文案助手
 *
 * MV3 Service Worker 不支持动态 import()，因此这里静态打包全部语言包，
 * 提供与 UI 侧同一份 src/locales/*.json 词条的查找 + {param} 插值。
 * 只覆盖 SW 需要的用户可见文案（报错等），key 与 UI 词条同域。
 *
 * 之所以不直接复用 vue-i18n：避免把整个 vue-i18n 运行时打进 SW bundle，
 * 同时规避 SW 环境对动态加载的限制。
 */

import { STORAGE_KEY_LOCALE } from './constants'
import zhCN from '../locales/zh-CN.json'
import en from '../locales/en.json'
import de from '../locales/de.json'
import es from '../locales/es.json'

/** 支持的语言代码（与 src/locales/index.ts 的 LOCALES 注册表保持一致） */
type SwLocaleCode = 'zh-CN' | 'en' | 'de' | 'es'

/** 全量语言包（静态 import，SW 可直接消费原始 JSON） */
const catalogs: Record<SwLocaleCode, Record<string, unknown>> = {
  'zh-CN': zhCN as Record<string, unknown>,
  en: en as Record<string, unknown>,
  de: de as Record<string, unknown>,
  es: es as Record<string, unknown>,
}

/** 当前生效语言（默认英语，initSwLocale 会从存储装载用户偏好） */
let currentLocale: SwLocaleCode = 'en'

/**
 * 在指定语言包中按点分 key 深层取值
 * @param locale 目标语言
 * @param key 词条 key（如 'sw.noActiveTab'）
 * @returns 命中的字符串；key 不存在或值不是字符串时返回 undefined
 */
function lookup(locale: SwLocaleCode, key: string): string | undefined {
  let node: unknown = catalogs[locale]
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * 校验并归一化语言代码
 * @param value 待校验值（来自存储）
 * @returns 合法的语言代码；不合法时返回 undefined
 */
function toLocaleCode(value: unknown): SwLocaleCode | undefined {
  return typeof value === 'string' && value in catalogs ? (value as SwLocaleCode) : undefined
}

/**
 * 翻译 SW 用户可见文案
 * @param key 词条 key（如 'sw.noActiveTab'）
 * @param params 可选插值参数，替换文案中的 {name} 占位符
 * @returns 当前语言文案 → 缺失时回退英语 → 仍缺失返回 key 本身（便于发现漏翻）
 */
export function swT(key: string, params?: Record<string, string | number>): string {
  const raw = lookup(currentLocale, key) ?? lookup('en', key) ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

/**
 * 初始化 SW 语言：从 chrome.storage 装载用户偏好，并监听后续变化
 * （sidepanel 切换语言后 SW 即时跟随）；storage 不可用时静默保持默认值。
 */
export async function initSwLocale(): Promise<void> {
  try {
    const result = (await chrome.storage.local.get(STORAGE_KEY_LOCALE)) as Record<string, unknown>
    const stored = toLocaleCode(result[STORAGE_KEY_LOCALE])
    if (stored) currentLocale = stored
  } catch {
    /* 保持默认语言 */
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const change = changes[STORAGE_KEY_LOCALE]
    if (!change) return
    const next = toLocaleCode(change.newValue)
    if (next) currentLocale = next
  })
}
