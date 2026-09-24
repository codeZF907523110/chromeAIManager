/**
 * DOM 感知引擎 - 采集 Accessibility Tree
 * 对标 Playwright MCP 的 browser_snapshot 实现
 */

export interface AccessibilityNode {
  role: string
  name: string
  ref: string
  /** DOM 层级深度（序列化时输出行首缩进，给模型提供层级上下文，对标 Playwright 树形快照） */
  depth?: number
  level?: number
  checked?: boolean
  disabled?: boolean
  required?: boolean
  selected?: boolean
  expanded?: boolean
  value?: string
  children?: AccessibilityNode[]
  tagName?: string
  xpath?: string
  rect?: {
    x: number
    y: number
    width: number
    height: number
  }
  iframeSrc?: string
}

export interface PageSnapshot {
  timestamp: number
  url: string
  title: string
  nodes: AccessibilityNode[]
  totalElements: number
  truncated: boolean
}

const MAX_DEPTH = 24
const MAX_ELEMENTS = 500
const REF_PREFIX = 'e'
const MAX_IFRAMES = 3

/** AI 视图最大节点数（与 useAIEngine.sanitizeResult 对 browser_snapshot 的 120 回灌上限一致） */
const MAX_AI_NODES = 120
/** 非 form role 在 AI 视图中的全局最大出现次数，超出部分按 role 汇总为末尾省略标记 */
const MAX_ROLE_TOTAL = 20
/** 表单类 role：输入控件是 agent 的核心操作目标，不参与 role 预算、永远保留 */
const FORM_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'spinbutton',
  'checkbox',
  'radio',
  'slider',
  'switch',
])

let snapshotCache: PageSnapshot | null = null

export function getSnapshotCache(): PageSnapshot | null {
  return snapshotCache
}

export function captureAccessibilityTree(options: {
  maxElements?: number
  includeIframes?: boolean
}): PageSnapshot {
  const maxElements = options.maxElements ?? MAX_ELEMENTS
  const nodes: AccessibilityNode[] = []
  let counter = 0

  function traverseNode(node: Node | null, depth: number, iframeSrc?: string): void {
    if (!node || depth > MAX_DEPTH || nodes.length >= maxElements) {
      return
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement

      // 未渲染子树整体剪枝：display:none 的后代必然未渲染，aria-hidden 不进入无障碍树。
      // 不剪枝会让 React 应用 DOM 里常驻的 hover 按钮/隐藏弹层淹没有效节点（对标 Chrome a11y tree / Playwright）
      if (isHiddenSubtree(el)) {
        return
      }

      const rect = el.getBoundingClientRect()

      // 采集交互元素（前序：父节点先于子节点，节点顺序 = 文档序，对标 Playwright MCP 的 aria snapshot）。
      // 0×0 的元素未渲染/不可操作，不入快照，但子树继续遍历（visibility:hidden 的子元素可能单独可见）
      if ((rect.width > 0 || rect.height > 0) && isInteractive(el)) {
        const ref = `${REF_PREFIX}${counter++}`
        const role = getRole(el)
        const name = getAccessibleName(el)

        nodes.push({
          role,
          name,
          ref: `[ref=${ref}]`,
          depth,
          tagName: el.tagName.toLowerCase(),
          xpath: getXPath(el),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          checked:
            el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
              ? el.checked
              : undefined,
          disabled:
            'disabled' in el ? (el as HTMLInputElement | HTMLButtonElement).disabled : undefined,
          required: 'required' in el ? (el as HTMLInputElement).required : undefined,
          selected: el instanceof HTMLOptionElement ? el.selected : undefined,
          expanded: el.getAttribute('aria-expanded') === 'true',
          // 标题层级（h1-h6 → level 1-6），帮助 AI 理解页面结构
          level:
            role === 'heading' && /^h[1-6]$/i.test(el.tagName) ? Number(el.tagName[1]) : undefined,
          // input/textarea 都回填当前值，AI 可看到输入框已有内容（如草稿）
          value:
            el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
              ? el.value.slice(0, 100)
              : undefined,
          iframeSrc,
        })
      }

      // 无论是否交互，都遍历子元素（关键修复：不能在非交互节点提前 return）
      for (const child of Array.from(el.children)) {
        traverseNode(child, depth + 1, iframeSrc)
      }

      // 处理 Shadow DOM
      if (el.shadowRoot) {
        for (const child of Array.from(el.shadowRoot.childNodes)) {
          traverseNode(child, depth + 1, iframeSrc)
        }
      }
    } else {
      for (const child of Array.from(node.childNodes)) {
        traverseNode(child, depth, iframeSrc)
      }
    }
  }

  traverseNode(document.body, 0)

  // 递归处理 iframe
  if (options.includeIframes !== false) {
    let iframeCount = 0
    const iframes = Array.from(document.querySelectorAll('iframe'))
    for (const iframeEl of iframes) {
      if (iframeCount >= MAX_IFRAMES) break
      try {
        const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow?.document
        if (iframeDoc && iframeDoc.body) {
          traverseNode(iframeDoc.body, 0, iframeEl.src)
          iframeCount++
        }
      } catch {
        console.warn('[DOM感知] 跨域 iframe 跳过:', iframeEl.src)
      }
    }
  }

  const snapshot: PageSnapshot = {
    timestamp: Date.now(),
    url: window.location.href,
    title: document.title,
    nodes,
    totalElements: counter,
    truncated: counter >= maxElements,
  }

  snapshotCache = snapshot
  console.log('[DOM感知] 扫描完成, 元素数量=', nodes.length, 'URL=', snapshot.url)
  return snapshot
}

