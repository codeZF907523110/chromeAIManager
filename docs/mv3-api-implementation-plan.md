# Manifest V3 全量能力接入实施方案

## 1. 背景与目标

当前扩展已声明多个 Chrome Manifest V3 权限，但 AI 实际可调用的工具只覆盖少量 API，且存在以下问题：

- 工具名称、参数类型和 Chrome 原生 API 不完全一致。
- 部分 handler 返回自定义字段，AI 难以依据返回结果继续规划。
- 标签组、标签页和书签之间的关系信息不足。
- `tabs_group_by_domain` 只能按域名批量分组，无法准确完成“创建指定名称的分组并移动匹配标签”。
- Service Worker、Side Panel、Content Script 的能力边界没有在工具协议中明确体现。
- 缺少统一的参数校验、风险控制、敏感数据脱敏和真实状态回读。
- `$ref` 只支持简单字段，无法稳定串联“查询 → 筛选 → 修改”流程。

目标是建立一套**完整、可验证、按上下文和风险控制的 Manifest V3 能力目录**，让 AI 只调用已经注册、参数合法、行为明确的工具，并让返回结果与 Chrome 实际状态一致。

本方案不等于把所有 Chrome API 无条件开放给 AI。高风险 API 必须经过策略限制、二次确认和审计；任意 JavaScript、Cookie、API Key、Debugger 等能力禁止直接交给模型。

---

## 2. 实施边界

### 2.1 第一阶段：核心浏览器能力

优先实现用户最常使用、能够直接验证结果的能力：

- `tabs`
- `windows`
- `tabGroups`
- `bookmarks`
- `history`
- `sessions`
- `downloads`
- `browsingData`
- `cookies`
- `contentSettings`
- `notifications`
- `storage`
- `topSites`
- 已有 Content Script 页面交互能力

### 2.2 第二阶段：扩展与高风险能力

在第一阶段稳定后单独评审和实现：

- `management`
- `privacy`
- `scripting`
- `alarms`
- `pageCapture`
- `tts`
- `webNavigation`
- `declarativeNetRequest`
- `desktopCapture`

### 2.3 不作为普通 AI 工具开放的能力

以下能力由扩展固定逻辑使用，不能作为 AI 任意调用入口：

- `runtime`
- `sidePanel`
- `offscreen`
- `commands`
- `action`

以下能力不纳入普通 AI 工具集：

- 任意 JavaScript 或 `eval`
- 远程代码执行
- `debugger`
- 完整网络抓包
- 向 AI 传递 Cookie、Session Token、API Key
- 将手写 DOM 快照宣称为 Chrome 原生 Accessibility Tree

---

## 3. 当前架构问题

### 3.1 执行链路

当前主要链路为：

```text
Side Panel
  ↓ chrome.runtime.sendMessage
Service Worker
  ↓ dispatchTool
handlers/*
  ↓ chrome.* API
ExecutionResult
  ↓ Side Panel
AI / UI
```

该链路方向正确，但工具契约不够严格：

- `src/shared/commands.ts` 定义了工具和参数。
- `src/service-worker/handlers/index.ts` 注册 handler。
- `src/service-worker/handlers/*.ts` 调用 Chrome API。
- `src/service-worker/index.ts` 负责消息路由。
- `src/service-worker/plan-runner.ts` 负责 plan DAG 和 `$ref`。
- `src/shared/ai/system-prompt.ts` 将工具清单交给 AI。

当前需要避免旧的 `executor.ts` 执行体系与新 `handlers/` 体系并存，必须保证只有一个实际执行入口。

### 3.2 已确认的典型错误

#### 标签页

- `tabs_update` 声明支持 `reload`，但没有始终调用 `chrome.tabs.reload`。
- 使用 `if (!tabId)` 判断 ID，可能错误处理边界值。
- `duplicate`、`discard` 等能力缺失或只通过旧别名间接映射。
- 标签移动的 `index` 语义存在 0-based / 1-based 混用。
- 域名过滤使用简单 `includes`，可能发生误匹配。

#### 标签组

