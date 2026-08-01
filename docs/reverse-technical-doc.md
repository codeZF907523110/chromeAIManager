# AI Browser Commander — 反向整理技术文档

> **整理日期**: 2026-07-28  
> **版本**: v0.1.0  
> **项目类型**: Chrome Extension (Manifest V3)  
> **核心技术**: Vanilla JS ES Modules + Chrome Extensions API + AI Agent Loop

---

## 一、项目概述

### 1.1 定位
"AI 浏览器管家" — 一个键盘驱动的 AI 浏览器命令中心。用户通过自然语言或斜杠命令管理标签页、书签、浏览历史、页面 DOM、扩展、Cookie、权限、主题字体、录制等。

### 1.2 核心亮点
- **Agent Loop 自主执行架构**：AI 以「观察→思考→执行→验证」的循环自主完成任务，代码仅做机械执行
- **双模式交互**：斜杠命令（精确、本地匹配）+ 自然语言（AI Agent Loop）
- **双 AI 后端**：Gemini Nano（Chrome 内置离线）+ OpenAI 兼容 API（DeepSeek/Ollama/OpenAI 等）
- **页面 DOM 操控**：通过 Content Script 扫描页面元素，AI 自主选择并操作
- **屏幕/标签录制**：通过 Offscreen Document + MediaRecorder 实现

---

## 二、项目结构

```
chromeAIManager/
├── manifest.json                         # Chrome 扩展清单
├── icons/                                # 扩展图标 (16/32/48/128)
├── docs/
│   └── architecture.md                   # 架构设计文档（正向）
└── src/
    ├── sidepanel/                        # 侧边面板（UI + 核心逻辑）
    │   ├── index.html                    # 面板 HTML
    │   ├── index.js                      # 主逻辑（SidePanel 类 + Agent Loop）
    │   ├── style.css                     # 科幻霓虹风格样式
    │   ├── ai/                           # AI 引擎模块
    │   │   ├── api-detector.js           # window.ai API 能力探测
    │   │   ├── engine.js                 # AI 引擎统一入口
    │   │   ├── gemini-nano.js            # Gemini Nano 适配器
    │   │   └── openai-adapter.js         # OpenAI 兼容 API 适配器
    │   └── command/                      # 命令解析模块
    │       ├── confirm.js                # 危险操作确认预览
    │       ├── intent-detector.js        # 意图识别器（已废弃，兼容层）
    │       └── slash-commands.js         # 斜杠命令注册表 + 匹配
    ├── service-worker/                   # Service Worker（后台）
    │   ├── index.js                      # SW 入口（消息路由 + 弹窗注入）
    │   ├── context-collector.js          # 浏览器上下文收集器
    │   ├── executor.js                   # 操作执行器（55+ Chrome API 命令）
    │   └── utils/
    │       └── tab-matcher.js            # 标签查找/去重工具
    ├── content/                          # Content Scripts
    │   ├── dom-commander.js              # DOM 机械手（扫描 + 操作）
    │   └── overlay.js                    # 全屏覆盖层 + iframe 弹窗注入
    ├── offscreen/                        # Offscreen Document
    │   ├── recorder.html                 # 录制文档 HTML
    │   └── recorder.js                   # MediaRecorder 录制逻辑
    └── shared/                           # 共享模块
        ├── commands.js                   # 命令定义注册表（55+ 命令）
        ├── constants.js                  # 消息类型常量 + 错误码
        ├── json-repair.js                # 容错 JSON 解析（处理 AI 输出）
        └── prompts.js                    # Agent 系统提示词生成
```

---

## 三、技术栈

| 层次 | 技术 |
|------|------|
| 平台 | Chrome Extension Manifest V3 |
| 语言 | ES Modules (原生 JS，无框架) |
| UI | 原生 DOM 操作 + CSS（科幻霓虹风格） |
| AI 后端 | Gemini Nano (window.ai) / OpenAI Compatible API |
| 录制 | MediaRecorder API + Offscreen Documents |
| 通信 | chrome.runtime.sendMessage (SW ↔ SidePanel ↔ ContentScript) |
| 存储 | chrome.storage.local（持久）/ chrome.storage.session（会话） |

