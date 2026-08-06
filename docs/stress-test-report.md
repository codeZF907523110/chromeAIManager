# AI 浏览器管家 — 压测问题报告

> **生成日期**: 2026-08-05
> **测试范围**: Chrome API 操作、DOM 操作、AI 引擎/对话、UI/交互、命令系统、Service Worker
> **审查方式**: 静态代码分析 + 逐行审查

---

## 问题统计

| 严重程度 | 数量 | 占比 |
|---------|------|------|
| **Critical** | 18 | 20% |
| **Major** | 37 | 41% |
| **Minor** | 35 | 39% |
| **合计** | **90** | 100% |

---

## 一、Critical 问题（18个，优先修复）

### 1.1 Service Worker 崩溃类

#### C01. `confirm()` 在 Service Worker 中不可用
- **文件**: [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) ~L175
- **描述**: `checkDangerousConfirm` 函数中使用了 `confirm()` 弹窗。在 Service Worker 上下文中，`confirm()` 不存在（无 DOM 和 window），调用会抛出 `ReferenceError`，导致所有危险操作（关闭标签、删除书签等）直接崩溃。
- **影响**: 所有危险操作完全不可用

#### C02. `takeScreenshot` 中 `targetId.windowId` 类型错误
- **文件**: [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) ~L533-536
- **描述**: `targetId` 被赋值为 `tab.id`（number 类型），但第 536 行 `targetId.windowId` 将 number 当作对象访问属性，抛出 `TypeError`。
- **影响**: 截图功能完全不可用

#### C03. `new Function(code)` 执行任意代码的安全风险
- **文件**: [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) ~L731-753
- **描述**: `domManipulate` 使用 `new Function(code)` 执行 AI 提供的代码，存在严重安全风险。攻击者可通过 AI 注入恶意代码在用户浏览器中执行任意操作。
- **影响**: 严重安全漏洞

#### C04. 多处 `tab.id!` 非空断言可能崩溃
- **文件**: [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) ~L237, L259, L282, L402, L547
- **描述**: `updateTab`、`removeTabs`、`ungroupTabs`、`openBookmark`、`setZoom` 等多处使用 `active.id!` 非空断言。当活动标签查询返回空数组时，`active` 为 `undefined`，`active.id!` 抛出 `TypeError`。
- **影响**: 多个标签操作在无活动标签时崩溃

#### C05. `moveTabs`/`removeTabs` 中 `payload.tabIds` 无空值检查
- **文件**: [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) ~L248-263
- **描述**: `payload.tabIds` 可能为 `undefined`，但使用 `tabIds!` 非空断言传递给 `chrome.tabs.move/remove`，没有任何 try-catch 保护。
- **影响**: 标签移动/关闭操作可能崩溃

### 1.2 AI 引擎功能失效类

