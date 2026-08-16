# DOM 操作架构设计文档（Playwright MCP 方案）

> **重要说明**：本文档是架构设计方案，指导项目从旧命令体系向 Playwright MCP 风格的重构。已识别出当前代码的多个关键缺陷，本文档提供完整修复方案。

---

## 1. 方案选型依据

### 1.1 业界主流方案对比

| 方案 | 访问模式 | Token 成本 | 可靠性 | 适合场景 | 复杂度 |
|------|----------|------------|--------|----------|--------|
| **Claude Computer Use** | 截图 + 视觉模型 | 高 ($0.50-$5/任务) | 78% | 全桌面控制 | 高 |
| **OpenAI Operator** | 截图 + CUA | 高（托管服务） | 87% | 简单 Web 任务 | 低 |
| **Stagehand** | Playwright + AI 选择器 | 中 | 89% | 生产级自动化 | 中 |
| **Browser Use** | Playwright + 多模态 | 高 | 89.1% | 复杂多步工作流 | 高 |
| **Playwright MCP** | Accessibility Tree + ref | 低 (~200-400 tokens/快照) | 92% | AI 驱动的浏览器操作 | 低 |

**选型结论：Playwright MCP 方案最优**

理由：
1. **Token 成本最低** - Accessibility Tree 比截图节省 90%+ tokens
2. **可靠性最高** - 92% 常见任务成功率（DOM 驱动方案普遍优于视觉方案）
3. **与 Chrome Extension 架构天然匹配** - 使用 Content Script 替代 Playwright，通过 Extension API 实现相同能力
4. **微软官方维护** - `@playwright/mcp` 是 Playwright 团队官方产物
5. **社区生态成熟** - 已集成到 Claude Code、Cursor、VS Code、Windsurf 等主流工具

---

## 2. 核心设计理念

### 2.1 三层架构（感知 → 决策 → 执行）

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agent 层                               │
│  (LLM 推理、规划、验证)                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      工具调用层 (Tool Registry)                  │
│  统一的工具接口，限制 AI 只能调用预定义工具                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      执行层 (Executor)                           │
│  Content Script 在页面上下文中执行操作                             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 关键设计原则

| 原则 | 说明 |
|------|------|
| **确定性引用** | 每个交互元素有唯一 `[ref=eN]` 标识符，AI 用 ref 定位而非自然语言描述 |
| **Accessibility Tree 优先** | 使用 Chrome Accessibility Tree 而非原始 DOM，天然过滤非交互元素 |
| **原子操作** | 每次只执行一个操作，避免复杂序列的不可预测性 |
| **Context 缓存** | 快照结果缓存，页面变化时才重新扫描 |
| **Ref 失效检测** | 操作失败时自动检测 ref 是否失效，必要时重新扫描 |
| **Iframe 穿透** | 递归扫描所有 iframe 内的可交互元素 |

### 2.3 与现有系统关系

当前项目存在两套命令体系：
- **旧体系**：`tabs_observe`, `bookmarks_observe_tree`, `navigate` 等（保留，用于浏览器管理）
- **新体系**：`browser_snapshot`, `browser_click`, `browser_type` 等（新增，用于页面操作）

**迁移策略**：
- 旧体系继续服务于标签页、书签、历史等浏览器层面的操作
- 新体系专注于页面内容层面的 DOM 操作
- 两者通过统一的 executeCommand switch 暴露给 AI

---

## 3. 工具系统设计（对标 Playwright MCP）

### 3.1 工具分类

#### 导航类 (Navigation)
| 工具名 | 参数 | 说明 |
|--------|------|------|
| `browser_navigate` | `{ url: string }` | 导航到指定 URL |
| `browser_navigate_back` | `{}` | 后退 |
| `browser_navigate_forward` | `{}` | 前进 |
| `browser_reload` | `{}` | 刷新页面 |

#### 观察类 (Observation)
| 工具名 | 参数 | 说明 |
|--------|------|------|
| `browser_snapshot` | `{ maxElements?: number, includeIframes?: boolean }` | 获取 Accessibility Tree 快照 |
| `browser_take_screenshot` | `{ path?: string, fullPage?: boolean }` | 截图（可选） |
| `browser_console_messages` | `{ limit?: number }` | 获取控制台日志 |
| `browser_network_requests` | `{}` | 获取网络请求 |

#### 交互类 (Interaction)
| 工具名 | 参数 | 说明 |
|--------|------|------|
| `browser_click` | `{ ref: string }` | 点击元素 |
| `browser_type` | `{ ref: string, text: string, submit?: boolean }` | 输入文本 |
| `browser_select_option` | `{ ref: string, value: string }` | 选择下拉选项 |
| `browser_hover` | `{ ref: string }` | 悬停元素 |
| `browser_drag` | `{ from: string, to: string }` | 拖拽元素 |
| `browser_press_key` | `{ key: string }` | 按键 |
| `browser_check` / `browser_uncheck` | `{ ref: string }` | 勾选/取消勾选 |
| `browser_fill_form` | `{ fields: Array<{ ref, value }> }` | 批量填写表单 |

#### 等待类 (Waiting)
| 工具名 | 参数 | 说明 |
|--------|------|------|
| `browser_wait_for` | `{ text?: string, ref?: string, timeout?: number }` | 等待条件满足 |

#### 标签页类 (Tabs) - 复用旧体系
| 工具名 | 参数 | 说明 |
|--------|------|------|
| `browser_tab_list` | `{}` | 列出所有标签页 → 映射到 `tabs_observe` |
| `browser_tab_new` | `{ url?: string }` | 新建标签页 → 映射到 `tabs_create` |
| `browser_tab_select` | `{ index: number }` | 切换标签页 → 映射到 `tabs_update` |
| `browser_tab_close` | `{ index?: number }` | 关闭标签页 → 映射到 `tabs_remove` |

### 3.2 工具白名单机制

AI 只能通过预定义的工具名调用操作，不能自创工具名。

