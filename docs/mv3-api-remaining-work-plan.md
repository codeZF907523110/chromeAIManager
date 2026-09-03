# Manifest V3 剩余工作颗粒化任务清单

> 依据 `docs/mv3-api-implementation-plan.md` 当前代码状态整理。本文同时覆盖：
>
> 1. 原方案中尚未闭环的安全、契约、测试、文档任务；
> 2. 当前缺失的 Chrome API/canonical 工具。
>
> 执行规则：严格按任务编号顺序推进；每个任务完成后执行该任务的验证命令，并更新本文状态、主方案文档和变更记录。任何任务不得只改 handler 而不同步 registry、commands、prompt、类型、测试和文档。

## 0. 基线与状态口径

### T0.1 建立三方差异表

**状态（2026-08-30）**：权限策略已接入 `dispatchTool`，按工具前缀映射 Manifest API 权限，使用 `chrome.permissions.contains` 同时支持 Promise 和 callback 风格；host 工具拒绝 `chrome://`、扩展页和 `chrome.google.com` 等受保护目标；权限预检覆盖 Promise 和 callback 风格 mock；plan 权限失败时返回 `PERMISSION_DENIED` 并阻断依赖项；嵌套 `$ref` 与缺失字段均返回 `REF_NOT_FOUND`；一次性确认 token 通过 `buildReconfirmPayload` 注入 `confirmationToken` 字段并由 SW 端指纹+TTL 校验；确认详情脱敏，避免 `password` / `value` 等敏感字段进入 UI；审计记录脱敏并限制 100 条；cookies set/remove、notifications 文本敏感脱敏、storage 敏感 key 拒绝、browsing_data 敏感类型需 `force`、downloads filename 路径穿越拒绝、permissions_update 复用统一 pattern、extensions 自保护已加强。Manifest 已收敛：移除 `privacy`、`desktopCapture`、`unlimitedStorage`；`web_accessible_resources` 仅暴露 `offscreen/*` 和 `lib/*`；context-collector 改为 capability-safe 调用并返回 capabilities/unavailable 摘要；新增 `tab_groups_find_or_create_by_title` 工具；`navigate` 改为 URL parse 后强制 http/https + Web Store 拒绝；`bookmarks_search` / `bookmarks_get_children` 增加 1-200/1-500 数量限制；新增 `history_search_min` 工具返回最小化 URL；`openai-adapter.ensurePermission` 改为 safeContains/safeRequest，测试环境无 permissions API 时直接跳过。剩余：真实 Chrome E2E 校验。

- 对比 `commands.ts`、`handlers/index.ts`、`system-prompt.ts`。
- 记录每个工具的 handler、Chrome API、权限、context、风险、确认、敏感输出、状态。
- 状态统一使用 `supported`、`compat`、`experimental`、`deferred`、`unsupported`。
- 验收：没有“commands 已暴露但 registry 无 handler”或反向漂移。

### T0.2 清理不稳定能力边界

- 将 `chrome.settings.private` 主题依赖标记为 `unsupported`，不进入 AI 工具清单。
- 将任意 JS/eval、debugger、远程代码、抓包、任意 scripting/DNR 规则、伪 Accessibility Tree 记录到 unsupported catalog。
- 验收：AI prompt 不展示这些工具，调用返回 `UNSUPPORTED_TOOL`。

## 1. 安全执行基座（P0）

### T1.1 完整消息来源校验

- 文件：`src/service-worker/index.ts`。
- 校验 `sender.id`、sender URL、context；扩展页/Side Panel 可执行特权工具，Content Script 只允许页面能力。
- 统一返回 `UNAUTHORIZED_SENDER`。
- 测试伪造扩展 ID、Content Script、空 sender。

### T1.2 完整 message/plan schema

**状态（2026-08-30）**：已完成基础闭环。已增加 SW 消息顶层普通对象/允许字段校验、sender 来源校验、plan thought/chat/plan 互斥校验、item ID/tool/args/deps 基础结构、数量限制和缺失依赖拒绝；循环诊断、嵌套 ref/规模专项测试及完整安全专项仍待继续。

### T1.3 统一 ExecutionResult

- 文件：`src/types/execution.ts`、`handlers/index.ts`。
- `success` 必填；新增 `suggestion/data/meta.api/meta.namespace/meta.durationMs`。
- 兼容旧 UI 顶层字段，但 dispatch 统一包装新字段。
- 验收所有 handler 结果可被同一类型消费。

