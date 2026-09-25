/**
 * i18n 引导模块（sidepanel 侧）
 *
 * 基于 vue-i18n（Composition 模式）提供 UI 文案多语言能力：
 * - LOCALES：支持的语言注册表，新增语言 = 新增一份 JSON + 在此注册一行
 * - resolveInitialLocale：语言解析链（用户设置 → 系统语言精确匹配 → 基础语言匹配 → en 兜底）
 * - setLocale：切换语言，未随包内置的语言包按需动态 import 懒加载
 *
 * 说明：SW 侧不能动态 import()，其文案助手见 src/shared/sw-i18n.ts，
 * 两侧共用同一份 src/locales/*.json 词条。
 *
 * 异常：chrome.i18n / storage 不可用时安全回退 en，不向外抛错。
 */

import { createI18n } from 'vue-i18n'
import type { DefineLocaleMessage } from 'vue-i18n'
import zhCN from './zh-CN.json'
import en from './en.json'

/** 支持的语言注册表（label 使用该语言的母语写法，保证任何界面语言下都可辨认） */
export const LOCALES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
] as const

/** 语言代码类型（由 LOCALES 注册表推导） */
export type LocaleCode = (typeof LOCALES)[number]['code']

/** 兜底语言：找不到词条或语言时最终落到英语 */
export const FALLBACK_LOCALE: LocaleCode = 'en'

/** 界面语言 → 语音识别 BCP-47 语言（Web Speech API 要求完整 tag，如 en-US） */
const SPEECH_RECOGNITION_LANGS: Record<LocaleCode, string> = {
  'zh-CN': 'zh-CN',
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
}

/**
 * 界面语言映射为语音识别语言
 * @param locale 界面语言代码（未注册的值按兜底语言处理）
 * @returns Web Speech API 可用的 BCP-47 语言标签
 */
export function speechLangFor(locale: string): string {
  return SPEECH_RECOGNITION_LANGS[locale as LocaleCode] ?? SPEECH_RECOGNITION_LANGS[FALLBACK_LOCALE]
}

/** 启动时即打包进 sidepanel 的语言包（其余语言在 setLocale 时懒加载）；宽类型，key 校验交给防回归脚本 */
const bundledMessages: Record<string, DefineLocaleMessage> = {
  'zh-CN': zhCN,
  en,
}

/** 懒加载语言包的加载器（已内置的语言不需要） */
const lazyLoaders: Partial<Record<LocaleCode, () => Promise<{ default: DefineLocaleMessage }>>> = {
  de: () => import('./de.json'),
  es: () => import('./es.json'),
}

/** 已加载进 i18n 实例的语言集合 */
const loadedLocales = new Set<string>(Object.keys(bundledMessages))

/**
 * 判断给定值是否为支持的语言代码
 * @param value 待校验值（通常来自存储或系统语言）
 * @returns 是否为 LOCALES 中注册的语言代码
 */
export function isLocaleCode(value: unknown): value is LocaleCode {
  return LOCALES.some((l) => l.code === value)
}

/**
 * 解析初始语言（解析链：用户设置 → 系统语言精确匹配 → 基础语言匹配 → en）
 * @param stored 用户此前持久化的语言偏好（可为空/非法）
 * @returns 最终生效的语言代码，保证一定是 LOCALES 中的值
 */
export function resolveInitialLocale(stored?: string | null): LocaleCode {
  if (isLocaleCode(stored)) return stored
  // 系统/浏览器 UI 语言：优先 chrome.i18n（扩展标准途径），降级 navigator.language
  let ui = ''
  try {
    ui = chrome.i18n.getUILanguage?.() || navigator.language || ''
  } catch {
    ui = typeof navigator !== 'undefined' ? navigator.language : ''
  }
  if (isLocaleCode(ui)) return ui
  const base = ui.split('-')[0]?.toLowerCase()
  if (base) {
    const byBase = LOCALES.find((l) => l.code.split('-')[0].toLowerCase() === base)
    if (byBase) return byBase.code
  }
  return FALLBACK_LOCALE
}

/**
 * i18n 单例：初始语言按系统语言解析（用户显式偏好由 useSettings 装载后经 setLocale 应用）
 * fallbackLocale 提供词条级兜底（某 key 缺失时取 en 同名词条）
 */
export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages: bundledMessages,
  // 词条缺失走 fallbackLocale，不在控制台刷警告
  missingWarn: false,
  fallbackWarn: false,
})

/**
 * 切换界面语言
 * @param code 目标语言代码（须为 LOCALES 注册值）
 * @throws 语言包动态加载失败时抛出（locale 保持不变），由调用方决定如何提示
 */
export async function setLocale(code: LocaleCode): Promise<void> {
  if (!loadedLocales.has(code)) {
    const load = lazyLoaders[code]
    if (!load) throw new Error(`Unknown locale: ${code}`)
    const { default: messages } = await load()
    i18n.global.setLocaleMessage(code, messages)
    loadedLocales.add(code)
  }
  i18n.global.locale.value = code
  // 同步 <html lang>，保证无障碍与字体渲染跟随
  document.documentElement.setAttribute('lang', code)
}