```typescript
// executor.ts 中的白名单
const TOOL_WHITELIST = new Set([
  // 导航
  'browser_navigate',
  'browser_navigate_back',
  'browser_navigate_forward',
  'browser_reload',
  // 观察
  'browser_snapshot',
  'browser_take_screenshot',
  'browser_console_messages',
  'browser_network_requests',
  // 交互
  'browser_click',
  'browser_type',
  'browser_select_option',
  'browser_hover',
  'browser_drag',
  'browser_press_key',
  'browser_check',
  'browser_uncheck',
  'browser_fill_form',
  // 等待
  'browser_wait_for',
  // 标签页（别名映射到旧体系）
  'browser_tab_list',
  'browser_tab_new',
  'browser_tab_select',
  'browser_tab_close',
])

async function executeCommand(intent: string, payload: Record<string, unknown>): Promise<ExecutionResult> {
  // 新体系工具白名单检查
  if (intent.startsWith('browser_')) {
    if (!TOOL_WHITELIST.has(intent)) {
      return {
        success: false,
        code: 'UNKNOWN_TOOL',
        message: `未知工具: ${intent}`,
        suggestion: `可用工具: ${Array.from(TOOL_WHITELIST).join(', ')}`,
      }
    }
    return await executeBrowserTool(intent, payload)
  }

  // 旧体系保持兼容
  switch (intent) {
    case 'tabs_observe': return await observeTabs(payload)
    // ... 其他旧命令
  }
}
```

### 3.3 工具名到消息类型的映射

```typescript
// content/messages.ts
export const TOOL_TO_MESSAGE: Record<string, string> = {
  browser_snapshot: 'SNAPSHOT',
  browser_click: 'CLICK',
  browser_type: 'TYPE',
  browser_select_option: 'SELECT',
  browser_hover: 'HOVER',
  browser_press_key: 'PRESS_KEY',
  browser_navigate: 'NAVIGATE',
  browser_take_screenshot: 'SCREENSHOT',
  browser_console_messages: 'CONSOLE_MESSAGES',
  browser_network_requests: 'NETWORK_REQUESTS',
  browser_navigate_back: 'NAVIGATE_BACK',
  browser_navigate_forward: 'NAVIGATE_FORWARD',
  browser_reload: 'RELOAD',
  browser_check: 'CHECK',
  browser_uncheck: 'UNCHECK',
  browser_fill_form: 'FILL_FORM',
  browser_wait_for: 'WAIT_FOR',
}
```

---

## 4. Accessibility Tree 快照系统

### 4.1 快照格式

Playwright MCP 的 `browser_snapshot` 返回 YAML-like 结构：

```yaml
- heading "Welcome back" [level=1]
- textbox "Email" [ref=e4]
- textbox "Password" [ref=e5]
- button "Sign in" [ref=e6]
- link "Forgot password?" [ref=e7]
- listitem:
  - checkbox "Remember me" [ref=e8]
```

### 4.2 数据结构定义

```typescript
// types/dom.ts（新建文件）

export interface AccessibilityNode {
  // 基础属性
  role: string           // button, textbox, link, heading, listitem 等
  name: string           // 可访问名称（aria-label 或文本内容）
  ref: string            // 唯一引用 [ref=e0]
  level?: number         // heading 级别
  checked?: boolean      // checkbox/radio 状态
  disabled?: boolean     // 是否禁用
  required?: boolean     // 是否必填
  selected?: boolean     // option 是否选中
  expanded?: boolean     // 是否展开
  value?: string         // 当前值
  children?: AccessibilityNode[]

  // 位置信息（用于调试和错误恢复）
  tagName?: string       // 原始 HTML 标签名
  xpath?: string         // 唯一 XPath（用于 ref 失效时的备用定位）
  rect?: {
    x: number
    y: number
    width: number
    height: number
  }                      // 元素位置（用于截图参考）

  // iframe 信息
  iframeSrc?: string     // 所在 iframe 的 src
}

export interface PageSnapshot {
  timestamp: number
  url: string
  title: string
  nodes: AccessibilityNode[]
  totalElements: number
  truncated: boolean
}
```

### 4.3 Content Script 实现

> **文件路径**：`src/content/dom-perception.ts`（新建）