#### C06. Agent 系统提示词中标签页信息丢失
- **文件**: [prompts.ts](file:///d:/vue+node/chromeAIManager/src/shared/prompts.ts) ~L43-51
- **描述**: `buildAgentSystemPrompt()` 中 `formatTruncated`/`formatFull` 的返回值没有被赋值或拼接到返回字符串中。**标签页列表信息永远不会出现在系统提示词中**，Agent 无法感知浏览器标签页状态。
- **影响**: Agent 无法获取标签页信息，核心功能失效

#### C07. `chatWithHistory()` 降级逻辑中 `messages` 为空数组时崩溃
- **文件**: [engine.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/engine.ts) ~L72-74
- **描述**: 当 `backend.chatWithMessages` 不存在时，降级逻辑取 `messages[messages.length - 1]`，如果 `messages` 为空数组，`last` 为 `undefined`，访问 `last.content` 抛出 `TypeError`。
- **影响**: 空对话时 AI 调用崩溃

#### C08. OpenAI 适配器强制 JSON mode 破坏兼容性
- **文件**: [openai-adapter.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.ts) ~L48
- **描述**: 强制 `response_format: { type: 'json_object' }`，但 Ollama、LM Studio 等非 OpenAI 服务可能不支持 JSON mode，导致 400 错误。且 JSON mode 会限制普通文本输出场景。
- **影响**: 与多个第三方 AI 服务的兼容性问题

#### C09. Gemini Nano session 复用导致系统提示词被覆盖
- **文件**: [gemini-nano.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/gemini-nano.ts) ~L24-26
- **描述**: `chat()` 复用已有 session，但 `systemPrompt` 可能和创建 session 时不同。第二次调用传入不同的 `systemPrompt`，但 session 已用旧的创建，新的 `systemPrompt` 被忽略。
- **影响**: 多轮对话上下文不一致

### 1.3 UI 功能失效类

#### C10. `App.vue` 中 `isSettingsOpen` 响应式丢失
- **文件**: [App.vue](file:///d:/vue+node/chromeAIManager/src/App.vue) ~L284
- **描述**: `const isSettingsOpen = state.isSettingsOpen` 将 getter 值赋给局部常量，模板中的 `v-if="isSettingsOpen"` 永远不会响应式更新。**设置面板完全无法打开**。
- **影响**: 设置面板功能完全失效

#### C11. `MessageBubble.vue` 中 `marked.parse()` 异步兼容性问题
- **文件**: [MessageBubble.vue](file:///d:/vue+node/chromeAIManager/src/components/MessageBubble.vue) ~L26
- **描述**: `marked` v5+ 中 `marked.parse()` 返回 `Promise<string>` 而非 `string`。如果项目依赖的 `marked` 是 v5+，`processedText` 将是一个 Promise 对象，`v-html` 渲染为 `"[object Promise]"`，**所有 AI 消息的 Markdown 渲染都会失败**。
- **影响**: 所有 AI 消息渲染失败

#### C12. `MessageBubble.vue` 中 `v-html` XSS 安全漏洞
- **文件**: [MessageBubble.vue](file:///d:/vue+node/chromeAIManager/src/components/MessageBubble.vue) ~L3
- **描述**: `v-html="processedText"` 直接渲染 `marked.parse()` 输出的 HTML，可能包含 `<script>`、`<img onerror>` 等危险内容。建议使用 `DOMPurify` 净化。
- **影响**: 严重 XSS 安全漏洞

#### C13. `App.vue` 中 `handleSubmit` 去重逻辑失效
- **文件**: [App.vue](file:///d:/vue+node/chromeAIManager/src/App.vue) ~L362-365
- **描述**: `lastSubmittedText = ''` 在 `aiHandleSubmit(text)` 执行前立即执行，导致去重逻辑永远不生效。连续快速提交时完全无法阻止重复。
- **影响**: 重复提交防护完全失效

### 1.4 安全漏洞类

#### C14. Overlay `postMessage` 未校验 `e.origin`
- **文件**: [overlay.js](file:///d:/vue+node/chromeAIManager/src/content/overlay.js) ~L106-107, L143-147
- **描述**: `window.addEventListener("message", ...)` 未验证 `e.origin`，任何网页（包括恶意页面）都可以发送 `postMessage` 触发截图复制或关闭 overlay。
- **影响**: 严重安全漏洞

#### C15. `manifest.json` 暴露 `service-worker.js` 到所有 URL
- **文件**: [manifest.json](file:///d:/vue+node/chromeAIManager/manifest.json) ~L65
- **描述**: `web_accessible_resources` 中暴露了 `service-worker.js` 到 `<all_urls>`，攻击者可通过 `chrome-extension://<id>/service-worker.js` 读取 Service Worker 源码。
- **影响**: 源码泄露风险

#### C16. `dom_manipulate` 命令未标记为危险操作
- **文件**: [commands.ts](file:///d:/vue+node/chromeAIManager/src/shared/commands.ts) ~L609-620
- **描述**: `dom_manipulate` 允许执行任意 JavaScript 代码，但标记为 `dangerous: false`，AI 可绕过安全确认直接执行危险操作。
- **影响**: 安全绕过风险

### 1.5 录制功能失效类

#### C17. `recorder.js` 中 `getUserMedia` 的 `audio` 约束使用 `mandatory` 导致崩溃
- **文件**: [recorder.js](file:///d:/vue+node/chromeAIManager/src/offscreen/recorder.js) ~L29-47
- **描述**: `getUserMedia` 的 `audio` 约束使用 `mandatory` 属性，但 tab 录制的音频约束不支持 `mandatory` 对象，会导致 `OverconstrainedError`。
- **影响**: 标签页录制功能完全不可用

#### C18. 斜杠命令 `buildSlots` 字段名错误
- **文件**: [slash-commands.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/slash-commands.ts) ~L427-432
- **描述**: `delete_history`、`sort_tabs`、`zoom_tab` 三个命令的 `buildSlots` 将参数错误地存入 `slots.name`，但实际需要 `slots.timeRange`/`slots.order`/`slots.direction`。导致这些命令功能完全失效，同时 `confirm.ts` 中的 `delete_history` 预览始终显示为"今天"。
- **影响**: 3个斜杠命令功能完全失效

---

## 二、Major 问题（37个）

### 2.1 Service Worker 问题

| ID | 文件 | 行号 | 描述 |
|----|------|------|------|
| M01 | [index.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/index.ts) | 5 | `@ts-nocheck` 禁用全局类型检查 |
| M02 | [index.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/index.ts) | 46 | 双重类型断言绕过类型系统 |
| M03 | [index.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/index.ts) | 78,161 | `onInstalled` 监听器注册两次 |
| M04 | [index.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/index.ts) | 134 | `tab.id` 可能为 `undefined` |
| M05 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 4 | `@ts-nocheck` 禁用全局类型检查 |
| M06 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 322 | `groupByDomain` 中 `tabs[0]` 可能为 `undefined` |
| M07 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 455 | `searchHistory` 中 `startTime` 可能为 `NaN` |
| M08 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 517 | `navigateTo` 中 `url` 可能为空或无效 |
| M09 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 561 | `chrome.settings.private` 可能不存在 |
| M10 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 609 | `observeCookies` 中空域名返回所有 Cookie |
| M11 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 686 | `sessionId!` 可能为 `undefined` |
| M12 | [context-collector.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/context-collector.ts) | 4 | `@ts-nocheck` 禁用全局类型检查 |
| M13 | [context-collector.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/context-collector.ts) | 11 | `Promise.all` 一个失败导致整个上下文收集失败 |
| M14 | [context-collector.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/context-collector.ts) | 17 | `currentWindow.tabs` 可能为 `undefined` |
| M15 | [context-collector.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/context-collector.ts) | 113 | `t.id` 可能为 `undefined` |
| M16 | [tab-matcher.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/utils/tab-matcher.ts) | 28 | `normalizeUrl` 异常处理不完善 |

### 2.2 AI 引擎问题

| ID | 文件 | 行号 | 描述 |
|----|------|------|------|
| M17 | [engine.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/engine.ts) | 27 | `checkAvailability()` 缓存失败状态，永不重试 |
| M18 | [engine.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/engine.ts) | 13 | `currentModel: any` 绕过类型检查 |
| M19 | [openai-adapter.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.ts) | 83 | 权限请求可能被浏览器静默拒绝 |
| M20 | [openai-adapter.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.ts) | 33 | 无网络重试逻辑 |
| M21 | [openai-adapter.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.ts) | 21 | `endpoint` URL 未验证合法性 |
| M22 | [openai-adapter.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.ts) | 50 | `fetch` 网络错误未包装友好消息 |
| M23 | [gemini-nano.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/gemini-nano.ts) | 29 | `session.prompt()` 异常处理有竞态问题 |
| M24 | [gemini-nano.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/gemini-nano.ts) | 33 | 第二次 `prompt()` 失败后 session 未清理 |
| M25 | [api-detector.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/api-detector.ts) | 54 | `after-download` 状态未返回可用 |
| M26 | [api-detector.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/api-detector.ts) | 72 | `chrome.aiOriginTrial` 类型不安全 |
| M27 | [json-repair.ts](file:///d:/vue+node/chromeAIManager/src/shared/json-repair.ts) | 48 | 正则修复可能破坏字符串内容 |

### 2.3 UI 交互问题

| ID | 文件 | 行号 | 描述 |
|----|------|------|------|
| M28 | [App.vue](file:///d:/vue+node/chromeAIManager/src/App.vue) | 31 | `pendingConfirm` 渲染竞态风险 |
| M29 | [App.vue](file:///d:/vue+node/chromeAIManager/src/App.vue) | 301 | Gemini Nano 添加时 API Key 校验失败 |
| M30 | [CommandInput.vue](file:///d:/vue+node/chromeAIManager/src/components/CommandInput.vue) | 160 | 空筛选时 Enter 行为不一致 |
| M31 | [MessageList.vue](file:///d:/vue+node/chromeAIManager/src/components/MessageList.vue) | 17 | `scrollTimer` 组件卸载后未清理 |
| M32 | [ParticleCanvas.vue](file:///d:/vue+node/chromeAIManager/src/components/ParticleCanvas.vue) | 100 | `handleResize` 导致多个 `requestAnimationFrame` 循环 |
| M33 | [useAIEngine.ts](file:///d:/vue+node/chromeAIManager/src/composables/useAIEngine.ts) | 393 | `NEEDS_CONFIRM` 分支中 `detail.children` 可能为 `undefined` |
| M34 | [useAIEngine.ts](file:///d:/vue+node/chromeAIManager/src/composables/useAIEngine.ts) | 218 | `agentLoop` 函数过长（300行），可维护性差 |
| M35 | [useSettings.ts](file:///d:/vue+node/chromeAIManager/src/composables/useSettings.ts) | 15 | `readonly` 返回类型与消费方不匹配 |

### 2.4 Content Script / Manifest 问题

| ID | 文件 | 行号 | 描述 |
|----|------|------|------|
| M36 | [overlay.js](file:///d:/vue+node/chromeAIManager/src/content/overlay.js) | 9 | `document.body` 可能为 `null` |
| M37 | [overlay.js](file:///d:/vue+node/chromeAIManager/src/content/overlay.js) | 97 | `onMessage` 监听器每次打开 overlay 都重复添加 |
| M38 | [manifest.json](file:///d:/vue+node/chromeAIManager/manifest.json) | 7 | 敏感权限过多，审核严格 |
| M39 | [manifest.json](file:///d:/vue+node/chromeAIManager/manifest.json) | 23 | `privacy` 权限未使用 |
| M40 | [manifest.json](file:///d:/vue+node/chromeAIManager/manifest.json) | 65 | `web_accessible_resources` 暴露过多文件 |

### 2.5 命令系统问题

| ID | 文件 | 行号 | 描述 |
|----|------|------|------|
| M41 | [slash-commands.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/slash-commands.ts) | 371 | 输入仅为 `/` 时匹配异常 |
| M42 | [slash-commands.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/slash-commands.ts) | 453 | `get_theme` 的 `buildSlots` 逻辑错误 |
| M43 | [confirm.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/confirm.ts) | 47 | `close_tabs_by_domain` 空域名匹配所有标签 |
| M44 | [confirm.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/confirm.ts) | 68 | `close_other_tabs` 中 `active` 可能为 `undefined` |
| M45 | [dom-commander.js](file:///d:/vue+node/chromeAIManager/src/content/dom-commander.js) | 8 | `MAX_ELEMENTS_COUNT` 与常量定义不一致（300 vs 80） |
| M46 | [dom-commander.js](file:///d:/vue+node/chromeAIManager/src/content/dom-commander.js) | 12 | `querySelectorAll("*")` 全量扫描性能问题 |

### 2.6 旧版 JS 实现问题

| ID | 文件 | 行号 | 描述 |
|----|------|------|------|
| M47 | [index.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/index.js) | 27 | `document.getElementById` 元素不存在时崩溃 |
| M48 | [index.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/index.js) | 67 | `onMessage` 监听器未移除（HMR 泄漏） |
| M49 | [index.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/index.js) | 202 | `setTimeout` 轮询 `_activeLoopId` 不可靠 |
| M50 | [index.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/index.js) | 432 | 重复的 `NEEDS_CONFIRM` 检查（死代码） |
| M51 | [index.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/index.js) | 853 | `showPalette` 点击监听器泄漏 |

---

## 三、Minor 问题（35个）

### 3.1 边界处理与代码健壮性

| ID | 文件 | 行号 | 描述 |
|----|------|------|------|
| m01 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 296 | `tab.groupId !== -1 ? 'gray' : 'gray'` 冗余判断 |
| m02 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 498 | `removeHistory` 返回 `deleted` 可能不准确 |
| m03 | [executor.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.ts) | 572 | `observeFontSize` 返回值可能不兼容 |
| m04 | [context-collector.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/context-collector.ts) | 85 | 过滤操作重复遍历 |
| m05 | [context-collector.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/context-collector.ts) | 67 | `MAX_TABS` 硬编码截断信息丢失 |
| m06 | [tab-matcher.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/utils/tab-matcher.ts) | 15 | `normalizeUrl` 无效 URL 返回原始字符串 |
| m07 | [index.ts](file:///d:/vue+node/chromeAIManager/src/service-worker/index.ts) | 117 | `setPanelBehavior` 缺少错误处理 |
| m08 | [engine.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/engine.ts) | 84 | `detectAICapability()` 重复调用 |
| m09 | [openai-adapter.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.ts) | 80 | 权限检查未缓存 |
| m10 | [openai-adapter.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.ts) | 35 | `timeout: 0` 被 `||` 覆盖 |
| m11 | [openai-adapter.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.ts) | 68 | API Key 可能通过错误消息泄露 |
| m12 | [gemini-nano.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/gemini-nano.ts) | 44 | `AI_CAPABILITIES.NONE` 未处理 |
| m13 | [api-detector.ts](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/api-detector.ts) | 55 | 异常被静默吞掉 |
| m14 | [json-repair.ts](file:///d:/vue+node/chromeAIManager/src/shared/json-repair.ts) | 44 | 尾部逗号修复不完整 |
| m15 | [json-repair.ts](file:///d:/vue+node/chromeAIManager/src/shared/json-repair.ts) | 52 | 解析失败错误信息不包含原文 |
| m16 | [prompts.ts](file:///d:/vue+node/chromeAIManager/src/shared/prompts.ts) | 168 | `||` 应改为 `??` |
| m17 | [prompts.ts](file:///d:/vue+node/chromeAIManager/src/shared/prompts.ts) | 180 | 属性值可能包含双引号破坏格式 |

### 3.2 UI 细节问题

| ID | 文件 | 行号 | 描述 |
|----|------|------|------|
| m18 | [App.vue](file:///d:/vue+node/chromeAIManager/src/App.vue) | 322 | `handleSaveEdit` 缺少表单验证 |
| m19 | [App.vue](file:///d:/vue+node/chromeAIManager/src/App.vue) | 329 | `handleDeleteModel` 无确认对话框 |
| m20 | [App.vue](file:///d:/vue+node/chromeAIManager/src/App.vue) | 368 | `onMounted` 中异步调用未 catch |
| m21 | [CommandInput.vue](file:///d:/vue+node/chromeAIManager/src/components/CommandInput.vue) | 149 | 空筛选时 `ArrowDown` 索引越界 |
| m22 | [CommandInput.vue](file:///d:/vue+node/chromeAIManager/src/components/CommandInput.vue) | 206 | `handleSelectModel` 异步无异常处理 |
| m23 | [MessageList.vue](file:///d:/vue+node/chromeAIManager/src/components/MessageList.vue) | 3 | `v-for` 使用 `index` 作为 `key` |
| m24 | [MessageBubble.vue](file:///d:/vue+node/chromeAIManager/src/components/MessageBubble.vue) | 14 | `marked.setOptions` 全局配置冲突 |
| m25 | [ConfirmCard.vue](file:///d:/vue+node/chromeAIManager/src/components/ConfirmCard.vue) | 36 | `handleConfirm` 失败未通知用户 |
| m26 | [ConfirmCard.vue](file:///d:/vue+node/chromeAIManager/src/components/ConfirmCard.vue) | 47 | `onCancel` 可能为 `undefined` |
| m27 | [ParticleCanvas.vue](file:///d:/vue+node/chromeAIManager/src/components/ParticleCanvas.vue) | 37 | `canvas.getContext('2d')` 可能为 `null` |
| m28 | [main.ts](file:///d:/vue+node/chromeAIManager/src/main.ts) | 12 | 注册了未使用的 Element Plus 图标 |
| m29 | [useAIEngine.ts](file:///d:/vue+node/chromeAIManager/src/composables/useAIEngine.ts) | 577 | `AI 不可用: undefined` 显示问题 |
| m30 | [useAIEngine.ts](file:///d:/vue+node/chromeAIManager/src/composables/useAIEngine.ts) | 586 | 确认卡片突然消失 |
| m31 | [useAIEngine.ts](file:///d:/vue+node/chromeAIManager/src/composables/useAIEngine.ts) | 693 | `new URL(t.url)` 中 `t.url` 可能为 `undefined` |
| m32 | [useAIEngine.ts](file:///d:/vue+node/chromeAIManager/src/composables/useAIEngine.ts) | 1361 | `mdToHtml` 函数未使用 |
| m33 | [useCommandHistory.ts](file:///d:/vue+node/chromeAIManager/src/composables/useCommandHistory.ts) | 35 | 历史导航边界未重置索引 |
| m34 | [useCommandHistory.ts](file:///d:/vue+node/chromeAIManager/src/composables/useCommandHistory.ts) | 60 | `|| ''` 覆盖空字符串历史 |
| m35 | [index.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/index.js) | 1220 | `postMessage` 使用 `'*'` 作为 targetOrigin |

---

## 四、按模块汇总

| 模块 | Critical | Major | Minor | 合计 |
|------|---------|-------|-------|------|
| **Service Worker** (index/executor/context-collector/tab-matcher) | 5 | 12 | 5 | 22 |
| **AI 引擎** (engine/openai-adapter/gemini-nano/api-detector) | 3 | 10 | 7 | 20 |
| **共享模块** (constants/commands/prompts/json-repair) | 2 | 1 | 5 | 8 |
| **Vue UI** (App.vue/components/composables) | 3 | 7 | 14 | 24 |
| **Content Scripts** (dom-commander/overlay) | 2 | 3 | 3 | 8 |
| **Offscreen** (recorder.js) | 1 | 2 | 1 | 4 |
| **命令系统** (slash-commands/confirm) | 2 | 5 | 3 | 10 |
| **Manifest** | 1 | 2 | 0 | 3 |

---

## 五、修复建议优先级

### 第一优先级（P0 — 崩溃/安全/功能完全失效）

1. **C01** — `confirm()` 在 SW 中不可用 → 改为通过 `chrome.runtime.sendMessage` 向 Side Panel 发送确认请求
2. **C02** — `targetId.windowId` 类型错误 → 改为 `captureVisibleTab(tab.windowId!)`
3. **C06** — `prompts.ts` 中 `formatTruncated`/`formatFull` 结果未使用 → 将结果拼接到 system prompt 中
4. **C10** — `isSettingsOpen` 响应式丢失 → 直接使用 `state.isSettingsOpen` 或解构为 `ref`
5. **C11** — `marked.parse()` 异步 → 使用 `await marked.parse()` 或锁定 marked v4.x
6. **C12** — `v-html` XSS 漏洞 → 引入 `DOMPurify` 净化 HTML
7. **C14** — `postMessage` 未校验 origin → 验证 `e.origin === chrome.runtime.getURL('')` 的 origin
8. **C18** — 斜杠命令 `buildSlots` 字段名错误 → 修正为正确的 slot 字段名

### 第二优先级（P1 — 功能异常/严重风险）

9. **C03** — `new Function(code)` 安全风险 → 限制执行上下文，或只允许白名单操作
10. **C04** — 多处 `tab.id!` 非空断言 → 添加 `if (!tab) return error` 保护
11. **C07** — 空数组降级崩溃 → 添加 `if (!messages.length) return error`
12. **C08** — 强制 JSON mode → 改为可选，或根据 provider 动态选择
13. **C09** — Gemini Nano session 复用 → 每次 `chat()` 时重建 session 或检查 systemPrompt 是否变化
14. **C13** — 去重逻辑失效 → 将 `lastSubmittedText = ''` 移到 `aiHandleSubmit` 完成后
15. **C15** — `service-worker.js` 暴露 → 从 `web_accessible_resources` 移除
16. **C16** — `dom_manipulate` 未标记危险 → 改为 `dangerous: true`
17. **C17** — 录制 `audio` 约束错误 → 移除 `mandatory` 或使用正确约束格式

### 第三优先级（P2 — 健壮性/兼容性/优化）

18. 所有 `@ts-nocheck` 移除并修复类型
19. 所有 `Promise.all` 改为 `Promise.allSettled`
20. 所有缺少 try-catch 的 Chrome API 调用添加错误处理
21. `ParticleCanvas.vue` resize 动画循环泄漏
22. `overlay.js` 监听器累积问题
23. `index.js` palette 事件监听器泄漏
24. 其余 Minor 问题

---

## 六、建议修复顺序

```
Phase 1 (P0): 修复 8 个 Critical 崩溃/安全/功能失效问题
  → 确保基本功能可用

Phase 2 (P1): 修复 9 个 Critical 功能异常/严重风险问题
  → 确保功能完整性和安全性

Phase 3 (P2): 修复所有 Major 问题
  → 提升健壮性和兼容性

Phase 4 (P3): 修复所有 Minor 问题
  → 代码质量和用户体验优化
```