# AI Browser Commander — 反向技术方案文档

> 本文档通过逆向分析项目源码生成，描述系统的技术架构、设计理念、核心模块和数据流。
>
> **项目名称**: AI Browser Commander (AI 浏览器管家)
> **项目类型**: Chrome 扩展 (Manifest V3)
> **核心定位**: 键盘驱动的 AI 浏览器命令中心，用自然语言管理标签、书签和浏览会话

---

## 一、技术栈概览

| 层级 | 技术选型 |
|------|---------|
| 扩展类型 | Chrome Extension (Manifest V3) |
| 前端框架 | Vue 3 (Composition API) |
| UI 组件库 | Element Plus |
| 样式方案 | Tailwind CSS + 内联 CSS |
| 构建工具 | Vite + 自定义 Chrome 扩展插件 |
| 脚本语言 | TypeScript (SW/前端) + JavaScript (Content Script) |
| AI 接入 | Gemini Nano (本地) + OpenAI 兼容 API (远程) |

### 关键技术约束

- **最低 Chrome 版本**: 125（因使用了 Side Panel API 和 window.ai）
- **扩展最小权限**: `tabs`, `bookmarks`, `sessions`, `storage`, `scripting` 等 17 项
- **Host 权限**: `<all_urls>`（全域名访问）

---

## 二、架构总览

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome 浏览器                              │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │  当前标签页    │    │  Side Panel UI   │    │ Service Worker │ │
│  │              │    │   (Vue 3 应用)    │    │  (后台常驻)    │ │
│  │  Content     │◄──►│                  │◄──►│               │ │
│  │  Script      │    │  ┌────────────┐  │    │  ┌──────────┐ │ │
│  │  (DOM 操作)  │    │  │ AI Engine  │  │    │  │ Executor │ │ │
│  │              │    │  │  (编排层)   │  │    │  │ (命令路由)│ │ │
│  │  dom-        │    │  └─────┬──────┘  │    │  └────┬─────┘ │ │
│  │  commander   │    │        │          │    │       │       │ │
│  └──────────────┘    │   ┌────▼─────┐    │    │       ▼       │ │
│                      │   │ AI 适配器 │    │    │  Chrome API   │ │
│                      │   │ (双后端)  │    │    │  (Tabs/Book/  │ │
│                      │   └──────────┘    │    │   History...) │ │
│                      └──────────────────┘    └───────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计哲学

项目的核心理念是 **"AI 是唯一决策者，代码只做机械执行"**：

| 角色 | 职责 |
|------|------|
| **AI Agent** | 观察、思考、计划、执行、验证的全部决策 |
| **Content Script** | 纯机械的 DOM 扫描和元素操作，不做业务判断 |
| **Service Worker** | 纯管道，接收命令并调用 Chrome API，原样返回结果 |
| **Side Panel** | Agent Loop 编排 + 状态管理，是 AI 与执行层之间的调度器 |

### 2.3 通信模式

```
Side Panel (Vue)
    │
    ├──→ chrome.runtime.sendMessage({ type: 'GET_CONTEXT' })
    │       └──→ Service Worker / context-collector.ts
    │               └──→ chrome.tabs.query() / chrome.bookmarks.getTree()
    │
    ├──→ chrome.tabs.sendMessage({ type: 'PAGE_SCAN' })
    │       └──→ Content Script / dom-commander.js
    │               └──→ DOM query + 序列化
    │
    ├──→ chrome.runtime.sendMessage({ type: 'EXECUTE' })
    │       └──→ Service Worker / executor.ts
    │               └──→ chrome.tabs.* / chrome.bookmarks.* / ...
    │
    └──→ AIEngine.chatWithHistory(messages)
            ├──→ Gemini Nano (window.ai.languageModel)
            └──→ OpenAI Adapter (fetch /v1/chat/completions)
```

---

## 三、模块详解

### 3.1 Service Worker (`src/service-worker/`)

**入口**: `index.ts`
**职责**: 消息路由 + 上下文收集 + 命令派发

#### 消息类型

| 消息名 | 方向 | 用途 |
|--------|------|------|
| `GET_CONTEXT` | SP → SW | 获取浏览器上下文（标签页、书签树等） |
| `GET_BOOKMARKS` | SP → SW | 搜索书签 |
| `EXECUTE` | SP → SW | 执行命令 |
| `SET_DISPLAY_MODE` | SP → SW | 持久化显示模式（sidepanel/popup） |
| `GET_DISPLAY_MODE` | SP → SW | 读取显示模式 |
| `EXECUTE_RESULT` | SW → SP | 异步执行结果（推送） |