```typescript
interface TraversalState {
  nodes: AccessibilityNode[]
  counter: number
  depth: number
}

const MAX_DEPTH = 10
const MAX_ELEMENTS = 500
const REF_PREFIX = 'e'

export function captureAccessibilityTree(options: {
  maxElements?: number
  includeIframes?: boolean
}): PageSnapshot {
  const maxElements = options.maxElements ?? MAX_ELEMENTS
  const state: TraversalState = {
    nodes: [],
    counter: 0,
    depth: 0,
  }

  function traverseNode(node: Node | null, depth: number, iframeSrc?: string): void {
    if (!node || depth > MAX_DEPTH || state.nodes.length >= maxElements) {
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
        const ref = `${REF_PREFIX}${state.counter++}`
        const role = getRole(el)
        const name = getAccessibleName(el)
        const rect = el.getBoundingClientRect()

        const treeNode: AccessibilityNode = {
          role,
          name,
          ref: `[ref=${ref}]`,
          tagName: el.tagName.toLowerCase(),
          xpath: getXPath(el),
          rect: rect.width > 0 || rect.height > 0
            ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            : undefined,
          checked: el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
            ? el.checked
            : undefined,
          disabled: el.disabled,
          required: el.required,
          selected: el instanceof HTMLOptionElement ? el.selected : undefined,
          expanded: el.getAttribute('aria-expanded') === 'true',
          value: el instanceof HTMLInputElement ? el.value.slice(0, 100) : undefined,
          iframeSrc,
        }

        state.nodes.push(treeNode)
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
    const iframeLimit = 3
    let iframeCount = 0
    for (const iframe of document.querySelectorAll('iframe')) {
      if (iframeCount >= iframeLimit) break
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
        if (iframeDoc && iframeDoc.body) {
          traverseNode(iframeDoc.body, 0, iframe.src)
          iframeCount++
        }
      } catch {
        console.warn('[DOM感知] 跨域 iframe 跳过:', iframe.src)
      }
    }
  }

  return {
    timestamp: Date.now(),
    url: window.location.href,
    title: document.title,
    nodes: state.nodes,
    totalElements: state.counter,
    truncated: state.counter >= maxElements,
  }
}

function isInteractive(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()

  // 可交互标签
  if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) {
    return true
  }

  // 有交互 role
  const role = el.getAttribute('role')
  if (role && isInteractiveRole(role)) {
    return true
  }

  // 可点击
  if (el.onclick !== null || el.getAttribute('onclick') !== null) {
    return true
  }

  // 可聚焦
  if (el.tabIndex >= 0) {
    return true
  }

  // data-* 属性中的点击相关键
  const datasetKeys = Object.keys(el.dataset)
  if (datasetKeys.some(k => /click|tap|action|event|handler|submit|toggle/i.test(k))) {
    return true
  }

  // cursor: pointer
  try {
    const style = window.getComputedStyle(el)
    if (style.cursor === 'pointer') {
      return true
    }
  } catch {
    // getComputedStyle 可能失败，忽略
  }

  // label 关联的交互元素
  if (el.tagName.toLowerCase() === 'label' && el.getAttribute('for')) {
    return true
  }

  return false
}

function isInteractiveRole(role: string): boolean {
  const interactiveRoles = new Set([
    'link', 'button', 'textbox', 'checkbox', 'radio', 'combobox', 'tab', 'menuitem',
    'switch', 'slider', 'treeitem', 'tabpanel', 'dialog', 'alert', 'alertdialog',
    'application', 'article', 'banner', 'cell', 'columnheader', 'definition',
    'directory', 'document', 'feed', 'figure', 'form', 'grid', 'gridcell',
    'group', 'heading', 'img', 'list', 'listbox', 'listitem', 'math',
    'meter', 'navigation', 'option', 'progressbar', 'radiogroup', 'region',
    'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox',
    'separator', 'spinbutton', 'status', 'tab', 'table', 'term', 'timer',
    'toolbar', 'tooltip', 'tree', 'treegrid',
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

function getInputRole(el: HTMLInputElement): string {
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
    datetime-local: 'textbox',
    month: 'textbox',
    week: 'textbox',
    time: 'textbox',
    color: 'color-swatch',
    hidden: '',
  }
  return roleMap[type] || 'textbox'
}

function getAccessibleName(el: HTMLElement): string {
  // aria-label
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return ariaLabel

  // aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const ref = document.getElementById(labelledBy)
    if (ref) return ref.textContent?.trim() || ''
  }

  // alt 文本
  if (el.tagName.toLowerCase() === 'img') {
    const alt = el.getAttribute('alt')
    if (alt) return alt
  }

  // placeholder
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const placeholder = el.getAttribute('placeholder')
    if (placeholder) return placeholder
  }

  // title
  const title = el.getAttribute('title')
  if (title) return title

  // 文本内容
  const text = el.textContent?.trim()
  if (text) return text.slice(0, 200) // 截断过长的文本

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

export function serializeSnapshot(nodes: AccessibilityNode[]): string {
  return nodes.map(node => {
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
  }).join('\n')
}
```

---

## 5. 元素定位策略

### 5.1 确定性引用系统

每个交互元素获得唯一 `[ref=eN]` 标识符，AI 通过该引用定位元素。

```
快照中的引用:
- textbox "Email" [ref=e4]
- button "Sign in" [ref=e6]

AI 调用:
browser_click({ ref: "e6" })
```

### 5.2 Ref 查找机制（修正版）

**关键修正**：不使用 `data-ref` 属性（性能差且侵入 DOM），改用 XPath 直接查找。

```typescript
// content/dom-perception.ts

/**
 * 根据 ref 查找对应 DOM 元素
 * 使用 XPath 查找，不依赖 data-* 属性
 */
export function findElementByRef(ref: string): HTMLElement | null {
  // 去掉 [ref= 和 ] 包装
  const cleanRef = ref.replace('[ref=', '').replace(']', '')

  // 通过 snapshotCache 找到对应的节点，再用 XPath 查找
  const node = snapshotCache?.nodes.find(n => n.ref === `[ref=${cleanRef}]`)
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

/**
 * 验证 ref 是否仍然有效
 */
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
```

### 5.3 Ref 失效检测与自愈

```typescript
// service-worker/executor.ts 中的执行逻辑

async function executeBrowserTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ExecutionResult> {
  const tabInfo = await getCurrentTab()
  if (!tabInfo) {
    return { success: false, code: 'TAB_NOT_FOUND', message: '未找到活动标签页' }
  }

  // 工具名 → Content Script 消息类型映射
  const message = buildMessage(toolName, args)

  try {
    const response = await chrome.tabs.sendMessage(tabInfo.tabId, message)
    return mapResponseToExecutionResult(response, toolName)
  } catch (error) {
    // 检查是否是 ref 失效
    const msg = (error as Error).message || ''
    if (msg.includes('REF_INVALID') || msg.includes('ELEMENT_NOT_FOUND')) {
      // 触发重新扫描
      await refreshSnapshot(tabInfo.tabId)
      return {
        success: false,
        code: 'REF_INVALID',
        message: `Ref 已失效，请重新扫描页面`,
        suggestion: 'RESCAN',
      }
    }
    return {
      success: false,
      code: 'CONTENT_SCRIPT_ERROR',
      message: msg || 'Content Script 响应失败',
    }
  }
}
```

---

## 6. Agent 循环流程

### 6.1 标准循环

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Loop 开始                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 扫描页面 (browser_snapshot)                         │
│  - 获取 Accessibility Tree                                   │
│  - 缓存快照结果                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: AI 决策                                             │
│  - 将快照 + 历史对话 + 任务目标 发送给 LLM                    │
│  - LLM 返回 JSON: { thought, action, args, predict, step }   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 执行操作                                            │
│  - 验证 action 是否在白名单中                                │
│  - 根据 action 类型执行对应操作                              │
│  - 记录操作结果                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 验证结果                                            │
│  - 检查 predict 是否与预期一致                               │
│  - 如果不一致，重新扫描页面                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    ▼               ▼
              继续循环          完成任务
              (action != done)   (action = done)