---

## 四、架构设计

### 4.1 架构总览

```
┌──────────────────────────────────────────────┐
│                 AI Agent                      │
│  观察 → 思考 → 计划 → 执行 → 验证 → 调整      │
│        (唯一的智能体，全部决策)                │
└──────────────────────────────────────────────┘
       │ 命令                     ▲ 原始结果
       ▼                          │
┌──────────────────┐    ┌──────────────────────┐
│  Content Script   │    │   Service Worker     │
│  (纯机械手)        │    │   (纯管道)            │
│  只执行，不理解     │    │  只转发，不判断       │
└──────────────────┘    └──────────────────────┘
```

### 4.2 数据流

```
用户输入 (自然语言/斜杠命令)
  │
  ▼
┌──────────────────────────────────────────────────┐
│  Side Panel (src/sidepanel/index.js)              │
│                                                   │
│  SidePanel.handleSubmit()                         │
│    ├─ 斜杠命令 → matchSlashCommand() → dispatchToSW()
│    └─ 自然语言 → agentLoop()                       │
│         ├─ 扫描页面 (PAGE_SCAN → elements[])       │
│         ├─ 构建 messages[system + lessons + ...]  │
│         └─ 循环 (max 12 steps):                   │
│              ├─ AI.chat() → {thought,action,...}  │
│              ├─ exec → _executeCommand() → SW     │
│              ├─ scan → 重扫页面                   │
│              ├─ done → 展示结果，清理             │
│              └─ ask  → 暂停，保留上下文           │
└──────────────────────────────────────────────────┘
         │ MSG_EXECUTE               ▲ 结果
         ▼                           │
┌──────────────┐    ┌──────────────────────────────┐
│ Service Worker│    │  Content Script               │
│ (index.js)   │    │  (dom-commander.js)           │
│              │    │                               │
│ executeCmd() │    │  PAGE_SCAN({filter}) →        │
│  → 路由handler│    │    elements[]                 │
│  → 返回原始结果│    │                               │
│              │    │  DOM_COMMAND → 执行+返回原始结果 │
└──────────────┘    └──────────────────────────────┘
```

### 4.3 核心设计原则

| 原则 | 说明 |
|------|------|
| **零硬编码** | 代码不允许出现任何对具体业务场景的假设（如匹配"登录"、"modal"等） |
| **AI 唯一决策者** | 所有智能判断由 AI 完成，代码只做机械执行和结果转发 |
| **动态规划** | 每步执行后重新评估，而非一次性输出所有步骤 |
| **深度上下文** | 维护完整对话历史、Plan Tracker、Lessons 经验库 |
| **预测性** | 每步执行前 AI 预测结果，执行后系统自动对比验证 |
| **容错机制** | 连续 3 次失败中断、超时保护、消息压缩 |

---

## 五、模块详解

### 5.1 Side Panel — 主控制面板

**文件**: [src/sidepanel/index.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/index.js)

核心类 `SidePanel`，负责：
- **UI 管理**：消息渲染、命令面板、设置面板、历史导航
- **命令路由**：区分斜杠命令和自然语言，分发处理
- **Agent Loop**：AI 自主执行循环的核心编排
- **Plan Tracker**：记录任务目标、当前计划、已完成步骤
- **Lessons 经验库**：session 级别错误经验记录
- **消息持久化**：通过 `chrome.storage.session` 保存/恢复聊天记录

**Agent Loop 关键流程**：
1. 收集上下文（标签、书签）+ 扫描当前页面
2. 构建 messages 数组（system prompt + 历史 + elements[] + user input）
3. 循环调用 AI，解析 JSON 响应，执行 action
4. 支持 `exec`（执行命令）、`scan`（重扫页面）、`done`（完成）、`ask`（暂停等待用户）
5. 每步执行后更新 Plan Tracker、验证预测、记录经验
6. 容错：max 12 步、连续 3 次失败中断、消息超 30 条压缩

### 5.2 Service Worker — 后台服务

