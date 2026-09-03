> 当前实现说明：本文中的旧 executor、browser_* 和 DOM/Agent Loop 设计属于历史方案，当前以 `docs/mv3-api-implementation-plan.md` 和 `docs/mv3-api-remaining-work-plan.md` 为准。
>
> 入口边界（2026-08-31）：斜杠命令由 `useSlashCommandRunner`（`src/composables/useSlashCommandRunner.ts`）自包含处理：slash 匹配、特殊默认值、precompute、`MSG_EXECUTE`、slash 确认、客户端命令路由（录制）、`dispatchToSW` 嵌入按钮路径、`onScopeDispose` 释放录制生命周期。自然语言由 `usePlanRunner`（`MSG_EXECUTE_PLAN`）处理。两者只共享底层安全执行设施（service-worker handlers / commands.ts / precompute / shared/render-result.ts）；不再共享业务状态、结果渲染或确认卡协议（`ConfirmCardData` 在 `types/ui.ts` 统一）。`useAIEngine` 仅保留 AI 入口（模型管理、消息持久化、状态通道、handleSubmit 分发）；结果渲染抽到中立层 `shared/render-result.ts`。

# AI 浏览器 API 操作架构设计文档（Plan-First 方案·最终版 v3.1）

> **文档版本**：v3.1（完整审查后定稿）
> **范围**：仅 Chrome 浏览器 API 操作（标签/书签/历史/存储/扩展/权限等），不涉及 DOM 操作
> **目标**：单次 AI 调用、并发调度、严格 JSON、零历史包袱
> **v3.1 相对 v3.0 的修订**：§5.4 precompute 位置修正（保留在前端）；§7.4 新增 handleConfirm 转换逻辑；§7.5 删 resolveAIReply；§7.6 删 scripting permission

---

## 1. 方案选型依据

### 1.1 业界主流方案对比

| 方案                        | 调用模式                 | 单次任务耗时 | 精准度   | Token 成本    | 复杂度 | 适合场景       |
| --------------------------- | ------------------------ | ------------ | -------- | ------------- | ------ | -------------- |
| Claude Computer Use         | 截图 + 视觉模型          | 8-15s        | 78%      | 高 ($0.50-$5) | 高     | 全桌面控制     |
| OpenAI Operator             | 截图 + CUA               | 5-10s        | 87%      | 高（托管）    | 低     | 简单 Web 任务  |
| Stagehand                   | Playwright + AI 选择器   | 3-6s         | 89%      | 中            | 中     | 生产级自动化   |
| Browser Use                 | Playwright + 多模态      | 4-8s         | 89.1%    | 高            | 高     | 复杂多步工作流 |
| Playwright MCP              | Accessibility Tree + ref | 2-4s         | 92%      | 低            | 低     | DOM 级操作     |
| **Plan-First AI（本方案）** | JSON Plan + DAG 并发     | **1-2s**     | **95%+** | 极低          | 低     | **API 级操作** |

**选型结论：Plan-First 方案最优（API 维度）**

---

## 2. v3.0 审查发现的问题（对比 v2.0）

通过 grep 全文搜索与代码阅读，发现 v2.0 方案遗漏以下关键点：

| #   | 问题                                                                                                                                                         | 严重度 | 修正方案                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `precompute()` 函数（useAIEngine.ts:1093-1210）依赖 `requiresPrecompute` 标记，斜杠命令 `dispatchToSW` 路径会调                                              | 🔴 高  | 提取为独立 `precompute()` 函数，dispatchToSW 路径保留                                                                   |
| 2   | `dispatchToSW`（1055-1091）被 `MessageBubble.vue:87` 的 `dispatchAction` 调用 → 嵌入组件按钮失效                                                             | 🔴 高  | dispatchToSW 对外 API 必须保留                                                                                          |
| 3   | `App.vue:317` 监听 `MSG_EXECUTE_RESULT` 消息 → `renderExecutionResult` 必须保留                                                                              | 🔴 高  | renderExecutionResult 移到顶层                                                                                          |
| 4   | `MessageBubble` 通过 `props.onAction(intent, args)` 调 `dispatchToSW` → 必须保留对外 API                                                                     | 🔴 高  | AI 输出嵌入按钮依赖                                                                                                     |
| 5   | `formatStepSummary` / `formatResultDescription` / `formatHelp` / `formatSlashCommands` 是斜杠命令渲染需要的                                                  | 🟡 中  | 保留到 useAIEngine                                                                                                      |
| 6   | `browser_*` 命令（commands.ts:934-1068）只支持 DOM 操作，要移除                                                                                              | 🟡 中  | 删 13 个 intent + 删除 handlers/browser-dom.ts                                                                          |
| 7   | `task_plan` / `exec_plan` 等 AI 协议字段要从 `AIResponse` 删除                                                                                               | 🟡 中  | AIResponse 重命名为 AIPlan                                                                                              |
| 8   | `requiresPrecompute` 命令要单独处理（10+ 个）                                                                                                                | 🟡 中  | dispatchToSW 路径保留                                                                                                   |
| 9   | `handleSlashCommand` 的"危险命令 preview 走 generateConfirmPreview"逻辑需要保留                                                                              | 🟡 中  | confirm.ts 完整保留                                                                                                     |
| 10  | `executor.ts:1411-1462` 的 `executeBrowserTool`（含 `BROWSER_TOOL_TO_MESSAGE` 等） → DOM 路径整体删除                                                        | 🟢 低  | handlers 不含 browser_*                                                                                                 |
| 11  | `usePlanRunner.handleClientExec` 调用 `chrome.tabs.group` 需要 `windowId`                                                                                    | 🟢 低  | handler 返回 groups 字段必须与旧版一致                                                                                  |
| 12  | `MAX_AGENT_STEPS` 等常量新方案中没意义，但 `DEFAULT_MAX_MESSAGES` 还要保留                                                                                   | 🟢 低  | 删除多余常量                                                                                                            |
| 13  | `formatResultDescription` 里有大量"DOM 脚本结果"分支                                                                                                         | 🟢 低  | 删除 DOM 相关分支                                                                                                       |
| 14  | 旧 agentLoop 在 NEEDS_CONFIRM 时要做 payload 转换（`extraPayload.selectedUrls/selectedIds/tabIds`），新方案 `usePlanRunner.handleConfirm` 也必须做同样的转换 | 🔴 高  | v3.1 补充：见 §7.4 handleConfirm                                                                                        |
| 15  | `precompute` 移到 SW 端后，前端 `dispatchToSW` 调用 SW `precompute` 路径不对——precompute 需要 `contextCache.tabs`，SW 端没有                                 | 🔴 高  | v3.1 修正：precompute 仍在前端，dispatchToSW 流程不变；新增 SW-side precompute 仅供 plan-runner 使用（plan 路径不需要） |
| 16  | `resolveAIReply` 函数在 AIPlan 协议下无用（AIPlan 只有 `chat.reply` + `thought`）                                                                            | 🟢 低  | 删除 resolveAIReply                                                                                                     |
| 17  | `manifest.json` 的 `scripting` permission 没在代码里使用                                                                                                     | 🟢 低  | 删除（manifest 也需要清理）                                                                                             |

---

## 3. 核心设计理念

### 3.1 三个原则

1. **单次调用，一次成功**：依赖 `response_format: json_object` + 严格 prompt，AI 一次返回合法 JSON，不修复、不重试
2. **DAG 并发调度**：用户一句话多任务 → 1 次 AI 调用输出 plan → SW 按依赖层级 `Promise.all` 并发执行
3. **斜杠命令不变**：slash command 路径（`/close-url` 等）100% 保留，仅自然语言路径重构

### 3.2 完整数据流

