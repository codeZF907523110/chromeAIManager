/**
 * DOM 感知引擎 - 采集 Accessibility Tree
 * 对标 Playwright MCP 的 browser_snapshot 实现
 */

export interface AccessibilityNode {
  role: string
  name: string
  ref: string
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

const MAX_DEPTH = 10
const MAX_ELEMENTS = 500
const REF_PREFIX = 'e'
const MAX_IFRAMES = 3

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

      // 无论是否交互，都先遍历子元素（关键修复：不能在非交互节点提前 return）
      for (const child of Array.from(el.children)) {
        traverseNode(child, depth + 1, iframeSrc)
      }

      // 处理 Shadow DOM
      if (el.shadowRoot) {
        for (const child of Array.from(el.shadowRoot.childNodes)) {
          traverseNode(child, depth + 1, iframeSrc)
        }
      }

      // 只采集交互元素
      if (isInteractive(el)) {
        const ref = `${REF_PREFIX}${counter++}`
        const role = getRole(el)
        const name = getAccessibleName(el)
        const rect = el.getBoundingClientRect()

        nodes.push({
          role,
          name,
          ref: `[ref=${ref}]`,
          tagName: el.tagName.toLowerCase(),
          xpath: getXPath(el),
          rect:
            rect.width > 0 || rect.height > 0
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : undefined,
          checked:
            el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
              ? el.checked
              : undefined,
          disabled:
            'disabled' in el ? (el as HTMLInputElement | HTMLButtonElement).disabled : undefined,
          required: 'required' in el ? (el as HTMLInputElement).required : undefined,
          selected: el instanceof HTMLOptionElement ? el.selected : undefined,
          expanded: el.getAttribute('aria-expanded') === 'true',
          value: el instanceof HTMLInputElement ? el.value.slice(0, 100) : undefined,
          iframeSrc,
        })
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

export function serializeSnapshot(nodes: AccessibilityNode[]): string {
  return nodes
    .map((node) => {
      let line = `- ${node.role}`
      if (node.name) line += ` "${node.name}"`
      if (node.ref) line += ` ${node.ref}`
      if (node.level) line += ` [level=${node.level}]`
      if (node.checked !== undefined) line += ` [checked=${node.checked}]`
      if (node.disabled) line += ` [disabled]`
      if (node.required) line += ` [required]`
      if (node.selected !== undefined) line += ` [selected=${node.selected}]`
      if (node.expanded !== undefined) line += ` [expanded=${node.expanded}]`
      if (node.iframeSrc) line += ` [iframe=${node.iframeSrc}]`
      return line
    })
    .join('\n')
}

export function findElementByRef(ref: string): HTMLElement | null {
  const snapshot = snapshotCache
  if (!snapshot) return null

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

function isInteractive(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()

  if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) {
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
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return ariaLabel

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const ref = document.getElementById(labelledBy)
    if (ref) return ref.textContent?.trim() || ''
  }

  if (el.tagName.toLowerCase() === 'img') {
    const alt = el.getAttribute('alt')
    if (alt) return alt
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const placeholder = el.getAttribute('placeholder')
    if (placeholder) return placeholder
  }

  const title = el.getAttribute('title')
  if (title) return title

  const text = el.textContent?.trim()
  if (text) return text.slice(0, 200)

  return ''
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