**入口**: [src/service-worker/index.js](file:///d:/vue+node/chromeAIManager/src/service-worker/index.js)

职责：
- **消息路由**：处理 `GET_CONTEXT`、`GET_BOOKMARKS`、`EXECUTE` 三类消息
- **弹窗注入**：点击扩展图标时注入 `overlay.js` 到当前页面
- **录制消息**：`START_*` / `STOP_RECORDING` 类型的消息由 offscreen 文档处理，SW 忽略

**上下文收集器**: [src/service-worker/context-collector.js](file:///d:/vue+node/chromeAIManager/src/service-worker/context-collector.js)
- 支持 `summary`（摘要）和 `detailed`（详情）两种模式
- 摘要模式：返回标签数量分布、书签文件夹、分组数
- 详情模式：返回所有标签信息（截断上限 120 个），支持 query 过滤

**操作执行器**: [src/service-worker/executor.js](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.js)
- 包含 55+ Chrome API 操作的处理函数，覆盖所有命令

#### 5.2.1 执行器命令清单

**标签操作 (11 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `close_tabs` | handleCloseTabs | 关闭指定标签 |
| `focus_tab` | handleFocusTab | 查找并聚焦标签 |
| `mute_tabs` | handleMuteTabs | 静音标签 |
| `unmute_tabs` | handleUnmuteTabs | 取消静音 |
| `sort_tabs` | handleSortTabs | 按域名/标题排序 |
| `pin_tab` | handlePinTab | 固定/取消固定 |
| `reload_tabs` | handleReloadTabs | 刷新标签 |
| `close_other_tabs` | handleCloseOtherTabs | 关闭其他标签 |
| `duplicate_tab` | handleDuplicateTab | 复制标签 |
| `move_tab` | handleMoveTab | 移动标签位置 |
| `discard_tabs` | handleDiscardTabs | 休眠释放内存 |

**分组操作 (4 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `group_tabs` | handleGroupTabs | 创建标签组 |
| `ungroup_tabs` | handleUngroupTabs | 取消分组 |
| `auto_group_by_domain` | handleAutoGroupByDomain | 按域名自动分组 |
| `list_groups` | handleListGroups | 列出所有分组 |
| `rename_group` | handleRenameGroup | 重命名分组 |

**书签操作 (12 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `add_bookmark` | handleAddBookmark | 添加书签 |
| `open_bookmark` | handleOpenBookmark | 搜索并打开书签 |
| `list_bookmarks` | handleListBookmarks | 列出书签 |
| `remove_bookmark` | handleRemoveBookmark | 删除书签 |
| `add_bookmark_to_folder` | handleAddBookmarkToFolder | 添加到文件夹 |
| `create_bookmark_folder` | handleCreateBookmarkFolder | 创建文件夹 |
| `delete_bookmarks_in_folder` | handleDeleteBookmarksInFolder | 清空文件夹 |
| `sort_bookmarks_in_folder` | handleSortBookmarksInFolder | 排序书签 |
| `move_bookmark_to_folder` | handleMoveBookmarkToFolder | 移动书签到文件夹 |
| `reorder_bookmark` | handleReorderBookmark | 调整书签位置 |
| `rename_bookmark_folder` | handleRenameBookmarkFolder | 重命名文件夹 |
| `delete_bookmark_folder` | handleDeleteBookmarkFolder | 删除文件夹 |
| `move_bookmark_folder` | handleMoveBookmarkFolder | 移动文件夹 |

**历史操作 (3 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `reopen_tab` | handleReopenTab | 恢复已关闭标签 |
| `search_history` | handleSearchHistory | 搜索历史 |
| `delete_history` | handleDeleteHistory | 删除历史 |

**导航 & 窗口 (3 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `navigate` | handleNavigate | 导航到 URL |
| `new_window` | handleNewWindow | 新窗口 |
| `open_downloads` | handleOpenDownloads | 打开下载页 |

**页面控制 (2 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `screenshot` | handleScreenshot | 截图可见区域 |
| `zoom_tab` | handleZoomTab | 缩放页面 |

**外观设置 (6 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `get_theme` | handleGetThemeSettings | 查看主题 |
| `set_theme` | handleSetThemeSettings | 设置主题 (light/dark/color) |
| `get_font_size` | handleGetFontSize | 查看字号 |
| `set_font_size` | handleSetFontSize | 设置字号 |
| `get_font_family` | handleGetFontFamily | 查看字体 |
| `set_font_family` | handleSetFontFamily | 设置字体 |

**Cookie (2 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `get_cookies` | handleGetCookies | 查看 Cookie |
| `clear_cookies` | handleClearCookies | 清除 Cookie |

**扩展管理 (4 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `list_extensions` | handleListExtensions | 列出扩展 |
| `enable_extension` | handleEnableExtension | 启用扩展 |
| `disable_extension` | handleDisableExtension | 禁用扩展 |
| `uninstall_extension` | handleUninstallExtension | 卸载扩展 |

**网站权限 (2 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `get_site_permissions` | handleGetSitePermissions | 查看权限 |
| `set_site_permission` | handleSetSitePermission | 设置权限 |

**存储 (3 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `storage_get` | handleStorageGet | 读存储 |
| `storage_set` | handleStorageSet | 写存储 |
| `storage_remove` | handleStorageRemove | 删存储 |

**录制 (3 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `record_tab` | handleRecordTab | 录制标签页 |
| `record_screen` | handleRecordScreen | 录制桌面 |
| `stop_record` | handleStopRecord | 停止录制 |

**DOM 操作 (1 个)**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `dom_manipulate` | handleDOMManipulate | 对当前页面 DOM 增删改查和事件 |

**其他**：
| 命令 | 函数 | 说明 |
|------|------|------|
| `get_top_sites` | handleGetTopSites | 常用网站 |

### 5.3 Content Scripts

#### 5.3.1 DOM Commander（常驻）

**文件**: [src/content/dom-commander.js](file:///d:/vue+node/chromeAIManager/src/content/dom-commander.js)

注入到所有页面 (`<all_urls>`, `run_at: document_idle`)，运行在 isolated world。

**核心功能**：

| 功能 | 说明 |
|------|------|
| `scanPage(filter)` | 扫描页面可交互元素，返回扁平 `elements[]` 列表（上限 80）。支持 AI 指定的 filter（tag/type/text/name/id/disabled/checked/hidden） |
| `fuzzyTextSearch(text)` | 按文本模糊匹配元素 |
| `simulateClick(el)` | 模拟真实点击（mousedown + mouseup + click） |
| `simulateInput(el, val)` | 原生 setter 设值 + 完整事件链（input/change/compositionstart/update/end/keydown/keyup） |
| `simulateSubmit(el)` | 表单提交 |
| `isHidden(el)` | offsetParent + computedStyle 判断可见性 |

**DOM 操作类型**：
- `query` — 查询元素（支持 text/html/attr:* 等 property）
- `modify` — 修改元素内容/属性/样式
- `remove` — 删除元素
- `add` — 创建并添加子元素
- `style` — 批量设置样式
- `event` — 触发事件（click/dblclick/input/change/focus/blur/submit/scroll/select/keydown/keyup/mouseenter/mouseleave）

**扁平元素模型 (`elements[]`)**：
```json
{
  "url": "...",
  "title": "...",
  "count": 4,
  "truncated": false,
  "elements": [
    {
      "tag": "input",
      "text": null,
      "hidden": false,
      "attrs": {
        "type": "text",
        "placeholder": "...",
        "name": "q",
        "id": "search",
        "_props": { "value": "", "disabled": false }
      }
    }
  ]
}
```

关键设计：`attrs` 包含元素全部 DOM 属性（不含 class/style），`_props` 补充 JS 属性（value/checked/disabled/readonly/href）。

#### 5.3.2 Overlay（弹窗注入）

**文件**: [src/content/overlay.js](file:///d:/vue+node/chromeAIManager/src/content/overlay.js)

点击扩展图标时注入，创建一个全屏半透明覆盖层 + 居中 iframe 弹窗（860x600px）加载 Side Panel。
- 支持点击遮罩关闭、按 Escape 关闭
- 支持动画（fade in/out + scale）
- 通过 `postMessage` 支持截图复制到剪贴板
- 使用 MutationObserver 兜底清理标记

### 5.4 Offscreen Document — 录制引擎

**文件**: [src/offscreen/recorder.js](file:///d:/vue+node/chromeAIManager/src/offscreen/recorder.js)

通过 Chrome Offscreen Documents API 创建隐藏文档，使用 `navigator.mediaDevices.getUserMedia` + `MediaRecorder` 实现：
- **标签录制**：通过 `chrome.tabCapture.getMediaStreamId` 获取流 ID
- **桌面录制**：通过 `chrome.desktopCapture.chooseDesktopMedia` 弹出选择器
- 录制格式：VP9/webm → VP8/webm → webm 降级
- 码率：2.5 Mbps，每秒收集一次数据
- 停止时通过 FileReader 转 base64 dataUrl 返回，自动触发下载

### 5.5 AI Engine — 多后端支持

**文件**: [src/sidepanel/ai/engine.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/engine.js)

统一 AI 入口，自动选择后端：

| 后端 | 条件 | 说明 |
|------|------|------|
| Gemini Nano | `window.ai` 可用 + 配置为 auto/gemini-nano | Chrome 内置，离线推理 |
| OpenAI 兼容 | API Key 已配置 + 配置为 auto/openai | 支持 OpenAI/DeepSeek/Ollama/LM Studio 等 |

**API 探测器** ([api-detector.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/api-detector.js))：
- 探测 3 种形态：`window.ai.languageModel`、`window.ai.assistant`、`chrome.aiOriginTrial.languageModel`

**OpenAI 适配器** ([openai-adapter.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.js))：
- 支持完整的 messages 数组（Agent Loop 专属）
- 自动请求 `host_permissions`
- 对 OpenAI/DeepSeek/Groq 自动启用 `response_format: json_object`
- 60s 超时 + AbortController

**Gemini Nano 适配器** ([gemini-nano.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/gemini-nano.js))：
- 支持 session 自动恢复（过期重创建）

### 5.6 Shared Modules — 共享模块

#### 5.6.1 命令注册表 ([commands.js](file:///d:/vue+node/chromeAIManager/src/shared/commands.js))

定义 `COMMANDS[]` 数组，每个命令包含：
- `intent` — 用户意图名
- `description` — 描述
- `dangerous` — 是否需要确认
- `slots` — 参数定义（类型、是否可选、描述）
- `swIntent` — 对应的 SW executor 命令名
- `requiresPrecompute` — 是否需要在 Side Panel 预计算（如根据域名筛选 tabIds）

导出 `COMMAND_MAP`（intent → command 的 Map 结构）。

**特殊命令**：
- `show_help` (swIntent: null) — 纯 UI 操作，显示帮助
- `chat` (swIntent: null) — 纯 AI 回复，无 Chrome API 操作
- `unknown` — 容错兜底

#### 5.6.2 消息常量 ([constants.js](file:///d:/vue+node/chromeAIManager/src/shared/constants.js))

```javascript
// Side Panel → Service Worker
MSG_GET_CONTEXT   = 'GET_CONTEXT'     // 获取浏览器上下文
MSG_GET_BOOKMARKS = 'GET_BOOKMARKS'   // 获取书签
MSG_EXECUTE       = 'EXECUTE'         // 执行命令

// Service Worker → Side Panel
MSG_EXECUTE_RESULT = 'EXECUTE_RESULT' // 执行结果

// 错误码
ERRORS = {
  UNKNOWN_TYPE, EMPTY_INPUT, NO_AI_BACKEND, AI_PARSE_FAILED,
  UNKNOWN_INTENT, UNKNOWN_SLASH, EXECUTION_FAILED,
  NO_TABS_FOUND, HOST_PERMISSION_DENIED
}
```

#### 5.6.3 JSON 修复器 ([json-repair.js](file:///d:/vue+node/chromeAIManager/src/shared/json-repair.js))

容错解析 AI 输出的 JSON：
1. 移除 markdown 代码块标记 (```json ... ```)
2. 直接解析 JSON
3. 提取 `{...}` 花括号内容
4. 修复尾部逗号、单引号转双引号

#### 5.6.4 Prompt 生成器 ([prompts.js](file:///d:/vue+node/chromeAIManager/src/shared/prompts.js))

`buildAgentSystemPrompt(context)` — 生成 Agent 系统提示词，包含：
- AI 角色定义（自主执行代理）
- 输出格式定义（JSON 结构：thought/action/plan/predict/command/reply）
- action 类型说明（exec/scan/done/ask）
- scanFilter 机制说明
- 可用命令列表（从 COMMANDS 动态生成）
- 通用原则（12 条，确保 AI 行为可控）
- 上下文注入（标签列表、lessons 经验、页面元素 elements[]）

### 5.7 Command Module — 命令模块

#### 5.7.1 斜杠命令 ([slash-commands.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/slash-commands.js))

定义 `SLASH_COMMANDS[]`，每个包含：
- `slash` — 命令名
- `intent` — 对应 intent
- `description` — 描述
- `aliases` — 中文/英文别名
- `hasArg` / `placeholder` — 参数提示

`matchSlashCommand(input)` — 解析斜杠命令：
1. 精确匹配 slash 名
2. 别名匹配
3. 前缀模糊匹配
4. 返回 `{intent, slots}` 或错误

#### 5.7.2 确认中间件 ([confirm.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/confirm.js))

`generateConfirmPreview(intent, slots, context)` — 为危险操作生成确认卡片，包含：
- 操作标题和描述
- 影响的标签/书签列表
- 确认/取消按钮

支持的危险操作：close_duplicate_tabs, close_tabs_by_domain, close_other_tabs, remove_bookmark, delete_history, delete_bookmarks_in_folder, delete_bookmark_folder, clear_cookies, uninstall_extension, storage_remove。

#### 5.7.3 意图识别器 (已废弃) ([intent-detector.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/intent-detector.js))

已被 Agent Loop 替代，保留作为兼容层。原用于将用户的自然语言通过 AI 转为确定性命令。

---

## 六、通信协议

### 6.1 消息通道

所有通信通过 `chrome.runtime.sendMessage` 进行：

```
Side Panel  ←→  Service Worker  ←→  Content Script
   (iframe)      (background)         (injected)

Offscreen Document
   (recorder)  ←→  Service Worker
```

### 6.2 消息类型

| 方向 | 类型 | 说明 |
|------|------|------|
| SP → SW | `GET_CONTEXT` | 获取浏览器上下文（标签/书签） |
| SP → SW | `GET_BOOKMARKS` | 获取书签 |
| SP → SW | `EXECUTE` | 执行 Chrome API 命令 |
| SW → CS | `PAGE_SCAN` | 扫描当前页面元素（支持 filter） |
| SW → CS | `DOM_COMMAND` | 执行 DOM 操作 |
| SW → CS | `CLOSE_OVERLAY` | 关闭弹窗 |
| SW → Offscreen | `START_TAB_RECORDING` | 开始标签录制 |
| SW → Offscreen | `START_DESKTOP_RECORDING` | 开始桌面录制 |
| SW → Offscreen | `STOP_RECORDING` | 停止录制 |

### 6.3 Content Script 内部消息

- `PAGE_SCAN` — 扫描页面，返回 `elements[]`
- `DOM_COMMAND` — 执行 6 类 DOM 操作，按 `params.action` 分发

### 6.4 iframe → 父页面通信

- 通过 `window.parent.postMessage` 传递 `COPY_SCREENSHOT` 消息（截图 dataUrl），由 overlay.js 的 `window.addEventListener("message")` 处理，将 base64 图片写入剪贴板。

---

## 七、Agent Loop 详细机制

### 7.1 输出规范

AI 每轮输出 JSON：

```json
{
  "thought": "推理：看到了什么，为什么做这一步",
  "action": "exec|done|ask|scan",
  "plan": "剩余计划简述（可选）",
  "predict": "预期执行结果（可选，系统自动验证）",
  "command": { "intent": "...", "slots": {...} },
  "reply": "给用户的最终文本（done/ask 时用）"
}
```

### 7.2 Plan Tracker

```javascript
{
  goal: "用户表达的目标",
  currentPlan: "AI声明的剩余步骤计划",
  steps: [
    { step: 1, thought: "推理", intent: "dom_manipulate", result: {...}, status: "ok" },
  ]
}
```

### 7.3 Lessons 经验库

```javascript
[
  { domain: "example.com", error: "未找到匹配元素", intent: "dom_manipulate", timestamp: ... },
]
```
- Session 级别，最多保留 10 条
- 失败时自动记录
- 注入到后续 prompt 中作为经验

### 7.4 Predict 验证

系统自动对比 AI 预测与执行结果：
```javascript
_verifyPredict(predict, result) {
  // 将预测拆分为关键词，检查是否出现在结果 JSON 中
  // 不匹配 → 追加 system message: "⚠ 预测不匹配..."
}
```

### 7.5 容错机制

| 机制 | 参数 |
|------|------|
| 最大步数 | 12 steps |
| 连续失败中断 | 3 次 |
| 消息压缩 | 超过 30 条：保留 system + lessons + 最近 28 轮 |
| 超时保护 | 60s（OpenAI adapter 级别） |

---

## 八、UI 设计

### 8.1 布局结构

```
┌─────────────────────────────┐
│  Header (标题 + 设置按钮)    │
├─────────────────────────────┤
│                             │
│  Messages (消息展示区)       │
│  - 用户消息 (右对齐气泡)     │
│  - AI 回复 (左对齐气泡)      │
│  - 系统消息 (居中灰色)       │
│  - 错误消息 (红色左边界)     │
│  - 确认卡片 (黄色边框)       │
│  - 截图 (图片渲染)           │
│                             │
├─────────────────────────────┤
│  Command Input (命令输入区)  │
│  [✦] [_____________] [▶]    │
│  装饰粒子线                  │
└─────────────────────────────┘
```

### 8.2 设计风格
- **科幻霓虹风格**：深色背景（#060812）+ 青色主题色（#00e5ff）
- 玻璃拟态（backdrop-filter: blur）+ 发光边框动画
- 扫描线覆盖效果（opacity: 0.03）
- 输入框聚焦发光扫过动画（glowSweep）
- 装饰粒子线呼吸动画（dotBlink）

### 8.3 交互功能
- **命令面板**：输入 `/` 弹出命令建议（实时过滤、键盘导航、点击选择）
- **命令历史**：上/下箭头键浏览历史输入
- **设置面板**：AI Provider / API Key / Endpoint / Model 配置
- **确认卡片**：危险操作二次确认，显示影响的标签/书签列表

---

## 九、权限清单

```json
{
  "permissions": [
    "tabs", "bookmarks", "sessions", "history", "storage",
    "tabGroups", "scripting", "activeTab", "browsingData",
    "fontSettings", "cookies", "topSites", "management",
    "contentSettings", "privacy", "tabCapture", "desktopCapture",
    "notifications", "downloads", "offscreen"
  ],
  "host_permissions": ["<all_urls>"]
}
```

---

## 十、配置项

通过 `chrome.storage.local` 持久化存储：

| 键 | 默认值 | 说明 |
|------|------|------|
| `aiProvider` | `"auto"` | AI 后端：auto / gemini-nano / openai |
| `apiKey` | `""` | OpenAI 兼容 API Key |
| `apiEndpoint` | `"https://api.deepseek.com"` | API 端点（默认 DeepSeek） |
| `modelName` | `"deepseek-chat"` | 模型名称 |
| `themeMode` | `"device"` | 主题模式：light / dark / device |
| `themeColor` | `"#00e5ff"` | 主题色 |
| `recordingState` | `"idle"` | 录制状态：idle / starting / recording / stopping |

通过 `chrome.storage.session` 存储：
- `lastInput` — 上次输入内容
- `messageLog` — 最近 50 条消息（恢复用）

---

## 十一、构建与部署

### 11.1 无需构建
项目使用原生 ES Modules，无构建工具依赖。直接加载为 Chrome 扩展即可。

### 11.2 安装步骤
1. 打开 Chrome → `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目根目录

### 11.3 快捷键
- `Ctrl+Shift+U` (Windows) / `Command+Shift+U` (Mac) — 打开 AI 命令面板

### 11.4 最低要求
- Chrome >= 125（Manifest V3 + ES Modules in Service Worker）

---

## 十二、关键文件索引

| 文件 | 行数 | 核心职责 |
|------|------|------|
| [manifest.json](file:///d:/vue+node/chromeAIManager/manifest.json) | 70 | 扩展清单配置 |
| [src/sidepanel/index.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/index.js) | 1077 | 主逻辑：Agent Loop + UI 渲染 |
| [src/sidepanel/index.html](file:///d:/vue+node/chromeAIManager/src/sidepanel/index.html) | 91 | 面板 HTML 结构 |
| [src/sidepanel/style.css](file:///d:/vue+node/chromeAIManager/src/sidepanel/style.css) | 521 | 科幻霓虹风格样式 |
| [src/service-worker/index.js](file:///d:/vue+node/chromeAIManager/src/service-worker/index.js) | 60 | SW 入口 + 消息路由 |
| [src/service-worker/executor.js](file:///d:/vue+node/chromeAIManager/src/service-worker/executor.js) | 1754 | 55+ Chrome API 命令实现 |
| [src/service-worker/context-collector.js](file:///d:/vue+node/chromeAIManager/src/service-worker/context-collector.js) | 134 | 浏览器上下文收集 |
| [src/content/dom-commander.js](file:///d:/vue+node/chromeAIManager/src/content/dom-commander.js) | 533 | DOM 扫描 + 操作执行 |
| [src/content/overlay.js](file:///d:/vue+node/chromeAIManager/src/content/overlay.js) | 137 | 弹窗注入 + 截图复制 |
| [src/offscreen/recorder.js](file:///d:/vue+node/chromeAIManager/src/offscreen/recorder.js) | 142 | MediaRecorder 录制引擎 |
| [src/shared/commands.js](file:///d:/vue+node/chromeAIManager/src/shared/commands.js) | 661 | 55+ 命令定义注册表 |
| [src/shared/prompts.js](file:///d:/vue+node/chromeAIManager/src/shared/prompts.js) | 163 | Agent 系统提示词生成 |
| [src/shared/constants.js](file:///d:/vue+node/chromeAIManager/src/shared/constants.js) | 22 | 消息类型 + 错误码 |
| [src/shared/json-repair.js](file:///d:/vue+node/chromeAIManager/src/shared/json-repair.js) | 22 | JSON 容错解析 |
| [src/sidepanel/ai/engine.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/engine.js) | 73 | AI 引擎统一入口 |
| [src/sidepanel/ai/api-detector.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/api-detector.js) | 42 | window.ai 能力探测 |
| [src/sidepanel/ai/openai-adapter.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/openai-adapter.js) | 69 | OpenAI 兼容 API 适配器 |
| [src/sidepanel/ai/gemini-nano.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/ai/gemini-nano.js) | 44 | Gemini Nano 适配器 |
| [src/sidepanel/command/slash-commands.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/slash-commands.js) | 688 | 斜杠命令注册 + 匹配 |
| [src/sidepanel/command/confirm.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/confirm.js) | 160 | 危险操作确认预览 |
| [src/sidepanel/command/intent-detector.js](file:///d:/vue+node/chromeAIManager/src/sidepanel/command/intent-detector.js) | 85 | 意图识别器（已废弃） |
| [src/service-worker/utils/tab-matcher.js](file:///d:/vue+node/chromeAIManager/src/service-worker/utils/tab-matcher.js) | 52 | 标签去重/搜索工具 |
| [docs/architecture.md](file:///d:/vue+node/chromeAIManager/docs/architecture.md) | 457 | 架构设计文档（正向） |

---

> **总代码量**: ~4500 行 JavaScript + ~600 行 CSS + ~100 行 HTML + ~70 行 JSON