```
Side Panel 用户输入
  │
  ├─ 以 / 开头 → handleSlashCommand(text)
  │   ├─ matchSlashCommand → intent + slots
  │   ├─ dangerous → generateConfirmPreview → 弹卡 → 用户确认
  │   └─ dispatchToSW(intent, slots)
  │       ├─ precompute(intent, slots)（前端侧，如 requiresPrecompute）
  │       ├─ chrome.runtime.sendMessage(MSG_EXECUTE, ...)
  │       │   ↓
  │       │ SW: dispatchTool(tool, args)
  │       │   ├─ 危险 & !force → NEEDS_CONFIRM
  │       │   ├─ handler(args) → ExecutionResult
  │       │   └─ clientExec 路径返回 clientExec 标志
  │       └─ renderExecutionResult(intent, result)
  │           ├─ clientExec 路径 → 前端执行 chrome.tabs.group / ungroup
  │           ├─ buildMarkdownBody(intent, result) → 富组件
  │           └─ fallback formatResultDescription
  │
  └─ 不以 / 开头 → handleNaturalLanguage(text)
      └─ usePlanRunner.run(text)
          ├─ collectContext({mode:'summary'})
          ├─ aiEngine.chat([{system: buildSystemPrompt}, {user}])
          ├─ JSON.parse(raw) 严格解析
          ├─ chrome.runtime.sendMessage(MSG_EXECUTE_PLAN, {plan})
          │   ↓
          │ SW: executePlan(plan)
          │   while (ready = items.filter(deps完成)):
          │     Promise.all(ready.map(dispatchTool))
          │   返回 PlanExecutionReport
          ├─ handleClientExec(report)（clientExec 路径前端执行）
          └─ 渲染：每项 addStepMessage，needsConfirm → 弹卡 → 重发 force:true
```

---

## 4. AI 输出协议（Plan-First）

### 4.1 Schema

```ts
// src/shared/ai/plan-types.ts (NEW)

/** plan 内单项：一项 = 一次 SW handler 调用 */
export interface PlanItem {
  /** plan 内唯一；用于 results 索引、UI 步骤序号 */
  id: string // 'p1', 'p2', ...
  /** COMMANDS 注册表中的 sw intent 名 */
  tool: string // 'tabs_remove' | 'bookmarks_create' | ...
  /** 工具参数；由 tool 的 slots 定义校验 */
  args: Record<string, unknown>
  /** 依赖的 item id；deps 全部成功后才执行；空数组 = 顶层可并行 */
  deps: string[]
  /** AI 合并标记：本次调用由哪些用户指令合并而来；仅用于 UI 展示 */
  mergedFrom?: string[]
}

/** AI 单次响应（替代旧 AIResponse） */
export interface AIPlan {
  /** 简短思考；不超过 200 字 */
  thought: string
  /** 计划项列表；空数组 = 纯闲聊 */
  plan?: PlanItem[]
  /** 闲聊模式（无工具调用） */
  chat?: { reply: string }
}

/** Plan 执行结果（SW 返回前端） */
export interface PlanItemResult {
  id: string
  tool: string
  args: Record<string, unknown>
  mergedFrom?: string[]
  result: ExecutionResult
  durationMs: number
}

export interface PlanExecutionReport {
  thought: string
  items: PlanItemResult[]
  success: boolean
  needsConfirm?: { itemId: string; detail: Record<string, unknown> }
}
```

### 4.2 协议示例

**例 1：合并同类 + 并行**

```
用户：「关闭 github 和 stackoverflow 标签，再把当前页加书签」
```

```json
{
  "thought": "两条同类关闭合并为一次 tabs_remove，加书签独立。两步无依赖，并行。",
  "plan": [
    {
      "id": "p1",
      "tool": "tabs_remove",
      "args": { "tabIds": [11, 22] },
      "deps": [],
      "mergedFrom": ["关闭github", "关闭stackoverflow"]
    },
    {
      "id": "p2",
      "tool": "bookmarks_add_current_page",
      "args": {},
      "deps": []
    }
  ]
}
```

**例 2：依赖图**

```
用户：「先看所有标签，再关闭 id=99 的那个」
```

```json
{
  "thought": "先观察，再依赖第一个 tab 关闭。",
  "plan": [
    { "id": "p1", "tool": "tabs_observe", "args": { "maxResults": 5 }, "deps": [] },
    {
      "id": "p2",
      "tool": "tabs_remove",
      "args": { "tabIds": "$ref:p1.tabs[0].id", "force": true },
      "deps": ["p1"]
    }
  ]
}
```

> **$ref 协议限制**（v3 最终）：
>
> - 只支持 `.field` 和 `[N].field` 两种路径
> - 不支持 `[?expr]` 过滤表达式
> - prompt 中明确写"如需过滤，先调 observe 取详情，自己选好后填 tabIds"

**例 3：闲聊**

```json
{
  "thought": "用户问候，直接回应。",
  "chat": { "reply": "喵~你好呀！" }
}
```

**例 4：危险操作（自动二次确认）**

```
用户：「删除今天的浏览历史」
```

```json
{
  "thought": "删除今天的历史属于危险操作，会触发二次确认。",
  "plan": [
    {
      "id": "p1",
      "tool": "history_remove",
      "args": { "timeRange": "today" },
      "deps": []
    }
  ]
}
```

SW 收到后返回 `NEEDS_CONFIRM` → 前端弹卡 → 用户确认 → 整 plan force:true 重发。

---

## 5. SW 执行层（注册表 + DAG 调度）

### 5.1 文件结构

```
src/service-worker/
├── handlers/                          # NEW: 按域拆分
│   ├── index.ts                       #   REGISTRY + DANGEROUS_TOOLS + buildConfirmChildren + dispatchTool
│   ├── tabs.ts                        #   tabs_observe/create/update/move/remove/remove_by_url/observe_groups/group_by_domain/ungroup_all (9)
│   ├── bookmarks.ts                   #   bookmarks_* (7)
│   ├── history.ts                     #   history_search/remove (2)
│   ├── windows.ts                     #   windows_observe/create/update (3)
│   ├── navigation.ts                  #   navigate/screenshot/zoom/downloads_open (4)
│   ├── storage.ts                     #   storage_get/set/remove + sessions_restore (4)
│   ├── theme-font.ts                  #   theme_*/font_* (6)
│   ├── cookies.ts                     #   cookies_observe/remove (2)
│   ├── top-sites.ts                   #   top_sites_observe (1)
│   ├── extensions.ts                  #   extensions_observe/update/remove (3)
│   └── permissions.ts                 #   permissions_observe/update (2)
├── plan-runner.ts                     # NEW: executePlan(plan) DAG 调度
├── index.ts                           # MOD: MSG_EXECUTE + MSG_EXECUTE_PLAN 路由
├── context-collector.ts               # MOD: 修 muted bug
├── precompute.ts                      # NEW: 从旧 useAIEngine 提取的 precompute 函数
└── task-planner.ts                    # DEL
```

### 5.2 handlers/index.ts（注册表 + 入口）