### T1.4 统一 ToolPolicy 与权限检查

- 完善 `src/shared/tool-contracts.ts`：权限、context、风险、hostAccess、sensitiveOutput。
- 危险集合由 policy 派生；运行时检查权限和 host 范围。
- 增加 command↔registry 双向一致性断言。

### T1.5 一次性确认 token

**状态（2026-08-29）**：部分完成。SW 已支持绑定工具与参数指纹、TTL 和消费后失效；前端 ConfirmCard 尚未完整传递 token，目标快照绑定和完整安全测试仍待完成。

- 首次危险调用生成短期 token，绑定 tool、item/plan 摘要、目标 ID/快照。
- 确认时 SW 校验并原子消费；裸 `force:true`、过期 token、重放 token 均拒绝。
- 更新 `shared/confirm.ts`、`usePlanRunner.ts` 和 ConfirmCard 链路。
- 覆盖 tabs/bookmarks/history/cookies/storage/browsingData/downloads/notifications/window 删除等危险操作。

### T1.6 非敏感审计

- 新增 SW-only 限长审计模块。
- 记录 timestamp/tool/risk/code/success/duration/context/confirmation，不记录 payload、完整 URL、Cookie value、API key。
- 测试审计脱敏与容量上限。

**状态（2026-08-31）**：斜杠命令已完全独立。`useSlashCommandRunner.ts` 自包含：slash 解析、特殊默认值、precompute、`MSG_EXECUTE`、slash 确认、客户端命令路由（录制）、`dispatchToSW` 嵌入按钮路径、录制生命周期（`onScopeDispose`）；通过 deps 注入 addMessage/clearMessages/setPendingConfirm/cancelPlan/showScreenshot，与 AI 侧零耦合。`useAIEngine.ts` 瘦身为仅 AI 入口（模型管理、消息持久化、状态通道、自然语言 plan 入口），不再持有 recordingExecutor / slashExecutor / renderExecutionResult；`handleSubmit` 通过外部注入 `slashRunner` 实现分发，保持向后兼容。结果渲染抽到 `shared/render-result.ts`（中立工具，slash + plan 共用）。`ConfirmCardData` 类型统一到 `types/ui.ts`。剩余：彻底替换历史 facade 适配层（仍由 `useAIEngine.handleSubmit` 转发，理想形态是 App.vue 自己分发）。

### T2.1 Tabs 缺失 API：基础查询与高亮

补齐并同步 handler、registry、commands、类型和测试：

- `tabs.get`（已有，补全契约与错误回读）
- `tabs.highlight`

### T2.2 Tabs 缺失 API：导航

- `tabs.goBack`
- `tabs.goForward`
- 校验 tabId、特殊页面和目标失效，执行后回读 tab。

### T2.3 Tabs 缺失 API：截图与缩放

- `tabs.captureVisibleTab`
- `tabs.getZoom`
- `tabs.setZoom`
- `tabs.getZoomSettings`
- `tabs.setZoomSettings`
- 截图明确按 window 当前可见标签，不接收任意 tab 的伪语义；结果不自动上传模型。

### T2.4 Tabs 参数与真实回读

- 统一 number ID、0-based index、URL、数组去重校验。
- 修复所有 `if (!id)`、字符串隐式 Number 转换、批量失败吞错。
- create/update/move/discard/remove 写后重新 query/get。

### T2.5 Windows canonical API

- 补齐 get/getCurrent/getLastFocused/getAll/remove 的 commands/prompt/测试同步。
- remove 进入 L2 token 确认；create/update/remove 执行后回读。

### T2.6 真实标签组查询与指定名称流程

- `observeGroups` 委托 `chrome.tabGroups.query`，返回真实 group、tabIds、tabs。
- 完成“查询 tabs → 明确筛选 → 查找/创建同名 group → 移动 → 回读”专用工具；不得用按域名分组替代。

### T2.7 ClientExec 注册表

- 将 `usePlanRunner.ts` 大型 if/else 抽为 `CLIENT_EXEC_HANDLERS`。
- 每个 handler 执行前校验目标，执行后 query group/tabs，返回统一 outcome。
- 消除 `useAIEngine.ts` 重复实现，保留兼容调用适配层。