#### Context Collector (`context-collector.ts`)

收集浏览器状态信息返回给 Side Panel：

- 当前活动标签页详情（URL、标题、是否静音/固定/休眠）
- 当前窗口所有标签页列表
- 书签树结构（支持搜索和层级遍历）
- URL 黑名单检查（`chrome://`、Web Store 等受保护页面）

### 3.2 Executor (`src/service-worker/executor.ts`)

**职责**: 解析 intent 并调用对应 Chrome API

命令按领域分为 11 个类别：

| 类别 | 命令数 | 示例 |
|------|--------|------|
| TABS | 9 | `tabs_observe`, `tabs_create`, `tabs_remove`, `tabs_group` |
| BOOKMARKS | 7 | `bookmarks_observe_tree`, `bookmarks_create_node`, `bookmarks_remove_node` |
| WINDOWS | 3 | `windows_observe`, `windows_create`, `windows_update` |
| HISTORY | 2 | `history_search`, `history_remove` |
| NAVIGATION | 2 | `navigate`, `screenshot` |
| PAGE | 2 | `zoom`, `downloads_open` |
| THEME | 2 | `theme_observe`, `theme_update` |
| FONT | 4 | `font_size_observe`, `font_size_update`, `font_family_*` |
| COOKIES | 2 | `cookies_observe`, `cookies_remove` |
| EXTENSIONS | 3 | `extensions_observe`, `extensions_update`, `extensions_remove` |
| 其他 | 7 | PERMISSIONS, STORAGE, SESSIONS, DOM, BATCH |

**危险操作处理**: `tabs_remove`、`bookmarks_remove_node`、`history_remove` 等被标记为 `dangerous`，执行前返回 `NEEDS_CONFIRM` 错误码，由前端弹出确认对话框。

**DOM 操作**: 通过 `chrome.scripting.executeScript` 在页面 MAIN world 执行，失败时自动降级到 ISOLATED world（不受 CSP 限制）。

### 3.3 Side Panel (`src/sidepanel/index.js`)

**类型**: 原生 JavaScript（非 Vue，单文件 SPA）
**职责**: Agent Loop 编排、UI 渲染、状态管理

#### Agent Loop 流程

```
agentLoop(userText)
    │
    ├─ 1. 并发控制：中断旧任务
    │
    ├─ 2. 获取上下文 → scanCurrentPage()
    │
    ├─ 3. 构建消息
    │     system: AgentPrompt + 命令列表 + planTracker + lessons + elements[]
    │     user: 【用户指令】{text}
    │
    ├─ 4. 循环（最多 12 步）
    │     ├─ AI.chatWithHistory(messages)
    │     ├─ 解析 AI 响应 { action, thought, toolCall, predict, reply }
    │     │
    │     ├─ action = "exec_tool" → _executeCommand(toolName, args)
    │     ├─ action = "scan" → scanCurrentPage(filter)
    │     ├─ action = "done" → 清理上下文，退出
    │     ├─ action = "ask" → 保留上下文，等待用户回复
    │     ├─ action = "chat" → 直接回复用户，退出
    │     │
    │     ├─ Predict 验证（关键词匹配）
    │     ├─ 错误学习（_addLesson）
    │     ├─ 消息压缩（超过 30 条时）
    │     └─ 容错检查（连续失败 3 次 / 步数超限 / 超时）
    │
    └─ 5. 渲染结果
```

#### 状态管理

| 状态变量 | 类型 | 用途 |
|----------|------|------|
| `_activeLoopId` | string | 互斥锁，防止并发 |
| `_conversationMessages` | ChatMessage[] | 完整对话历史 |
| `_planTracker` | PlanTracker | 当前计划及已完成步骤 |
| `_lessons` | Lesson[] | 经验库（最近 10 条） |
| `_contextSwitched` | boolean | 标签页切换标记 |
| `_pageChanged` | boolean | 页面刷新/跳转标记 |

#### UI 组件（原生 DOM）

- **CommandInput**: 命令输入框，支持斜杠命令补全（命令面板）
- **MessageList**: 消息气泡列表（user/system/ai/error 四种类型）
- **ConfirmCard**: 危险操作确认卡片
- **SettingsPanel**: 设置面板（模型管理、主题、关于）
- **ParticleCanvas**: 粒子动画背景

#### 命令面板（Command Palette）