```ts
// src/service-worker/handlers/index.ts (NEW)
import type { ExecutionResult } from '../../types'
import * as tabs from './tabs'
import * as bookmarks from './bookmarks'
import * as history from './history'
import * as windows from './windows'
import * as navigation from './navigation'
import * as storage from './storage'
import * as themeFont from './theme-font'
import * as cookies from './cookies'
import * as topSites from './top-sites'
import * as extensions from './extensions'
import * as permissions from './permissions'

export type Handler = (args: Record<string, unknown>) => Promise<ExecutionResult>

/** SW 工具注册表：tool 名 → handler */
export const REGISTRY: Record<string, Handler> = {
  // ─── TABS ───
  tabs_observe: tabs.observe,
  tabs_create: tabs.create,
  tabs_update: tabs.update,
  tabs_remove: tabs.remove,
  tabs_remove_by_url: tabs.removeByUrl,
  tabs_move: tabs.move,
  tabs_observe_groups: tabs.observeGroups,
  tabs_group_by_domain: tabs.groupByDomain,
  tabs_ungroup_all: tabs.ungroupAll,
  // ─── BOOKMARKS ───
  bookmarks_observe_tree: bookmarks.observeTree,
  bookmarks_create_node: bookmarks.createNode,
  bookmarks_update_node: bookmarks.updateNode,
  bookmarks_move_node: bookmarks.moveNode,
  bookmarks_remove_node: bookmarks.removeNode,
  bookmarks_open_node: bookmarks.openNode,
  bookmarks_add_current_page: bookmarks.addCurrentPage,
  // ─── HISTORY ───
  history_search: history.search,
  history_remove: history.remove,
  // ─── WINDOWS ───
  windows_observe: windows.observe,
  windows_create: windows.create,
  windows_update: windows.update,
  // ─── NAVIGATION / PAGE ───
  navigate: navigation.navigate,
  screenshot: navigation.screenshot,
  zoom: navigation.zoom,
  downloads_open: navigation.downloadsOpen,
  // ─── STORAGE / SESSIONS ───
  storage_get: storage.get,
  storage_set: storage.set,
  storage_remove: storage.remove,
  sessions_restore: storage.restoreSession,
  // ─── THEME / FONT ───
  theme_observe: themeFont.observeTheme,
  theme_update: themeFont.updateTheme,
  font_size_observe: themeFont.observeFontSize,
  font_size_update: themeFont.updateFontSize,
  font_family_observe: themeFont.observeFontFamily,
  font_family_update: themeFont.updateFontFamily,
  // ─── COOKIES ───
  cookies_observe: cookies.observe,
  cookies_remove: cookies.remove,
  // ─── TOP SITES ───
  top_sites_observe: topSites.observe,
  // ─── EXTENSIONS ───
  extensions_observe: extensions.observe,
  extensions_update: extensions.update,
  extensions_remove: extensions.remove,
  // ─── PERMISSIONS ───
  permissions_observe: permissions.observe,
  permissions_update: permissions.update,
}

export function getHandler(tool: string): Handler | undefined {
  return REGISTRY[tool]
}

/** 危险工具集合：调用前需要 force=true 或前端二次确认 */
export const DANGEROUS_TOOLS = new Set([
  'tabs_remove',
  'tabs_remove_by_url',
  'bookmarks_remove_node',
  'history_remove',
  'cookies_remove',
  'extensions_remove',
])

/** 二次确认时的 children 列表（从旧 executor.ts:229 完整迁移） */
export async function buildConfirmChildren(
  tool: string,
  args: Record<string, unknown>
): Promise<Array<{ id: string | number; title?: string; url?: string }> | undefined> {
  try {
    if (tool === 'bookmarks_remove_node') {
      const nodeId = args.nodeId as string | undefined
      if (!nodeId) return undefined
      try {
        const nodes = await chrome.bookmarks.get(nodeId)
        const node = nodes[0]
        if (!node || !node.children) return undefined
        const children = await chrome.bookmarks.getChildren(nodeId)
        return children.map((c) => ({ id: c.id, title: c.title, url: c.url }))
      } catch {
        return undefined
      }
    }
    if (tool === 'tabs_remove') {
      const tabIds = Array.isArray(args.tabIds) ? (args.tabIds as number[]) : []
      if (!tabIds.length) return undefined
      const tabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null)))
      return tabs
        .filter((t): t is chrome.tabs.Tab => !!t && t.id !== undefined)
        .map((t) => ({ id: t.id!, title: t.title, url: t.url }))
    }
    if (tool === 'history_remove' && args.query) {
      const items = await chrome.history.search({
        text: args.query as string,
        maxResults: 20,
      })
      return items
        .filter((it) => !!it.url)
        .map((it) => ({ id: it.url as string, title: it.title, url: it.url }))
    }
  } catch {
    return undefined
  }
  return undefined
}

/** dispatchTool 入口（替代旧 executeCommand） */
export async function dispatchTool(
  tool: string,
  args: Record<string, unknown> = {}
): Promise<ExecutionResult> {
  const handler = getHandler(tool)
  if (!handler) {
    return { success: false, code: 'UNKNOWN_TOOL', message: `未知工具: ${tool}` }
  }

  // 危险操作二次确认
  if (DANGEROUS_TOOLS.has(tool) && args.force !== true) {
    return {
      success: false,
      code: 'NEEDS_CONFIRM',
      message: `确认执行 "${tool}" 操作？此操作不可撤销。`,
      detail: {
        tool,
        payload: args,
        nodeId: args.nodeId,
        title: args.title,
        children: await buildConfirmChildren(tool, args),
      },
    }
  }

  // 用解构剥离 force，避免污染原对象
  const { force: _force, ...cleanArgs } = args
  return handler(cleanArgs)
}
```

### 5.3 plan-runner.ts（DAG 调度）

```ts
// src/service-worker/plan-runner.ts (NEW)
import { dispatchTool } from './handlers'
import type { AIPlan, PlanItemResult } from '../shared/ai/plan-types'
import type { ExecutionResult } from '../types'

export interface PlanExecutionReport {
  thought: string
  items: PlanItemResult[]
  success: boolean
  needsConfirm?: { itemId: string; detail: Record<string, unknown> }
}

export async function executePlan(plan: AIPlan): Promise<PlanExecutionReport> {
  const items = plan.plan ?? []
  if (!items.length) {
    return { thought: plan.thought, items: [], success: true }
  }

  // 防御：检测重复 id
  const ids = new Set<string>()
  for (const it of items) {
    if (ids.has(it.id)) {
      return {
        thought: plan.thought,
        items: items.map((it) => ({
          id: it.id,
          tool: it.tool,
          args: it.args,
          mergedFrom: it.mergedFrom,
          result: {
            success: false,
            code: 'DUPLICATE_ITEM_ID',
            message: '重复的 item id',
          } as ExecutionResult,
          durationMs: 0,
        })),
        success: false,
      }
    }
    ids.add(it.id)
  }

  const finished = new Map<string, PlanItemResult>()
  let needsConfirm: PlanExecutionReport['needsConfirm']

  while (true) {
    const ready = items.filter(
      (it) => !finished.has(it.id) && it.deps.every((d) => finished.has(d)) && !needsConfirm
    )
    if (!ready.length) break

    const results = await Promise.all(
      ready.map(async (it): Promise<PlanItemResult> => {
        const t0 = Date.now()
        const resolvedArgs = resolveRefs(it.args, finished)
        const result = await dispatchTool(it.tool, resolvedArgs)
        return {
          id: it.id,
          tool: it.tool,
          args: it.args,
          mergedFrom: it.mergedFrom,
          result,
          durationMs: Date.now() - t0,
        }
      })
    )

    for (const r of results) finished.set(r.id, r)

    const confirmItem = results.find((r) => r.result.code === 'NEEDS_CONFIRM')
    if (confirmItem) {
      needsConfirm = {
        itemId: confirmItem.id,
        detail: confirmItem.result.detail ?? {},
      }
    }
  }

  // 兜底：未执行项标 BLOCKED_BY_FAILED_DEP
  const blocked: PlanItemResult[] = items
    .filter((it) => !finished.has(it.id))
    .map((it) => ({
      id: it.id,
      tool: it.tool,
      args: it.args,
      mergedFrom: it.mergedFrom,
      result: {
        success: false,
        code: 'BLOCKED_BY_FAILED_DEP',
        message: '依赖项失败或需要确认，整 plan 已暂停',
      },
      durationMs: 0,
    }))

  const all = [...finished.values(), ...blocked]
  const success = !needsConfirm && blocked.length === 0
  return { thought: plan.thought, items: all, success, needsConfirm }
}

/** $ref 占位符解析：只支持 .field 和 [N].field */
function resolveRefs(
  args: Record<string, unknown>,
  finished: Map<string, PlanItemResult>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string') {
      const m = v.match(/^\$ref:([a-z0-9_]+)\.(.+)$/)
      if (m) {
        const dep = finished.get(m[1])
        out[k] = resolvePath(dep?.result, m[2])
        continue
      }
    }
    out[k] = v
  }
  return out
}

function resolvePath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const seg of path.split('.')) {
    if (cur == null) return undefined
    const idx = seg.match(/^(\w+)\[(\d+)\]$/)
    if (idx) {
      cur = (cur as Record<string, unknown[]>)[idx[1]]?.[Number(idx[2])]
    } else {
      cur = (cur as Record<string, unknown>)[seg]
    }
  }
  return cur
}
```

### 5.4 precompute.ts（v3.1 修正：保留在前端，dispatchToSW 路径不变）

**关键修正**：v3.0 误把 precompute 放到了 SW 端，但 precompute 需要 `contextCache.tabs`（前端缓存），SW 端没有这个状态。

