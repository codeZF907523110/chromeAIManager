# AI 浏览器管家 — 反向技术文档

> **项目名称**: AI Browser Commander (AI 浏览器管家)
> **版本**: 0.1.0
> **技术栈**: Vue 3 + TypeScript + Chrome Extension Manifest V3 + Element Plus
> **构建工具**: Vite 5
> **最后更新**: 2026-08-05

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [核心模块详解](#4-核心模块详解)
   - 4.1 [Service Worker 后台](#41-service-worker-后台)
   - 4.2 [Side Panel 前端](#42-side-panel-前端)
   - 4.3 [AI 引擎层](#43-ai-引擎层)
   - 4.4 [命令系统](#44-命令系统)
   - 4.5 [Content Scripts](#45-content-scripts)
   - 4.6 [Offscreen 文档](#46-offsreen-文档)
   - 4.7 [共享模块](#47-共享模块)
   - 4.8 [类型定义](#48-类型定义)
5. [数据流与通信](#5-数据流与通信)
6. [构建与部署](#6-构建与部署)
7. [关键设计决策](#7-关键设计决策)

---

## 1. 项目概述

AI 浏览器管家是一个**键盘驱动的 AI 浏览器命令中心**，基于 Chrome Extension Manifest V3 构建。用户可以通过自然语言或斜杠命令来管理浏览器中的标签页、书签、历史记录、窗口、扩展、Cookie、主题、字体等，同时支持 DOM 操作、页面截图、录屏等功能。

核心设计理念：**代码纯编排，AI 做全部决策**。系统通过 Agent 循环（Observe → Think → Act → Verify）自主完成用户指令。

### 核心功能

| 功能类别 | 能力 |
|---------|------|
| **标签管理** | 创建/关闭/移动/分组/排序/静音/休眠/去重标签 |
| **书签管理** | 增删改查书签和文件夹 |
| **窗口管理** | 创建/更新窗口 |
| **历史管理** | 搜索/删除浏览历史 |
| **页面操作** | 导航/截图/缩放/DOM 操作 |
| **主题/字体** | 查看/设置主题模式和字体 |
| **Cookie 管理** | 查看/清除 Cookie |
| **扩展管理** | 启用/禁用/卸载扩展 |
| **权限管理** | 查看/设置网站权限 |
| **存储管理** | 扩展本地存储读写 |
| **会话恢复** | 恢复最近关闭的标签 |
| **录屏** | 标签页/桌面录制 |

### 交互方式

1. **自然语言输入**: 通过 AI 引擎（Gemini Nano 或 OpenAI 兼容 API）解析用户意图，自动执行多步操作
2. **斜杠命令**: 以 `/` 开头的精确命令，无需 AI 即可执行（如 `/find 关键词`、`/close-duplicates`）
3. **显示模式**: 支持侧边栏（Side Panel）和弹窗（Overlay/Popup）两种模式

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Chrome Extension (MV3)                            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Service Worker (后台)                          │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────┐  │  │
│  │  │  context-collector│  │    executor     │  │   tab-matcher (util) │  │  │
│  │  │  (上下文收集器)   │  │  (命令执行器)    │  │   (标签匹配工具)     │  │  │
│  │  └─────────────────┘  └─────────────────┘  └──────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │  chrome.runtime.sendMessage           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     Side Panel (侧边栏 / 弹窗)                       │  │
│  │  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────────┐  │  │
│  │  │  Vue 3 UI    │  │   AI Engine     │  │   Agent Loop           │  │  │
│  │  │  (App.vue)   │  │  (engine.ts)    │  │   (sidepanel/index.js)  │  │  │
│  │  │  + Element   │  │  ┌───────────┐  │  │   / useAIEngine.ts     │  │  │
│  │  │  Plus 组件   │  │  │Gemini Nano│  │  └────────────────────────┘  │  │
│  │  │              │  │  │OpenAI适配 │  │  ┌────────────────────────┐  │  │
│  │  │              │  │  └───────────┘  │  │  Slash Commands        │  │  │
│  │  │              │  │  ┌───────────┐  │  │  (斜杠命令解析器)      │  │  │
│  │  │              │  │  │api-detector│  │  └────────────────────────┘  │  │
│  │  │              │  │  └───────────┘  │  ┌────────────────────────┐  │  │
│  │  │              │  │                 │  │  Confirm 确认中间件    │  │  │
│  │  │              │  │                 │  └────────────────────────┘  │  │
│  │  └──────────────┘  └─────────────────┘                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     Content Scripts (内容脚本)                        │  │
│  │  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │  │
│  │  │  dom-commander.js       │  │  overlay.js                      │  │  │
│  │  │  (常驻 DOM 扫描器)      │  │  (弹窗注入层)                    │  │  │
│  │  └─────────────────────────┘  └──────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Offscreen Document (离屏录制)                                       │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  recorder.js — MediaRecorder 录制标签/桌面                     │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 架构分层

| 层级 | 职责 | 关键技术 |
|------|------|---------|
| **Service Worker** | 后台常驻，消息路由，上下文收集，命令执行 | Chrome Extension SW API |
| **Side Panel UI** | 用户界面，命令输入/输出，AI 对话 | Vue 3 + Element Plus |
| **AI 引擎层** | AI 后端选择，API 调用，Agent 循环 | Gemini Nano / OpenAI API |
| **命令系统** | 命令定义、解析、匹配、执行 | 本地命令注册表 |
| **Content Scripts** | 页面 DOM 扫描、弹窗注入 | Chrome Content Scripts |
| **Offscreen** | 音视频录制 | MediaRecorder API |

---

## 3. 目录结构

```
chromeAIManager/
├── public/
│   └── index.html              # Side Panel HTML 入口
├── icons/                       # 扩展图标 (16/32/48/128)
├── src/
│   ├── main.ts                  # Vue 应用入口
│   ├── App.vue                  # 根组件
│   ├── env.d.ts                 # 环境类型声明
│   │
│   ├── components/              # Vue 组件
│   │   ├── CommandInput.vue     # 命令输入框 (含斜杠提示)
│   │   ├── MessageList.vue      # 消息列表
│   │   ├── MessageBubble.vue    # 消息气泡 (支持 Markdown)
│   │   ├── ConfirmCard.vue      # 确认操作卡片
│   │   └── ParticleCanvas.vue   # 粒子背景动画
│   │
│   ├── composables/             # Vue 组合式函数
│   │   ├── useAIEngine.ts       # 主逻辑 (AI + Agent + 命令处理)
│   │   ├── useSettings.ts       # 设置管理 (模型 CRUD)
│   │   ├── useMessageLog.ts     # 消息日志
│   │   └── useCommandHistory.ts # 命令历史
│   │
│   ├── types/                   # TypeScript 类型定义
│   │   ├── index.ts             # 统一导出
│   │   ├── ai.ts                # AI 相关类型
│   │   ├── chrome.ts            # Chrome API 类型
│   │   ├── command.ts           # 命令类型
│   │   ├── context.ts           # 上下文类型
│   │   ├── execution.ts         # 执行结果类型
│   │   └── ui.ts                # UI 类型
│   │
│   ├── shared/                  # 共享模块 (SP + SW 共用)
│   │   ├── constants.ts         # 消息类型常量、错误码、系统常量
│   │   ├── commands.ts          # 命令定义注册表 (50+ 命令)
│   │   ├── prompts.ts           # Agent 系统提示词构建
│   │   └── json-repair.ts       # 容错 JSON 解析
│   │
│   ├── service-worker/          # Service Worker 后台
│   │   ├── index.ts             # 入口：消息路由 + 生命周期
│   │   ├── executor.ts          # 命令执行器 (30+ 意图)
│   │   ├── context-collector.ts # 浏览器上下文收集器
│   │   └── utils/
│   │       └── tab-matcher.ts   # 标签匹配工具函数
│   │
│   ├── sidepanel/               # Side Panel 逻辑
│   │   ├── index.js             # 主逻辑类 (旧版 SidePanel)
│   │   ├── ai/
│   │   │   ├── engine.ts        # AI 引擎 (自动选择后端)
│   │   │   ├── api-detector.ts  # AI 能力检测 (Gemini Nano)
│   │   │   ├── gemini-nano.ts   # Gemini Nano 适配器
│   │   │   └── openai-adapter.ts# OpenAI 兼容 API 适配器
│   │   └── command/
│   │       ├── slash-commands.ts # 斜杠命令注册表 (40+ 命令)
│   │       └── confirm.ts       # 危险操作确认预览
│   │
│   ├── content/                 # Content Scripts
│   │   ├── dom-commander.js     # 常驻 DOM 扫描器
│   │   └── overlay.js           # 弹窗覆盖层注入
│   │
│   ├── offscreen/               # Offscreen 文档
│   │   ├── recorder.html
│   │   └── recorder.js          # 录制器
│   │
│   └── lib/
│       └── testing-library-dom.umd.min.js  # 测试库 (备用)
│
├── manifest.json                # Chrome 扩展清单
├── vite.config.ts               # Vite 构建配置 + 自定义插件
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── .prettierrc.js
├── package.json
└── yarn.lock
```

---

## 4. 核心模块详解

### 4.1 Service Worker 后台

**文件**: `src/service-worker/index.ts`

#### 职责
- 消息路由：接收 Side Panel 的请求，分发给对应处理函数
- 上下文收集：调用 `collectContext` 收集浏览器当前状态
- 命令执行：调用 `executeCommand` 执行具体操作
- 生命周期管理：安装/更新/启动事件处理
- 显示模式切换：管理 sidepanel/overlay 两种模式

#### 消息类型

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| `GET_CONTEXT` | SP → SW | 获取浏览器上下文 (标签/书签等) |
| `GET_BOOKMARKS` | SP → SW | 搜索书签 |
| `EXECUTE` | SP → SW | 执行命令 (intent + payload) |
| `SET_DISPLAY_MODE` | SP → SW | 设置显示模式 |
| `GET_DISPLAY_MODE` | SP → SW | 获取当前显示模式 |

#### 关键代码流

```
onMessage → handleMessage
  ├── GET_CONTEXT → collectContext(options)
  ├── GET_BOOKMARKS → chrome.bookmarks.search(query)
  ├── EXECUTE → executeCommand(intent, payload)
  ├── SET_DISPLAY_MODE → chrome.storage.local.set
  └── GET_DISPLAY_MODE → chrome.storage.local.get
```

#### 快捷键与图标点击

- `Ctrl+Shift+U` / `Cmd+Shift+U`: 打开命令面板
- 点击扩展图标: 根据 `displayMode` 设置打开侧边栏或注入 overlay
- `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`: 自动打开侧边栏

---

### 4.2 Side Panel 前端

#### 4.2.1 主逻辑 (旧版)

**文件**: `src/sidepanel/index.js`

`SidePanel` 类是整个前端的主控制器，负责：
- 初始化：同步模式按钮、恢复会话、绑定事件
- 命令处理：区分斜杠命令和自然语言
- Agent 循环：AI 驱动的多步执行
- 消息渲染：用户消息、AI 回复、系统消息、错误消息
- 确认对话框：危险操作的二次确认
- 历史导航：上下键浏览命令历史
- 斜杠命令面板：`/` 触发命令提示

#### 4.2.2 主逻辑 (Vue Composable)

**文件**: `src/composables/useAIEngine.ts`

这是 Vue 重构后的主逻辑 Composable，封装了与旧版 `SidePanel` 类相同的功能，但采用 Vue 响应式状态管理。核心状态包括：

| 状态 | 类型 | 说明 |
|------|------|------|
| `messageLog` | `MessageLog[]` | 消息历史 |
| `contextCache` | `Context \| null` | 浏览器上下文缓存 (30s TTL) |
| `activeLoopId` | `string \| null` | 当前 Agent 循环 ID |
| `conversationMessages` | `ChatMessage[] \| null` | 对话上下文 (用于多轮) |
| `planTracker` | `PlanTracker \| null` | 计划追踪器 |
| `lessons` | `Lesson[]` | 历史经验 (最多10条) |
| `lastScreenshot` | `string \| null` | 最近截图 data URL |
| `pendingConfirm` | `PendingConfirm \| null` | 待处理的确认对话框 |

#### 4.2.3 Vue 组件树

```
App.vue
├── ParticleCanvas.vue        # 粒子背景动画
├── MessageList.vue           # 消息列表
│   └── MessageBubble.vue     # 消息气泡 (×N)
├── ConfirmCard.vue           # 确认操作卡片 (条件渲染)
├── [设置面板]                # 条件渲染
│   ├── 模型管理页面
│   ├── 主题设置页面
│   └── 关于页面
├── [添加模型弹窗]            # 条件渲染
├── [编辑模型弹窗]            # 条件渲染
└── CommandInput.vue          # 命令输入区
    ├── textarea 输入框
    ├── 斜杠命令提示面板
    ├── 模型选择下拉
    ├── 麦克风按钮
    └── 发送按钮
```

#### 4.2.4 模型管理

**文件**: `src/composables/useSettings.ts`

- 支持多模型管理：添加、编辑、删除、设为默认
- 模型数据持久化到 `chrome.storage.local`
- 默认模型：DeepSeek V3 (`https://api.deepseek.com`, `deepseek-chat`)
- 模型字段：`id`, `name`, `provider`, `apiKey`, `apiEndpoint`, `modelName`, `isDefault`, `createdAt`

---

### 4.3 AI 引擎层

#### 4.3.1 AI 引擎

**文件**: `src/sidepanel/ai/engine.ts`

`AIEngine` 类负责自动选择 AI 后端：

```
setModel(config) → reset()
checkAvailability()
  ├── detectAICapability()
  ├── Gemini Nano 可用 → backend = gemini-nano (离线)
  └── 有 API Key → backend = openai (在线)
prompt(system, user, options) → getBackend().chat()
chatWithHistory(messages, options) → getBackend().chatWithMessages()
```

**后端选择优先级**:
1. `provider === 'gemini-nano'` 且 Chrome 内置 AI 可用 → Gemini Nano
2. `provider === 'openai'` 且有 API Key → OpenAI 兼容 API
3. `provider === 'auto'` → 自动检测，优先 Gemini Nano，降级 OpenAI

#### 4.3.2 AI 能力检测

**文件**: `src/sidepanel/ai/api-detector.ts`

检测 Chrome 内置 AI 的三种形态：

| 检测方式 | 检测对象 | 说明 |
|---------|---------|------|
| `window.ai.languageModel` | Chrome 内置 Prompt API | 最稳定，Chrome 125+ |
| `window.ai.assistant` | 未来 API 形态 | 预留 |
| `chrome.aiOriginTrial` | Origin Trial 实验性 API | 开发者试用 |

#### 4.3.3 Gemini Nano 适配器

**文件**: `src/sidepanel/ai/gemini-nano.ts`

- 适配 Chrome 内置 AI 的三种 API 形态
- 自动管理 session 生命周期
- session 过期自动重建

#### 4.3.4 OpenAI 适配器

**文件**: `src/sidepanel/ai/openai-adapter.ts`

- 兼容 OpenAI / DeepSeek / Ollama / LM Studio / OpenRouter 等所有 `/v1/chat/completions` 服务
- 支持 `chat` 和 `chatWithMessages` 两种调用方式
- 自动请求 `chrome.permissions` 获取 API 端点跨域权限
- 超时控制 (默认 60s)
- 默认启用 JSON mode (`response_format: { type: 'json_object' }`)
- 错误处理：解析 API 返回的错误信息

---

### 4.4 命令系统

#### 4.4.1 命令定义注册表

**文件**: `src/shared/commands.ts`

定义了 50+ 命令，每个命令包含：

```typescript
interface Command {
  intent: string           // 唯一意图 ID
  description: string      // 描述
  dangerous: boolean       // 是否危险操作
  slots: Record<string, CommandSlot>  // 参数定义
  swIntent: string | null  // 对应的 SW 执行器命令名
  aiHidden?: boolean       // 是否对 AI 隐藏 (仅用于斜杠命令)
  requiresPrecompute?: boolean  // 是否需要预计算
}
```

命令分类：

| 类别 | 命令数 | 示例 |
|------|--------|------|
| Tabs | 9 | `tabs_observe`, `tabs_create`, `tabs_remove`, `tabs_group` |
| Bookmarks | 7 | `bookmarks_observe_tree`, `bookmarks_create_node` |
| Windows | 3 | `windows_observe`, `windows_create` |
| History | 2 | `history_search`, `history_remove` |
| Navigation | 2 | `navigate`, `screenshot` |
| Page | 2 | `zoom`, `downloads_open` |
| Theme | 2 | `theme_observe`, `theme_update` |
| Font | 4 | `font_size_observe/update`, `font_family_observe/update` |
| Cookies | 2 | `cookies_observe`, `cookies_remove` |
| Top Sites | 1 | `top_sites_observe` |
| Extensions | 3 | `extensions_observe`, `extensions_update`, `extensions_remove` |
| Permissions | 2 | `permissions_observe`, `permissions_update` |
| Storage | 3 | `storage_get/set/remove` |
| Sessions | 1 | `sessions_restore` |
| Recording | 3 | `recording_start_tab/screen/stop` |
| DOM | 1 | `dom_manipulate` |
| Batch | 1 | `batch` |
| 向后兼容 | 30+ | `find_tab`, `close_duplicate_tabs`, `sort_tabs` 等 |
| 内置 | 3 | `show_help`, `unknown`, `chat` |

#### 4.4.2 命令执行器

**文件**: `src/service-worker/executor.ts`

`executeCommand(intent, payload)` 是实际的命令执行入口，通过 `switch` 分发到各实现函数。

**危险操作保护**:
- 定义 `DANGEROUS_INTENTS` 集合: `tabs_remove`, `bookmarks_remove_node`, `history_remove`, `cookies_remove`, `extensions_remove`
- 执行前通过 `checkDangerousConfirm()` 调用 `confirm()` 弹窗二次确认

**执行器能力矩阵**:

| 功能 | 函数 | Chrome API |
|------|------|-----------|
| 查询标签 | `observeTabs` | `chrome.tabs.query` |
| 创建标签 | `createTab` | `chrome.tabs.create` |
| 更新标签 | `updateTab` | `chrome.tabs.update` |
| 移动标签 | `moveTabs` | `chrome.tabs.move` |
| 关闭标签 | `removeTabs` | `chrome.tabs.remove` |
| 分组标签 | `groupTabs` | `chrome.tabs.group` |
| 取消分组 | `ungroupTabs` | `chrome.tabs.ungroup` |
| 按域名分组 | `groupByDomain` | `chrome.tabs.group` |
| 查询书签树 | `observeBookmarks` | `chrome.bookmarks.getTree` |
| 移动书签 | `moveBookmark` | `chrome.bookmarks.move` |
| 创建书签 | `createBookmark` | `chrome.bookmarks.create` |
| 更新书签 | `updateBookmark` | `chrome.bookmarks.update` |
| 打开书签 | `openBookmark` | `chrome.tabs.update` |
| 删除书签 | `removeBookmark` | `chrome.bookmarks.remove` |
| 添加当前页 | `addCurrentPageBookmark` | `chrome.bookmarks.create` |
| 查询窗口 | `observeWindows` | `chrome.windows.getAll` |
| 创建窗口 | `createWindow` | `chrome.windows.create` |
| 更新窗口 | `updateWindow` | `chrome.windows.update` |
| 搜索历史 | `searchHistory` | `chrome.history.search` |
| 删除历史 | `removeHistory` | `chrome.history.deleteRange/deleteAll` |
| 导航 | `navigateTo` | `chrome.tabs.update/create` |
| 截图 | `takeScreenshot` | `chrome.tabs.captureVisibleTab` |
| 缩放 | `setZoom` | `chrome.tabs.getZoom/setZoom` |
| 主题 | `observeTheme/updateTheme` | `chrome.settings.private` |
| 字号 | `observeFontSize/updateFontSize` | `chrome.fontSettings` |
| 字体 | `observeFontFamily/updateFontFamily` | `chrome.fontSettings` |
| Cookie | `observeCookies/removeCookies` | `chrome.cookies.getAll/remove` |
| 常用网站 | `observeTopSites` | `chrome.topSites.get` |
| 扩展 | `observeExtensions/updateExtension/removeExtension` | `chrome.management` |
| 存储 | `getStorage/setStorage/removeStorage` | `chrome.storage.local` |
| 恢复会话 | `restoreSession` | `chrome.sessions.getRecentlyClosed/restore` |
| 录制 | `startTabRecording/startScreenRecording/stopRecording` | `chrome.tabCapture` |
| DOM 操作 | `domManipulate` | `chrome.scripting.executeScript` |
| 批量执行 | `batchExecute` | 递归调用 `executeCommand` |

#### 4.4.3 斜杠命令注册表

**文件**: `src/sidepanel/command/slash-commands.ts`

定义 40+ 斜杠命令，每个命令包含：

```typescript
interface SlashCommand {
  slash: string         // 命令名 (如 "close-duplicates")
  intent: string        // 对应 intent
  description: string   // 描述
  aliases?: string[]    // 别名 (如 ["cd", "dedup", "去重"])
  hasArg?: boolean      // 是否需要参数
  placeholder?: string  // 参数占位符
}
```

**匹配逻辑** (`matchSlashCommand`):
1. 精确匹配 `slash` 名称
2. 别名匹配 `aliases`
3. 前缀模糊匹配
4. 参数解析按 intent 类型分发到不同解析逻辑

#### 4.4.4 确认中间件

**文件**: `src/sidepanel/command/confirm.ts`

为危险操作生成预览信息，支持的操作类型：

| 操作 | 预览内容 |
|------|---------|
| `close_duplicate_tabs` | 显示重复 URL 组和数量 |
| `close_tabs_by_domain` | 显示匹配域名下的标签列表 |
| `close_other_tabs` | 显示将要关闭的标签列表 |
| `remove_bookmark` | 显示匹配关键词 |
| `delete_history` | 显示时间范围和关键词 |
| `clear_cookies` | 显示域名 |
| `uninstall_extension` | 显示扩展名 |
| `storage_remove` | 显示存储键名 |

---

### 4.5 Content Scripts

#### 4.5.1 DOM Commander

**文件**: `src/content/dom-commander.js`

常驻 content script，通过 `PAGE_SCAN` 消息响应页面扫描请求。

**扫描输出**:
```javascript
{
  url: string,           // 当前页面 URL
  title: string,         // 页面标题
  count: number,         // 实际返回元素数
  totalCount: number,    // 页面总元素数
  truncated: boolean,    // 是否截断 (超过 300 个)
  elements: [            // 元素数组
    { tag: string, text: string|null, attrs: object|null }
  ],
  iframes: [             // iframe 列表
    { src: string, id: string|null, name: string|null }
  ] | null
}
```

**设计原则**: 纯数据收集，零业务判断。AI 通过 `dom_manipulate` 工具写自定义脚本做精确操作。

#### 4.5.2 Overlay 弹窗

**文件**: `src/content/overlay.js`

注入全屏覆盖层 + 居中 iframe 弹窗，用于 Popup 模式。

**特性**:
- 点击遮罩层关闭
- Escape 键关闭
- 动画效果 (fade in/out, dialog in/out)
- 监听 `CLOSE_OVERLAY` 消息
- 截图自动复制到剪贴板
- MutationObserver 兜底清理标记

---

### 4.6 Offscreen 文档

**文件**: `src/offscreen/recorder.js`

使用 MediaRecorder 录制标签页或桌面画面。

**消息类型**:
- `START_TAB_RECORDING`: 开始录制标签页 (需要 streamId)
- `START_DESKTOP_RECORDING`: 开始录制桌面
- `STOP_RECORDING`: 停止录制，返回 data URL

**编码**: VP9/WebM → VP8/WebM 降级，2.5 Mbps 码率，每秒收集数据

---

### 4.7 共享模块

#### 4.7.1 常量定义

**文件**: `src/shared/constants.ts`

- 消息类型常量 (5 个)
- 错误码类型 (15+ 个)
- 系统常量:
  - `MAX_ELEMENTS_COUNT = 80` (DOM 扫描最大元素数)
  - `MAX_AGENT_STEPS = 12` (Agent 最大步数)
  - `STEP_TIMEOUT_MS = 10000` (单步超时)
  - `TOTAL_TASK_TIMEOUT_MS = 120000` (总任务超时)
  - `MAX_CONSECUTIVE_FAILURES = 3` (最大连续失败)
  - `MAX_MESSAGES_COUNT = 30` (对话上下文上限)
- 受保护页面配置: `chrome://`, `chrome-extension://`, `chrome.google.com`

#### 4.7.2 Agent 系统提示词

**文件**: `src/shared/prompts.ts`

`buildAgentSystemPrompt(context)` 构建 Agent 的 system prompt，包含：

1. **当前环境信息**: 当前标签页标题和 URL
2. **核心能力说明**: 观察→思考→执行→验证循环
3. **操作模式判断**: 浏览器操作 vs 纯对话
4. **输出格式**: 严格的 JSON 格式要求
5. **action 类型**: `exec_tool`, `scan`, `done`, `ask`
6. **DOM 操作指南**: API 列表、写法示例
7. **错误码参考**: 各类错误码含义
8. **通用原则**: 16 条 Agent 行为准则
9. **可用工具**: 过滤后的命令列表
10. **历史经验**: 最近 3 条失败经验
11. **页面结构**: 当前页面元素列表

#### 4.7.3 容错 JSON 解析

**文件**: `src/shared/json-repair.ts`

`repairJSON(raw)` 修复 AI 输出的常见 JSON 格式问题：

1. 移除 Markdown 代码块标记
2. 提取花括号内容
3. 修复尾部逗号
4. 单引号转双引号
5. 修复未引号的 key

---

### 4.8 类型定义

**文件**: `src/types/*.ts`

| 文件 | 核心类型 |
|------|---------|
| `ai.ts` | `ChatMessage`, `MessageLog`, `AIResponse`, `ToolCall`, `AIProvider`, `AIModel`, `AIConfig`, `AIStatus`, `AIOptions`, `AIAdapter` |
| `chrome.ts` | `TabInfo`, `ActiveTab`, `BookmarkNode`, `WindowInfo` |
| `command.ts` | `CommandSlot`, `Command`, `SlashCommand`, `SlashCommandMatch` |
| `context.ts` | `PageElement`, `Iframe`, `PageStructure`, `Lesson`, `PlanStep`, `PlanTracker`, `SessionData`, `Context` |
| `execution.ts` | `ExecutionResult`, `ExecuteCommandPayload` |
| `ui.ts` | `DisplayMode`, `MessageLog`, `ChatMessage`, `Lesson`, `PlanTracker`, `AgentState`, `Settings` |

---

## 5. 数据流与通信

### 5.1 整体通信架构

```
User Input (自然语言)
    │
    ▼
Side Panel (Vue UI)
    │
    ├── 斜杠命令 ──→ matchSlashCommand() ──→ COMMAND_MAP ──→ chrome.runtime.sendMessage(EXECUTE) ──→ Service Worker executor
    │                                                                                                         │
    │                                                                                                         ▼
    │                                                                                                    Chrome API 调用
    │                                                                                                         │
    │                                                                                                         ▼
    │                                                                                                    ExecutionResult
    │                                                                                                         │
    └── 自然语言 ──→ AIEngine.checkAvailability() ──→ AIEngine.chatWithHistory()
                            │
                            ├── Gemini Nano (离线) ←── api-detector
                            │
                            └── OpenAI API (在线) ──→ /v1/chat/completions
                                    │
                                    ▼
                            AIResponse (JSON: action + toolCall)
                                    │
                                    ▼
                            Agent Loop (while < MAX_STEPS)
                                    │
                                    ├── exec_tool → executeCommand() → SW → Chrome API
                                    ├── scan → chrome.tabs.sendMessage(PAGE_SCAN) → DOM Commander
                                    ├── ask → 等待用户输入
                                    └── done → 完成
```

### 5.2 Agent 循环流程

```
用户输入
    │
    ▼
checkAvailability() ──→ AI 不可用 → 显示斜杠命令列表
    │
    ▼ (AI 可用)
buildAgentSystemPrompt(context) → 构建 system prompt
    │
    ▼
while (stepCount < MAX_AGENT_STEPS = 12):
    │
    ├── AI 返回 JSON { thought, action, plan, predict, toolCall }
    │
    ├── action === "done" → 显示 AI 回复，结束
    ├── action === "ask" → 保存对话上下文，等待用户输入
    ├── action === "scan" → scanCurrentPage() → 继续循环
    ├── action === "chat" → 显示 AI 回复，等待用户输入
    └── action === "exec_tool" → executeCommand() → 分析结果 → 继续循环
            │
            ├── NEEDS_CONFIRM → 显示确认对话框，暂停
            ├── 连续失败 3 次 → 停止
            ├── 超时 120s → 停止
            └── 正常 → 结果注入消息，继续
```

### 5.3 消息持久化

- **消息日志**: `sessionStorage('ai_message_log')` + `chrome.storage.local` 双重持久化
- **会话恢复**: `sessionStorage('ai_commander_session')` 保存 planTracker + lessons + conversationMessages，5 分钟过期
- **输入草稿**: `sessionStorage('lastInput')` 保存最后输入内容

---

## 6. 构建与部署

### 6.1 构建配置

**文件**: `vite.config.ts`

使用 Vite 5 构建，自定义 `chromeExtensionPlugin` 插件处理 Chrome 扩展的特殊构建需求：

1. **清理**: 构建前删除 `dist/` 目录
2. **多入口**: Side Panel HTML + Service Worker
3. **路径修复**: 修复 Vite 输出的相对路径
4. **资源复制**: 
   - `manifest.json` → `dist/`
   - `icons/` → `dist/icons/`
   - `src/content/*.js` → `dist/content/`
   - `src/offscreen/*` → `dist/offscreen/`
   - `src/lib/*.js` → `dist/lib/`

### 6.2 构建产物

```
dist/
├── manifest.json
├── sidepanel.html           # Side Panel 入口
├── sidepanel.js             # Vue 应用打包
├── sidepanel.css            # 样式
├── service-worker.js        # Service Worker 打包
├── icons/                   # 扩展图标
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── content/
│   ├── dom-commander.js     # 内容脚本
│   └── overlay.js
├── offscreen/
│   ├── recorder.html
│   └── recorder.js
└── lib/
    └── testing-library-dom.umd.min.js
```

### 6.3 构建命令

```bash
yarn dev      # 开发模式
yarn build    # 生产构建
yarn preview  # 预览
```

### 6.4 Manifest 权限

| 权限 | 用途 |
|------|------|
| `tabs` | 标签页 CRUD、查询、分组 |
| `bookmarks` | 书签增删改查 |
| `sessions` | 恢复最近关闭标签 |
| `history` | 搜索/删除浏览历史 |
| `storage` | 扩展本地存储 |
| `tabGroups` | 标签分组管理 |
| `scripting` | 注入脚本执行 DOM 操作 |
| `activeTab` | 当前标签交互 |
| `browsingData` | 浏览数据清理 |
| `fontSettings` | 字体设置读写 |
| `cookies` | Cookie 查看/清除 |
| `topSites` | 常用网站查询 |
| `management` | 扩展管理 |
| `contentSettings` | 内容权限设置 |
| `privacy` | 隐私设置 |
| `tabCapture` | 标签页录制 |
| `desktopCapture` | 桌面录制 |
| `notifications` | 通知 |
| `downloads` | 下载管理 |
| `offscreen` | 离屏文档 |
| `sidePanel` | 侧边栏 |
| `<all_urls>` | 所有网站主机权限 |

---

## 7. 关键设计决策

### 7.1 为什么选择 Agent 循环而非一次性调用？

AI 模型在单次调用中难以准确完成复杂的多步操作。Agent 循环通过"观察→思考→执行→验证"的迭代方式，让 AI 每次只做一件事，看到结果后再决定下一步，大幅提高了复杂任务的完成率。

### 7.2 为什么同时支持 Gemini Nano 和 OpenAI？

- **Gemini Nano**: Chrome 内置，离线可用，无需 API Key，零成本，但模型能力有限
- **OpenAI 兼容 API**: 支持 DeepSeek、OpenAI、Ollama 等，模型能力更强，但需要网络和 API Key
- **自动模式**: 优先使用 Gemini Nano，不可用时自动降级到 OpenAI

### 7.3 为什么斜杠命令和 AI 自然语言并存？

- **斜杠命令**: 精确、快速、无需 AI，适合常见操作（如 `/close-duplicates`）
- **自然语言**: 灵活、强大，适合复杂场景（如"帮我整理所有标签页，按域名分组，然后关闭重复的"）
- 两者互补：AI 不可用时，斜杠命令作为降级方案

### 7.4 为什么需要预计算 (Precompute)？

某些命令需要先查询浏览器状态才能确定参数，例如：
- `close_duplicate_tabs`: 需要先扫描所有标签找出重复的
- `group_tabs`: 需要先按域名过滤标签获取 ID 列表
- `sort_tabs`: 需要先排序再获取新的 tab 顺序

预计算在 Side Panel 中执行，利用缓存的 context 做本地计算，减少与 Service Worker 的通信次数。

### 7.5 为什么有两种 UI 实现 (旧版 JS + Vue Composable)？

项目正在从纯 JavaScript 向 Vue 3 + TypeScript 迁移。`src/sidepanel/index.js` 是旧版实现，`src/composables/useAIEngine.ts` 是 Vue 重构版，两者功能相同。当前 `App.vue` 使用新版 Composable。

### 7.6 错误处理策略

- **结构化错误码**: 15+ 个预定义错误码，覆盖元素、操作、页面、通信、限制五类
- **连续失败保护**: 连续 3 次失败自动停止
- **超时保护**: 单步 10s，总任务 120s
- **JSON 解析容错**: 修复 AI 输出的常见格式问题，最多重试 2 次
- **危险操作确认**: 5 类危险操作需要用户二次确认
- **上下文压缩**: 对话超过 30 条时自动压缩，保留最近 20 条
- **结果安全处理**: 截断大字符串、过滤 data URL、检测循环引用

---

## 附录 A: 斜杠命令速查表

| 命令 | 别名 | 参数 | 说明 |
|------|------|------|------|
| `/close-duplicates` | cd, dedup, 去重 | - | 关闭所有重复标签页 |
| `/find` | f, search, 搜索 | 关键词 | 查找标签页 |
| `/close-domain` | cdd | 域名 | 关闭指定域名的所有标签 |
| `/bookmark` | bm, 收藏 | - | 添加当前页为书签 |
| `/group` | g, 分组 | 组名 [域名/关键词] | 创建标签分组 |
| `/ungroup` | ug, 解组 | - | 取消所有标签分组 |
| `/reopen` | undo, 恢复 | - | 恢复最近关闭的标签 |
| `/sort` | s | domain \| title | 排序标签页 |
| `/mute` | m | 域名 | 静音指定域名标签 |
| `/history` | hi | 关键词 | 搜索浏览历史 |
| `/pin` | 固定, p | - | 固定/取消固定当前标签 |
| `/reload` | r, 刷新 | all(可选) | 刷新当前标签 |
| `/close-other` | co, 保留当前 | - | 关闭其他标签 |
| `/duplicate` | dup, 复制 | - | 复制当前标签页 |
| `/remove-bookmark` | rb, 删书签 | 关键词 | 删除匹配的书签 |
| `/move` | mv, 移动 | 位置序号 | 移动当前标签 |
| `/discard` | dc, 休眠 | 域名(或all) | 休眠标签页释放内存 |
| `/unmute` | um, 取消静音 | 域名 | 取消静音 |
| `/screenshot` | shot, 截图 | 标签关键词(可选) | 截取页面截图 |
| `/zoom` | z, 缩放 | in/out/reset | 缩放当前页面 |
| `/downloads` | dl, 下载 | - | 打开下载管理页面 |
| `/new-window` | nw, 新窗口 | URL(可选) | 在新窗口打开 URL |
| `/group-by-domain` | gbd, 域名分组 | - | 按域名分组 |
| `/list-groups` | lg, 分组列表 | - | 列出所有标签分组 |
| `/rename-group` | rg, 重命名组 | 新名称 | 重命名标签分组 |
| `/theme` | 主题 | 模式或颜色 | 查看/设置主题 |
| `/font-size` | fs, 字号 | 字号(可选) | 查看/设置字号 |
| `/font` | 字体 | 字体名(可选) | 查看/设置字体 |
| `/clear-history` | ch, 清历史 | today/week/month/all | 删除浏览历史 |
| `/cookies` | ck, Cookie | 域名 | 查看 Cookie |
| `/clear-cookies` | cc, 清Cookie | 域名 | 清除 Cookie |
| `/top-sites` | ts, 常用网站 | - | 查看最常访问网站 |
| `/extensions` | ext, 扩展 | - | 查看所有扩展 |
| `/enable-extension` | ee, 启用扩展 | 名称或ID | 启用扩展 |
| `/disable-extension` | de, 禁用扩展 | 名称或ID | 禁用扩展 |
| `/uninstall-extension` | ue, 卸载扩展 | 名称或ID | 卸载扩展 |
| `/site-perms` | sp, 网站权限 | 域名 | 查看网站权限 |
| `/set-site-perm` | ssp, 设权限 | 域名 类型 值 | 设置网站权限 |
| `/storage-get` | sg, 读存储 | key | 读取扩展存储 |
| `/storage-set` | ss, 写存储 | key value | 写入扩展存储 |
| `/storage-remove` | srm, 删存储 | key | 删除扩展存储 |
| `/record-tab` | rt, 录标签 | - | 录制当前标签页 |
| `/record-screen` | rs, 录屏 | - | 录制桌面/窗口 |
| `/stop-record` | sto, 停录 | - | 停止录制 |
| `/dom` | 页面操作 | query/modify/remove/add/style | DOM 操作 |
| `/help` | h, ?, 帮助 | - | 显示所有命令 |

## 附录 B: 错误码参考

| 错误码 | 类别 | 说明 |
|--------|------|------|
| `ELE_NOT_FOUND` | 元素 | 未找到目标元素 |
| `ELE_NOT_VISIBLE` | 元素 | 元素不可见 |
| `ELE_DISABLED` | 元素 | 元素被禁用 |
| `ELE_STALE` | 元素 | 元素已从 DOM 中移除 |
| `ELE_OBSCURED` | 元素 | 元素被遮挡 |
| `ACT_TIMEOUT` | 操作 | 操作执行超时 (10s) |
| `ACT_BLOCKED` | 操作 | 操作被浏览器拦截 |
| `ACT_NO_EFFECT` | 操作 | 操作无效果 |
| `ACT_PARTIAL` | 操作 | 操作部分成功 |
| `PAGE_BLOCKED` | 页面 | 受保护页面 (chrome://) |
| `PAGE_LOADING` | 页面 | 页面正在加载 |
| `PAGE_CRASHED` | 页面 | 页面崩溃 |
| `PAGE_REDIRECT` | 页面 | 页面发生重定向 |
| `COM_DISCONNECTED` | 通信 | Service Worker 连接断开 |
| `COM_TIMEOUT` | 通信 | 通信超时 |
| `LIM_TOO_MANY_ELEMENTS` | 限制 | 页面元素过多 |
| `LIM_STEP_MAX` | 限制 | 达到最大执行步数 |
| `LIM_CONTEXT_OVERFLOW` | 限制 | 上下文溢出 |