```

### 6.2 Action 类型

| Action | 说明 | 参数 |
|--------|------|------|
| `browser_navigate` | 导航 | `{ url: string }` |
| `browser_snapshot` | 扫描页面 | `{ maxElements?: number, includeIframes?: boolean }` |
| `browser_click` | 点击 | `{ ref: string }` |
| `browser_type` | 输入 | `{ ref: string, text: string, submit?: boolean }` |
| `browser_select_option` | 选择 | `{ ref: string, value: string }` |
| `browser_hover` | 悬停 | `{ ref: string }` |
| `browser_press_key` | 按键 | `{ key: string }` |
| `browser_check` | 勾选 | `{ ref: string }` |
| `browser_uncheck` | 取消勾选 | `{ ref: string }` |
| `browser_fill_form` | 填表单 | `{ fields: Array<{ ref, value }> }` |
| `browser_wait_for` | 等待 | `{ text?: string, ref?: string, timeout?: number }` |
| `browser_take_screenshot` | 截图 | `{ path?: string }` |
| `done` | 完成 | - |
| `ask` | 询问用户 | `{ question: string }` |
| `chat` | 纯对话 | `{ message: string }` |

---

## 7. 消息通信协议

### 7.1 Service Worker → Content Script

```typescript
// content/messages.ts（新建）

export type ContentScriptMessage =
  | { type: 'SNAPSHOT'; timestamp: number }
  | { type: 'CLICK'; ref: string; timestamp: number }
  | { type: 'TYPE'; ref: string; text: string; submit?: boolean; timestamp: number }
  | { type: 'SELECT'; ref: string; value: string; timestamp: number }
  | { type: 'HOVER'; ref: string; timestamp: number }
  | { type: 'PRESS_KEY'; key: string; timestamp: number }
  | { type: 'NAVIGATE'; url: string; timestamp: number }
  | { type: 'SCREENSHOT'; path?: string; timestamp: number }
  | { type: 'CHECK'; ref: string; timestamp: number }
  | { type: 'UNCHECK'; ref: string; timestamp: number }
  | { type: 'FILL_FORM'; fields: Array<{ ref: string; value: string }>; timestamp: number }
  | { type: 'WAIT_FOR'; text?: string; ref?: string; timeout?: number; timestamp: number }
  | { type: 'NAVIGATE_BACK'; timestamp: number }
  | { type: 'NAVIGATE_FORWARD'; timestamp: number }
  | { type: 'RELOAD'; timestamp: number }
```

### 7.2 Content Script 响应

```typescript
export type ContentScriptResponse =
  | { success: true; data?: unknown; timestamp: number }
  | { success: false; error: string; message?: string; suggestion?: string; timestamp: number }
```

---

## 8. Context 管理系统

### 8.1 Context 结构

```typescript
// types/dom.ts（新建文件）

export interface AgentContext {
  taskId: string
  goal: string
  currentUrl: string
  pageTitle: string
  snapshot: {
    timestamp: number
    data: PageSnapshot
  } | null
  conversationHistory: ChatMessage[]
  operationLog: OperationRecord[]
  lessons: Lesson[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface OperationRecord {
  step: number
  action: string
  args: Record<string, unknown>
  result: ExecutionResult
  timestamp: number
}
```

### 8.2 Context 缓存策略

```typescript
// service-worker/context-cache.ts（新建）

interface CachedSnapshot {
  timestamp: number
  tabId: number
  url: string
  snapshot: PageSnapshot
}

export class ContextCache {
  private cache = new Map<string, CachedSnapshot>()
  private readonly TTL = 30_000 // 30 秒
  private readonly MAX_SIZE = 10

  private getCacheKey(tabId: number, url: string): string {
    return `${tabId}:${url}`
  }

  async getOrFetch(
    tabId: number,
    forceRefresh = false
  ): Promise<CachedSnapshot | null> {
    const url = await this.getCurrentUrl(tabId)
    const key = this.getCacheKey(tabId, url)

    if (!forceRefresh) {
      const cached = this.cache.get(key)
      if (cached && Date.now() - cached.timestamp < this.TTL) {
        return cached
      }
    }

    // 重新扫描
    const snapshot = await this.scanPage(tabId)
    if (snapshot) {
      this.cache.set(key, { timestamp: Date.now(), tabId, url, snapshot })
      this.evictOldEntries()
    }
    return snapshot ? { timestamp: Date.now(), tabId, url, snapshot } : null
  }

  invalidate(tabId: number): void {
    for (const [key] of this.cache) {
      if (key.startsWith(`${tabId}:`)) {
        this.cache.delete(key)
      }
    }
  }

  private evictOldEntries(): void {
    if (this.cache.size <= this.MAX_SIZE) return
    const keys = Array.from(this.cache.keys())
    keys.sort((a, b) => this.cache.get(a)!.timestamp - this.cache.get(b)!.timestamp)
    for (let i = 0; i < this.cache.size - this.MAX_SIZE; i++) {
      this.cache.delete(keys[i])
    }
  }

  private async getCurrentUrl(tabId: number): Promise<string> {
    try {
      const tab = await chrome.tabs.get(tabId)
      return tab.url || ''
    } catch {
      return ''
    }
  }

  private async scanPage(tabId: number): Promise<PageSnapshot | null> {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'SNAPSHOT' })
      return result?.data as PageSnapshot | null
    } catch {
      return null
    }
  }
}
```

---

## 9. 错误处理与自愈

### 9.1 错误分类

```typescript
// types/execution.ts（修改）

export enum DOMErrorType {
  // 元素相关
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  ELEMENT_NOT_VISIBLE = 'ELEMENT_NOT_VISIBLE',
  ELEMENT_DISABLED = 'ELEMENT_DISABLED',
  ELEMENT_NOT_INTERACTIVE = 'ELEMENT_NOT_INTERACTIVE',
  ELEMENT_OBSCURED = 'ELEMENT_OBSCURED',