/**
 * 生成回传给 sidepanel（最终给 AI 看）的瘦身快照。
 *
 * 1. 瘦身：只保留 AI 决策需要的字段（role/name/ref 及状态标记），剥掉 xpath/rect/tagName ——
 *    xpath 仅供 content script 内部 findElementByRef 用 snapshotCache 全量副本定位，
 *    传输通道里不需要，且 xpath 字符串较长，回灌 AI 会浪费大量 token。
 * 2. 全局 role 预算：非表单 role 最多出现 MAX_ROLE_TOTAL 次，超出部分按 role 汇总为
 *    末尾"已省略 N 个"标记节点，防止侧边栏历史列表等长列表淹没 AI 视野窗口；
 *    表单类 role 豁免、永远保留。总量上限 MAX_AI_NODES。
 * 3. nodesText：Playwright MCP 式逐行紧凑文本（AI 实际阅读的视图，见 serializeAINodes）。
 * 折叠与瘦身只作用于本函数的返回值，本地 snapshotCache 保留全量数据。
 *
 * @param snapshot 内容脚本采集的完整快照
 * @returns 瘦身 + 折叠后的 AI 视图快照（含 nodesText 文本视图）
 */
export function toAISnapshot(snapshot: PageSnapshot): PageSnapshot & { nodesText: string } {
  const aiNodes = buildAINodes(snapshot.nodes)
  return {
    ...snapshot,
    nodes: aiNodes,
    nodesText: serializeAINodes(aiNodes),
  }
}

/**
 * 归一化 + 转义用于逐行文本的名称/值。
 * 空白归一化：textContent/textarea 常含换行与连续空格，会破坏"一行一元素"格式并干扰
 * 模型阅读与 browser_find 匹配；引号转义：内嵌双引号会破坏 `- role "名称"` 的引号格式。
 *
 * @param text 原始文本
 * @returns 单行、空白归一化、双引号换为单引号的安全文本
 */
function toLineSafeText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/"/g, "'").trim()
}

/**
 * 把 AI 视图节点序列化为 Playwright MCP 式逐行文本（本文档 4.1 设计的快照格式）。
 * 每行一个元素：行首缩进表示 DOM 层级（对标 Playwright 树形快照的层级上下文，上限 6 层
 * 防止深层节点产生超长前导空行），格式 `- role "名称" [ref=eN] [状态…]`；折叠标记渲染为普通行。
 * 相比嵌套 JSON，逐行文本 token 更省且模型逐行可读，输入框一目了然。
 *
 * @param nodes 已折叠/瘦身的 AI 视图节点
 * @returns 逐行文本（换行分隔）
 */
function serializeAINodes(nodes: AccessibilityNode[]): string {
  return nodes
    .map((node) => {
      const indent = '  '.repeat(Math.min(node.depth ?? 0, 6))
      let line = `${indent}- ${node.role}`
      if (node.name) line += ` "${toLineSafeText(node.name)}"`
      if (node.ref) line += ` ${node.ref}`
      if (node.level) line += ` [level=${node.level}]`
      if (node.checked !== undefined) line += ` [checked=${node.checked}]`
      if (node.disabled) line += ` [disabled]`
      if (node.required) line += ` [required]`
      if (node.selected !== undefined) line += ` [selected=${node.selected}]`
      if (node.expanded !== undefined) line += ` [expanded=${node.expanded}]`
      if (node.value) line += ` [value="${toLineSafeText(node.value)}"]`
      if (node.iframeSrc) line += ` [iframe=${node.iframeSrc}]`
      return line
    })
    .join('\n')
}