- 旧 `observeGroups` 从标签页反推分组，并伪造颜色和标题。
- 没有完整使用 `chrome.tabGroups.query` 返回真实字段。
- 缺少按名称查找、创建、更新和移动标签的明确工具。
- `tabs.group` / `tabs.ungroup` 与 Service Worker、Side Panel 上下文边界没有统一抽象。

#### 书签

- `bookmarks_open_node` 描述为新标签打开，但旧实现可能复用当前标签。
- `beforeId` 参数未正确转换为 Chrome `parentId/index`。
- 创建节点没有充分校验 folder/bookmark 类型和 URL。
- 缺少独立的 `get`、`getChildren`、`getSubTree`、`search`、`getRecent` 工具。

#### 其它能力

- `permissions` 部分实现是 stub，不能代表完整网站权限能力。
- 主题代码依赖非公开的 `chrome.settings.private`，不可作为稳定 MV3 API。
- `downloads`、`browsingData`、`notifications` 等权限已声明，但实际工具不完整。
- `cookies` 返回值可能包含敏感 Cookie value，不允许直接发送给 AI。
- SW 消息入口缺少严格的 sender 校验和统一参数校验。

---

## 4. 统一工具契约

### 4.1 工具元数据

新增统一工具策略类型，建议包含：

```ts
interface ToolPolicy {
  name: string
  apiNamespace: string
  requiredPermissions: string[]
  allowedContexts: Array<'service-worker' | 'extension-page' | 'content-script'>
  risk: 'L0' | 'L1' | 'L2'
  requiresUserConfirmation: boolean
  hostAccess: 'none' | 'activeTab' | 'declared-host'
  sensitiveOutput: boolean
}
```

所有 AI 工具必须同时具有：

- 工具名
- 参数定义
- 对应 Chrome API
- 所需权限
- 允许调用上下文
- 风险等级
- 确认策略
- 敏感输出策略

### 4.2 统一返回结构

统一 `ExecutionResult` 的语义：

```ts
interface ExecutionResult {
  success: boolean
  code?: string
  message?: string
  suggestion?: string
  data?: unknown
  meta?: {
    api: string
    namespace: string
    durationMs?: number
  }
}
```

为兼容现有 UI，可以暂时保留旧的顶层字段，例如 `tabs`、`groups`、`bookmark`，但新工具应优先使用稳定的 `data` 和 `meta`，并逐步迁移旧字段。

### 4.3 参数校验

在 handler 执行前统一校验：

- 必填字段是否存在。
- `string`、`number`、`boolean`、数组类型是否正确。
- ID 是否为正确类型：`tabId/groupId` 为 number，`bookmark nodeId` 为 string。
- 数组是否为空、是否包含重复值。
- 枚举值是否在 Chrome API 允许范围内。
- URL 是否合法，是否为受保护协议。
- `index` 是否使用统一的 0-based 语义。

错误必须返回：

```ts
{
  success: false,
  code: 'INVALID_PARAMS',
  message: '参数不合法',
  suggestion: '请先调用 tabs_observe 获取有效 tabId'
}
```

不能把错误类型静默转换后继续执行。

---

## 5. Service Worker 安全执行层

### 5.1 消息入口

修改 `src/service-worker/index.ts`：

1. 校验消息来源 `sender.id` 是否为当前扩展。
2. 对消息结构进行 schema 校验。
3. 只允许 canonical tool allowlist。
4. 禁止通过未知字段绕过工具策略。
5. 根据工具策略检查所需权限和上下文。
6. 执行前重新获取目标 tab/window 状态。
7. 对敏感结果执行脱敏。
8. 记录不含敏感数据的执行摘要。

### 5.2 危险操作

危险操作不能只依赖 AI 输出的 `force: true`。确认流程应包含：

1. Service Worker 返回 `NEEDS_CONFIRM`。
2. Side Panel 展示具体目标和影响范围。
3. 用户明确确认。
4. 生成一次性确认标识或受限确认 payload。
5. Service Worker 校验确认上下文后执行。
6. 执行后重新读取真实状态。

高风险操作包括：

- 关闭标签/窗口
- 删除书签
- 删除历史
- 清除浏览数据
- Cookie 读取/写入/删除
- 修改隐私和网站安全设置
- 管理扩展启用/禁用/卸载
- 桌面录屏
- 打开未知下载文件

---

## 6. 第一阶段：标签页、窗口和标签组

