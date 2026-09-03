/**
 * Cookie SW 命令实现
 * 对应 swIntent: cookies_observe / cookies_remove
 */

import type { ExecutionResult } from '../../types/execution'

type SafeCookie = {
  name: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  session: boolean
  sameSite?: string
  storeId?: string
}

interface CookieRecord {
  name: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  session: boolean
  sameSite?: string
  storeId?: string
  value?: string
}

/** 将 Cookie 转换为不包含 value 的安全摘要，防止认证信息进入模型。 */
function sanitizeCookie(cookie: CookieRecord): SafeCookie {
  return {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    session: cookie.session,
    sameSite: cookie.sameSite,
    storeId: cookie.storeId,
  }
}

/** 解析并校验 Cookie 查询 URL。 */
function validateCookieUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** 解析 Cookie 查询域名，禁止空值和非法域名。 */
function validateDomain(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const domain = value
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
  return /^[a-z0-9.-]+$/i.test(domain) && domain.includes('.') ? domain : null
}

/**
 * 解析 Cookie 查询域名：
 * - 字符串值：validateDomain 校验后返回
 * - CURRENT_TAB_DOMAIN 哨兵值：取当前活动标签的 hostname（侧栏命令 /cookies 无参时用）
 * - 其它：返回 null（拒绝非法输入）
 */
export const CURRENT_TAB_DOMAIN = '__current__'

async function resolveDomain(value: unknown): Promise<string | null> {
  const explicit = validateDomain(value)
  if (explicit) return explicit
  if (value !== CURRENT_TAB_DOMAIN) return null
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return null
  try {
    return validateDomain(new URL(tab.url).hostname)
  } catch {
    return null
  }
}

/** 查询单个 Cookie，并只返回安全字段。 */
export async function get(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const url = validateCookieUrl(payload.url)
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!url || !name)
    return { success: false, code: 'INVALID_PARAMS', message: '需要合法 url 和 name' }
  const cookie = await chrome.cookies.get({
    url,
    name,
    storeId: payload.storeId as string | undefined,
  })
  return { success: true, cookie: cookie ? sanitizeCookie(cookie) : null }
}

/** 查询 Cookie 列表，并统一移除 value 字段。 */
export async function getAll(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const domain = await resolveDomain(payload.domain)
  if (!domain) return { success: false, code: 'INVALID_PARAMS', message: '需要合法 domain' }
  const cookies = await chrome.cookies.getAll({
    domain,
    storeId: payload.storeId as string | undefined,
  })
  return { success: true, cookies: cookies.map(sanitizeCookie), found: cookies.length, domain }
}

/** 查询浏览器 Cookie Store，仅返回非敏感标识。 */
export async function getAllCookieStores(): Promise<ExecutionResult> {
  const stores = await chrome.cookies.getAllCookieStores()
  return {
    success: true,
    stores: stores.map((store) => ({ id: store.id, tabIds: store.tabIds })),
  }
}

/** 设置 Cookie；value 仅传给 Chrome API，不写入返回值。 */
export async function set(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const url = validateCookieUrl(payload.url)
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const value = typeof payload.value === 'string' ? payload.value : null
  if (!url || !name || value === null) {
    return { success: false, code: 'INVALID_PARAMS', message: '需要合法 url、name 和 value' }
  }
  const details: Record<string, unknown> = { url, name, value }
  for (const key of [
    'domain',
    'path',
    'secure',
    'httpOnly',
    'sameSite',
    'storeId',
    'expirationDate',
    'partitionKey',
  ]) {
    if (payload[key] !== undefined) details[key] = payload[key]
  }
  const cookie = await chrome.cookies.set(details)
  return { success: true, cookie: cookie ? sanitizeCookie(cookie) : null, set: true }
}

export async function observe(payload: Record<string, unknown>): Promise<ExecutionResult> {
  return getAll(payload)
}

/** 清除指定域名的 Cookie（dangerous — 由 dispatchTool 拦截） */
export async function remove(payload: Record<string, unknown>): Promise<ExecutionResult> {
  const domain = await resolveDomain(payload.domain)
  if (!domain) return { success: false, code: 'INVALID_PARAMS', message: '需要合法 domain' }
  const cookies = await chrome.cookies.getAll({ domain })

  // 支持按用户勾选的 selectedNames（字符串数组）只删除部分
  const selectedNames = Array.isArray(payload.selectedNames)
    ? (payload.selectedNames as unknown[]).filter(
        (n): n is string => typeof n === 'string' && n.length > 0
      )
    : null
  const targetCookies = selectedNames
    ? cookies.filter((c) => selectedNames.includes(c.name))
    : cookies

  const failures: string[] = []
  let removed = 0
  for (const cookie of targetCookies) {
    const cookieDomain = cookie.domain.replace(/^\./, '') || domain
    const path = cookie.path || '/'
    const url = `${cookie.secure ? 'https' : 'http'}://${cookieDomain}${path}`
    try {
      await chrome.cookies.remove({ url, name: cookie.name, storeId: cookie.storeId })
      removed++
    } catch {
      failures.push(cookie.name)
    }
  }
  return {
    success: failures.length === 0,
    code: failures.length ? 'PARTIAL_SUCCESS' : undefined,
    removed,
    failed: failures,
    domain,
  }
}