/** browser_find 返回的最大匹配行数（10 行 × 约 35 字符，控制在 sanitize 500 字符上限内） */
const MAX_FIND_MATCHES = 10

/**
 * 按文本模糊查找页面元素（对标 Playwright 语义 locator getByRole(name)）。
 * 实时重新采集快照（保证返回的 ref 新鲜可用，顺带刷新 snapshotCache），
 * 在**全量**节点上做包含匹配——不经过 toAISnapshot 的 120 总量 / 每 role 预算裁剪：
 * 那两层裁剪只服务"整页概览"控 token，按需检索必须能找回任意被折叠的元素。
 * 匹配范围：可访问名 + 输入框当前值；空白序列归一化、大小写不敏感。
 * 结果按匹配精确度分档排序（名称全等 > 前缀 > 其它包含），防止低质量命中
 * （如历史会话标题恰好包含查询词）挤占 MAX_FIND_MATCHES 配额；同档保持文档序。
 *
 * @param query 查询关键词（如"新对话"）
 * @param role 可选 role 优先筛选（如 "button"，大小写不敏感）。**不作硬过滤**：
 *             页面常用 div/span 模拟按钮（真实 role 是 generic/text），AI 按用户口语
 *             传的 role 只是猜测——命中为空时自动放宽为全量文本命中并标记 roleRelaxed
 * @returns query/role 原样回传；roleRelaxed 表示 role 限定后零匹配已放宽；
 *          count 命中总数；truncated 是否超过 MAX_FIND_MATCHES；
 *          matches 为 serializeAINodes 逐行文本（含 ref，可直接用于后续点击/输入）
 */
export function findNodesByText(
  query: string,
  role?: string
): {
  query: string
  role?: string
  roleRelaxed: boolean
  count: number
  truncated: boolean
  matches: string
} {
  const keyword = query.replace(/\s+/g, ' ').trim().toLowerCase()
  const roleFilter = role?.trim().toLowerCase()
  const snapshot = captureAccessibilityTree({ includeIframes: true })
  // 先按文本取全量命中池（不过 role）——文本命中是召回底线，role 只影响精度
  const pool = snapshot.nodes.filter((node) => {
    const name = (node.name || '').replace(/\s+/g, ' ').toLowerCase()
    const value = (node.value || '').replace(/\s+/g, ' ').toLowerCase()
    return name.includes(keyword) || value.includes(keyword)
  })
  // role 命中非空 → 返回 role 子集（精确优先）；命中为空 → 放宽为全量池，不因猜测漏检
  let hit = pool
  let roleRelaxed = false
  if (roleFilter) {
    const inRole = pool.filter((node) => node.role.toLowerCase() === roleFilter)
    if (inRole.length > 0) {
      hit = inRole
    } else {
      roleRelaxed = true
    }
  }
  hit.sort((a, b) => matchTier(a, keyword) - matchTier(b, keyword))
  return {
    query,
    role,
    roleRelaxed,
    count: hit.length,
    truncated: hit.length > MAX_FIND_MATCHES,
    matches: serializeAINodes(hit.slice(0, MAX_FIND_MATCHES)),
  }
}

/**
 * 计算节点对关键词的匹配档位（值越小越精确）。
 * 0 = 名称与关键词完全相等；1 = 名称以关键词开头；2 = 其它包含命中（含仅 value 命中）。
 * 配合稳定的 Array.sort 实现"精确优先、档内保持文档序"。
 *
 * @param node 候选节点
 * @param keyword 已归一化的小写关键词
 * @returns 档位数字
 */
