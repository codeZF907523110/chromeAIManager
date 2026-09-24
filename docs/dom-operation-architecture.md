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
| 剔除未渲染元素 | `display:none` / `aria-hidden` 子树剪枝，0×0 元素不入快照（详见问题 12） | 对标 Chrome a11y tree，消除 hover 按钮/隐藏弹层噪声 |
| 只保留交互元素 | 非交互元素不入快照 | 减少 60-80% |
| 文本截断 | 单元素文本超过 200 字符截断 | 减少 20-30% |
| 全局 role 预算 | 非表单 role 在 AI 视图最多 20 个，超出按 role 汇总为"已省略 N 个"标记；表单类 role 豁免（详见问题 11/12） | 侧边栏/长列表降噪，对交替序列同样生效 |
| 传输瘦身 | `toAISnapshot()` 剥掉 xpath/rect/tagName，AI 视图只留决策字段（xpath 留在 content script 本地缓存供 ref 定位） | 单节点 token 减少约 70% |
| 回灌格式 | AI 视图剔除 nodes 数组，只回灌 Playwright 式逐行文本 `nodesText`（对标 4.1 设计）；通用字符串 500 截断对快照放宽到 8000（详见问题 13） | 单快照 token 降约 60%，模型逐行可读 |
| 回灌截断 | AI 视图总量上限 120 在 `toAISnapshot` 收口；`sanitizeResult` 对快照 nodes 同步放宽到 120，其余大数组 30 条 | 兼顾视野完整性与上下文窗口 |
| 深度限制 | 递归深度不超过 24 层（覆盖现代 SPA 包装层） | 防止过深树 |
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

### 问题 10：DeepSeek 等 SPA 的输入框（textarea）AI 扫不到、输不进（关键）

**现象**：agent 在 DeepSeek 页面反复「扫描 → 点开启新对话 → 等待」，始终宣称"页面上没有输入框"，
最后直接放弃。用户确认对话框存在，是一个 `<textarea>`。

**根因（三层叠加，任一层都足以让 AI 看不见/用不了输入框）**：