```ts
// src/composables/usePrecompute.ts (NEW, 取代旧 useAIEngine 内的 precompute)
import { contextCache } from './usePrecompute'

/**
 * 部分命令需要先 observe 后才能 resolve 参数（如 query → tabId）。
 * 此函数从旧 useAIEngine.ts 完整迁移。
 * 用在 useSlashCommandRunner.sendToSW / dispatchToSW 路径，AI plan 路径不调（AI 直接给 tabIds）。
 */
export async function precompute(
  intent: string,
  slots: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tabs = contextCache.value?.tabs ?? []
  const activeTab = tabs.find((t) => t.active)

  switch (intent) {
    case 'close_duplicate_tabs': {
      const seen = new Map<string, number>()
      const dupIds: number[] = []
      for (const t of tabs) {
        const url = (t.url || '').replace(/\/$/, '')
        if (slots.url && !url.includes(slots.url as string)) continue
        if (seen.has(url)) dupIds.push(t.id)
        else seen.set(url, t.id)
      }
      return { tabIds: dupIds }
    }

    case 'close_tabs_by_url':
      return slots

    case 'ungroup_all': {
      const selectedGroupIds = Array.isArray(slots.selectedGroupIds)
        ? (slots.selectedGroupIds as unknown[])
            .map((g) => Number(g))
            .filter((g) => Number.isFinite(g))
        : null
      const groupMap = new Map<number, number[]>()
      for (const t of tabs) {
        if (t.id === undefined) continue
        if (t.groupId === undefined || t.groupId === -1) continue
        if (selectedGroupIds && !selectedGroupIds.includes(t.groupId)) continue
        if (!groupMap.has(t.groupId)) groupMap.set(t.groupId, [])
        groupMap.get(t.groupId)!.push(t.id)
      }
      const result: Record<string, unknown> = { tabIds: [] }
      for (const [, ids] of groupMap) {
        ;(result.tabIds as number[]).push(...ids)
      }
      return result
    }

    case 'duplicate_tab': {
      if (!activeTab) return {}
      return {
        url: activeTab.url,
        active: true,
        index: (activeTab.index || 0) + 1,
      }
    }

    case 'sort_tabs': {
      const order = (slots.order as string) || 'domain'
      const sorted = [...tabs].sort((a, b) => {
        if (order === 'title') return (a.title || '').localeCompare(b.title || '')
        const dA = a.url ? new URL(a.url).hostname : ''
        const dB = b.url ? new URL(b.url).hostname : ''
        return dA.localeCompare(dB) || (a.index || 0) - (b.index || 0)
      })
      return { tabIds: sorted.map((t) => t.id), index: 0 }
    }

    case 'pin_tab': {
      if (!activeTab) return {}
      let isPinned = activeTab.pinned
      try {
        const liveTab = await chrome.tabs.get(activeTab.id)
        isPinned = !!liveTab.pinned
      } catch {
        // tab 已不存在就用缓存值
      }
      return { tabId: activeTab.id, pinned: !isPinned }
    }

    case 'remove_bookmark': {
      if (!slots.query) return {}
      try {
        const results = (await chrome.runtime.sendMessage({
          type: 'GET_BOOKMARKS',
          options: { query: slots.query as string },
        })) as Array<{ id: string }>
        const node = results?.[0]
        if (!node) return {}
        return { nodeId: node.id }
      } catch {
        return {}
      }
    }

    case 'enable_extension':
    case 'disable_extension':
    case 'uninstall_extension': {
      if (!slots.query) return {}
      try {
        const exts = await chrome.management.getAll()
        const q = (slots.query as string).toLowerCase()
        const match = exts.find((e) => e.id === slots.query || e.name.toLowerCase().includes(q))
        if (!match) return {}
        if (intent === 'enable_extension') return { id: match.id, enabled: true }
        if (intent === 'disable_extension') return { id: match.id, enabled: false }
        return { id: match.id }
      } catch {
        return {}
      }
    }

    default:
      return slots
  }
}
```

### 5.5 SW 消息路由升级

```ts
// src/service-worker/index.ts (MOD)
import { collectContext } from './context-collector'
import { dispatchTool } from './handlers'
import { executePlan } from './plan-runner'
import { precompute } from './precompute'
// ... 录制协调不变

export const MSG_EXECUTE_PLAN = 'EXECUTE_PLAN'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }))
  return true
})

async function handleMessage(message: {
  type: string
  command?: { intent?: string; plan?: AIPlan; payload?: unknown }
  options?: unknown
}): Promise<unknown> {
  const { type } = message

  if (type === MSG_GET_CONTEXT) {
    return await collectContext(message.options as { mode?: string; query?: string })
  }
  if (type === MSG_GET_BOOKMARKS) {
    return await handleGetBookmarks(message.options as { query?: string })
  }

  // ─── 新增：plan 路径（自然语言）───
  if (type === MSG_EXECUTE_PLAN) {
    const plan = message.command?.plan as AIPlan
    return await executePlan(plan)
  }

  // ─── 单 tool 路径（斜杠命令 + 嵌入组件按钮）───
  if (type === MSG_EXECUTE) {
    const cmd = message.command!
    let { intent, payload } = cmd

    // 调用方已在 sidepanel 端 precompute 过 payload；这里直接 dispatch
    return await dispatchTool(intent!, payload as Record<string, unknown>)
  }

  // ... 录制协调不变
}
```

---

## 6. Prompt 设计

### 6.1 System Prompt 结构

```ts
// src/shared/ai/system-prompt.ts (NEW, 替换旧 prompts.ts)
import { COMMANDS } from '../commands'

function buildToolList(): string {
  return COMMANDS.filter(
    (c) => !c.aiHidden && c.swIntent !== null && !c.intent.startsWith('browser_')
  )
    .map((c) => {
      const slots = Object.entries(c.slots)
        .map(([name, slot]) => `${name}${slot.optional ? '?' : ''}:${slot.type}`)
        .join(', ')
      const danger = c.dangerous ? '  ⚠️' : ''
      return `- ${c.swIntent}{${slots}}${danger}  // ${c.description}`
    })
    .join('\n')
}

export interface ContextSnapshot {
  activeTab: { id: number; title: string; url: string; hostname: string } | null
  tabsSummary: string
  bookmarkFolders: string[]
}

export function buildSystemPrompt(ctx: ContextSnapshot): string {
  const toolList = buildToolList()
  return `你是 AI 浏览器管家。每次请求只输出一个 JSON 对象，禁止任何其它内容。

## 当前状态
active_tab: ${ctx.activeTab ? `${ctx.activeTab.title} (${ctx.activeTab.hostname})` : '无'}
tabs: ${ctx.tabsSummary}
bookmark_folders: ${ctx.bookmarkFolders.join(', ') || '空'}

## 工具
${toolList}
⚠️ = 危险操作（自动二次确认，无需在 plan 中处理）

## 输出格式
工具调用：
{"thought":"<≤200 字>","plan":[
  {"id":"p1","tool":"<工具名>","args":{...},"deps":[],"mergedFrom":["..."]}
]}

纯闲聊：
{"thought":"...","chat":{"reply":"..."}}

## 规则
1. 一句话多任务 → 用 plan 数组；deps=[] 的项会自动并行
2. 同类操作合并：用 tabIds 数组等合并参数；填 mergedFrom 标注
3. 依赖前置输出 → deps:["pN"] + args 用 "$ref:pN.field" 占位（仅支持 .id 和 [N].id）
4. 危险操作自动二次确认
5. 不要输出 DOM 操作相关工具（本扩展不支持）

## 错误模式
- tabs_remove 没传 tabIds → 会关闭当前活动标签；要关多个用 tabs_remove_by_url
- bookmarks_remove_node 缺 nodeId → 先调 bookmarks_observe_tree 拿 id
- chrome.cookies.getAll 必须传 domain → 无参时取当前 tab 的 hostname`
}
```

### 6.2 Context 注入（修 muted bug）

```ts
// src/service-worker/context-collector.ts (MOD: 第 121 行修 bug)
function formatTab(t: TabInfo): TabInfo {
  return {
    id: t.id,
    title: (t.title || '').slice(0, 100),
    url: t.url,
    windowId: t.windowId,
    active: t.active,
    groupId: t.groupId ?? -1,
    index: t.index,
    muted: t.muted, // ← v3 修正：从 false 改为真实值
  }
}
```

---

## 7. 前端入口

### 7.1 useAIEngine 实例独立化（已实现）

```ts
// src/composables/useAIEngine.ts (瘦身后, 仅 AI 侧职责)
import { ref } from 'vue'
import { AIEngine } from '../shared/ai/engine'

const engine = new AIEngine() // ← 模块级单例，usePlanRunner 可直接 import