当输入 `/` 时触发，显示可用斜杠命令列表，支持：
- 模糊匹配（`/close` 匹配 `close_tab`, `close_other_tabs`）
- 上下箭头导航
- Enter 选中并自动填充

### 3.4 AI Engine (`src/sidepanel/ai/`)

#### 引擎架构

```
AIEngine
    │
    ├─ checkAvailability()
    │     ├─ detectAICapability() → 判断 Gemini Nano 是否可用
    │     ├─ 配置了 apiKey → OpenAI 兼容 API
    │     └─ 无配置 → 不可用
    │
    ├─ prompt(systemPrompt, userMessage)
    │     └─ getBackend().chat()
    │
    └─ chatWithHistory(messages)
          └─ getBackend().chatWithMessages()
                │
                ├─ GeminiNanoAdapter (本地推理)
                │     └─ window.ai.languageModel.create() / prompt()
                │
                └─ OpenAIAdapter (远程 API)
                      └─ fetch /v1/chat/completions
```

#### AI 适配器

| 适配器 | 场景 | 配置需求 |
|--------|------|---------|
| `GeminiNanoAdapter` | Chrome 内置 Gemini Nano（本地推理，离线可用） | Chrome 125+ 且开启 AI 能力 |
| `OpenAIAdapter` | OpenAI 兼容 API（DeepSeek、Ollama、LM Studio、OpenRouter 等） | apiKey + apiEndpoint + modelName |

**自动选择逻辑**:
1. 检测 `window.ai.languageModel` 是否可用
2. 如果用户配置了 `gemini-nano` 或 `auto`，优先使用 Gemini Nano
3. 如果 Gemini Nano 不可用且配置了 API Key，降级到 OpenAI 兼容 API
4. 否则返回不可用状态

### 3.5 命令系统 (`src/shared/commands.ts`)

#### 命令定义结构

```typescript
interface Command {
  intent: string           // 唯一标识
  description: string      // AI 可读的描述
  dangerous: boolean       // 是否危险操作
  aiHidden?: boolean       // 对 AI 隐藏（斜杠命令兼容）
  requiresPrecompute?: boolean  // 是否需要 SP 预计算参数
  slots: Record<string, { type, optional, description }>
  swIntent: string | null  // SW executor 中的处理函数名，null 表示前端处理
}
```

**命令映射**: `COMMANDS[]` 数组 → `COMMAND_MAP`（ReadonlyMap）用于快速查找。

**预计算机制**: `requiresPrecompute=true` 的命令（如 `group_tabs`, `sort_tabs`）需要 Side Panel 先查询所有标签页，过滤出目标 ID/参数，再发送给 SW 执行。这避免了 SW 重复查询状态。

### 3.6 Prompt 系统 (`src/shared/prompts.ts`)

#### 系统提示词构建

```
buildAgentSystemPrompt(context)
    │
    ├─ AI_VISIBLE_COMMANDS: 过滤 aiHidden=true 的命令
    ├─ tabsBlock: 当前标签页列表（截断展示）
    ├─ lessonsBlock: 最近 3 条错误经验
    ├─ pageBlock: 页面元素结构（elements[]）
    └─ Agent System Prompt: 角色定义 + 操作规范
```

#### 页面结构格式化

`formatPageStructure(ps: PageStructure)` 将扫描结果格式化为 AI 可读的文本：

```
## 当前页面 (标题) — N 个元素 (已截断，显示前 M 个)
  [0] <input> text="用户名" type="text" placeholder="请输入..."
  [1] <button> text="登录" type="submit"
页内 iframe:
  [0] src=https://xxx.com id=frame1
```

### 3.7 Content Script (`src/content/dom-commander.js`)

**加载时机**: `document_idle`（页面空闲时注入）
**运行环境**: ISOLATED world（不受目标页面 CSP 限制）

#### 核心功能

| 函数 | 用途 |
|------|------|
| `scanCurrentPage()` | 全量扫描可见 DOM 元素（最多 300 个） |
| `queryElements(query)` | CSS 选择器查询 |
| `getElementInfo(index)` | 按索引获取元素详情 |
| `getElementBySelector(selector)` | 按选择器获取元素 |
| `executeJavaScript(code)` | 在页面执行 JS 代码 |

#### 可见性判断

```javascript
isVisible(el):
    ├─ !hidden 属性
    ├─ computedStyle.display !== 'none'
    ├─ computedStyle.visibility !== 'hidden'
    ├─ computedStyle.opacity !== '0'
    ├─ boundingRect 尺寸 > 0
    └─ 所有祖先元素均可见
```

