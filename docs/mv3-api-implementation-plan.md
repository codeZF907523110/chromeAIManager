# MV3 未完成能力收尾实施计划

## 背景

当前仓库已完成部分执行链路、工具注册、tabs/tabGroups 基础能力及 ESLint/Prettier 修复，但与本方案的成功标准仍有明显差距。上一轮仅补充了部分策略校验、`tab_groups_get` 和 Cookie 脱敏查询；当前已将基础 `ToolPolicy` 权限预检接入 `dispatchTool`，但 host/context 细粒度校验和真实 Chrome E2E 仍待完成，因此本计划继续收尾全部未实现内容，并将每个 API 的“命令定义、注册表、handler、权限策略、提示词、测试、文档”同步闭环。

## 执行原则

- 以 `src/service-worker/handlers/index.ts` 为唯一特权工具入口，禁止恢复旧通用 executor。
- 先安全基座，再只读 canonical API，再写操作；未通过安全评审的高风险 API 保持未注册/明确 unsupported。
- 保留旧 slash/UI 别名，但通过兼容映射指向 canonical handler，禁止别名绕过策略。
- 所有新函数添加中文注释；所有写操作执行前重新读取目标、执行后回读真实状态。
- 每阶段完成后运行 type-check、lint、format 和对应单元测试，再进入下一阶段。

## 阶段 1：安全基座与统一契约（P0）

**文件**：`src/service-worker/index.ts`、`src/service-worker/handlers/index.ts`、`src/shared/tool-contracts.ts`、`src/types/execution.ts`、`src/shared/confirm.ts`、`src/composables/usePlanRunner.ts`。

1. 为消息 listener 传入并校验 `sender.id`、sender URL/context；拒绝未经授权的 content-script 特权消息，返回 `UNAUTHORIZED_SENDER`。
2. 增加 message、AIPlan、plan item、args、deps、未知字段的 type guard；入口只接受 canonical registry 工具。
3. 将 `ExecutionResult` 收敛为必填 `success`，补齐 `suggestion/data/meta(api/namespace/durationMs)`；保留旧顶层字段作为过渡兼容。
4. 由 `ToolPolicy` 统一声明权限、上下文、风险、hostAccess、敏感输出；危险集合和 plan runner 均从策略派生。
5. 替换裸 `force:true`：首次确认生成绑定 tool、参数摘要、目标 ID 和短期过期时间的一次性 token；确认时由 SW 校验并原子消费，裸 force 返回 `CONFIRM_INVALID`。
6. 新增 SW-only 限长审计记录，只保存 tool、risk、code、success、duration、context 和确认状态，不记录 payload、URL 全量、Cookie value 或 secret。
7. 增加 command↔registry 双向一致性检查，避免 AI 看到未注册工具或注册工具无参数契约。

## 阶段 2：tabs、windows、tabGroups 与上下文（P1）

**文件**：`handlers/tabs.ts`、`handlers/windows.ts`、`handlers/tab-groups.ts`、`context-collector.ts`、`system-prompt.ts`、`usePlanRunner.ts`。

1. 补齐 tabs 的 get/highlight/captureVisibleTab/zoom 系列工具；修复所有 ID、index、URL、数组校验和 0 值判断。
2. 补齐 windows get/getCurrent/getLastFocused/getAll/remove，并将窗口关闭纳入 L2 确认。
3. `observeGroups` 委托真实 `chrome.tabGroups.query`，返回 group 与 tabIds/tabs，不再伪造字段；补全 `tab_groups_get`。
4. 抽取 `CLIENT_EXEC_HANDLERS`，统一校验、调用、错误返回和执行后 group/tabs 回读；移除 `useAIEngine.ts` 中重复执行分支或统一转发。
5. 新增明确的“按筛选条件创建/查找指定名称分组并移动 tabs”流程，保留 `tabs_group_by_domain` 仅用于用户明确要求的按域名分组。
6. 对齐 ContextSnapshot：activeTab 完整字段、tabs 最多 30 条优先级裁剪、真实 tabGroups、结构化 bookmarkFolders、windows 列表；prompt 只列 canonical 工具。

## 阶段 3：书签、历史、会话 canonical API（P1）

**文件**：`handlers/bookmarks.ts`、`handlers/history.ts`、`handlers/sessions.ts`、`commands.ts`、`handlers/index.ts`。