function matchTier(node: AccessibilityNode, keyword: string): number {
  const name = (node.name || '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (name === keyword) return 0
  if (name.startsWith(keyword)) return 1
  return 2
}

/**
 * 构建 AI 视图节点列表：瘦身 + 全局 role 预算 + 总量收口。
 *
 * 预算规则：非 form role 最多出现 MAX_ROLE_TOTAL 次（侧边栏历史列表等长列表降噪；
 * 真实列表项常夹杂隐藏按钮导致 role 交替，按全局计数比"连续同 role"更稳）。
 * 被省略的节点按 role 汇总，在末尾追加无 ref 的标记节点（AI 不可点击，纯信息）。
 * 表单 role 豁免预算，永远保留。
 *
 * @param nodes 采集到的完整交互节点（文档序）
 * @returns 瘦身 + 预算收口后的 AI 视图节点列表
 */
function buildAINodes(nodes: AccessibilityNode[]): AccessibilityNode[] {
  const result: AccessibilityNode[] = []
  /** 各 role 已保留的节点数 */
  const keptByRole = new Map<string, number>()
  /** 各 role 已省略的节点数（仅超预算的记录） */
  const omittedByRole = new Map<string, number>()

  for (const node of nodes) {
    if (result.length >= MAX_AI_NODES) break
    if (!FORM_ROLES.has(node.role)) {
      const kept = keptByRole.get(node.role) ?? 0
      if (kept >= MAX_ROLE_TOTAL) {
        omittedByRole.set(node.role, (omittedByRole.get(node.role) ?? 0) + 1)
        continue
      }
      keptByRole.set(node.role, kept + 1)
    }
    result.push(toSlimNode(node))
  }

  // 末尾按 role 汇总省略标记，让 AI 知道视图不完整及省略规模
  for (const [role, count] of omittedByRole) {
    result.push({ role: 'text', name: `（已省略 ${count} 个 ${role} 元素）`, ref: '' })
  }
  return result
}

/**
 * 剥离定位类字段，生成 AI 决策用的瘦节点。
 *
 * @param node 完整节点
 * @returns 只含决策字段的瘦节点
 */
function toSlimNode(node: AccessibilityNode): AccessibilityNode {
  return {
    role: node.role,
    name: node.name,
    ref: node.ref,
    depth: node.depth,
    level: node.level,
    checked: node.checked,
    disabled: node.disabled,
    required: node.required,
    selected: node.selected,
    expanded: node.expanded,
    value: node.value,
    iframeSrc: node.iframeSrc,
  }
}

export function findElementByRef(ref: string): HTMLElement | null {
  const snapshot = snapshotCache
  if (!snapshot) return null

  // 跨页面导航后 snapshot 过期，避免使用旧页面的元素引用
  if (snapshot.url !== window.location.href) return null

  const cleanRef = ref.replace('[ref=', '').replace(']', '')
  const node = snapshot.nodes.find((n) => n.ref === `[ref=${cleanRef}]`)
  if (!node?.xpath) return null

  try {
    const xpathResult = document.evaluate(
      node.xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    )
    return xpathResult.singleNodeValue as HTMLElement | null
  } catch {
    return null
  }
}

export function validateRef(ref: string): { valid: boolean; error?: string } {
  const el = findElementByRef(ref)
  if (!el) {
    return { valid: false, error: 'ELEMENT_NOT_FOUND' }
  }
  if (!document.body.contains(el)) {
    return { valid: false, error: 'ELEMENT_NOT_VISIBLE' }
  }
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    return { valid: false, error: 'ELEMENT_NOT_VISIBLE' }
  }
  return { valid: true }
}

// ========== 内部工具函数 ==========

/**
 * 判断元素子树是否未渲染（对标 Chrome 无障碍树 / Playwright aria snapshot 的剔除规则）。
 *
 * display:none 的后代必然全部未渲染，可整体剪枝；
 * aria-hidden="true" 的子树按无障碍语义不进入快照。
 * 注意：visibility:hidden 不在此剪枝——后代可能单独声明 visibility:visible，
 * 交由 0×0 采集守卫兜底。
 *
 * @param el 待判定元素
 * @returns true 表示该子树整体不进入快照
 */
function isHiddenSubtree(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') {
    return true
  }
  try {
    return window.getComputedStyle(el).display === 'none'
  } catch {
    // getComputedStyle 可能失败，按可见处理
    return false
  }
}

function isInteractive(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()

  if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) {
    return true
  }

  // contenteditable 元素（富文本编辑器、可编辑 div 等）
  if (el.getAttribute('contenteditable') === 'true' || el.isContentEditable) {
    return true
  }

  const role = el.getAttribute('role')
  if (role && isInteractiveRole(role)) {
    return true
  }

  if (el.onclick !== null || el.getAttribute('onclick') !== null) {
    return true
  }

  if (el.tabIndex >= 0) {
    return true
  }

  const datasetKeys = Object.keys(el.dataset)
  if (datasetKeys.some((k) => /click|tap|action|event|handler|submit|toggle/i.test(k))) {
    return true
  }

  try {
    const style = window.getComputedStyle(el)
    if (style.cursor === 'pointer') {
      return true
    }
  } catch {
    // getComputedStyle 可能失败，忽略
  }

  if (el.tagName.toLowerCase() === 'label' && el.getAttribute('for')) {
    return true
  }

  return false
}