#### 可交互性判断

```javascript
isInteractive(el):
    ├─ 标签在白名单 (BUTTON/INPUT/SELECT/TEXTAREA/A/LABEL/SUMMARY/DETAILS/FIELDSET/LEGEND)
    ├─ 有 onclick 属性
    ├─ tabIndex >= 0
    └─ role 在可交互角色列表中
```

#### Performance Shim

`window.__aiPerformance` 提供降级性能数据获取。当 MAIN world 因 CSP 被阻止时，ISOLATED world 的 shim 自动收集：

- Navigation Timing 数据（DNS、TCP、TLS、TTFB、DOM 解析等）
- 资源加载记录（前 30 个）
- Performance Mark 和 Measure
- JS Heap 内存使用

---

## 四、关键设计模式

### 4.1 适配器模式（AI 层）

```
AIEngine (统一接口)
    │
    ├─ GeminiNanoAdapter (implements AIAdapter)
    │     - chat(systemPrompt, userMessage)
    │     - chatWithMessages(messages)
    │
    └─ OpenAIAdapter (implements AIAdapter)
          - chat(systemPrompt, userMessage)
          - chatWithMessages(messages)
```

适配器接口：

```typescript
interface AIAdapter {
  chat(systemPrompt: string, userMessage: string, options?: AIOptions): Promise<string>
  chatWithMessages?(messages: ChatMessage[], options?: AIOptions): Promise<string>
}
```

### 4.2 命令模式（Executor 层）

```typescript
executeCommand(intent, payload):
    switch(intent):
        case 'tabs_observe': return await observeTabs(payload)
        case 'tabs_create': return await createTab(payload)
        case 'tabs_remove': return await removeTabs(payload)
        ...
        case 'dom_manipulate': return await domManipulate(payload)
        default: return { error: 'UNKNOWN_INTENT' }
```

每种 intent 对应一个独立函数，职责单一，便于扩展。

### 4.3 策略模式（AI 响应处理）

```typescript
// AI 响应 action 分发
if (json.action === 'done') { ... }
if (json.action === 'ask') { ... }
if (json.action === 'scan') { ... }
if (json.action === 'chat') { ... }
if (json.action === 'exec_tool') { ... }
```

### 4.4 零硬编码原则

项目明确规定代码层不做任何业务决策：

| 允许（机械操作） | 禁止（业务决策） |
|----------------|----------------|
| `fuzzyTextSearch("登录")` | `pickBestForAction()` |
| URL 黑名单检查 | CSS class 匹配规则 |
| 超时/步数限制 | 自动重试逻辑 |
| 消息大小截断 | "智能筛选" 逻辑 |

---

## 五、数据流详解

### 5.1 自然语言命令执行流程

```
用户: "帮我把所有 GitHub 标签页分组"

1. handleSubmit()
      └─ handleNaturalLanguage("帮我把所有 GitHub 标签页分组")

2. agentLoop(text)
      ├─ scanCurrentPage() → 当前页面元素
      ├─ buildAgentSystemPrompt() → 构建上下文
      │
      ├─ AI.chatWithHistory(messages)
      │     返回: { action: "exec_tool", toolCall: { name: "tabs_observe", args: { domain: "github" } } }
      │
      ├─ _executeCommand("tabs_observe", { domain: "github" })
      │     └─ chrome.runtime.sendMessage({ type: "EXECUTE", command: { intent: "tabs_observe", payload: { domain: "github" } } })
      │           └─ Service Worker: collectContext() / chrome.tabs.query()
      │
      ├─ AI.chatWithHistory(messages + 结果)
      │     返回: { action: "exec_tool", toolCall: { name: "batch", args: { calls: [{ tool: "tabs_group", args: {...} }] } } }
      │
      └─ _executeCommand("batch", { calls: [...] })
            └─ 批量执行多个 tabs_group

3. renderExecutionResult()
      └─ 渲染成功消息气泡
```

### 5.2 斜杠命令执行流程

```
用户: /close duplicate

1. handleSlashCommand("/close duplicate")
      ├─ matchSlashCommand(text) → 解析 intent: "close_duplicate_tabs"
      ├─ COMMAND_MAP["close_duplicate_tabs"] → requiresPrecompute: true
      │
      ├─ precompute("close_duplicate_tabs", {})
      │     └─ chrome.runtime.sendMessage({ type: "GET_CONTEXT" })
      │           ├─ chrome.tabs.query() → 获取所有标签
      │           └─ 过滤出 URL 重复的标签 → { tabIds: [...] }
      │
      └─ dispatchToSW("close_duplicate_tabs", { tabIds: [...] })
            └─ chrome.runtime.sendMessage({ type: "EXECUTE" })
                  └─ Service Worker: removeTabs({ tabIds: [...] })
```

