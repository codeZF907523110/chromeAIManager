/**
 * 页面采集器
 * 两个纯函数：extractContent / extractStructure
 *  - extractContent：Readability 简化算法选主容器并提取正文/大纲/链接/代码块/列表
 *  - extractStructure：纯遍历识别 ARIA landmark + 交互元素分布
 *
 * 设计原则：
 *  1. 不依赖任何三方库（无 jsdom / 无 cheerio）
 *  2. 任何节点遍历都必须设上限（防大页面卡死）
 *  3. 不修改入参 document
 *  4. 所有函数纯函数（除 DOM 读之外无副作用）
 */

/* ========== 数据结构 ========== */

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

/** 单条 heading */
export interface HeadingItem {
  level: HeadingLevel
  text: string
}

/** 主容器内的关键链接 */
export interface LinkItem {
  text: string
  href: string
}

/** 代码块 */
export interface CodeBlock {
  lang?: string
  code: string
}

/** 列表 */
export interface ListItem {
  ordered: boolean
  items: string[]
}

/** 内容摘要快照 */
export interface ContentSnapshot {
  url: string
  title: string
  lang: string | null
  metaDescription: string | null
  headings: HeadingItem[]
  paragraphs: string[]
  keyLinks: LinkItem[]
  codeBlocks: CodeBlock[]
  lists: ListItem[]
  stats: {
    totalChars: number
    truncated: boolean
  }
}

/** ARIA landmark 统计 */
export interface StructureLandmarks {
  navigation: LinkItem[]
  main: {
    exists: boolean
    childCount: number
    headingCount: number
  }
  complementary: number
  contentinfo: boolean
  banner: boolean
  search: number
}

/** 结构梳理快照 */
export interface StructureSnapshot {
  url: string
  title: string
  lang: string | null
  landmarks: StructureLandmarks
  headings: HeadingItem[]
  buttons: Array<{ text: string }>
  inputs: Array<{ type: string; name?: string; placeholder?: string }>
  formsCount: number
  sectionsCount: { section: number; article: number; aside: number }
  meta: {
    description: string | null
    viewport: string | null
    charset: string | null
  }
}

/* ========== 容量上限 ========== */

const LIMITS = {
  MAX_HEADINGS_CONTENT: 80,
  MAX_PARAGRAPHS: 50,
  MAX_PARAGRAPH_CHARS: 500,
  MIN_PARAGRAPH_CHARS: 20,
  MAX_KEY_LINKS: 30,
  MAX_CODE_BLOCKS: 5,
  MAX_CODE_CHARS: 500,
  MAX_LISTS: 10,
  MAX_LIST_ITEM_CHARS: 30,
  MAX_HEADINGS_STRUCTURE: 100,
  MAX_BUTTONS: 30,
  MAX_INPUTS: 30,
  MAX_NAV_LINKS: 20,
  SCAN_NODES: 5000, // 主容器候选评分时的遍历上限
} as const

/* ========== 1. extractContent ========== */

/**
 * 提取页面正文快照
 * 算法：Readability 简化版
 *  1. 遍历候选节点（article/main/[role] + 容器 div/section）做加分/减分评分
 *  2. 取分数最高且非 body 自身的节点作为 mainContainer
 *  3. 在 mainContainer 内提取 headings / paragraphs / links / codeBlocks / lists
 *  4. 任意阶段容量截断，超过则 stats.truncated = true
 *
 * @param doc 目标 document
 * @returns ContentSnapshot
 */
export function extractContent(doc: Document): ContentSnapshot {
  const url = doc.URL || ''
  const title = doc.title || ''
  const lang = doc.documentElement?.getAttribute('lang') || null
  const metaDescription =
    doc.querySelector('meta[name="description"]')?.getAttribute('content') || null

  const mainContainer = findMainContainer(doc)
  const usingFallback = mainContainer === doc.body

  // 提取大纲
  const headings = collectHeadings(mainContainer, LIMITS.MAX_HEADINGS_CONTENT)
  // 提取段落
  const paragraphs = collectParagraphs(mainContainer)
  // 提取链接
  const keyLinks = collectLinks(mainContainer, LIMITS.MAX_KEY_LINKS)
  // 提取代码块
  const codeBlocks = collectCodeBlocks(mainContainer)
  // 提取列表
  const lists = collectLists(mainContainer)

  const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0)
  const truncated =
    usingFallback ||
    paragraphs.length >= LIMITS.MAX_PARAGRAPHS ||
    headings.length >= LIMITS.MAX_HEADINGS_CONTENT

  return {
    url,
    title,
    lang,
    metaDescription,
    headings,
    paragraphs,
    keyLinks,
    codeBlocks,
    lists,
    stats: { totalChars, truncated },
  }
}