### 6.1 标签页工具

完善 `src/service-worker/handlers/tabs.ts`：

- `tabs.query`
- `tabs.get`
- `tabs.create`
- `tabs.update`
- `tabs.reload`
- `tabs.remove`
- `tabs.move`
- `tabs.duplicate`
- `tabs.discard`
- `tabs.highlight`
- `tabs.goBack`
- `tabs.goForward`
- `tabs.captureVisibleTab`
- `tabs.getZoom`
- `tabs.setZoom`
- `tabs.getZoomSettings`
- `tabs.setZoomSettings`

约束：

- 明确当前标签的默认选择规则。
- 所有 tab ID 使用 number。
- `reload` 必须真的调用 `chrome.tabs.reload`。
- `discard` 不允许对活动标签执行。
- `captureVisibleTab` 必须明确捕获的是目标窗口当前可见标签，而不是任意 tab。
- 域名匹配使用 hostname 精确或边界匹配，不使用无约束的 `includes`。

### 6.2 窗口工具

完善 `src/service-worker/handlers/windows.ts`：

- `windows.get`
- `windows.getCurrent`
- `windows.getLastFocused`
- `windows.getAll`
- `windows.create`
- `windows.update`
- `windows.remove`

窗口关闭属于 L2，必须确认。

### 6.3 标签组工具

新建 `src/service-worker/handlers/tab-groups.ts`：

- `tab_groups_query`
- `tab_groups_get`
- `tab_groups_create`
- `tab_groups_update`
- `tab_groups_move_tabs`
- `tab_groups_ungroup_tabs`
- `tabs_group_by_domain`

查询结果必须来自 `chrome.tabGroups.query`，返回：

```ts
{
  id: number
  title?: string
  color: string
  collapsed: boolean
  windowId: number
  tabIds: number[]
  tabs: Array<{ id?: number; title?: string; url?: string; index?: number }>
}
```

“创建指定名称的分组并移动匹配标签”必须拆成可验证步骤：

```text
查询标签 → 明确匹配 tabIds → 创建或查找目标 group → 移动 tabIds → 回读 group 和 tabs
```

不能把该需求降级成“按域名创建多个分组”。

### 6.4 clientExec

需要 Side Panel 用户上下文的操作统一返回：

```ts
{
  success: true,
  clientExec: 'tabs_group_create' | 'tabs_group_move' | 'tabs_ungroup',
  ...payload
}
```

建议逐步将 `usePlanRunner.ts` 中的硬编码 `if/else` 抽成：

```ts
const CLIENT_EXEC_HANDLERS: Record<string, ClientExecHandler> ={}n```

每个 clientExec handler 负责：

- 再次验证 tabId/groupId。
- 调用 `chrome.tabs.group` 或 `chrome.tabs.ungroup`。
- 调用 `chrome.tabGroups.update` 设置属性。
- 返回实际执行结果。

---

## 7. 第二阶段：书签、历史与会话

### 7.1 书签工具

完善 `src/service-worker/handlers/bookmarks.ts`：

- `bookmarks.getTree`
- `bookmarks.get`
- `bookmarks.getChildren`
- `bookmarks.getSubTree`
- `bookmarks.search`
- `bookmarks.getRecent`
- `bookmarks.create`
- `bookmarks.update`
- `bookmarks.move`
- `bookmarks.remove`
- `bookmarks.open`

约束：

- nodeId 始终为 string。
- folder 与 bookmark 类型严格区分。
- bookmark 节点必须有合法 URL。
- `beforeId` 不是 Chrome 原生参数，应先查询目标节点并转换为 `parentId/index`。
- `index` 和 `beforeId` 不能同时传入。
- `bookmarks.open` 明确使用 `chrome.tabs.create` 新建标签。
- 返回完整 `id/parentId/index/title/url/type/dateAdded/path`。
- 删除文件夹及批量删除必须确认。

### 7.2 历史工具

完善 `src/service-worker/handlers/history.ts`：

- `history.search`
- `history.getVisits`
- `history.deleteUrl`
- `history.deleteRange`
- `history.deleteAll`

约束：