  // 操作相关
  OPERATION_FAILED = 'OPERATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  REF_INVALID = 'REF_INVALID',

  // 页面相关
  PAGE_NAVIGATED = 'PAGE_NAVIGATED',
  PAGE_ERROR = 'PAGE_ERROR',
  PAGE_LOADING = 'PAGE_LOADING',

  // 通信相关
  CONTENT_SCRIPT_UNRESPONSIVE = 'CONTENT_SCRIPT_UNRESPONSIVE',
  TAB_NOT_FOUND = 'TAB_NOT_FOUND',

  // 工具相关
  UNKNOWN_TOOL = 'UNKNOWN_TOOL',
}
```

### 9.2 自愈策略

| 错误类型 | 自愈策略 |
|----------|----------|
| `ELEMENT_NOT_FOUND` | 重新扫描页面，获取新的 ref |
| `REF_INVALID` | 重新扫描页面 |
| `PAGE_NAVIGATED` | 等待页面加载完成，重新扫描 |
| `CONTENT_SCRIPT_UNRESPONSIVE` | 等待重试（最多 3 次） |
| `TIMEOUT` | 延长等待时间后重试 |
| `ELEMENT_NOT_VISIBLE` | 尝试滚动到元素位置后重试 |
| `UNKNOWN_TOOL` | 返回可用工具列表给 AI |

---

## 10. 系统提示词设计

### 10.1 核心系统提示

```
你是 AI 浏览器操作助手。你通过「观察 → 思考 → 执行 → 验证」的循环来完成用户任务。

## 工作流
1. 首先使用 browser_snapshot 观察当前页面
2. 根据观察结果和用户需求，选择适当的工具执行操作
3. 执行后验证结果是否符合预期
4. 重复步骤 1-3 直到任务完成

## 可用工具
你必须使用以下工具（不能发明新工具）：
- browser_snapshot: 扫描页面获取元素列表
- browser_click: 点击元素 [ref=eN]
- browser_type: 输入文本到元素 [ref=eN]
- browser_select_option: 选择下拉选项
- browser_hover: 悬停在元素上
- browser_press_key: 按键（如 Enter, Tab）
- browser_fill_form: 批量填写表单
- browser_wait_for: 等待条件满足
- browser_take_screenshot: 截图
- browser_navigate: 导航到 URL
- browser_tab_list: 列出所有标签页
- browser_tab_new: 新建标签页
- browser_tab_select: 切换标签页
- browser_tab_close: 关闭标签页
- done: 任务完成
- ask: 需要用户确认或输入
- chat: 纯对话（不操作浏览器）

## 输出格式
每次只输出一个 JSON 对象：
{
  "thought": "你的思考过程",
  "action": "工具名",
  "args": { /* 工具参数 */ },
  "predict": "预期结果",
  "step": 步骤序号
}

## 操作原则
1. 每次只执行一个操作
2. 使用 [ref=eN] 引用元素，不要使用 CSS selector 或 XPath
3. 操作前先 snapshot，操作后再次 snapshot 验证结果
4. 遇到错误时重新 snapshot 获取最新状态
5. 登录等敏感操作需要用户确认
6. 如果 ref 失效（返回 REF_INVALID），重新扫描页面获取新的 ref
7. 对于 iframe 内的元素，注意快照中会标注 [iframe=xxx]
```

### 10.2 上下文注入

每次 LLM 调用时，注入以下内容：
- 当前任务目标
- 历史操作记录（最近 5 步）
- 当前页面快照（Accessibility Tree）
- 经验库（lessons）中的相关经验

---

## 11. 文件结构设计

```
src/
├── content/                          # 新建：Content Script 目录
│   ├── dom-perception.ts             # DOM 感知引擎（核心）
│   ├── messages.ts                   # 消息类型定义
│   └── index.ts                      # Content Script 入口
├── service-worker/
│   ├── executor.ts                   # 工具执行器（修改：添加 browser_* 命令处理）
│   ├── tool-registry.ts              # 工具注册表（新建）
│   ├── context-cache.ts              # Context 缓存（新建）
│   ├── retry.ts                      # 重试逻辑（新建）
│   ├── task-planner.ts               # 任务规划器（已有，保留）
│   └── index.ts                      # Service Worker 入口
├── composables/
│   └── useAIEngine.ts                # AI Agent 主循环（修改：适配新工具名）
├── shared/
│   ├── commands.ts                   # 命令定义（保留浏览器管理命令）
│   ├── prompts.ts                    # 系统提示词（修改为新格式）
│   └── constants.ts                  # 常量定义
├── types/
│   ├── dom.ts                        # DOM 相关类型（新建）
│   ├── execution.ts                  # 执行结果类型（修改：添加 DOMErrorType）
│   └── context.ts                    # 上下文类型（修改）
└── recording/
    └── executor.ts                   # 录屏执行器（已有，保留）
```

---

## 12. Manifest 和构建配置变更

### 12.1 manifest.json 变更

```json
{
  "manifest_version": 3,
  "name": "AI Browser Commander",
  "version": "0.2.0",
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle",
      "all_frames": false
    }
  ],
  "permissions": [
    "tabs",
    "bookmarks",
    "sessions",
    "history",
    "storage",
    "tabGroups",
    "scripting",
    "activeTab",
    "browsingData",
    "cookies",
    "topSites",
    "management",
    "contentSettings",
    "privacy",
    "desktopCapture",
    "notifications",
    "downloads",
    "offscreen",
    "sidePanel"
  ],
  "host_permissions": ["<all_urls>"],
  "action": {},
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  }
}
```

### 12.2 vite.config.ts 变更

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // Side Panel 入口
        sidepanel: resolve(__dirname, 'public/index.html'),
        // Service Worker 入口
        'service-worker': resolve(__dirname, 'src/service-worker/index.ts'),
        // Content Script 入口（新增）
        'content': resolve(__dirname, 'src/content/index.ts'),
      },
    },
  },
})
```

---

## 13. 关键实现细节

