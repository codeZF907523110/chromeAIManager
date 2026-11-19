/**
 * 网页深色模式 — SW 端实现（executeScript 注入固定 id 的 <style>，按 id 幂等增删）
 * 方案详见 docs/page-theme.md（v2.4：弃用 insertCSS/removeCSS 字符串配对语义）
 */

import { STORAGE_KEY_PAGE_THEME_SITES } from '../shared/constants'

/**
 * 暗化滤镜 CSS（Dark Reader Filter 模式同款）：
 * - html 整页反色 + hue-rotate 抵消色相偏移，浅色页面反色后变暗
 * - 媒体与嵌入内容（图片/视频/canvas/iframe 等）再反转回原色，避免变成「底片」
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

/**
 * 暗化 <style> 元素 id（全站唯一）：
 * 按存在性判定/移除，天然幂等——不依赖「注入与移除次数相等」的配对语义，
 * 路由跳转、重复调用、升级残留都能保证同一文档至多一份样式、一次除净
 */
const PAGE_THEME_STYLE_ID = 'ai-commander-page-dark-style'

/** 记为深色的域名集合（站点记忆）：内存缓存镜像 storage，避免每次页面加载都读 storage */
let darkSites: Set<string> | null = null
/** 水合进行中的 promise（幂等，并发调用共享同一次读取） */
let hydrating: Promise<void> | null = null

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
 * 向标签页注入暗化样式（幂等：document 里已有本 id 的 <style> 则跳过）。
 * executeScript 每次注入全新脚本执行，无常驻脚本、无配对语义；
 * documentElement 未就绪时跳过，由 onUpdated complete 兜底事件重试自愈
 * @param tabId 标签页 ID
 * @throws chrome:// 等受限页面 executeScript 直接抛错，由调用方映射错误文案
 */
export async function applyDarkCss(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (styleId: string, css: string) => {
      if (!document.documentElement || document.getElementById(styleId)) return
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = css
      document.documentElement.appendChild(style)
    },
    args: [PAGE_THEME_STYLE_ID, PAGE_THEME_DARK_CSS],
  })
}

/**
 * 移除标签页暗化样式（按 id 全量 remove，元素不存在时为安全 no-op）。
 * 附带一次配对 removeCSS 清理 v2.x insertCSS 升级残留（旧样式不在 DOM、无残留时为 no-op；
 * 受限页 removeCSS 抛错就地吞掉，由 executeScript 的抛错统一走调用方错误映射）
 * @param tabId 标签页 ID
 * @throws 受限页面 executeScript 抛错，由调用方映射错误文案
 */
export async function removeDarkCss(tabId: number): Promise<void> {
  await chrome.scripting.removeCSS({ target: { tabId }, css: PAGE_THEME_DARK_CSS }).catch(() => {})
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (styleId: string) => {
      document.querySelectorAll(`#${styleId}`).forEach((el) => el.remove())
    },
    args: [PAGE_THEME_STYLE_ID],
  })
}

/**
 * 注册「已记忆域名自动暗化」监听（必须在 SW 顶层同步调用，MV3 事件唤醒规则）：
 * - onUpdated loading：新文档开始加载，域名命中记忆则注入
 * - onUpdated complete：兜底重试（loading 阶段注入失败时自愈；applyDarkCss 按 id 幂等，重复调用无副作用）
 */
export function registerPageThemeAutoApply(): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    void autoApplyOnTabUpdate(tabId, changeInfo.status ?? '', changeInfo.url ?? tab?.url)
  })
}

/**
 * 页面加载事件处理：按站点记忆自动注入暗化样式
 * @param tabId 标签页 ID
 * @param status 加载状态（loading / complete / 其它忽略）
 * @param url 事件携带的页面 URL
 */
async function autoApplyOnTabUpdate(tabId: number, status: string, url: string | undefined) {
  if (status !== 'loading' && status !== 'complete') return
  const hostname = hostnameOf(url)
  if (!hostname) return
  try {
    await hydrateSites()
  } catch {
    return // storage 暂不可用，complete 阶段还有一次兜底机会
  }
  if (!darkSites?.has(hostname)) return
  try {
    await applyDarkCss(tabId)
  } catch {
    // 受限页面（chrome:// 等）无法注入，静默跳过（与手动 /dark 的显式报错不同）
  }
}