- 正确计算 today/yesterday/week/month 时间边界。
- 搜索返回必要字段，不默认发送完整敏感 URL。
- 删除前显示具体 URL 或时间范围。
- `deleteAll` 必须单独强确认。

### 7.3 会话工具

完善 `src/service-worker/handlers/sessions.ts`：

- `sessions.getRecentlyClosed`
- `sessions.restore`
- `sessions.getDevices`

跨设备会话信息应脱敏，批量恢复需要确认。

---

## 8. 第三阶段：下载、浏览数据和存储

### 8.1 下载工具

新建 `src/service-worker/handlers/downloads.ts`：

- `downloads.download`
- `downloads.search`
- `downloads.pause`
- `downloads.resume`
- `downloads.cancel`
- `downloads.show`
- `downloads.open`
- `downloads.erase`
- `downloads.removeFile`

安全要求：

- 校验 URL 协议和 host。
- 校验 filename，禁止任意路径写入。
- 下载未知文件或打开外部文件需要确认。
- 不把文件内容自动上传给 AI。

### 8.2 浏览数据工具

新建 `src/service-worker/handlers/browsing-data.ts`：

- `browsingData.settings`
- `browsingData.remove`
- `browsingData.removeCache`
- `browsingData.removeCookies`

必须明确：

- 时间范围。
- 数据类型。
- 目标范围。
- 是否包含 hosted app data、downloads、passwords 等高风险数据。

所有删除操作 L2 强确认。

### 8.3 存储工具

扩展 `src/service-worker/handlers/storage.ts`：

- `storage.local`
- `storage.session`
- `storage.sync`
- `storage.managed`（只读）

约束：

- API Key 只允许 SW 读取。
- AI 不允许读取任意敏感配置键。
- storage area 必须显式指定。
- 写入和删除返回实际 key 和结果。

---

## 9. 第四阶段：Cookie、网站设置和通知

### 9.1 Cookie

扩展 `src/service-worker/handlers/cookies.ts`：

- `cookies.get`
- `cookies.getAll`
- `cookies.set`
- `cookies.remove`
- `cookies.getAllCookieStores`

安全要求：

- 默认不将 `value`、认证 Cookie、Session Token 发送给 AI。
- 返回结果必须脱敏，例如只返回 name/domain/path/secure/session。
- Cookie 设置和删除需要明确确认。
- 处理 host-only、domain、path、secure、partitionKey 等字段。
- cookies 权限与 host permissions 必须同时校验。

### 9.2 Content Settings

新建或拆出 `content-settings.ts`：

- `contentSettings.get`
- `contentSettings.set`
- `contentSettings.clear`

必须使用合法的 `primaryPattern`，不能把普通 domain 字符串直接当作所有 API 的 pattern。

### 9.3 Notifications

新建 `notifications.ts`：

- `notifications.create`
- `notifications.update`
- `notifications.clear`
- `notifications.getAll`

限制通知频率和敏感文本长度，提供用户关闭入口。

---

## 10. 高风险扩展能力

### 10.1 Management

只提供只读诊断作为默认能力：

- `management.getAll`
- `management.get`
- 权限信息查询

启用、禁用、卸载扩展必须：

- 单独开关。
- 二次确认。
- 禁止操作自身。
- 禁止默认操作安全扩展。

### 10.2 Privacy

默认只读或完全不纳入 AI 工具：

- `privacy.network`
- `privacy.services`
- `privacy.websites`

修改全局隐私设置必须强确认和审计。

### 10.3 Scripting

允许的只能是固定内置脚本：

- 不接受 AI 生成的任意函数。
- 不接受字符串形式的 JavaScript。
- 禁止 `eval`。
- 校验目标 tab、frame、host permission。
- `chrome://`、Web Store、扩展页、部分 PDF 页面禁止注入。

### 10.4 Alarms

如果实现定时任务：

- 任务必须幂等。
- 支持取消和查询。
- 不允许无限驱动 AI 循环。
- 不保证精确到秒。

### 10.5 Desktop Capture

录屏必须保留 Chrome 用户选择界面、可见开始/停止控制和生命周期管理。不能把 `chooseDesktopMedia` 当作普通截图 API。

### 10.6 Declarative Net Request

只允许受控规则集，不能让 AI 任意添加网络拦截规则。规则变更需要确认和回滚能力。