1. **`executeType` 写 textarea 抛异常**（`content/index.ts`）
   - 写值统一用 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, text)`；
   - WebIDL 对 setter 做 brand check，receiver 是 `HTMLTextAreaElement` 时直接抛 `Illegal invocation`；
   - 异常发生在消息 listener 内且无 try/catch → `sendResponse` 永远不会被调用，SW 侧请求挂起。
   - **就算 AI 找到了 textarea，输入也必然失败。**
2. **`MAX_DEPTH = 10` 过浅**（`dom-perception.ts`）
   - DeepSeek/Next.js 类 SPA 的输入框嵌套普遍在 10 层以上，深度剪枝导致扫描根本到不了 textarea。
3. **后序遍历 + 回灌截断，textarea 进不了 AI 视野**
   - `traverseNode` 先递归子节点、后 push 当前节点（后序），节点数组不是文档序，
     数组前段全是页头/侧栏深处的叶子交互元素；
   - `useAIEngine.sanitizeResult` 把回灌给 AI 的数组统一截断为前 30 项（`MAX_ARRAY = 30`），
     日志中的"本次快照只返回了前 30 个元素"即来源于此；
   - 排在数组尾部的 textarea 永远落不进这 30 项窗口。

**对标**：Playwright MCP 的 aria snapshot 按**文档序**（前序 DFS，父先于子）输出，
且没有 10 层深度上限；token 控制靠"只输出交互元素 + 文本截断"，而非粗暴截断条数。

**修复方案**：

| # | 位置 | 改动 |
|---|------|------|
| 1 | `content/index.ts` `executeType` | 按元素类型取原生 prototype：textarea 用 `HTMLTextAreaElement.prototype` 的 value setter，input 维持原样；contenteditable 分支不变 |
| 2 | `dom-perception.ts` | `MAX_DEPTH` 10 → 24（覆盖现代 SPA 包装层深度） |
| 3 | `dom-perception.ts` `traverseNode` | 改为前序：交互元素**先 push 再递归子节点**，节点顺序 = 文档序，ref 编号自上而下 |
| 4 | `dom-perception.ts` | heading 节点补 `level`（h1-h6）；textarea 同样回填 `value`（让 AI 看到已有草稿） |
| 5 | `dom-perception.ts` | 新增 `toAISnapshot()`：回传给 sidepanel 的快照瘦身——剥掉 `xpath`/`rect`/`tagName`（AI 按 ref 操作，xpath 仅 content script 内部 `findElementByRef` 用 `snapshotCache` 全量副本，通道里不需要）；删除无任何调用的死代码 `serializeSnapshot` |
| 6 | `useAIEngine.ts` `sanitizeResult` | `browser_snapshot` 的数组截断上限放宽为 120（节点已瘦身、单条约 10-15 token），其余大数组（历史/书签）维持 30 |

**自查**：
- ref 定位链不受影响：`findElementByRef` 走 content script 本地 `snapshotCache`（含 xpath），传输副本瘦身不影响定位；
- `scanCurrentPage`（sidepanel）只消费 `role/name/ref`，瘦身字段无外部消费方（已 grep 确认 xpath/rect/tagName 在 content 目录外无引用）；
- 前序遍历只改 push 时机，"非交互节点也要递归子树"的关键修复保留；
- MAX_DEPTH 变深仅增加按需扫描时的遍历量，扫描由 agent 显式触发，无常态开销。

### 问题 11：侧边栏长列表淹没快照窗口，输入框仍进不了 AI 视野（问题 10 修复后的遗留）

**现象**：修复问题 10 后实测 DeepSeek：点击「开启新对话」成功（URL 正确跳到 `chat.deepseek.com/`），
120 项回灌上限也生效，但 AI 仍宣称"快照前 120 项被侧边栏内容占满，尚未显示对话输入框"，
最终只能靠截图兜底。

**根因**：前序遍历的文档序 = **侧边栏 DOM 在前**。DeepSeek 侧边栏的聊天历史列表有上百个可点击项
（每个都满足交互判定，role 多为 link/generic/menuitem），在节点数组前段把 120 项窗口全部占满，
主内容区的 textarea 排在 120 之后。AI 调大 `maxElements` 无效——窗口在回灌侧（`sanitizeResult`），
不在采集侧。

**对标**：Playwright MCP 输出完整树不截断（token 成本高）；browser-use 等框架对长列表做降噪。
本项目采用**同类元素折叠**（run-length 折叠）：

- 连续同 role 的节点最多保留前 `MAX_SAME_ROLE_RUN`（15）个，其余折叠为一条
  `{ role: 'text', name: '（同类元素已省略 N 项）', ref: '' }` 标记节点（无 ref，AI 不可点击，纯信息）；
- 表单类 role（textbox/searchbox/combobox/spinbutton/checkbox/radio/slider/switch）是 agent
  的核心操作目标，**不参与折叠、永远保留**；
- 折叠只作用于 AI 视图（`toAISnapshot`），content script 本地 `snapshotCache` 保留全量；
- AI 视图总量上限 `MAX_AI_NODES`（120）在 `toAISnapshot` 内收口，与
  `sanitizeResult` 对 browser_snapshot 的 120 上限一致（双保险）。

折叠后 DeepSeek 首页侧边栏 100+ 项塌缩为 16 条，textarea 落在窗口前段，且保持文档序。

**自查**：
- 标记节点 `ref` 为空串，`findElementByRef` 按 `[ref=eN]` 匹配永不命中，无可 click 性；
- 折叠不改变 ref 编号（采集期不变），AI 引用的 ref 均来自它真实看到的节点；
- 复杂页面（如 40 个并排按钮的工具栏）折叠后 AI 通过"已省略 N 项"标记知晓有更多元素，
  且 `totalElements` 与 nodes 数不一致也可作为"视图不全"的信号。

### 问题 12：隐藏元素噪声使折叠失效，AI 陷入原地循环（问题 11 修复后的遗留）

**现象**：修复问题 11 后实测 DeepSeek：点击「开启新对话」实际已成功（URL 从 `/a/chat/s/…` 跳到
`chat.deepseek.com/`，而**首页本身就是新对话页**，输入框就在页面上），但 AI 在两次首页快照里
仍然看不到输入框，转而反复点击同一个已无效的按钮 4 次，最终放弃并询问用户。

**根因（两个）**：

1. **快照采集了未渲染的元素**。`isInteractive` 基于标签/role/tabIndex/cursor 判定，
   `display:none` 的元素（React 应用 DOM 里常驻的 hover 操作按钮、关闭的弹层、隐藏表单等）
   全部被采集。侧边栏每个历史项挂 2-3 个隐藏按钮，节点序列变成
   `generic → button → button → generic → …` **交替排列**，问题 11 的"连续同 role 折叠"
   前提（同 role 长跑）被打破，折叠失效，侧边栏噪声继续淹没 120 窗口。
   对标：Chrome 无障碍树与 Playwright aria snapshot 都会剔除 `display:none` / `aria-hidden` 子树，
   这是我们与业界方案的真实差距。
2. **提示词缺少"快照一致"的防循环规则**。点击后页面无变化时（其实已在新对话页），
   AI 选择重复同一操作而不是重新审视目标是否存在。

**修复方案**：

| # | 位置 | 改动 |
|---|------|------|
| 1 | `dom-perception.ts` `traverseNode` | 未渲染子树整体剪枝：`getComputedStyle(el).display === 'none'` 或 `aria-hidden="true"` 直接 return（对标 Chrome a11y tree / Playwright） |
| 2 | `dom-perception.ts` 采集守卫 | `rect` 为 0×0 的元素不入快照（未渲染/不可用），子树继续遍历（`visibility:hidden` 的子元素可能可见） |
| 3 | `dom-perception.ts` `buildAINodes` | 折叠从"连续同 role 长跑"升级为**全局 role 预算**：非表单 role 在 AI 视图中最多出现 20 次（`MAX_ROLE_TOTAL`），超出省略并按 role 汇总为末尾标记节点（`已省略 N 个 <role> 元素`）——对交替序列同样生效；表单 role 仍豁免 |
| 4 | `prompts.ts` 操作原则 | 新增第 16 条：连续两次快照结果一致时不得重复同一操作；聊天类站点首页往往就是新对话页，应先在当前页面找输入框 |

**自查**：
- 剪枝只影响可见性判定，不改变 ref 语义：`findElementByRef` 走本地全量缓存（缓存同样只含已渲染节点，AI 不会引用到已剪枝节点）；
- `display:none` 子树整体剪枝是安全的（后代必然未渲染）；`visibility:hidden` 不剪枝、只靠 0×0 守卫兜底（后代可单独 `visibility:visible`）；
- 全局 role 预算替换连续折叠后逻辑更简单（无 run 状态机），文档序保持不变，表单元素永不省略；
- `getComputedStyle` 每元素一次的开销被"隐藏子树整体剪枝"抵消（整块 DOM 不再遍历），扫描仍由 agent 按需触发。

### 问题 13：快照回灌是嵌套 JSON 大块，模型"看不见"输入框；且缺少采集侧诊断手段

**现象**：问题 10-12 修复后，可见的 textarea 在机械链路上已必然进入 AI 视野
（表单 role 豁免预算、120 窗口、隐藏元素剪枝），但模型仍宣称"没有输入框"。

**根因**：

1. **回灌格式违背了本文档 4.1 的设计**。4.1 明确快照应为 Playwright MCP 式紧凑文本
   （`- textbox "Email" [ref=e4]`），但实现从未跟上——一直把 120 个节点的嵌套 JSON 数组
   （约 18KB）整块塞给模型。每个节点 token 是紧凑行的 2-3 倍，且 deepseek 类模型在
   超长嵌套 JSON 中定位单个元素的能力明显弱于逐行文本。
2. **采集侧没有诊断手段**。"输入框进不了 AI 视野"存在两类可能（没采集到 / 采集了但模型没看见），
   此前只能靠日志推断，无法一锤定音。

**修复方案**：

| # | 位置 | 改动 |
|---|------|------|
| 1 | `dom-perception.ts` | `toAISnapshot` 在瘦节点列表之外新增 `nodesText` 字段：Playwright 式逐行紧凑文本（`- role "名称" [ref=eN] [状态…]`），折叠标记渲染为 `- text "（已省略 N 个 …）"` |
| 2 | `useAIEngine.ts` `sanitizeResult` | browser_snapshot 专属：AI 视图剔除 `nodes` 数组（仅程序消费，如 `scanCurrentPage`），只留 `nodesText/url/title/totalElements`；字符串截断阈值对 browser_snapshot 放宽到 8000（nodesText 是一整段文本，500→200 的通用截断会毁掉它） |
| 3 | `prompts.ts` | 工具说明中补充 nodesText 逐行格式说明：textbox/searchbox 等输入元素**永远完整列出**，看到 `- textbox "…" [ref=eN]` 即可用 browser_type 直接输入 |
| 4 | `content/dom-perception.ts` | 临时诊断 `diagnoseInputBoxes()`（textarea/input/contenteditable 逐个报告 rect、placeholder、未采集原因，SNAPSHOT 时打印到页面 console）：已确认采集层无问题、链路端到端验证成功（DeepSeek textarea 成功定位并输入）后**按"第一版不留无用代码"规则移除** |

**自查**：
- `scanCurrentPage`（斜杠命令/上下文/后验证）继续消费 `nodes` 数组，不受 AI 视图剔除影响——
  它把结果转换成 `{totalCount, count, elements}` 后以 `scan` 名义走 sanitize，toolName 不命中 browser_snapshot；
- `verifyPredict` 对 `JSON.stringify(result)` 做关键词匹配，nodesText 保留了全部 name，匹配能力不降级；
- 折叠标记在文本里呈现为普通行，模型可读。

### 问题 14：扩展重载后，已打开页面所有 DOM 工具报「Content Script 未响应」（关键）
**现象**：每次 `pnpm build` 后在 chrome://extensions 重载扩展，之前已打开的网页上执行
browser_snapshot / browser_click / browser_type 等全部报
`[CONTENT_SCRIPT_ERROR] Content Script 未响应，请确认页面已加载扩展`。

**根因**：Chrome 的既定行为——**扩展重载不会给已打开的标签页重新注入 content script**。
旧 content script 挂在被销毁的旧扩展实例上成为孤儿（收不到新 service worker 的消息），
新 SW 的 `chrome.tabs.sendMessage` 抛 "Receiving end does not exist"，
`executeBrowserTool` 的裸 catch 统一映射为该错误。
截图链路 `forwardScreenshotToContent` 早前已针对同一问题做过「动态注入 + 重试」兜底
（`injectContentScript()`，依赖 scripting + `<all_urls>` 权限），但主 DOM 工具链路没有接入。

**修复方案**：

| # | 位置 | 改动 |
|---|------|------|
| 1 | `service-worker/executor.ts` | 抽通用 helper `sendToContentScriptWithInjection(tabId, message, retryDelayMs?)`：先 sendMessage，接收端不存在时动态注入 content.js 并重试一次；注入失败（chrome:// 等受限页）抛 INJECTION_FAILED |
| 2 | `service-worker/executor.ts` `executeBrowserTool` | 改用 helper（retryDelayMs=1200：content script 的 `enabled` 有 1s 就绪延迟，注入后立即重试会得到"DOM感知未启用"）；错误按"受限页 / 仍无响应"区分文案 |
| 3 | `service-worker/executor.ts` `forwardScreenshotToContent` | 同样改用 helper（retryDelayMs=0，SCREENSHOT 分支不检查 enabled），消除两段重复的 try/catch |
| 4 | `content/index.ts` `init()` | 幂等守卫：window 标记防重复注入产生双 listener——bundle 重执行会重建模块作用域，必须用 window 标记；否则双 listener 会导致 click 等副作用执行两次 |

**自查**：
- 动态注入发生在页面加载完成后（executeScript 由 SW 主动调用），readyState 不会是 loading，
  走 1000ms 就绪分支，1200ms 等待窗口足够；
- 兜底只在「接收端不存在」时触发，正常通信零开销（一次 try/catch）；
- 双 listener 场景：刷新过的新 script 已注册、因其它原因 sendMessage 失败再注入一次 →
  window 守卫拦截，不会双响应/双点击；
- 两条链路错误文案保持"受限页 vs 未响应"的区分，AI 可据此换标签页或提示刷新。

### 问题 15：AI 视图裁剪形成"黑洞"，目标元素被折叠后 AI 永远找不到（关键）
**现象**：用户让 AI 点「开启新对话」，AI 回复找不到该按钮。实际按钮在页面上。

**根因**：两层。
1. **裁剪黑洞（结构性）**：AI 视图 = 文档序前 120 个保留节点 + 每 role 预算 20
  （问题 11/12 的降噪方案）。侧边栏历史列表几十个 button + 噪声角色会把目标按钮挤出窗口；
  而折叠标记只有「（已省略 N 个 button 元素）」一行——AI 既不知道里面有没有目标，
  也拿不到被省略元素的 ref。**被裁剪的元素对 AI 不可见也不可恢复**。
2. **语义匹配失败**：用户口语（"开启新对话"）与页面文案（"新的对话"）不完全一致时，
  AI 直接断言"页面上没有"，不做模糊匹配、不换关键词。

**业界方案**：Playwright 的语义 locator `getByRole('button', { name: /新对话/ })`——
按名称模糊匹配、实时查询、与快照截断无关；browser-use / Chrome DevTools MCP 均提供
"find element by description" 类工具。核心思想：**整页概览负责"看"，按需检索负责"查"**，
概览可以裁剪，检索必须能找回任意元素。

**修复方案**：新增 `browser_find` 工具（对标 Playwright 语义 locator）

| # | 位置 | 改动 |
|---|------|------|
| 1 | `content/dom-perception.ts` | 新增 `findNodesByText(query)`：实时重新采集（保证 ref 新鲜，顺带刷新 snapshotCache），在**全量**节点（500 上限，不经 120/20 裁剪）上做包含匹配；匹配范围 = 可访问名 + 输入框 value，空白归一化 + 大小写不敏感；返回 serializeAINodes 逐行文本（最多 10 条 + count + truncated） |
| 2 | `content/messages.ts` | 消息联合类型新增 `{ type: 'FIND'; query: string }` |
| 3 | `content/index.ts` | FIND case：query 缺失返回 MISSING_QUERY，否则返回 findNodesByText 结果 |
| 4 | `service-worker/executor.ts` | `executeCommand` 增加 `case 'browser_find'` 分发；`BROWSER_TOOL_TO_MESSAGE` 增加 `browser_find → 'FIND'`（响应映射走通用 mapContentScriptResponse，无需改） |
| 5 | `shared/prompts.ts` | ①工具列表加 browser_find 说明；②「快照阅读方法」补充：折叠标记只说明该类元素过多、不代表目标不存在；③操作原则新增第 17 条：找不到目标时的标准动作序列 = 语义模糊匹配名称 → browser_find 用核心关键词检索 → 仍找不到才 ask，禁止直接断言"页面上没有" |
| 6 | `shared/commands.ts` | COMMANDS 注册表新增 browser_find 条目（slots: query 必填 / role 可选，swIntent: 'browser_find'）。**首轮改动遗漏**：sidepanel `executeCommand` 先经 `getCommand()` 查该注册表，未注册直接返回"未知命令： browser_find"，SW 侧分发根本不会触达——教训：新增 AI 工具必须同时登记 SW executor 与 shared/commands.ts 两处 |

**自查**：
- findNodesByText 复用 captureAccessibilityTree 而非读旧 snapshotCache——每次 find 都是
  新鲜采集，返回的 ref 必然可被 findElementByRef 解析，规避"页面已变、缓存 ref 失效"；
- 回灌体积：10 行 × 约 35 字符 ≈ 350 字符 < sanitize 非快照工具 500 上限；
  count/truncated 让 AI 知道结果是否被截断、可换更精确关键词；
- FIND 与其它消息共用 enabled 门禁 + SW 兜底注入/1.2s 等待链路，无特殊路径；
- 纯新增分支，SNAPSHOT/CLICK 等既有路径零改动；
- 裁剪黑洞的定位不变：概览继续裁剪（控 token），黑洞由 browser_find 按需找回（保可达）。

### 问题 16：操作准确性综合优化（四项，对标 Playwright / Playwright MCP）
**背景**：问题 15 落地后继续排查"AI 操作不准确"的剩余来源，确认四项：

| # | 问题 | 根因 | 业界对标 | 方案 |
|---|------|------|----------|------|
| 1 | 名称含换行/多空格破坏快照行格式 | `getAccessibleName` 只 trim 首尾，textContent 中部的 `\n`+缩进原样进入 nodesText——一行元素被拆成多行乱码，模型阅读与 browser_find 匹配同时失配；名称含 `"` 还会破坏引号格式 | Playwright aria snapshot 的 yaml 对文本做归一化/转义 | `getAccessibleName` 出口统一 `replace(/\s+/g,' ').trim()`；`serializeAINodes` 对 name/value 做 `"` → `'` 转义 + 同样归一化（双保险，value 来自 textarea 可含换行） |
| 2 | 扁平列表无层级上下文 | 20 个 button 平铺，模型无法判断哪个在侧边栏/主区域，只能猜 | Playwright aria snapshot 是**缩进树**，层级就是模型的定位上下文 | 采集时记录 `depth`，`serializeAINodes` 按深度输出行首缩进（上限 6 层防超长行）；折叠造成的空隙不影响相对分组 |
| 3 | browser_find 命中按文档序取前 10，低质量命中挤占配额 | 历史会话标题包含查询词时（如"帮我写开启新对话的文案"），可能把精确命中的按钮挤出 10 条配额 | Playwright `getByRole(role, { name })`：role 限定 + 名称匹配 | 匹配结果分档排序：名称完全相等 > 前缀匹配 > 包含匹配，档内保持文档序（Array.sort 稳定）；新增可选 `args.role` 过滤（大小写不敏感） |
| 4 | 操作后 AI 需再调一次 browser_snapshot 验证，且存在竞态 | click/submit 返回是同步的，SPA 渲染是异步的——AI 紧接着的快照可能拍到旧 DOM，误判"操作没生效"再乱点 | **Playwright MCP：所有 mutation action 的返回都自动附带操作后的新 aria snapshot**，一步顶两步 | content script 对 DOM 操作类消息（CLICK/TYPE/SELECT/HOVER/PRESS_KEY/CHECK/UNCHECK/FILL_FORM）改为异步响应：执行后等 500ms（SPA 渲染窗口）再采集，响应 `data.snapshot = {url,title,totalElements,nodesText}`；采集失败降级为原响应。sanitizeResult 把这些工具纳入快照级（剔 nodes 留 nodesText、放宽阈值）；提示词引导"操作结果自带最新快照，先读它，别再单独调 browser_snapshot" |