**状态（2026-08-31）**：`CLIENT_EXEC_HANDLERS` 已在 `src/shared/client-exec.ts` 实现并接入 `usePlanRunner.handleClientExec`；但 `tabs_group_by_domain` / `tabs_ungroup_all` 两个 handler 仍走 usePlanRunner 内联的 if/else（render-result.ts 也内联了一份）——这两条 clientExec 路径**重复实现**了 `shared/client-exec` 没有覆盖的领域，应在下个阶段抽到 `CLIENT_EXEC_HANDLERS` 里。`useAIEngine.renderExecutionResult` 已删除，重复分支随之消除。

### T2.9 Tabs 按域名批量关闭（domain 模式）

**背景**：用户用自然语言说"关闭当前窗口 baidu.com 的所有标签"。原 `tabs_remove` 只接 `tabIds`，AI 必须先 `tabs_observe(domain=...)` 查 ID 再 `tabs_remove(tabIds=[...])`。两步 plan 既慢又让用户看不到要关的标签全貌。`close_tabs_by_domain`（aiHidden）只服务于斜杠命令，向 AI 隐藏。

**方案**：
- `tabs_remove` 增加可选 slot：`domain?: string`、`currentWindow?: boolean (默认 true)`。
- SW handler `tabs.remove()` 增加 domain 模式：按 hostname 匹配当前窗口所有未 pinned 标签，追加到 tabIds 列表，去重后批量 `chrome.tabs.remove(tabIds)`。
- `buildConfirmChildren` 增加 domain 分支：用 `chrome.tabs.query` 列出匹配项，前端 ConfirmCard 显示具体标签，用户可取消勾选。
- `system-prompt.ts` 错误模式段同步说明：`tabs_remove` 不传 tabIds 但传 domain 时不再"关闭当前活动标签"，而是按域名批量关闭。

**文件**：`src/shared/commands.ts`、`src/service-worker/handlers/tabs.ts`、`src/service-worker/handlers/index.ts`、`src/shared/ai/system-prompt.ts`、`tests/handlers/tabs.spec.ts`。

**验收**：
- type-check / lint / test 通过。
- 新增 `tabs.remove({ domain: 'baidu.com' })` 单测覆盖：匹配 / 不匹配 / pinned 跳过 / 跨窗口不命中。
- `tabs_remove({ domain: 'baidu.com' })` 二次确认卡列出所有匹配标签。

### T2.8 ContextSnapshot

- activeTab 补 hostname/windowId/groupId/index。
- tabs 最多 30 条，按当前窗口、active、group、关键词优先。
- groups 附真实 tabIds；bookmarkFolders 为 `{id,title,path}`；补 windows。
- system prompt 仅渲染 canonical 工具和安全规则。

## 3. Bookmarks、History、Sessions（P1）

### T3.1 Bookmarks canonical 查询

补齐并测试：

- `bookmarks.getTree`
- `bookmarks.get`
- `bookmarks.getChildren`
- `bookmarks.getSubTree`
- `bookmarks.search`
- `bookmarks.getRecent`

统一 nodeId string、folder/bookmark 类型、原生字段、真实 path 和结果结构。

### T3.2 Bookmarks 写操作修复

- 严格校验 nodeId/title/url/type/index。
- `beforeId` 转 parentId/index；index 与 beforeId 互斥。
- 文件夹递归计数、批量删除逐项错误返回；写后回读。
- open 固定 tabs.create 新标签。

### T3.3 History 查询与时间边界

- `history.search` 支持明确 timeRange：today/yesterday/week/month/all。
- 新增 `history.getVisits`。
- 抽取可测试的本地时间边界函数；未知范围拒绝。
- 默认 URL 最小化，显式 detail 才允许更完整信息。

### T3.4 History 缺失删除 API

补齐并独立设置确认级别：

- `history.deleteUrl`
- `history.deleteRange`
- `history.deleteAll`

保留 `history_remove` compat，但不得让聚合入口绕过最高级别确认；执行后回读或明确记录 Chrome API 无法枚举的限制。

### T3.5 Sessions canonical 查询与恢复

- `sessions.getRecentlyClosed`
- `sessions.getDevices`
- 统一 window/tab sessionId，设备信息脱敏。
- canonical `sessions_restore` 取代错误的 storage.restoreSession 映射。
- 批量恢复、恢复前验证、恢复后状态回读和 token 确认。

## 4. Downloads、BrowsingData、Storage（P1）

### T4.1 Downloads 缺失 API

- `downloads.pause`
- `downloads.resume`
- 同步状态回读和 API reject 测试。

### T4.2 Downloads 安全校验

- URL 仅 http/https，并按 hostAccess 校验授权范围。
- filename 禁止绝对路径、反斜杠、路径穿越、控制字符。
- open/removeFile/erase/cancel 按风险进入 token 确认；不上传文件内容。