### 10.7 不公开或不稳定 API

删除或隔离对以下能力的依赖：

- `chrome.settings.private`
- 把 `webRequest` 当作 MV3 任意网络拦截能力
- 把手写 DOM tree 当作 Chrome Accessibility API

---

## 11. ContextSnapshot 与 System Prompt

### 11.1 上下文内容

扩展 `src/service-worker/context-collector.ts` 和 `src/shared/ai/system-prompt.ts`，提供：

```ts
interface ContextSnapshot {
  activeTab: {
    id: number
    title: string
    url: string
    hostname: string
    windowId: number
    groupId: number
    index: number
  } | null
  tabs: Array<{
    id: number
    title: string
    url: string
    windowId: number
    groupId: number
    index: number
    active: boolean
    pinned: boolean
  }>
  tabGroups: Array<{
    id: number
    title?: string
    color: string
    collapsed: boolean
    windowId: number
    tabIds: number[]
  }>
  bookmarkFolders: Array<{ id: string; title: string; path: string }>
  windows: Array<{ id: number; focused: boolean; state?: string }>
}
```

### 11.2 上下文预算

避免把全部浏览器数据无上限塞给模型：

- active tab：完整返回。
- tabs：最多 30 条，优先当前窗口、活动标签、已分组标签和匹配关键词标签。
- tabGroups：全部返回，通常数量较少。
- bookmarkFolders：只返回 folder 索引；完整节点通过 observe 工具获取。
- history、Cookie、Top Sites：默认不放入 summary，必须显式查询。

### 11.3 工具清单

工具表按 namespace 分组，并包含：

- 参数类型。
- 返回字段示例。
- 是否需要先 observe。
- 风险等级。
- Chrome 上下文限制。
- 是否产生 clientExec。

工具清单应按用户输入裁剪或控制总长度，不能无差别发送大量不相关工具。

### 11.4 AI 规则

System Prompt 必须明确：

1. 工具名只能来自注册表。
2. ID 必须来自当前上下文或 observe 结果，禁止猜测。
3. 先查询、后修改。
4. 同一 plan 内有依赖时使用 `deps`。
5. 目标不明确时不能执行破坏性操作。
6. 不能输出任意 API 名称。
7. 不能读取或输出 Cookie value、API Key 等敏感字段。
8. plan 中的“创建指定名称分组”不得替换为“按域名分组”。

---

## 12. Plan 引用协议

### 12.1 第一阶段只支持安全路径

将 `src/service-worker/plan-runner.ts` 的 `$ref` 扩展为：

- `$ref:p1.field`
- `$ref:p1.items[0].id`
- `$ref:p1.groups[0].tabIds`
- `$ref:p1.tabIds`

数组引用必须保留真实数组类型。

### 12.2 禁止任意表达式

第一阶段不支持：

```text
[?expr]
```

不执行任意过滤表达式，避免引入新的表达式解析和安全边界。

如果需要筛选，应：

1. 让 observe handler 支持明确的 query/domain/title 参数。
2. 返回经过筛选的明确 ID 数组。
3. 后续 mutate 只接收这些 ID。

### 12.3 引用错误

当引用不存在时不得静默传入 `undefined`，必须返回：

```ts
{
  success: false,
  code: 'REF_NOT_FOUND',
  message: '找不到 plan p1 的字段 groups[0].tabIds',
  suggestion: '请先执行对应 observe 工具并确认返回字段'
}
```

---

## 13. Manifest 与权限策略

当前 manifest 权限较宽，建议逐项核对实际功能：

- 开发阶段可以新增必要权限，但同步更新权限说明。
- 未使用的权限应删除。
- `fontSettings` 如果继续使用，应确认权限和 Chrome 版本支持。
- 优先使用 `activeTab`，减少 `<all_urls>` 长期 host 权限。
- 需要长期访问的站点使用最小 host permissions 或 optional host permissions。
- cookies 等敏感权限必须单独说明用途。
- `web_accessible_resources` 不应无必要暴露 Side Panel 资源给所有网站。

权限矩阵应记录：

```text
tool → Chrome API → permission → allowed context → risk → confirmation
```

---

## 14. 测试方案

### 14.1 Handler 单元测试