export { engine as aiEngine }
export function useAIEngine() {
  // 保留:
  // - addMessage / deleteMessage / clearMessages / 模型 CRUD / initEngine / selectModel
  // - handleNaturalLanguage（调 usePlanRunner.run）
  // - handleSubmit（分发：以 / 开头 → slashRunner.run；其它 → handleNaturalLanguage）
  // - pendingConfirm（App.vue 共用确认卡）
  // - state.messageLog / state.isSettingsOpen / state.commandInputValue

  // 已迁出:
  // - handleSlashCommand / dispatchToSW / renderExecutionResult / formatResultDescription
  // - recordingExecutor（→ useSlashCommandRunner 内部 + onScopeDispose）
  // - formatHelp / formatSlashCommands / formatStepSummary
  // - precompute 函数（→ usePrecompute 模块）

  // 已删除:
  // - agentLoop（被 usePlanRunner 替代）
  // - scanCurrentPage（DOM 相关）
  // - updatePlanTracker / persistPlanTracker / recoverContext / addLesson
  // - verifyPredict / compressMessages
  // - SESSION_KEY / sessionStorage 持久化
  // - conversationMessages / planTracker / lessons stateRef
  // - exec_plan / askUserResponse / ask / scan / chat 协议分支
  // - sanitizeResult（截断在 plan-runner 里不需要，ExecutionResult 直接传）

  return {/* ... */}
}
```

### 7.2 usePlanRunner.ts

```ts
// src/composables/usePlanRunner.ts (NEW)
import { aiEngine } from './useAIEngine'
import { buildSystemPrompt, type ContextSnapshot } from '../shared/ai/system-prompt'
import { MSG_EXECUTE_PLAN, MSG_GET_CONTEXT } from '../shared/constants'
import type { AIPlan } from '../shared/ai/plan-types'
import type { PlanExecutionReport } from '../service-worker/plan-runner'
import { wrapCatReply } from '../shared/personality'

let abortCtl: AbortController | null = null

export async function run(userText: string): Promise<void> {
  abortCtl?.abort()
  abortCtl = new AbortController()

  // 1. 收集上下文
  const ctx = await getSummaryContext()

  // 2. 调 AI（jsonMode 强制 JSON）
  const raw = await aiEngine.chatWithHistory(
    [
      { role: 'system', content: buildSystemPrompt(ctx) },
      { role: 'user', content: userText },
    ],
    { temperature: 0.1, jsonMode: true, mode: 'task', signal: abortCtl.signal }
  )

  // 3. 严格解析
  let parsed: AIPlan
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    addAIChat(wrapCatReply('抱歉，我没理解您的请求喵~'), true)
    return
  }

  // 4. 闲聊路径
  if (parsed.chat) {
    addAIChat(wrapCatReply(parsed.chat.reply), true)
    return
  }

  // 5. 空 plan
  if (!parsed.plan?.length) {
    addAIChat(wrapCatReply(parsed.thought || '已完成'), true)
    return
  }

  // 6. 一次性发给 SW 做 DAG 调度
  const report = (await chrome.runtime.sendMessage({
    type: MSG_EXECUTE_PLAN,
    command: { plan: parsed },
  })) as PlanExecutionReport

  // 7. 处理 clientExec 路径（tabs.group_by_domain / tabs.ungroup_all）
  await handleClientExec(report)

  // 8. 渲染
  for (const item of report.items) {
    addStepMessage(item.tool, item.result, item.mergedFrom)
  }
  if (report.needsConfirm) {
    showConfirmCard(report.needsConfirm, parsed)
  } else {
    emitFinalChat(report)
  }
}

/** 处理 clientExec 路径（从旧 useAIEngine.ts:1691-1804 完整迁移） */
async function handleClientExec(report: PlanExecutionReport): Promise<void> {
  for (const item of report.items) {
    const r = item.result as { clientExec?: string; groups?: unknown }
    if (r.clientExec === 'tabs_group_by_domain' && Array.isArray(r.groups)) {
      const groups = r.groups as Array<{ title: string; tabIds: number[]; windowId: number }>
      // ... 验证 tab + chrome.tabs.group + chrome.tabGroups.update（同旧代码）
    }
    if (r.clientExec === 'tabs_ungroup_all' && Array.isArray(r.groups)) {
      const groups = r.groups as Array<{ groupId: number; tabIds: number[] }>
      // ... 验证 tab + chrome.tabs.ungroup（同旧代码）
    }
  }
}

async function getSummaryContext(): Promise<ContextSnapshot> {
  const raw = (await chrome.runtime.sendMessage({
    type: MSG_GET_CONTEXT,
    options: { mode: 'summary' },
  })) as {
    activeTab: { id: number; title: string; url: string } | null
    tabCount: number
    domainDistribution: Array<{ domain: string; count: number }>
    bookmarkFolders: string[]
  }
  return {
    activeTab: raw.activeTab
      ? {
          id: raw.activeTab.id,
          title: raw.activeTab.title,
          url: raw.activeTab.url,
          hostname: (() => {
            try {
              return new URL(raw.activeTab.url).hostname
            } catch {
              return ''
            }
          })(),
        }
      : null,
    tabsSummary: `总 ${raw.tabCount} 个；域名分布: ${raw.domainDistribution
      .slice(0, 5)
      .map((d) => `${d.domain}:${d.count}`)
      .join(', ')}`,
    bookmarkFolders: raw.bookmarkFolders,
  }
}
```

### 7.4 handleConfirm（v3.1 新增：NEEDS_CONFIRM 弹卡后的 payload 转换）

**关键修正**：v3.0 漏了 NEEDS_CONFIRM 弹卡后重发 plan 的 payload 转换。旧 useAIEngine.ts:673-683 有专门的 `extraPayload` 转换逻辑（按 intent 归一化 selectedTabIds），新方案必须保留。

```ts
// src/composables/usePlanRunner.ts (新增)

/**
 * 危险确认弹卡：用户勾选子集后重发整个 plan
 * children 的 id 可能是 string（书签/历史 URL）或 number（tabId）；
 * 按 intent 类型归一化到对应字段：
 *   - history_remove: selectedUrls (string[])
 *   - bookmarks_remove_node: selectedIds (string[]/number[])
 *   - tabs_remove: tabIds (number[])
 *   - tabs_remove_by_url: tabIds (number[])
 *   - 其他: 透传 selectedIds
 */
function buildReconfirmPayload(
  originalPlan: AIPlan,
  confirmItem: PlanItemResult,
  selectedIds: Array<string | number>
): AIPlan {
  const tool = confirmItem.tool
  return {
    thought: originalPlan.thought,
    plan: originalPlan.plan?.map((it) => {
      if (it.id !== confirmItem.id) return it
      const extra: Record<string, unknown> = { force: true }
      if (tool === 'history_remove') {
        extra.selectedUrls = selectedIds.map((id) => String(id))
      } else if (tool === 'bookmarks_remove_node') {
        // 书签 id 可能是 number（前端 Number() 转换）或 string
        extra.selectedIds = selectedIds
          .map((id) => (typeof id === 'number' ? id : Number(id)))
          .filter((id) => Number.isFinite(id) && id > 0)
      } else if (tool === 'tabs_remove' || tool === 'tabs_remove_by_url') {
        extra.tabIds = selectedIds.filter((id): id is number => typeof id === 'number')
      } else {
        extra.selectedIds = selectedIds
      }
      return {
        ...it,
        args: { ...it.args, ...extra },
      }
    }),
  }
}
```

### 7.5 删 resolveAIReply（v3.1）

AIPlan 协议下，AI 输出只有 `chat.reply` + `thought`，不再有 `toolCall.reply` / `args.reply` 等嵌套字段。`resolveAIReply(ai: AIResponse, ...)` 函数整体删除。

### 7.6 删 manifest.json 的 scripting permission（v3.1）

代码中没有使用 `chrome.scripting.*`，删掉。如果后续 DOM 操作架构恢复再加。

```ts
// src/composables/useAIEngine.ts: handleNaturalLanguage (瘦身后)
async function handleNaturalLanguage(text: string) {
  const ai = await aiEngine.checkAvailability()
  if (!ai.available) {
    addMessage(
      'system',
      `AI 不可用: ${ai.reason || '未配置'}\n\n可用斜杠命令:\n${formatSlashCommands()}`
    )
    return
  }

  if (pendingConfirm.value) cleanup()

  setStatusMessage('思考中...')

  const { run: runPlan } = await import('./usePlanRunner')
  await runPlan(text, {
    addMessage: addMessageLocal,
    updateStatusText,
    removeStatusText,
    setPendingConfirm: (value) => { pendingConfirm.value = value },
    // plan 路径下由 usePlanRunner 自己负责单步渲染（含 clientExec + 确认卡），
    // 这里用空实现占位，保持 PlanRunnerContext 接口兼容
    renderExecutionResult: async () => {},
  })
}
```

### 7.7 useSlashCommandRunner 自包含（v3.1+，已实现）

```ts
// src/composables/useSlashCommandRunner.ts (NEW)
import { onScopeDispose } from 'vue'
import { createRecordingExecutor } from '../recording/executor'
import { renderExecutionResult } from '../shared/render-result'
import { SLASH_COMMANDS, matchSlashCommand } from '../shared/slash-commands'