### 13.1 Content Script 初始化

```typescript
// content/index.ts（新建）

import {
  captureAccessibilityTree,
  serializeSnapshot,
  findElementByRef,
  validateRef,
} from './dom-perception'
import type { ContentScriptMessage, ContentScriptResponse } from './messages'

let enabled = false
let snapshotCache: import('./dom-perception').PageSnapshot | null = null

function init(): void {
  setupMessageListener()
  setupMutationObserver()

  console.log('[DOM感知] 初始化开始, readyState=', document.readyState)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        enabled = true
        console.log('[DOM感知] 页面就绪，扫描已启用')
      }, 1500)
    })
  } else {
    setTimeout(() => {
      enabled = true
      console.log('[DOM感知] 页面已就绪，扫描已启用')
    }, 1000)
  }
}

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener(
    (message: ContentScriptMessage, _sender, sendResponse) => {
      if (!enabled) {
        sendResponse({
          success: false,
          error: 'DOM感知未启用',
          timestamp: Date.now(),
        } as ContentScriptResponse)
        return false
      }

      switch (message.type) {
        case 'SNAPSHOT':
          snapshotCache = captureAccessibilityTree({ includeIframes: true })
          console.log(
            '[DOM感知] SNAPSHOT 响应, 元素数量=',
            snapshotCache.nodes.length,
            'URL=',
            snapshotCache.url
          )
          sendResponse({
            success: true,
            data: snapshotCache,
            timestamp: message.timestamp,
          } as ContentScriptResponse)
          return false

        case 'CLICK':
          sendResponse(executeClick(message.ref))
          return false

        case 'TYPE':
          sendResponse(executeType(message.ref, message.text, message.submit))
          return false

        case 'SELECT':
          sendResponse(executeSelect(message.ref, message.value))
          return false

        case 'HOVER':
          sendResponse(executeHover(message.ref))
          return false

        case 'PRESS_KEY':
          sendResponse(executeKeyPress(message.key))
          return false

        case 'CHECK':
          sendResponse(executeCheck(message.ref, true))
          return false

        case 'UNCHECK':
          sendResponse(executeCheck(message.ref, false))
          return false

        case 'FILL_FORM':
          sendResponse(executeFillForm(message.fields))
          return false

        case 'WAIT_FOR':
          sendResponse(executeWaitFor(message.text, message.ref, message.timeout))
          return false

        case 'NAVIGATE':
          window.location.href = message.url
          sendResponse({ success: true, timestamp: message.timestamp })
          return false

        case 'NAVIGATE_BACK':
          window.history.back()
          sendResponse({ success: true, timestamp: message.timestamp })
          return false

        case 'NAVIGATE_FORWARD':
          window.history.forward()
          sendResponse({ success: true, timestamp: message.timestamp })
          return false

        case 'RELOAD':
          window.location.reload()
          sendResponse({ success: true, timestamp: message.timestamp })
          return false

        case 'SCREENSHOT':
          sendResponse({
            success: true,
            data: 'screenshot_not_implemented_yet',
            timestamp: message.timestamp,
          })
          return false

        default:
          sendResponse({
            success: false,
            error: 'UNKNOWN_MESSAGE_TYPE',
            timestamp: Date.now(),
          } as ContentScriptResponse)
          return false
      }
    }
  )
}

function executeClick(ref: string): ContentScriptResponse {
  const validation = validateRef(ref)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error!,
      message: `Ref ${ref} 无效`,
      timestamp: Date.now(),
    }
  }

  const el = findElementByRef(ref)
  if (!el) {
    return {
      success: false,
      error: 'ELEMENT_NOT_FOUND',
      message: `Ref ${ref} 对应的元素未找到`,
      timestamp: Date.now(),
    }
  }

  el.click()
  console.log(`[DOM感知] 点击成功: ${ref}`)
  return { success: true, timestamp: Date.now() }
}

function executeType(ref: string, text: string, submit?: boolean): ContentScriptResponse {
  const el = findElementByRef(ref)
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return {
      success: false,
      error: 'ELEMENT_NOT_INPUT',
      message: `Ref ${ref} 不是输入框`,
      timestamp: Date.now(),
    }
  }

  // 清空并设置值
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))

  if (submit) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }

  console.log(`[DOM感知] 输入成功: ${ref}`)
  return { success: true, timestamp: Date.now() }
}

function executeSelect(ref: string, value: string): ContentScriptResponse {
  const el = findElementByRef(ref)
  if (!el || !(el instanceof HTMLSelectElement)) {
    return { success: false, error: 'ELEMENT_NOT_SELECT', timestamp: Date.now() }
  }

  el.value = value
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return { success: true, timestamp: Date.now() }
}

function executeHover(ref: string): ContentScriptResponse {
  const el = findElementByRef(ref)
  if (!el) return { success: false, error: 'ELEMENT_NOT_FOUND', timestamp: Date.now() }

  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  return { success: true, timestamp: Date.now() }
}

function executeKeyPress(key: string): ContentScriptResponse {
  const event = new KeyboardEvent('keydown', { key, bubbles: true })
  document.dispatchEvent(event)
  return { success: true, timestamp: Date.now() }
}

function executeCheck(ref: string, check: boolean): ContentScriptResponse {
  const el = findElementByRef(ref)
  if (!el || !(el instanceof HTMLInputElement) || el.type !== 'checkbox') {
    return { success: false, error: 'ELEMENT_NOT_CHECKBOX', timestamp: Date.now() }
  }

  el.checked = check
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return { success: true, timestamp: Date.now() }
}

function executeFillForm(fields: Array<{ ref: string; value: string }>): ContentScriptResponse {
  for (const field of fields) {
    const result = executeType(field.ref, field.value)
    if (!result.success) return result
  }
  return { success: true, timestamp: Date.now() }
}

function executeWaitFor(
  text?: string,
  ref?: string,
  timeout?: number
): ContentScriptResponse {
  const ms = timeout || 5000
  return { success: true, timestamp: Date.now() }
}
```

### 13.2 Service Worker 执行器集成