新增：

```text
tests/handlers/tabs.spec.ts
tests/handlers/tab-groups.spec.ts
tests/handlers/bookmarks.spec.ts
tests/handlers/history.spec.ts
tests/handlers/downloads.spec.ts
tests/handlers/browsing-data.spec.ts
tests/handlers/cookies.spec.ts
tests/handlers/storage.spec.ts
```

每个 handler 至少测试：

- 正常参数。
- 缺少必填参数。
- 错误类型参数。
- 无效 ID。
- Chrome API reject。
- 返回字段准确性。
- 真实状态回读。
- 敏感字段脱敏。

### 14.2 Plan Runner 测试

扩展 `tests/plan-runner.spec.ts`：

- 多步骤 DAG。
- 依赖失败阻断。
- `NEEDS_CONFIRM`。
- clientExec。
- 数组 `$ref`。
- 嵌套 `$ref`。
- `REF_NOT_FOUND`。
- 重复 item id。
- 多个 clientExec 结果。

### 14.3 安全测试

- 未授权 sender 发送 `MSG_EXECUTE`。
- 未注册 tool。
- `force:true` 绕过确认。
- batch 递归绕过危险策略。
- 读取 Cookie value/API Key。
- 目标 host 不在授权范围。
- 目标 tab 已关闭或已变更。
- Content Script 向 SW 发送伪造特权消息。

### 14.4 真实 Chrome E2E

至少覆盖：

1. 查询当前 tabs/window/tabGroups。
2. 创建指定名称分组并移动匹配 tabs。
3. 创建、搜索、移动和打开书签。
4. 查询历史并确认删除。
5. 查询和取消下载。
6. 清除指定时间范围浏览数据并确认。
7. Cookie 返回脱敏字段。
8. 多窗口、固定标签、空标签组和目标不存在场景。
9. DOM 工具在特殊页面、跨 iframe、ref 失效时的错误处理。

每个写操作后必须重新查询 Chrome 状态，不能只断言 handler 返回 `success: true`。

---

## 15. 实施顺序

### 阶段 A：执行链路收敛

1. 确认 `handlers/` 是唯一执行入口。
2. 删除或隔离旧 `executor.ts` 依赖。
3. 增加 canonical tool allowlist。
4. 增加消息来源和参数校验。
5. 统一 `ExecutionResult`。

### 阶段 B：核心标签能力

1. 修复 tabs handler。
2. 新增 tab-groups handler。
3. 扩展真实上下文。
4. 完善 clientExec 注册机制。
5. 修复窗口相关 API。

### 阶段 C：书签/历史/会话

1. 对齐 bookmarks 原生字段。
2. 修复 open/move/create 语义。
3. 完善 history 时间边界和删除策略。
4. 增加 sessions 查询与恢复。

### 阶段 D：下载/浏览数据/存储

1. 新增 downloads handler。
2. 新增 browsingData handler。
3. 扩展 storage area。
4. 完成高风险确认和审计。

### 阶段 E：Cookie/网站设置/通知

1. Cookie 脱敏和权限校验。
2. contentSettings pattern 校验。
3. notifications 限流和敏感文本控制。

### 阶段 F：高风险扩展能力

逐项评审 management、privacy、scripting、alarms、pageCapture、tts、webNavigation、declarativeNetRequest、desktopCapture，不通过评审的能力保持未支持状态。

---

## 16. 成功标准

- AI 只输出已注册、参数 schema 合法的工具。
- 任何 ID 都来自真实上下文或 observe 结果，不能猜测。
- 标签、窗口、分组、书签等操作结果与 Chrome 实际状态一致。
- “创建指定名称分组并移动匹配标签”不再退化为按域名分组。
- 所有危险操作都有清晰目标、用户确认和审计记录。
- Cookie、API Key、Session Token 等敏感数据不进入模型。
- Service Worker 是唯一特权执行层。
- Content Script 只能执行页面 DOM 工具，不能直接调用特权 API。
- 未实现 API 明确标记为未支持，不让 AI 猜测。
- 每个实现的 API 都有权限矩阵、工具定义、handler、prompt 描述和测试。
- `npm run type-check`、格式检查、单元测试和真实 Chrome E2E 均通过。