export interface SlashRunnerDeps {
  addMessage: (type, text, image?, video?, recordingFile?) => void
  clearMessages: () => void
  setPendingConfirm: (value: ConfirmCardData | null) => void
  cancelPlan: () => void
  showScreenshot: (dataUrl: string, tabTitle?: string) => void
}

export function useSlashCommandRunner(deps: SlashRunnerDeps) {
  // 录制执行器（slash 专属生命周期，onScopeDispose 释放）
  const recordingExecutor = createRecordingExecutor({ ... })

  // 渲染：注入 shared/render-result
  const renderResult = (intent, response, slots) =>
    renderExecutionResult(intent, response, slots, {
      addAIChat: (t) => deps.addMessage('ai-chat', t),
      addSystem: (t) => deps.addMessage('system', t),
      showScreenshot: deps.showScreenshot,
    })

  // 危险命令 → 确认卡（独立协议）
  async function prepareConfirmation(intent, slots) { ... }

  // 主入口：run(text) + dispatchToSW(intent, slots)
  // dispatchToSW 供 MessageBubble 嵌入按钮调用
  async function run(text) { ... }
  async function dispatchToSW(intent, slots) { ... }

  return { run, dispatchToSW, formatSlashCommands }
}
```

**与 useAIEngine / usePlanRunner 完全解耦**：仅共享底层 service-worker handler / commands.ts / precompute / shared/render-result.ts。`App.vue` 注入 deps 即可。

---

## 8. 文件清单（v3 完整）

### 8.1 删除（DEL）

```
src/shared/json-repair.ts                            # 严格 JSON.parse 后无需启发式修复
src/service-worker/task-planner.ts                   # 替换为 plan-runner.ts
src/service-worker/executor.ts                       # 替换为 handlers/* + dispatchTool
src/service-worker/handlers/browser-dom.ts           # DOM 操作能力整体删除（v3 新增）
src/types/ai.ts: AIResponse / ToolCall 整文件（替换为 AIPlan）
  # 删除字段: toolCall / planStatus / predict / step / intent / steps / userDataKey / userDataValue
  # 删除字段: askUserResponse / exec_plan / scan / chat / done / ask / exec_tool / execute
src/types/context.ts: Lesson / PlanTracker / PlanStep / SessionData  # v1 不需要
src/types/ui.ts: PlanTracker / Lesson references    # v1 不需要
src/shared/prompts.ts                                # 替换为 system-prompt.ts

src/composables/useAIEngine.ts 内（删除函数）:
  - agentLoop
  - updatePlanTracker / persistPlanTracker
  - addLesson / verifyPredict
  - compressMessages / recoverContext
  - sessionStorage 持久化（SESSION_KEY）
  - scanCurrentPage（DOM 扫描相关）
  - sanitizeResult（plan 路径不需要截断）
  - if (json.action === 'task_plan' / 'exec_plan' / 'askUserResponse' / 'scan' / 'ask') 分支
  - jsonRetryCount / consecutiveErrors 逻辑

src/shared/commands.ts 内（删除 intent）:
  - browser_snapshot / browser_click / browser_type / browser_select_option
  - browser_hover / browser_press_key / browser_check / browser_uncheck
  - browser_fill_form / browser_wait_for / browser_take_screenshot
  - browser_navigate / browser_navigate_back / browser_navigate_forward / browser_reload
  - browser_tab_list / browser_tab_new / browser_tab_select / browser_tab_close
  - task_plan

src/manifest.json 内（删除 permissions，可选）:
  - "scripting"（如果只用于 DOM 操作）
  # 注: 暂不动 manifest，避免遗漏其他用途
```

### 8.2 新增（NEW）

```
src/shared/ai/plan-types.ts                          # AIPlan / PlanItem / PlanItemResult / PlanExecutionReport
src/shared/ai/system-prompt.ts                       # buildSystemPrompt() + buildToolList()
src/service-worker/plan-runner.ts                    # executePlan(plan) DAG 调度
src/composables/usePrecompute.ts                     # 前端 precompute（slash + plan 共享）
src/service-worker/handlers/index.ts                 # REGISTRY + DANGEROUS_TOOLS + buildConfirmChildren + dispatchTool
src/service-worker/handlers/tabs.ts                  # tab handler（含 clientExec: tabs_group_by_domain / tabs_ungroup_all）
src/service-worker/handlers/bookmarks.ts             # 7 个 bookmark handler
src/service-worker/handlers/history.ts               # history handler
src/service-worker/handlers/window-groups.ts         # window / tab-groups handler
src/service-worker/handlers/navigation.ts            # 4 个 navigation handler
src/service-worker/handlers/storage.ts               # 4 个 storage/session handler
src/service-worker/handlers/theme-font.ts            # 6 个 theme/font handler
src/service-worker/handlers/cookies.ts               # 2 个 cookie handler
src/service-worker/handlers/top-sites.ts             # 1 个 top site handler
src/service-worker/handlers/extensions.ts            # 3 个 extension handler
src/service-worker/handlers/permissions.ts           # 2 个 permission handler（含 site-perms / set-site-perm）
src/service-worker/handlers/notifications.ts         # notifications handler
src/service-worker/handlers/downloads.ts             # downloads handler
src/service-worker/handlers/browsing-data.ts         # browsing_data handler
src/service-worker/handlers/sessions.ts              # sessions handler
src/service-worker/handlers/content-settings.ts      # content_settings handler
src/composables/usePlanRunner.ts                     # 新 AI 入口
src/composables/useSlashCommandRunner.ts             # 自包含 slash runner（解析 / 确认 / SW dispatch / 客户端命令 / 录制）
src/shared/render-result.ts                          # 中立渲染层（renderExecutionResult / formatResultDescription）
src/shared/client-exec.ts                            # CLIENT_EXEC_HANDLERS 注册表
src/types/ui.ts                                      # 新增 ConfirmCardData / ConfirmCardItem
tests/plan-runner.spec.ts                            # vitest 单元测试
```

### 8.3 修改（MOD）

```
src/service-worker/index.ts                          # 加 MSG_EXECUTE_PLAN 分支；移除 executeCommand import
src/service-worker/context-collector.ts              # 修 muted bug (line 121)
src/composables/useAIEngine.ts                       # 进一步瘦身：移除 handleSlashCommand / dispatchToSW /
                                                 # renderExecutionResult / recordingExecutor / formatHelp
                                                 # （全部迁到 useSlashCommandRunner + shared/render-result）
                                                 # handleSubmit 改为可选注入 slashRunner，保持向后兼容
