/**
 * 网站权限 SW 命令实现
 * 对应 swIntent: permissions_observe / permissions_update
 *
 * 仅观察/设置 chrome.contentSettings 支持的常用权限类型；
 * 不支持的设置会被拒（保持单一数据源与白名单语义）。
 */

import type { ExecutionResult } from '../../types/execution'

/**
 * Chrome contentSettings 支持的权限类型子集。
 *
 * resourceId：在 chrome.contentSettings API 中的资源标识
 * legalSettings：该资源允许的 setting 值
 *
 * 当用户传入不在 legalSettings 内的值（典型 'default'），
 * permissions_update 会拒绝写入，避免 API 抛错。
 */
const OBSERVABLE_PERMISSION_TYPES: Array<{
  key: string
  label: string
  resourceId: string
  legalSettings: readonly string[]
}> = [
  { key: 'cookies', label: 'Cookie', resourceId: 'cookies', legalSettings: ['allow', 'block'] },
  {
    key: 'javascript',
    label: 'JavaScript',
    resourceId: 'javascript',
    legalSettings: ['allow', 'block'],
  },
  { key: 'popups', label: '弹窗', resourceId: 'popups', legalSettings: ['allow', 'block'] },
  {
    key: 'notifications',
    label: '通知',
    resourceId: 'notifications',
    legalSettings: ['allow', 'block', 'ask'],
  },
  { key: 'images', label: '图片', resourceId: 'images', legalSettings: ['allow', 'block'] },
  {
    key: 'microphone',
    label: '麦克风',
    resourceId: 'microphone',
    legalSettings: ['allow', 'block', 'ask'],
  },
  {
    key: 'camera',
    label: '摄像头',
    resourceId: 'camera',
    legalSettings: ['allow', 'block', 'ask'],
  },
  {
    key: 'location',
    label: '位置',
    resourceId: 'location',
    legalSettings: ['allow', 'block', 'ask'],
  },
]

/** chrome.contentSettings.get 的返回结构（只用到 setting 字段） */
interface ContentSettingResult {
  setting?: string
}

/**
 * 查询某域名的所有可观察权限（无参或 CURRENT_TAB_DOMAIN 哨兵取当前活动标签的 hostname）
 *
 * secondaryPattern 在权限类 resourceId 上表示"哪些第三方 subframe 能用这个权限"，
 * 对单域名查询无意义，省略以匹配更广义的设置。
 */
export const CURRENT_TAB_DOMAIN = '__current__'

export async function observe(payload: Record<string, unknown>): Promise<ExecutionResult> {
  let domain = (payload.domain as string | undefined)?.trim()
  if (!domain || domain === CURRENT_TAB_DOMAIN) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) {
      return { success: false, code: 'NO_TABS_FOUND', message: '未找到当前标签' }
    }
    try {
      domain = new URL(tab.url).hostname
    } catch {
      return { success: false, code: 'INVALID_PARAMS', message: '当前页面不是合法 URL' }
    }
  }

  const entries: Array<Record<string, unknown>> = []
  for (const t of OBSERVABLE_PERMISSION_TYPES) {
    try {
      const result = (await chrome.contentSettings.get({
        primaryPattern: `https://${domain}/*`,
        resourceIdentifier: { id: t.resourceId },
      })) as ContentSettingResult
      entries.push({
        key: t.key,
        label: t.label,
        value: result?.setting || 'default',
      })
    } catch {
      entries.push({ key: t.key, label: t.label, value: 'default' })
    }
  }

  return { success: true, domain, permissions: entries, found: entries.length }
}

/** 将域名转换为合法的 HTTPS primaryPattern。 */
function getPattern(domain: unknown): string | null {
  if (typeof domain !== 'string' || !domain.trim()) return null
  const value = domain
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
  return /^[a-z0-9.-]+$/i.test(value) && value.includes('.') ? `https://${value}/*` : null
}

/** 清除指定域名的内容设置，恢复 Chrome 默认值。 */
export async function clear(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const primaryPattern =
    typeof payload.primaryPattern === 'string' ? payload.primaryPattern : getPattern(payload.domain)
  if (!primaryPattern || !/^https?:\/\/([a-z0-9.-]+)\/\*$/i.test(primaryPattern)) {
    return { success: false, code: 'INVALID_PARAMS', message: 'primaryPattern 不合法' }
  }
  await chrome.contentSettings.clear({ primaryPattern })
  return { success: true, primaryPattern, cleared: true }
}
/**
 * 三道校验：
 *  1. domain 必须有值
 *  2. setting 必须是 OBSERVABLE_PERMISSION_TYPES 里注册的 resourceId
 *  3. value 必须在该 resourceId 的 legalSettings 范围内
 */
export async function update(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const domain = (payload.domain as string | undefined)?.trim()
  const setting = payload.setting as string | undefined
  const value = payload.value as string | undefined

  if (!domain) {
    return { success: false, code: 'INVALID_PARAMS', message: '缺少域名' }
  }
  const pattern = getPattern(domain)
  if (!pattern) return { success: false, code: 'INVALID_PARAMS', message: '域名不合法' }
  const type = OBSERVABLE_PERMISSION_TYPES.find((t) => t.resourceId === setting)
  if (!type) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: `不支持的权限类型: ${setting}`,
      suggestion: `支持的类型: ${OBSERVABLE_PERMISSION_TYPES.map((t) => t.key).join(', ')}`,
    }
  }
  if (!value || !type.legalSettings.includes(value)) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: `${type.label} 的 value 必须是 ${type.legalSettings.join(' | ')}`,
      suggestion: '不支持 "default"（如需重置，请传 allow 或 block）',
    }
  }

  await chrome.contentSettings.set({
    primaryPattern: pattern,
    resourceIdentifier: { id: type.resourceId },
    setting: value,
  })
  return { success: true, domain, setting: type.key, value }
}