function isInteractiveRole(role: string): boolean {
  const interactiveRoles = new Set([
    'link',
    'button',
    'textbox',
    'checkbox',
    'radio',
    'combobox',
    'tab',
    'menuitem',
    'switch',
    'slider',
    'treeitem',
    'tabpanel',
    'dialog',
    'alert',
    'alertdialog',
    'application',
    'article',
    'banner',
    'cell',
    'columnheader',
    'definition',
    'directory',
    'document',
    'feed',
    'figure',
    'form',
    'grid',
    'gridcell',
    'group',
    'heading',
    'img',
    'list',
    'listbox',
    'listitem',
    'math',
    'meter',
    'navigation',
    'option',
    'progressbar',
    'radiogroup',
    'region',
    'row',
    'rowgroup',
    'rowheader',
    'scrollbar',
    'search',
    'searchbox',
    'separator',
    'spinbutton',
    'status',
    'table',
    'term',
    'timer',
    'toolbar',
    'tooltip',
    'tree',
    'treegrid',
  ])
  return interactiveRoles.has(role)
}

function getRole(el: HTMLElement): string {
  const role = el.getAttribute('role')
  if (role) return role

  const tag = el.tagName.toLowerCase()
  const implicitRoles: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: getInputRole(el),
    select: 'listbox',
    textarea: 'textbox',
    img: 'img',
    form: 'form',
    header: 'banner',
    footer: 'contentinfo',
    nav: 'navigation',
    main: 'main',
    aside: 'complementary',
    section: 'region',
    article: 'article',
    details: 'group',
    dialog: 'dialog',
    figure: 'figure',
    figcaption: 'caption',
    video: 'video',
    audio: 'audio',
    canvas: 'canvas',
    table: 'table',
    fieldset: 'group',
    dl: 'list',
    dd: 'listitem',
    dt: 'listitem',
    ol: 'list',
    ul: 'list',
    li: 'listitem',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
  }

  return implicitRoles[tag] || 'generic'
}

function getInputRole(el: HTMLElement): string {
  if (!(el instanceof HTMLInputElement)) return 'textbox'
  const type = el.type?.toLowerCase()
  const roleMap: Record<string, string> = {
    text: 'textbox',
    password: 'textbox',
    email: 'textbox',
    tel: 'textbox',
    search: 'searchbox',
    number: 'spinbutton',
    checkbox: 'checkbox',
    radio: 'radio',
    range: 'slider',
    file: 'button',
    submit: 'button',
    reset: 'button',
    image: 'button',
    button: 'button',
    date: 'textbox',
    'datetime-local': 'textbox',
    month: 'textbox',
    week: 'textbox',
    time: 'textbox',
    color: 'color-swatch',
    hidden: '',
  }
  return roleMap[type] || 'textbox'
}

function getAccessibleName(el: HTMLElement): string {
  let name = ''

  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) {
    name = ariaLabel
  } else {
    const labelledBy = el.getAttribute('aria-labelledby')
    const labelledEl = labelledBy ? document.getElementById(labelledBy) : null
    if (labelledEl) {
      name = labelledEl.textContent?.trim() || ''
    } else if (el.tagName.toLowerCase() === 'img') {
      name = el.getAttribute('alt') || ''
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      name = el.getAttribute('placeholder') || ''
    } else if (el.isContentEditable) {
      // contenteditable 元素的 placeholder
      name = el.getAttribute('placeholder') || ''
    } else {
      name = el.getAttribute('title') || el.textContent?.trim() || ''
    }
  }

  // 出口统一空白归一化：textContent 常含换行/连续空格，原样进入会破坏 nodesText
  // 的逐行格式，并干扰模型阅读与 browser_find 匹配
  return name.replace(/\s+/g, ' ').trim().slice(0, 200)
}

function getXPath(el: HTMLElement): string {
  const parts: string[] = []
  let current: HTMLElement | null = el
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1
    let sibling = current.previousElementSibling
    while (sibling) {
      if (sibling.tagName === current.tagName) index++
      sibling = sibling.previousElementSibling
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`)
    current = current.parentElement
  }
  return '/' + parts.join('/')
}