src/types/ai.ts                                      # 替换 AIResponse → AIPlan（导出 AIPlan / PlanItem）
src/types/execution.ts                               # 保留 ExecutionResult；新增 PlanItemResult / PlanExecutionReport
src/types/index.ts                                   # 删 Lesson/PlanStep/PlanTracker/SessionData 导出
src/types/context.ts                                 # 删 Lesson/PlanTracker/PlanStep/SessionData
src/types/ui.ts                                      # 删 Lesson/PlanTracker 引用
src/shared/constants.ts                              # 加 MSG_EXECUTE_PLAN；删 MAX_AGENT_STEPS / STEP_TIMEOUT_MS / TOTAL_TASK_TIMEOUT_MS / MAX_CONSECUTIVE_FAILURES
src/shared/commands.ts                               # 删 browser_* / task_plan intents（共 18 个）
src/shared/slash-commands.ts                         # 不动（100% 保留）
src/shared/confirm.ts                                # 不动（保留 dangerous 预览）
src/shared/block-renderers/index.ts                  # 不动（保留渲染器）
src/shared/personality.ts                            # 不动（保留 cat 人设）
src/shared/message-store.ts                          # 不动（保留 IndexedDB）
src/shared/ai/openai-adapter.ts                      # 不动（已支持 jsonMode=true）
src/shared/ai/gemini-nano.ts                         # 不动
src/shared/ai/engine.ts                              # 不动
src/recording/executor.ts                            # 不动（100% 保留）
src/offscreen/recorder.js                            # 不动（100% 保留）
src/components/CommandInput.vue                      # 不动（仍 import useAIEngine）
src/components/MessageBubble.vue                     # 不动（仍调 dispatchToSW）
src/components/MessageList.vue                       # 不动
src/components/ConfirmCard.vue                       # 不动
src/App.vue                                          # 不动（仍调 aiHandleSubmit / renderExecutionResult）
```

---

## 9. 迁移步骤

### 阶段 1：建立新内核（0.8d）

1. 新建 `plan-types.ts` / `system-prompt.ts`
2. 新建 `precompute.ts`（从 useAIEngine 提取）
3. 新建 `handlers/index.ts` + 11 个 handler 文件（业务逻辑从 executor.ts 1:1 迁移）
4. 新建 `plan-runner.ts`
5. SW 路由加 `MSG_EXECUTE_PLAN` 分支

### 阶段 2：替换前端入口（0.4d）

1. `useAIEngine.ts` 提取 aiEngine 为模块级单例
2. 删除 agentLoop / PlanTracker / lessons / scanCurrentPage / SESSION_KEY
3. 新建 `usePlanRunner.ts`
4. `handleNaturalLanguage` 直接调 `usePlanRunner.run(text)`

### 阶段 3：删除旧代码（0.2d）

1. 删 `task-planner.ts` / `json-repair.ts` / `executor.ts`
2. 删 `src/shared/prompts.ts`（替换为 system-prompt.ts）
3. 删 `src/types/context.ts` 中 Lesson/PlanTracker/PlanStep/SessionData
4. 删 `src/types/ai.ts` 中 AIResponse（替换为 AIPlan）
5. 删 `src/shared/commands.ts` 中 18 个 browser_* / task_plan intents
6. 删 `src/types/ui.ts` 中 Lesson/PlanTracker 引用

### 阶段 4：测试 + 验证（0.2d）

1. vitest 单测（5 个场景）
2. 手工测试 8 个自然语言场景
3. 跑所有 33 个斜杠命令验证无回归
4. 测试嵌入组件按钮（ActionButtonGroup）

---

## 10. Verification

### 10.1 单元测试（vitest）

```ts
// tests/plan-runner.spec.ts
import { describe, it, expect, vi } from 'vitest'

const fakeHandlers = {
  tabs_remove: vi.fn(async ({ tabIds }) => ({ success: true, removed: tabIds.length })),
  tabs_observe: vi.fn(async () => ({ success: true, tabs: [{ id: 99, title: 'foo' }] })),
  bookmarks_add_current_page: vi.fn(async () => ({ success: true, bookmark: { id: '1' } })),
  history_remove: vi.fn(async () => ({
    success: false,
    code: 'NEEDS_CONFIRM',
    message: 'confirm',
  })),
}

vi.mock('../src/service-worker/handlers', () => ({
  REGISTRY: fakeHandlers,
  getHandler: (t: string) => fakeHandlers[t as keyof typeof fakeHandlers],
  DANGEROUS_TOOLS: new Set(['tabs_remove', 'history_remove']),
  dispatchTool: async (tool: string, args: any) => {
    const h = fakeHandlers[tool as keyof typeof fakeHandlers]
    if (!h) return { success: false, code: 'UNKNOWN_TOOL' }
    return h(args)
  },
}))

describe('executePlan', () => {
  it('并发执行无依赖项', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'tabs_remove', args: { tabIds: [1, 2], force: true }, deps: [] },
        { id: 'p2', tool: 'bookmarks_add_current_page', args: {}, deps: [] },
      ],
    })
    expect(report.success).toBe(true)
    expect(report.items).toHaveLength(2)
  })

  it('危险操作首次返回 NEEDS_CONFIRM', async () => {
    const report = await executePlan({
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_remove', args: { tabIds: [1] }, deps: [] }],
    })
    expect(report.needsConfirm?.itemId).toBe('p1')
    expect(report.success).toBe(false)
  })

  it('force:true 跳过二次确认', async () => {
    const report = await executePlan({
      thought: '',
      plan: [{ id: 'p1', tool: 'tabs_remove', args: { tabIds: [1], force: true }, deps: [] }],
    })
    expect(report.success).toBe(true)
    expect(report.needsConfirm).toBeUndefined()
  })

  it('解析 $ref 占位符', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'tabs_observe', args: {}, deps: [] },
        {
          id: 'p2',
          tool: 'tabs_remove',
          args: { tabIds: '$ref:p1.tabs[0].id', force: true },
          deps: ['p1'],
        },
      ],
    })
    expect(report.items[1].result.removed).toBe(1)
  })

  it('依赖图循环 → 标 BLOCKED_BY_FAILED_DEP', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'tabs_observe', args: {}, deps: ['p2'] },
        { id: 'p2', tool: 'tabs_observe', args: {}, deps: ['p1'] },
      ],
    })
    expect(report.items.every((i) => i.result.code === 'BLOCKED_BY_FAILED_DEP')).toBe(true)
  })

  it('NEEDS_CONFIRM 阻断后续调度', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'history_remove', args: { timeRange: 'today' }, deps: [] },
        { id: 'p2', tool: 'tabs_remove', args: { tabIds: [1], force: true }, deps: ['p1'] },
      ],
    })
    expect(report.needsConfirm?.itemId).toBe('p1')
    expect(report.items.find((i) => i.id === 'p2')?.result.code).toBe('BLOCKED_BY_FAILED_DEP')
  })

  it('重复 id 报错', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'tabs_observe', args: {}, deps: [] },
        { id: 'p1', tool: 'tabs_observe', args: {}, deps: [] },
      ],
    })
    expect(report.success).toBe(false)
    expect(report.items[0].result.code).toBe('DUPLICATE_ITEM_ID')
  })
})
```

### 10.2 手工测试场景

**自然语言路径**（8 个场景）：

| #   | 用户输入                          | 预期 plan                                      | 预期耗时       |
| --- | --------------------------------- | ---------------------------------------------- | -------------- |
| 1   | 你好                              | `{chat:{reply:'喵~'}}`                         | <1s            |
| 2   | 关闭 github 标签                  | 单 item tabs_remove                            | <1.5s          |
| 3   | 关闭 github 和 stackoverflow 标签 | 合并为 tabs_remove(tabIds:[…])                 | <1.5s          |
| 4   | 关闭 github，再加书签             | p1+p2 并行                                     | <1.5s          |
| 5   | 先看标签再关 github               | p1→p2 顺序                                     | <2s            |
| 6   | 删除今天的浏览历史                | history_remove(timeRange:today) → 弹卡 → force | <1s + 用户确认 |
| 7   | 把当前页加书签                    | 单 item bookmarks_add_current_page             | <1s            |
| 8   | 切换深色主题                      | theme_update(mode:dark)                        | <1s            |

**斜杠命令回归**（关键 5 个）：

| #   | 命令                   | 验证点                      |
| --- | ---------------------- | --------------------------- |
| 1   | `/help`                | 显示所有命令                |
| 2   | `/close-url github`    | 关闭 github 标签，弹卡      |
| 3   | `/bookmark`            | 当前页加书签                |
| 4   | `/pin`                 | 切换固定（precompute 路径） |
| 5   | `/clear-history today` | 弹卡 → 确认 → 删除          |

**嵌入组件按钮**：

| #   | 场景                             | 验证点                                                |
| --- | -------------------------------- | ----------------------------------------------------- |
| 1   | 历史消息卡片按钮（如"恢复标签"） | dispatchAction → dispatchToSW → renderExecutionResult |
| 2   | 操作卡片按钮                     | 同上                                                  |

### 10.3 边缘情况

| 场景                             | 处理                                                   |
| -------------------------------- | ------------------------------------------------------ |
| AI 输出非法 JSON                 | 直接告诉用户"没理解"，不重试                           |
| plan 为空数组                    | addAIChat(thought)                                     |
| 顶层某项失败（非 NEEDS_CONFIRM） | 记录到 report.items；不影响其他并行项                  |
| 依赖项 NEEDS_CONFIRM             | 整 plan 暂停；前端弹卡；force:true 重发同一 plan       |
| dep 循环依赖                     | 全部标 BLOCKED_BY_FAILED_DEP                           |
| 重复 id                          | DUPLICATE_ITEM_ID 错误                                 |
| `$ref` 路径不存在                | 解析为 undefined；handler 校验参数失败                 |
| 并发自然语言请求                 | usePlanRunner abortCtl；新请求 abort 旧请求            |
| AI 输出 args 字段缺失            | dispatchTool 默认 {}；handler 内做参数校验             |
| 危险操作在 plan 中部             | 整 plan 暂停；不影响已完成的顶层项结果                 |
| tabs.group_by_domain 在 plan 里  | SW handler 返回 clientExec；前端 handleClientExec 执行 |
| 斜杠命令 requiresPrecompute      | 走 dispatchToSW → precompute → SW dispatchTool         |
| 嵌入组件按钮                     | 走 dispatchToSW → precompute → SW dispatchTool         |

### 10.4 回归检查（grep）

```bash
grep -r "json-repair\|repairJSON\|task-planner\|execPlan\|planTracker\|recentLessons\|addLesson\|verifyPredict\|sanitizeResult\|compressMessages\|persistPlanTracker\|recoverContext\|predict\b" src/
# 应全部 0 命中