### T4.3 BrowsingData 细分 API

- `browsingData.removeCache`
- `browsingData.removeCookies`
- dataToRemove、since、originTypes、范围严格校验。
- passwords/downloads 等类型强确认并写入审计。

### T4.4 Storage 安全策略

- area 必须显式指定；managed 只读。
- 禁止全量读取；建立可配置敏感 key denylist。
- 写入不回显 value，写删清空确认、审计和结果回读。
- 旧入口只能作为明确 compat，不得扩大权限。

## 5. Cookies、Content Settings、Notifications（P0/P1）

### T5.1 Cookie 只读与脱敏

- `cookies.get`、`cookies.getAll`、`cookies.getAllCookieStores` 已有基础，统一 sanitizeCookie 白名单。
- 不允许 value、认证 Cookie、Session Token 进入结果、确认详情、日志。
- cookies 权限和 host permissions 双检。

### T5.2 Cookie 写入与删除

- 新增 `cookies.set`。
- 完整校验 url/name/value/domain/path/secure/storeId/partitionKey。
- set/remove token 确认；按 host-only/domain/path/partitionKey 构造删除；执行后回读。

### T5.3 Content Settings canonical handler

- 新建 `handlers/content-settings.ts`，旧 permissions handler 改兼容适配层。
- 实现 get/set/clear；primaryPattern 只接受明确支持的合法模式。
- 修改后回读，L2 操作使用 token。

### T5.4 Notifications canonical handler

- `notifications.create/update/clear/getAll`。
- 旧 list 兼容映射；icon 仅扩展内资源；title/message 限长与敏感文本策略。
- 增加频率限制和用户关闭入口；clear 使用 token。

## 6. 测试与文档闭环（每波同步）

### T6.1 Handler 单测

新增：

- `tests/handlers/tabs.spec.ts`
- `tab-groups.spec.ts`
- `bookmarks.spec.ts`
- `history.spec.ts`
- `sessions.spec.ts`
- `downloads.spec.ts`
- `browsing-data.spec.ts`
- `storage.spec.ts`
- `cookies.spec.ts`
- `content-settings.spec.ts`
- `notifications.spec.ts`

每个 handler 覆盖正常、缺参、错型、无效 ID、Chrome reject、结果字段、回读、脱敏。

### T6.2 安全与 Plan 测试

新增 `tests/service-worker/security.spec.ts`，覆盖 sender、未知工具、未知字段、force 绕过、token 过期/重放、batch 绕过、host 越权、Cookie/API key 泄露、失效 tab。

扩展 plan runner：DAG、重复 ID、缺失 deps、失败阻断、数组/嵌套 ref、REF_NOT_FOUND、多个 clientExec。

### T6.3 Chrome E2E

建立可选 E2E 脚本，覆盖 tabs/windows/groups、指定名称分组、书签、history 确认删除、downloads、browsingData、Cookie 脱敏、多窗口/特殊页面/目标不存在。

### T6.4 权限、隐私与 unsupported 文档

**状态（2026-08-30）**：已完成初版文档闭环。新增 `docs/mv3-permission-matrix.md`、`docs/mv3-unsupported-catalog.md`，README 已同步 Plan-First、安全边界、测试和权限说明；真实 Chrome E2E 与 Manifest 最小权限收敛仍待人工验证。

- 新增权限矩阵：tool → API → permission → context → risk → confirmation → sensitiveOutput。
- 更新 README 的权限用途、数据处理、测试说明。
- 更新 `docs/ai-api-architecture.md`，标记旧 DOM/executor 方案为历史/不支持。
- 主方案文档逐项更新日期、状态、验证结果。

## 7. 高风险能力最终评审（P2）

逐项评审 management、privacy、scripting、alarms、pageCapture、tts、webNavigation、declarativeNetRequest、desktopCapture。未满足最小权限、固定能力、用户可见确认、回滚、审计和 E2E 的能力保持 `unsupported/deferred`，不进入 AI prompt。

## 验收顺序

每个子任务完成后执行：

```bash
npm run type-check
npm run lint
npm run format -- --check
npm test
```

阶段完成后再执行：

```bash
npm run build
```

最终验收必须逐项确认：唯一特权入口、sender 校验、确认不可绕过、敏感数据不进模型、canonical/registry/handler/prompt/权限矩阵一致、所有写操作真实回读、测试和文档同步。