### 5.3 录制功能流程

```
用户: "开始录屏"
    ↓
AI 返回: { action: "exec_tool", toolCall: { name: "record_screen" } }
    ↓
swIntent: null（前端处理）
    ↓
_sidepanel/index.js: dispatchToClient("record_screen")
    ↓
chrome.storage.local.set({ ai_recorder: { action: "start_screen" } })
    ↓
监听 storage 变化 → _startDesktopRecording()
    ↓
getUserMedia({ video: true, audio: true })
    ↓
MediaRecorder 录制
    ↓
用户: "停止录制"
    ↓
chrome.storage.local.set({ ai_recorder: { action: "stop" } })
    ↓
_stopRecording() → MediaRecorder.stop() → Blob → dataUrl
    ↓
chrome.runtime.sendMessage({ type: "RECORDING_RESULT", dataUrl })
    ↓
Side Panel: _showRecordingResult() → 渲染 video + 下载按钮
```

---

## 六、构建系统

### 6.1 Vite 配置

```typescript
build:
    ├─ outDir: dist/
    ├─ 输入:
    │     ├─ sidepanel: public/index.html
    │     └─ service-worker: src/service-worker/index.ts
    └─ 输出:
          ├─ sidepanel.js
          ├─ sidepanel.html (从 public/index.html 移动)
          ├─ service-worker.js
          └─ assets/
```

### 6.2 自定义构建插件 (`chromeExtensionPlugin`)

```typescript
buildStart():
    └─ rmSync(dist/) → mkdirSync(dist/)

closeBundle():
    ├─ 移动 HTML 文件 (public/index.html → sidepanel.html)
    ├─ 清理空目录
    ├─ 复制 manifest.json
    ├─ 复制 icons/ 目录
    ├─ 复制 content/ 脚本 (dom-commander.js, overlay.js)
    ├─ 复制 offscreen/ 文档
    ├─ 复制 lib/ 依赖
    └─ 删除未打包的 SW 源码
```

---

## 七、持久化存储

| 存储位置 | 数据 | 生命周期 |
|---------|------|---------|
| `chrome.storage.local` | AI 配置（provider/apiKey/endpoint/modelName）、显示模式、用户偏好 | 永久 |
| `chrome.storage.session` | 最后输入草稿、消息日志（最近 50 条） | 会话级 |
| `sessionStorage` | planTracker、lessons、消息日志 | 页面刷新不丢失（5 分钟过期） |
| `内存` | 对话历史、Agent 状态、UI 状态 | 随页面销毁 |

---

## 八、安全模型

### 8.1 受保护页面

以下 URL 前缀被拦截，不允许 DOM 操作：

- `chrome://`
- `chrome-extension://`
- `chrome.google.com/webstore`
- `javascript:` 协议

### 8.2 危险操作确认

以下操作标记为 `dangerous: true`，执行前必须用户确认：

- 关闭标签页
- 删除书签/文件夹
- 删除历史记录
- 清除 Cookie
- 卸载扩展

### 8.3 API Key 隐私

- 用户自行配置 API Key，存储在 `chrome.storage.local`
- 不预设任何 Key
- 不上传到任何第三方服务器

---

## 九、错误码体系

### 9.1 错误分类

| 前缀 | 类别 | 示例 |
|------|------|------|
| `ELE_` | 元素相关 | `ELE_NOT_FOUND`, `ELE_NOT_VISIBLE`, `ELE_DISABLED` |
| `ACT_` | 操作相关 | `ACT_TIMEOUT`, `ACT_BLOCKED`, `ACT_NO_EFFECT` |
| `PAGE_` | 页面相关 | `PAGE_BLOCKED`, `PAGE_LOADING`, `PAGE_CRASHED` |
| `COM_` | 通信相关 | `COM_DISCONNECTED`, `COM_TIMEOUT` |
| `LIM_` | 限制相关 | `LIM_TOO_MANY_ELEMENTS`, `LIM_STEP_MAX` |

### 9.2 统一错误响应格式

