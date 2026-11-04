/**
 * 网页深色模式 — SW 端实现（chrome.scripting.insertCSS 直达，不依赖 content script）
 * 方案详见 docs/page-theme.md
 */

import { STORAGE_KEY_PAGE_THEME_SITES } from '../shared/constants'

/**
 * 暗化滤镜 CSS（Dark Reader Filter 模式同款）：
 * - html 整页反色 + hue-rotate 抵消色相偏移，浅色页面反色后变暗
 * - 媒体与嵌入内容（图片/视频/canvas/iframe 等）再反转回原色，避免变成「底片」
 * insertCSS 与 removeCSS 必须传同一字符串才能配对移除，故常量在此单一来源
 */
const PAGE_THEME_DARK_CSS = `
html {
  filter: invert(1) hue-rotate(180deg);
  background-color: #fff;
}
img, video, picture, canvas, svg, iframe, embed, object,
[style*="background-image"] {
  filter: invert(1) hue-rotate(180deg);
}
`

/** 记为深色的域名集合（站点记忆）：内存缓存镜像 storage，避免每次页面加载都读 storage */
let darkSites: Set<string> | null = null
/** 水合进行中的 promise（幂等，并发调用共享同一次读取） */
let hydrating: Promise<void> | null = null

/** 已注入暗化 CSS 的标签页（防同文档重复注入；导航时由 onUpdated 'loading' 清除） */
const appliedTabs = new Set<number>()

/**
 * 从 storage 水合站点记忆到内存缓存
 * @throws storage 读取失败时抛出，由调用方兜底（保持 null，下次事件重试）
 */
async function hydrateSites(): Promise<void> {
  if (darkSites) return
  if (!hydrating) {
    hydrating = (async () => {
      const store = (await chrome.storage.local.get([STORAGE_KEY_PAGE_THEME_SITES])) as Record<
        string,
        Record<string, string> | undefined
      >
      const map = store[STORAGE_KEY_PAGE_THEME_SITES] ?? {}
      darkSites = new Set(
        Object.entries(map)
          .filter(([, v]) => v === 'dark')
          .map(([host]) => host)
      )
    })().finally(() => {
      hydrating = null
    })
  }
  await hydrating
}

/**
 * 站点记忆写入/删除并同步 storage（light = 删除记忆，恢复该站默认原样）
 * @param hostname 域名
 * @param dark true 记住深色偏好，false 删除
 */
export async function rememberSite(hostname: string, dark: boolean): Promise<void> {
  try {
    await hydrateSites()
  } catch {
    // 读取已有记忆失败时跳过本次写入：用空集覆盖会把其它已记域名全部丢失，
    // 宁可少记一条（页面切换本身已生效），也不要丢数据
    return
  }
  const next = new Set(darkSites ?? [])
  if (dark) next.add(hostname)
  else next.delete(hostname)
  darkSites = next
  const map: Record<string, string> = {}
  for (const host of next) map[host] = 'dark'
  await chrome.storage.local.set({ [STORAGE_KEY_PAGE_THEME_SITES]: map })
}

/**
 * 解析 URL 的 hostname
 * @param url 完整 URL（tab.url / changeInfo.url）
 * @returns hostname；非 http(s) 或非法 URL 返回空串
 */
function hostnameOf(url: string | undefined): string {
  if (!url || !/^https?:\/\//i.test(url)) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * 获取标签页当前页面的域名
 * @param tabId 标签页 ID
 * @returns hostname；受限页（无权限读 url）返回空串
 */
export async function getTabHostname(tabId: number): Promise<string> {
  try {
    const tab = await chrome.tabs.get(tabId)
    return hostnameOf(tab.url)
  } catch {
    return ''
  }
}

/**
 * 向标签页注入暗化 CSS（幂等：当前文档已注入则跳过）
 * @param tabId 标签页 ID
 * @throws chrome:// 等受限页面 insertCSS 直接抛错，由调用方映射错误文案
 */
export async function applyDarkCss(tabId: number): Promise<void> {
  if (appliedTabs.has(tabId)) return
  await chrome.scripting.insertCSS({ target: { tabId }, css: PAGE_THEME_DARK_CSS })
  appliedTabs.add(tabId)
}

/**
 * 移除标签页暗化 CSS（未注入过时为安全 no-op）
 * @param tabId 标签页 ID
 * @throws 受限页面抛错，由调用方映射错误文案
 */
export async function removeDarkCss(tabId: number): Promise<void> {
  await chrome.scripting.removeCSS({ target: { tabId }, css: PAGE_THEME_DARK_CSS })
  appliedTabs.delete(tabId)
}

/**
 * 注册「已记忆域名自动暗化」监听（必须在 SW 顶层同步调用，MV3 事件唤醒规则）：
 * - onUpdated 'loading'：新文档开始加载，清注入标记；域名命中记忆则注入
 * - onUpdated 'complete'：兜底重试（loading 阶段注入失败时自愈，标记防重复）
 * - onRemoved：清理注入标记，防泄漏
 */
export function registerPageThemeAutoApply(): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    void autoApplyOnTabUpdate(tabId, changeInfo.status ?? '', changeInfo.url ?? tab?.url)
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    appliedTabs.delete(tabId)
  })
}

/**
 * 页面加载事件处理：按站点记忆自动注入暗化 CSS
 * @param tabId 标签页 ID
 * @param status 加载状态（loading / complete / 其它忽略）
 * @param url 事件携带的页面 URL
 */
async function autoApplyOnTabUpdate(tabId: number, status: string, url: string | undefined) {
  if (status === 'loading') {
    // 新文档开始加载：insertCSS 的样式随旧文档销毁，标记同步清除
    appliedTabs.delete(tabId)
  }
  if (status !== 'loading' && status !== 'complete') return
  const hostname = hostnameOf(url)
  if (!hostname) return
  try {
    await hydrateSites()
  } catch {
    return // storage 暂不可用，complete 阶段还有一次兜底机会
  }
  if (appliedTabs.has(tabId) || !darkSites?.has(hostname)) return
  try {
    await applyDarkCss(tabId)
  } catch {
    // 受限页面（chrome:// 等）无法注入，静默跳过（与手动 /dark 的显式报错不同）
  }
}