/**
 * 主容器评分选择
 * 评分规则（简化 Readability）：
 *  + <article>/<main>/[role=main|article]                   +50
 *  + <p> 数量 × 1                                            +n
 *  + 文本长度 / 100                                          +n
 *  + class~=content|article|post|entry|main-body             +25
 *  - 存在 <script|style|nav|header|footer|aside|form>        × -3 / 个
 *  - 链接密度 > 0.5                                          × -15
 * @param doc
 * @returns 选中节点；无候选则回退 body
 */
function findMainContainer(doc: Document): Element {
  const candidates: Element[] = []
  const selector = 'article, main, [role="main"], [role="article"], section, div'
  const all = doc.querySelectorAll(selector)
  for (let i = 0; i < all.length && candidates.length < LIMITS.SCAN_NODES; i++) {
    candidates.push(all[i])
  }

  let best: Element = doc.body
  let bestScore = -Infinity

  for (const node of candidates) {
    const score = scoreNode(node)
    if (score > bestScore) {
      bestScore = score
      best = node
    }
  }

  // 极端情况：body 自身也参与评分为 0，必须保证非负
  return best || doc.body
}

/**
 * 节点评分（详见 findMainContainer 注释）
 * @param node
 * @returns 分数（数值越大越像正文）
 */
function scoreNode(node: Element): number {
  const tag = node.tagName.toLowerCase()
  let score = 0

  // 语义标签加分
  if (tag === 'article' || tag === 'main') score += 50
  const role = node.getAttribute('role')
  if (role === 'main' || role === 'article') score += 50

  // 段落密度
  const paragraphs = node.querySelectorAll('p')
  score += paragraphs.length

  // 文本长度贡献（按 100 字为单位）
  const text = (node.textContent || '').trim()
  score += Math.floor(text.length / 100)

  // class 关键词加分
  const className = (node.getAttribute('class') || '').toLowerCase()
  if (/content|article|post|entry|main-body|post-content/.test(className)) {
    score += 25
  }

  // 减分项：噪音标签数量
  const noisy = node.querySelectorAll('script, style, nav, header, footer, aside, form')
  score -= noisy.length * 3

  // 减分项：链接密度过高
  const links = node.querySelectorAll('a')
  const linkTextLen = Array.from(links).reduce((sum, a) => sum + (a.textContent || '').length, 0)
  if (text.length > 0 && linkTextLen / text.length > 0.5) {
    score -= 15
  }

  return score
}

/**
 * 在 root 下按顺序收集 h1-h6
 * @param root
 * @param limit
 */
function collectHeadings(root: Element, limit: number): HeadingItem[] {
  const out: HeadingItem[] = []
  const nodes = root.querySelectorAll('h1, h2, h3, h4, h5, h6')
  for (let i = 0; i < nodes.length && out.length < limit; i++) {
    const el = nodes[i]
    const level = Number(el.tagName.charAt(1)) as HeadingLevel
    if (level < 1 || level > 6) continue
    const text = (el.textContent || '').trim()
    if (!text) continue
    out.push({ level, text })
  }
  return out
}

/**
 * 收集段落正文
 *  - 长度在 [MIN_PARAGRAPH_CHARS, MAX_PARAGRAPH_CHARS] 之间
 *  - 最多 MAX_PARAGRAPHS 段
 * @param root
 */