**自查**：
- #4 的竞态兜底：操作导致页面跳转时响应可能丢失 → SW 兜底注入重发 → `findElementByRef` 的 URL 守卫判定 ref 失效返回 ELEMENT_NOT_FOUND，**不会跨页面重复执行动作**；
- #4 异步响应通道：与 SCREENSHOT 相同的 `return true` 模式，成功/失败/异常三条路径都有且仅有一次 sendResponse；
- #2 缩进只加在 serializeAINodes 输出层，nodes 数据结构（transport/scanCurrentPage 消费方）不受影响；
- #3 排序在同分档内保持文档序（ES2019+ sort 稳定），行为可预期；role 过滤缺省不过滤，兼容既有调用；
- #1 归一化在采集源头做，snapshotCache/scanCurrentPage/browser_find 全部自动受益；
- 提示词同步更新：快照阅读方法（缩进语义 + find 排序说明）、操作原则第 4 条（验证 = 读操作结果自带的 snapshot）。

### 问题 17：browser_find 按 role 硬过滤漏检 + AI 用截图兜底 DOM 操作

**现象**：让 AI 点「开启新对话」，`browser_find(query="新对话", role="button")` 返回 `count:0`，
AI 随即调截图"看图找元素"，任务失败。

**根因**：两层。
1. **role 硬过滤**：页面大量"按钮"是 div/span 模拟（无原生 button 语义），a11y role 是
  `generic`/`text` 而非 `button`。AI 按用户口语（"按钮"）传 `role="button"`，
  findNodesByText 把 role 当硬过滤条件 → 文本明明存在却被筛光。语义检索场景里
  role 是 AI 的**猜测**，猜测不能作为召回的前置条件。