```json
{
  "success": false,
  "code": "ELE_NOT_FOUND",
  "message": "未找到匹配元素",
  "detail": {
    "selector": "button[type='submit']",
    "reason": "页面中不存在该元素",
    "context": "当前页面: github.com/login"
  }
}
```

---

## 十、文件结构清单

```
src/
├── main.ts                          # Vue 应用入口（popup 模式）
├── App.vue                          # Vue 根组件
├── components/
│   ├── CommandInput.vue             # 命令输入组件
│   ├── ConfirmCard.vue              # 确认卡片组件
│   ├── MessageBubble.vue            # 消息气泡组件
│   ├── MessageList.vue              # 消息列表组件
│   └── ParticleCanvas.vue           # 粒子动画组件
├── composables/
│   ├── useAIEngine.ts               # AI 引擎 composable
│   ├── useCommandHistory.ts         # 命令历史 composable
│   ├── useMessageLog.ts             # 消息日志 composable
│   └── useSettings.ts               # 设置 composable
├── content/
│   ├── dom-commander.js             # Content Script: DOM 扫描和操作
│   └── overlay.js                   # Popup 模式覆盖层
├── offscreen/
│   ├── recorder.html                # 离屏录制页面
│   └── recorder.js                 # 离屏录制逻辑
├── service-worker/
│   ├── index.ts                     # SW 入口：消息路由
│   ├── context-collector.ts         # 上下文收集
│   ├── executor.ts                  # 命令执行器
│   └── utils/
│       └── tab-matcher.ts           # 标签页匹配工具
├── sidepanel/
│   ├── index.js                     # Side Panel 主逻辑（Agent Loop）
│   ├── ai/
│   │   ├── engine.ts                # AI 引擎抽象层
│   │   ├── api-detector.ts          # Chrome AI 能力检测
│   │   ├── gemini-nano.ts           # Gemini Nano 适配器
│   │   └── openai-adapter.ts        # OpenAI 兼容 API 适配器
│   └── command/
│       ├── confirm.ts              # 确认预览生成
│       └── slash-commands.ts       # 斜杠命令解析
├── shared/
│   ├── commands.ts                  # 命令定义注册表
│   ├── constants.ts                 # 常量和错误码
│   ├── json-repair.ts               # JSON 修复工具
│   ├── personality.ts              # AI 人格/风格定义
│   └── prompts.ts                   # Agent 系统提示词构建
├── types/
│   ├── ai.ts                        # AI 相关类型
│   ├── chrome.ts                    # Chrome API 类型
│   ├── command.ts                   # 命令类型
│   ├── context.ts                   # 上下文类型
│   ├── execution.ts                 # 执行结果类型
│   ├── index.ts                     # 类型导出汇总
│   └── ui.ts                        # UI 相关类型
└── lib/
    └── testing-library-dom.umd.min.js

public/
└── index.html                       # Side Panel HTML 模板

docs/
├── architecture.md                   # 原始架构设计文档
├── reverse-technical-doc.md          # 本文档
├── stress-test-plan.md              # 压力测试计划
└── stress-test-report.md           # 压力测试报告

根目录
├── manifest.json                     # Chrome 扩展清单
├── vite.config.ts                   # Vite 配置 + 自定义插件
├── tsconfig.json                    # TypeScript 配置
├── tailwind.config.js               # Tailwind CSS 配置
├── eslint.config.js                 # ESLint 配置
├── postcss.config.js                # PostCSS 配置
└── .prettierrc.js                   # Prettier 配置
```

---

## 十一、技术亮点

1. **AI 优先架构**: 真正将 AI 作为唯一决策者，代码层完全不做业务判断
2. **双后端 AI 接入**: 同时支持 Gemini Nano（离线本地）和 OpenAI 兼容 API（远程），自动降级
3. **智能预计算**: Side Panel 先查询所有标签/书签，过滤出目标后再执行，减少往返
4. **机械验证**: Predict 验证机制用关键词匹配做机械对比，不做语义判断
5. **经验学习**: 失败经验跨轮复用，同一域名不再重复犯错
6. **动态规划**: 每步执行后重新评估，不是一次性输出所有步骤
7. **受保护页面兜底**: 代码层面只拦截物理边界（chrome:// 等），其他全部交给 AI
8. **Content Script 降级**: MAIN world 失败自动降级到 ISOLATED world，不受 CSP 限制
9. **录制功能**: 纯前端 MediaRecorder 实现，无需 SW 中转
10. **命令面板**: 斜杠命令模糊匹配 + 实时补全，体验接近现代 IDE