function collectParagraphs(root: Element): string[] {
  const out: string[] = []
  const nodes = root.querySelectorAll('p')
  for (let i = 0; i < nodes.length && out.length < LIMITS.MAX_PARAGRAPHS; i++) {
    const text = collapseWhitespace(nodes[i].textContent || '')
    if (text.length < LIMITS.MIN_PARAGRAPH_CHARS) continue
    if (text.length > LIMITS.MAX_PARAGRAPH_CHARS) {
      out.push(text.slice(0, LIMITS.MAX_PARAGRAPH_CHARS) + '…')
    } else {
      out.push(text)
    }
  }
  return out
}

/**
 * 收集关键链接（去重 + 文本非空）
 * @param root
 * @param limit
 */
function collectLinks(root: Element, limit: number): LinkItem[] {
  const out: LinkItem[] = []
  const seen = new Set<string>()
  const nodes = root.querySelectorAll('a[href]')
  for (let i = 0; i < nodes.length && out.length < limit; i++) {
    const a = nodes[i]
    const href = a.getAttribute('href') || ''
    // 过滤锚点、javascript:、mailto:、空 href
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue
    const text = collapseWhitespace(a.textContent || '')
    if (!text || text.length > 100) continue
    const key = href + '|' + text
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ text, href: absolutize(href, root.baseURI) })
  }
  return out
}

/**
 * 收集代码块
 *  - 仅取 <pre><code> 或 <pre>
 *  - 截断到 MAX_CODE_CHARS
 * @param root
 */
function collectCodeBlocks(root: Element): CodeBlock[] {
  const out: CodeBlock[] = []
  const pres = root.querySelectorAll('pre')
  for (let i = 0; i < pres.length && out.length < LIMITS.MAX_CODE_BLOCKS; i++) {
    const pre = pres[i]
    const codeEl = pre.querySelector('code')
    const raw = codeEl?.textContent || pre.textContent || ''
    const code = collapseWhitespace(raw).slice(0, LIMITS.MAX_CODE_CHARS)
    if (!code) continue
    const lang =
      codeEl?.getAttribute('class')?.match(/language-([\w-]+)/i)?.[1] ||
      codeEl?.getAttribute('class')?.match(/lang-([\w-]+)/i)?.[1] ||
      undefined
    out.push(lang ? { lang, code } : { code })
  }
  return out
}

/**
 * 收集列表（ul/ol），每项截断到 MAX_LIST_ITEM_CHARS
 * @param root
 */
function collectLists(root: Element): ListItem[] {
  const out: ListItem[] = []
  const lists = root.querySelectorAll('ul, ol')
  for (let i = 0; i < lists.length && out.length < LIMITS.MAX_LISTS; i++) {
    const list = lists[i]
    const items = Array.from(list.querySelectorAll(':scope > li'))
      .map((li) => collapseWhitespace(li.textContent || '').slice(0, LIMITS.MAX_LIST_ITEM_CHARS))
      .filter((t) => t.length > 0)
    if (items.length === 0) continue
    out.push({ ordered: list.tagName.toLowerCase() === 'ol', items })
  }
  return out
}

/* ========== 2. extractStructure ========== */

/**
 * 提取页面结构梳理快照
 *  - ARIA landmark 优先级：role > 显式标签 > 启发式
 *  - 全页面遍历，无主容器评分
 *
 * @param doc 目标 document
 * @returns StructureSnapshot
 */
export function extractStructure(doc: Document): StructureSnapshot {
  const url = doc.URL || ''
  const title = doc.title || ''
  const lang = doc.documentElement?.getAttribute('lang') || null

  const landmarks = collectLandmarks(doc)
  const headings = collectHeadings(doc.body, LIMITS.MAX_HEADINGS_STRUCTURE)
  const buttons = collectButtons(doc)
  const inputs = collectInputs(doc)
  const formsCount = doc.querySelectorAll('form').length
  const sectionsCount = {
    section: doc.querySelectorAll('section').length,
    article: doc.querySelectorAll('article').length,
    aside: doc.querySelectorAll('aside').length,
  }
  const meta = {
    description: doc.querySelector('meta[name="description"]')?.getAttribute('content') || null,
    viewport: doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || null,
    charset:
      doc.querySelector('meta[charset]')?.getAttribute('charset') || doc.characterSet || null,
  }

  return {
    url,
    title,
    lang,
    landmarks,
    headings,
    buttons,
    inputs,
    formsCount,
    sectionsCount,
    meta,
  }
}