```typescript
// service-worker/executor.ts 修改点

// 在现有 switch 语句末尾添加新工具处理
case 'browser_snapshot':
  return await executeBrowserTool('SNAPSHOT', payload)
case 'browser_click':
  return await executeBrowserTool('CLICK', payload)
case 'browser_type':
  return await executeBrowserTool('TYPE', payload)
case 'browser_select_option':
  return await executeBrowserTool('SELECT', payload)
case 'browser_hover':
  return await executeBrowserTool('HOVER', payload)
case 'browser_press_key':
  return await executeBrowserTool('PRESS_KEY', payload)
case 'browser_navigate':
  return await executeBrowserTool('NAVIGATE', payload)
case 'browser_take_screenshot':
  return await executeBrowserTool('SCREENSHOT', payload)
case 'browser_check':
  return await executeBrowserTool('CHECK', payload)
case 'browser_uncheck':
  return await executeBrowserTool('UNCHECK', payload)
case 'browser_fill_form':
  return await executeBrowserTool('FILL_FORM', payload)
case 'browser_wait_for':
  return await executeBrowserTool('WAIT_FOR', payload)
case 'browser_navigate_back':
  return await executeBrowserTool('NAVIGATE_BACK', payload)
case 'browser_navigate_forward':
  return await executeBrowserTool('NAVIGATE_FORWARD', payload)
case 'browser_reload':
  return await executeBrowserTool('RELOAD', payload)

// 标签页别名映射
case 'browser_tab_list':
  return await observeTabs(payload)
case 'browser_tab_new':
  return await createTab(payload)
case 'browser_tab_select':
  return await updateTab({ ...payload, updateType: 'select' })
case 'browser_tab_close':
  return await removeTabs(payload)
```

---

## 14. Token 优化策略

### 14.1 快照压缩

| 策略 | 说明 | 效果 |
|------|------|------|
| 只保留交互元素 | 非交互元素不入快照 | 减少 60-80% |
| 文本截断 | 单元素文本超过 200 字符截断 | 减少 20-30% |
| 深度限制 | 递归深度不超过 10 层 | 防止过深树 |
| Token 预算 | 总 Token 不超过 4000 | 控制上下文窗口 |
| iframe 限制 | 最多扫描 3 个 iframe | 防止性能问题 |

### 14.2 增量更新

```typescript
function computeDelta(
  oldNodes: AccessibilityNode[],
  newNodes: AccessibilityNode[]
): { added: AccessibilityNode[]; removed: AccessibilityNode[]; changed: AccessibilityNode[] } {
  const oldRefs = new Set(oldNodes.map(n => n.ref))
  const newRefs = new Set(newNodes.map(n => n.ref))

  return {
    added: newNodes.filter(n => !oldRefs.has(n.ref)),
    removed: oldNodes.filter(n => !newRefs.has(n.ref)),
    changed: oldNodes.filter(old => {
      const newOne = newNodes.find(n => n.ref === old.ref)
      return newOne && (old.name !== newOne.name || old.value !== newOne.value)
    }),
  }
}
```

---

## 15. 安全边界

### 15.1 物理边界

- 无法操作 `chrome://` 页面
- 无法操作扩展商店页面
- 无法操作其他扩展的页面
- 跨域 iframe 无法访问内容（仅能扫描同域 iframe）

### 15.2 操作限制

```typescript
const SAFETY_CONFIG = {
  requiresConfirmation: ['browser_navigate', 'browser_fill_form'],
  forbiddenUrls: ['chrome://*', 'chrome-extension://*'],
  maxRetries: 3,
  timeoutMs: 30000,
  maxElementsPerScan: 5000,
  maxIframesPerScan: 3,
}
```

### 15.3 敏感数据处理

```typescript
const SENSITIVE_FIELDS = ['password', 'email', 'phone', 'credit_card', 'ssn']

function maskSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))
        ? '***MASKED***'
        : value,
    ])
  )
}
```

---

## 16. 实施计划

### Phase 1: 核心基础设施（优先级最高）
- [ ] 创建 `src/content/dom-perception.ts`（包含完整的 Accessibility Tree 采集逻辑）
- [ ] 创建 `src/content/messages.ts`
- [ ] 创建 `src/content/index.ts`
- [ ] 更新 `manifest.json` 添加 `content_scripts` 配置
- [ ] 更新 `vite.config.ts` 添加 content script 构建入口
- [ ] 测试小红书页面扫描（验证 tree 长度 > 0）

### Phase 2: Service Worker 集成
- [ ] 修改 `executor.ts` 添加 `browser_*` 命令处理
- [ ] 创建 `src/service-worker/context-cache.ts`
- [ ] 创建 `src/types/dom.ts`
- [ ] 修改 `src/types/execution.ts` 添加 `DOMErrorType`
- [ ] 测试 `browser_snapshot` 和 `browser_click` 端到端流程

### Phase 3: Agent 循环适配
- [ ] 修改 `prompts.ts` 使用新的工具名和输出格式
- [ ] 修改 `useAIEngine.ts` 适配新的 toolCall 结构
- [ ] 统一 AI 输出格式为 `{ thought, action, args, predict, step }`
- [ ] 端到端测试小红书登录流程

### Phase 4: 优化与完善
- [ ] 实现截图功能
- [ ] 实现控制台消息和网络请求获取
- [ ] 性能优化和 Token 压缩
- [ ] 添加更多错误自愈策略

---

## 17. 已知问题与解决方案

### 问题 1：当前 AI 输出 `browser_type` 但 executor 不识别
**根因**：executor.ts 的 switch 语句没有 `browser_*` case
**解决**：在 executor.ts 中添加所有 `browser_*` 命令的 case

### 问题 2：Content Script 不存在
**根因**：`src/content/` 目录未创建，manifest.json 未配置 content_scripts
**解决**：按 Phase 1 计划创建所有文件并更新配置

### 问题 3：DOM 遍历提前终止
**根因**：原代码在非交互元素处 `return`，导致整个子树被跳过
**解决**：已在 dom-perception.ts 中修复，子元素遍历在交互判断之前