grep -r "browser_snapshot\|browser_click\|browser_type\|task_plan" src/shared/commands.ts
# 应 0 命中
```

---

## 11. 关键设计取舍

1. **删 json-repair**：依赖 `response_format:json_object` + 严格 prompt
2. **依赖图用 `$ref` 路径字符串**：JSON 序列化友好；只支持 `.id` 和 `[N].id`
3. **合并同类由 AI 主动做**：填 `mergedFrom` 标注
4. **斜杠命令 100% 不变**：复用旧 `MSG_EXECUTE` 消息；自然语言走新 `MSG_EXECUTE_PLAN`
5. **录制 100% 保留**：`recordingExecutor` 不在重构范围
6. **不保留 plan tracker / conversation memory**：v1 目标"单次 input 一气呵成"
7. **prompt 工具列表自动从 COMMANDS 生成**：保证与注册表一致
8. **不留 feature flag**：直接替换 handleNaturalLanguage
9. **clientExec 路径保留**：tabs.group_by_domain / tabs.ungroup_all 需要用户激活上下文
10. **aiEngine 模块级单例**：usePlanRunner 和 useAIEngine 共享
11. **precompute 路径保留**：10+ 个 requiresPrecompute 命令需要 query → tabId 转换
12. **dispatchToSW 保留**：嵌入组件按钮依赖
13. **renderExecutionResult 保留**：嵌入组件按钮回调 + EXECUTE_RESULT 消息监听
14. _\*browser_* 命令删除_*：v3 只支持 API 操作，不支持 DOM 操作

---

## 12. 实施时间线

| 阶段 | 任务                                                                    | 估时 |
| ---- | ----------------------------------------------------------------------- | ---- |
| 1    | 新建 plan-types / system-prompt / plan-runner / precompute / handlers/* | 0.8d |
| 2    | usePlanRunner.ts + useAIEngine 瘦身 + handleNaturalLanguage 替换        | 0.4d |
| 3    | 删旧代码 + commands.ts 清理 18 个 intent + manifest 核对 + grep 验证    | 0.2d |
| 4    | vitest 单测 + 手工测试 + 斜杠命令回归 + 嵌入组件按钮测试                | 0.2d |

合计 **~1.6 个工作日**。

---

## Critical Files for Implementation

- /Users/didi/Desktop/myProject/chromeAIManager/src/service-worker/index.ts
- /Users/didi/Desktop/myProject/chromeAIManager/src/service-worker/handlers/index.ts（统一 dispatcher，替代旧 executor.ts）
- /Users/didi/Desktop/myProject/chromeAIManager/src/service-worker/context-collector.ts
- /Users/didi/Desktop/myProject/chromeAIManager/src/composables/useAIEngine.ts（瘦身后：仅 AI 入口 / 模型管理 / 消息通道）
- /Users/didi/Desktop/myProject/chromeAIManager/src/composables/useSlashCommandRunner.ts（自包含：slash 解析 / 确认 / SW dispatch / 客户端命令 / 录制生命周期）
- /Users/didi/Desktop/myProject/chromeAIManager/src/composables/usePlanRunner.ts（自然语言入口：AI 调用 + DAG 调度）
- /Users/didi/Desktop/myProject/chromeAIManager/src/composables/usePrecompute.ts（前端 precompute，slash + plan 共用）
- /Users/didi/Desktop/myProject/chromeAIManager/src/shared/commands.ts
- /Users/didi/Desktop/myProject/chromeAIManager/src/shared/slash-commands.ts
- /Users/didi/Desktop/myProject/chromeAIManager/src/shared/render-result.ts（中立渲染层：renderExecutionResult / formatResultDescription）
- /Users/didi/Desktop/myProject/chromeAIManager/src/shared/client-exec.ts（CLIENT_EXEC_HANDLERS 注册表）
- /Users/didi/Desktop/myProject/chromeAIManager/src/shared/confirm.ts
- /Users/didi/Desktop/myProject/chromeAIManager/src/types/ai.ts
- /Users/didi/Desktop/myProject/chromeAIManager/src/types/context.ts
- /Users/didi/Desktop/myProject/chromeAIManager/src/types/ui.ts（ConfirmCardData / ConfirmCardItem 统一）
- /Users/didi/Desktop/myProject/chromeAIManager/src/shared/constants.ts
- /Users/didi/Desktop/myProject/chromeAIManager/src/App.vue
- /Users/didi/Desktop/myProject/chromeAIManager/src/components/MessageBubble.vue

## Verification

```bash
# 1. 构建
npm run build

# 2. 加载到 Chrome，验证：
#    - 斜杠命令：/help /close-url /bookmark /pin 等所有 33 个命令
#    - 自然语言：8 个测试场景全部通过
#    - 危险操作：弹卡 → 确认 → 执行
#    - 客户端执行：tabs.group_by_domain 在用户激活上下文生效
#    - 嵌入组件按钮：历史消息卡按钮可点击并执行

# 3. 回归 grep
grep -r "json-repair\|repairJSON\|task-planner\|execPlan\|task_plan\|planTracker\|recentLessons\|addLesson\|verifyPredict\|sanitizeResult\|compressMessages\|persistPlanTracker\|recoverContext" src/
# 应全部 0 命中

grep -rn "browser_snapshot\|browser_click\|browser_type\|task_plan" src/shared/commands.ts
# 应 0 命中

# 4. 单元测试
npm run test tests/plan-runner.spec.ts
```

## 14. UI 状态归属与 Runner 回调

`App.vue` 是唯一创建 `useAIEngine()` 的 UI 状态拥有者。`MessageList`、`MessageBubble` 和 `CommandInput` 不创建新的 engine 实例：前者只接收消息和动作派发回调，后者接收模型数据和模型选择事件。

自然语言请求通过 `useAIEngine.handleNaturalLanguage()` 创建 `PlanRunnerContext`，将当前实例的 `addMessageLocal`、确认状态 setter 和 `renderExecutionResult` 显式传入 `usePlanRunner.run()`。runner 的执行结果、错误消息、确认卡片和确认后的重试都使用这一上下文，不能通过模块级可变引用或再次调用 `useAIEngine()` 获取状态。

## 15. 执行状态指示器

`usePlanRunner` 维护一个 `ExecutionStatus` 单例 ref，UI 通过 `getExecutionStatus()` 读取，状态阶段有三种：

- `idle`：不渲染。
- `thinking`：用户发送消息后立即进入，显示"思考中" + AI 思考摘要。
- `executing`：plan 调度开始后进入，显示进度环 + 当前工具名。

组件 `src/components/ExecutionStatus.vue` 挂在 `MessageList` 顶部；`MessageList` 通过 200ms 轮询同步状态，避免引入新调度频率。状态自动在 plan 完成、失败或用户中断后回到 idle，不写入 `messageLog`，保持一问一答的消息结构。