/**
 * 收集 ARIA landmarks
 *  优先级：role 属性 > 显式 HTML5 标签 > 启发式
 * @param doc
 */
function collectLandmarks(doc: Document): StructureLandmarks {
  // navigation: <nav> 或 role=navigation
  const navEls = Array.from(doc.querySelectorAll('nav, [role="navigation"]')).slice(
    0,
    LIMITS.MAX_NAV_LINKS
  )
  const navigation: LinkItem[] = []
  for (const nav of navEls) {
    const links = nav.querySelectorAll('a[href]')
    for (let i = 0; i < links.length && navigation.length < LIMITS.MAX_NAV_LINKS; i++) {
      const a = links[i]
      const href = a.getAttribute('href') || ''
      if (!href || href.startsWith('#')) continue
      const text = collapseWhitespace(a.textContent || '')
      if (!text) continue
      navigation.push({ text: text.slice(0, 50), href: absolutize(href, nav.baseURI) })
    }
  }

  // main: <main> / <article> / role=main
  const mainEl = doc.querySelector('main, article, [role="main"]')
  const main = mainEl
    ? {
        exists: true,
        childCount: mainEl.children.length,
        headingCount: mainEl.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
      }
    : { exists: false, childCount: 0, headingCount: 0 }

  // complementary: <aside> 或 role=complementary
  const complementary = doc.querySelectorAll('aside, [role="complementary"]').length

  // contentinfo: <footer> 或 role=contentinfo
  const contentinfo = doc.querySelectorAll('footer, [role="contentinfo"]').length > 0

  // banner: <header> 或 role=banner（注意：<header> 在 article 内不计入 banner）
  const banner =
    doc.querySelectorAll(
      'body > header, body > [role="banner"], header:not(article header):not(main header), [role="banner"]:not(article [role="banner"]):not(main [role="banner"])'
    ).length > 0

  // search: role=search 或 <form role="search">
  const search = doc.querySelectorAll('[role="search"], form[role="search"]').length

  return { navigation, main, complementary, contentinfo, banner, search }
}

/**
 * 收集按钮（<button> 或 role=button 或 input[type=button|submit|reset]）
 * @param doc
 */
function collectButtons(doc: Document): Array<{ text: string }> {
  const out: Array<{ text: string }> = []
  const buttons = doc.querySelectorAll(
    'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]'
  )
  for (let i = 0; i < buttons.length && out.length < LIMITS.MAX_BUTTONS; i++) {
    const el = buttons[i]
    const text = collapseWhitespace(el.textContent || (el as HTMLInputElement).value || '').slice(
      0,
      50
    )
    if (!text) continue
    out.push({ text })
  }
  return out
}

/**
 * 收集输入控件
 * @param doc
 */
function collectInputs(
  doc: Document
): Array<{ type: string; name?: string; placeholder?: string }> {
  const out: Array<{ type: string; name?: string; placeholder?: string }> = []
  const inputs = doc.querySelectorAll('input, textarea, select')
  for (let i = 0; i < inputs.length && out.length < LIMITS.MAX_INPUTS; i++) {
    const el = inputs[i] as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    const type = el instanceof HTMLInputElement ? el.type || 'text' : el.tagName.toLowerCase()
    // 跳过纯隐藏字段
    if (type === 'hidden') continue
    const name = el.getAttribute('name') || undefined
    const placeholder = el.getAttribute('placeholder') || undefined
    const item: { type: string; name?: string; placeholder?: string } = { type }
    if (name) item.name = name
    if (placeholder) item.placeholder = placeholder
    out.push(item)
  }
  return out
}

/* ========== 工具函数 ========== */

/**
 * 多空白字符折叠为单空格
 * @param s
 */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * href 绝对化：相对路径补 baseURI，协议相对路径补协议
 * @param href
 * @param base
 */
function absolutize(href: string, base: string): string {
  if (!base) return href
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}