### 问题 4：Ref 查找使用不存在的 `data-ref` 属性
**根因**：dom-perception.ts 没往 DOM 写 `data-ref`，但查找逻辑用了它
**解决**：改用 XPath 查找，通过 `node.xpath` 定位元素

### 问题 5：AI 输出格式与代码解析逻辑不匹配（关键）
**根因**：
- 当前 `useAIEngine.ts:554-565` 期望 AI 输出 `{ action: 'exec_tool', toolCall: { name, args } }`
- 当前 `types/ai.ts:30` 定义的 action 类型是 `'exec_tool' | 'execute' | 'done' | ...`
- 文档新提示词要求 AI 输出 `{ action: 'browser_click', args: { ref } }`
- **这三者完全不一致，会导致解析失败**

**最终决策：采用方案 B（扁平格式，符合 MCP 标准）**

选择理由：
1. **标准化** - 与 Playwright MCP、Claude Computer Use 等业界标准一致
2. **代码更简洁** - AI 直接说"我要做什么"，不需要理解包装结构
3. **长期维护成本更低** - 未来集成其他 MCP 工具无需适配层
4. **Token 开销更小** - 每次调用节省约 20-30 tokens

**完整改动清单**：

#### 1. `types/ai.ts` - 修改 AIResponse 类型
```typescript
export interface AIResponse {
  thought?: string
  action:
    | 'browser_snapshot' | 'browser_click' | 'browser_type' | 'browser_select_option'
    | 'browser_hover' | 'browser_press_key' | 'browser_check' | 'browser_uncheck'
    | 'browser_fill_form' | 'browser_wait_for' | 'browser_take_screenshot'
    | 'browser_navigate' | 'browser_navigate_back' | 'browser_navigate_forward'
    | 'browser_reload' | 'browser_tab_list' | 'browser_tab_new' | 'browser_tab_select'
    | 'browser_tab_close'
    | 'done' | 'ask' | 'scan' | 'chat' | 'exec_plan' | 'askUserResponse'
  args?: Record<string, unknown>   // 新增：扁平化参数
  plan?: string
  predict?: string
  reply?: string
  content?: string
  step?: number                    // 新增：步骤序号
  // ... exec_plan 相关字段保持不变
}
```

#### 2. `prompts.ts` - 更新输出格式说明
将输出格式从：
```json
{ "action": "exec_tool", "toolCall": { "name": "...", "args": {...} } }
```
改为：
```json
{ "action": "browser_click", "args": { "ref": "e6" }, "predict": "..." }
```

#### 3. `useAIEngine.ts` - 适配扁平格式解析（核心改动）
关键替换逻辑（约 15 行）：
```typescript
// 原代码（line 564-565）
const toolCall = json.toolCall
const toolName = toolCall.name

// 新代码
const toolName = json.action  // action 本身就是工具名
const toolArgs = json.args || {}

// 执行
executeCommand(toolName, toolArgs)

// chat 分支（原 line 567-569）也需适配
if (toolName === 'chat') {
  emitAIChat((json.args?.reply as string) || json.reply || '', true)
  return
}
```

**注意**：`exec_plan`、`scan` 等非 browser 命令的解析逻辑也需要保留兼容。

### 问题 6：`executeCommand` 函数不存在于 Service Worker
**根因**：`useAIEngine.ts:825` 定义了本地 `executeCommand` 函数，通过 `chrome.runtime.sendMessage` 调用 Service Worker
**解决**：确认 `service-worker/index.ts:45` 已经正确接收并分发消息，无需额外修改

### 问题 7：vite.config.ts 缺少 Content Script 构建入口
**根因**：`vite.config.ts:119-124` 只有 `sidepanel` 和 `service-worker` 两个入口
**解决**：按文档第 12.2 节添加 `content` 入口

### 问题 8：Manifest 缺少 Content Script 配置
**根因**：`manifest.json` 没有 `content_scripts` 字段
**解决**：按文档第 12.1 节添加 content_scripts 配置

### 问题 9：`traverseNode` 闭包作用域问题
**根因**：文档第 4.3 节的 `traverseNode` 函数引用了 `options?.maxElements`，但 `options` 是 `captureAccessibilityTree` 的参数，在 `traverseNode` 闭包中无法直接访问
**解决**：在 `captureAccessibilityTree` 中提取 `maxElements` 到局部变量，传入 `traverseNode` 或通过闭包访问

```typescript
export function captureAccessibilityTree(options: {...}): PageSnapshot {
  const maxElements = options.maxElements ?? MAX_ELEMENTS
  const state: TraversalState = { nodes: [], counter: 0, depth: 0 }
  // traverseNode 内部通过闭包访问 maxElements
  function traverseNode(node: Node | null, depth: number): void {
    if (!node || depth > MAX_DEPTH || state.nodes.length >= maxElements) return
    // ...
  }
}
```

---

## 18. 参考资料

### 官方文档
- [Playwright MCP 官方文档](https://playwright.dev/mcp)
- [Model Context Protocol 规范](https://modelcontextprotocol.io)
- [Playwright Accessibility API](https://playwright.dev/docs/accessibility)
- [Chrome Extensions API](https://developer.chrome.com/docs/extensions/reference)

### 开源项目
- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) - 官方 MCP 服务器
- [Browserbase/stagehand](https://github.com/browserbase/stagehand) - TypeScript 自动化框架
- [browser-use/browser-use](https://github.com/browser-use/browser-use) - Python Agent 框架

### 行业文章
- [Playwright MCP Complete Guide (2026)](https://mcp.directory/blog/playwright-browser-mcp-guide-2026)
- [Browser Use vs Stagehand vs Playwright MCP](https://fp8.co/articles/Browser-Use-vs-Stagehand-vs-Playwright-MCP-AI-Agent-Browser-Automation)
- [How We Made Our AI Browser Agent Stop Clicking the Wrong Button](https://dev.to/omidseyfan/how-we-made-our-ai-browser-agent-stop-clicking-the-wrong-button-3kkl)