1. 增加 bookmarks get/getChildren/getSubTree/search/getRecent，统一 string nodeId、folder/bookmark 类型、URL 校验和稳定返回字段。
2. 修复书签 path、maxDepth/maxResults、update 空 changes、beforeId 转换、批量删除失败语义；open 固定使用 `tabs.create`。
3. 增加 history getVisits/deleteUrl/deleteRange/deleteAll；抽取 today/yesterday/week/month 明确本地时间边界；未知范围拒绝，不允许静默扩展到 epoch 0。
4. history 默认对 URL 做最小化/脱敏，删除确认详情同样脱敏；deleteAll 使用独立最高风险策略。
5. 增加 sessions getRecentlyClosed/getDevices；统一 tab/window sessionId，设备结果只返回必要摘要；restore 前验证并在执行后回读。
6. 保留旧 `observe_tree`、`history_remove`、`sessions_restore_by_id` 作为兼容映射，但 canonical 命令优先进入 prompt。

## 阶段 4：downloads、browsingData、storage（P1）

**文件**：`handlers/downloads.ts`、`handlers/browsing-data.ts`、`handlers/storage.ts`、`commands.ts`。

1. 增加 downloads pause/resume；严格校验 URL 协议、host 授权、filename 禁止绝对路径/反斜杠/路径穿越和控制字符。
2. 统一 downloads.open 语义，区分打开下载管理页和打开已完成文件；未知文件、removeFile、erase 进入确认策略。
3. 增加 browsingData removeCache/removeCookies；严格校验 since、originTypes、数据类型白名单；passwords/downloads 等敏感类型单独强确认。
4. storage 必须显式指定 area；禁止 AI 全量读取和读取 API key/token/secret 等敏感 key；写入/删除不回显 value，返回实际 key/result。
5. 所有下载、浏览数据、存储写操作增加审计和结果回读；未能安全回读的能力保持 unsupported。

## 阶段 5：Cookie、contentSettings、notifications（P0/P1）

**文件**：`handlers/cookies.ts`、新增 `handlers/content-settings.ts` 或将 `permissions.ts` 改为兼容适配层、`handlers/notifications.ts`、`env.d.ts`。

1. Cookie 仅保留白名单字段，绝不返回 value；完善 get/getAll/set/remove/getAllCookieStores、domain/URL/partitionKey/storeId 校验、cookies 与 host 权限联合检查。
2. Cookie set/remove 必须确认，执行后重新 getAll 回读；确认详情和审计均使用脱敏摘要。
3. contentSettings 支持合法 primaryPattern（至少明确 http/https host pattern），实现 get/set/clear；clear 调用原生 clear，不用 set default 伪装；修改后回读。
4. notifications 增加 update/getAll canonical 接口，限制 title/message 长度、icon 仅允许扩展资源、增加频率控制；旧 list 为兼容映射；clear 使用危险策略。
5. 同步 Chrome 类型声明、权限矩阵、commands、registry、prompt 和测试。

## 阶段 6：测试、E2E 与文档闭环

新增：`tests/handlers/tabs.spec.ts`、`tab-groups.spec.ts`、`bookmarks.spec.ts`、`history.spec.ts`、`sessions.spec.ts`、`downloads.spec.ts`、`browsing-data.spec.ts`、`cookies.spec.ts`、`storage.spec.ts`、`content-settings.spec.ts`、`notifications.spec.ts`、`tests/service-worker/security.spec.ts`。

覆盖：正常/缺参/错型/无效 ID/API reject、数组和嵌套 `$ref`、重复 item/deps、危险确认 token、sender 越权、批量绕过、Cookie value/API key 脱敏、host 越权、写后真实状态回读、多窗口/特殊页面/目标失效。

补充 Chrome unpacked E2E：tabs/window/group 查询，指定名称分组，书签完整链路，历史确认删除，下载暂停/取消，浏览数据确认清理，Cookie 脱敏，多窗口和特殊页面。

更新 `docs/mv3-api-implementation-plan.md`：每阶段记录完成状态、未支持项和日期；新增权限矩阵与敏感数据处理说明；更新 `docs/ai-api-architecture.md` 和 README 测试/隐私说明。

## 阶段 7：高风险能力评审

逐项评审 management、privacy、scripting、alarms、pageCapture、tts、webNavigation、declarativeNetRequest、desktopCapture。未通过权限、用户确认、回滚和 E2E 评审的能力不注册为普通 AI 工具，并在 prompt 中明确 unsupported；禁止任意 JavaScript、debugger、Cookie value、远程代码和网络拦截入口。

## 验证门禁

每阶段必须通过：

```bash
npm run type-check
npm run lint
npm run format -- --check
npm test
npm run build
```

由于当前环境 Node 版本可能低于 Vite/Vitest 要求，如命令失败必须记录真实错误；不得以跳过测试代替通过。最终对照成功标准逐项审查唯一执行入口、sender 安全、确认不可绕过、敏感数据不出模型、工具注册一致性、真实状态回读和无回归。