2. **截图兜底无禁令**：提示词只在"整理/总结"场景禁止截图，DOM 操作失败路径没有任何
  限制，模型自发退化成多模态"看图猜元素"——但截图拿不到 ref，点了也没用，纯属浪费步数。

**业界方案**：模糊检索工具的过滤参数只作**优先级**不作召回门槛（检索保召回、排序保精度）；
Playwright 的 getByRole 是精确匹配，但前提是 role 来自真实 aria 树而非模型猜测。
截图在 browser自动化里只用于"给用户看"，不用于"给 agent 看"（Playwright MCP 同样不靠
截图定位元素）。

**修复方案**：

| # | 位置 | 改动 |
|---|------|------|
| 1 | `content/dom-perception.ts` | `findNodesByText`：role 从硬过滤改为**优先筛选**——先按文本取全量命中 pool；role 命中非空则返回 role 子集；role 命中为空则返回全量 pool 并标记 `roleRelaxed: true`。返回类型增加 `roleRelaxed` |
| 2 | `shared/prompts.ts` | ①browser_find 工具说明：args.role 不要随意传（div 模拟按钮的真实 role 多为 generic），仅快照里明确看到目标 role 时才传；限定后无匹配自动放宽并返回 `roleRelaxed: true`。②操作原则第 17 条：处置序列第②步改为 browser_find **不传 role**。③新增第 18 条：DOM 操作全程禁止截图兜底——找不到就 find 换关键词 → ask 用户；截图仅在用户明确要求时使用 |

**自查**：
- 放宽逻辑只在 role 命中为空时触发，role 命中非空时行为与之前完全一致（精确优先）；
- `roleRelaxed` 是纯新增字段，旧消费方（mapContentScriptResponse 透传 + sanitize 白名单
  标量）无需改动；
- 排序/截断/新鲜采集逻辑不变，find 的 ref 有效性保证不受影响；
- 截图工具本体保留（用户明确要求时仍可用），仅约束 agent 的自主兜底行为；
- 既有 browser_* 工具与快照链路零改动。

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
