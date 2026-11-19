# 能力覆盖优先级链：专用命令 → chrome_api 兜底 → 如实告知

> 状态：已实施（2026-11-19）
> 背景：用户翻车案例——「查某一天的浏览记录」时 history_search 的 timeRange
> 只有相对枚举，AI 换格式硬调 3 步全失败（见 history-search-timerange-fix.md §6）。
> v2 用「快速失败 + 如实告知」止住了假成功循环，但把「不支持」直接抛回给用户
> 违背产品原则：**能查到就必须查到，不该让用户自己判断支不支持**。
> 用户明确要求：**优先用斜杠/专用指令，指令参数表达不了的需求兜底调 Chrome API，
> API 也表达不了才告知用户**。

## 1. 优先级链（写入 prompts 操作原则 #19）

```
① 专用命令参数能表达 → 必须用专用命令（禁 chrome_api 绕路）
② 表达不了 → chrome_api 直接调 Chrome 扩展 API 兜底（只读白名单）
③ 白名单也覆盖不了 → 才 ask/chat 如实告知用户不支持
```

禁止：编造参数硬调（假成功/被拒循环）、跳过①直接用②、在②可用时走③。

## 2. 改动清单

| #   | 文件                            | 改动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `commands.ts`                   | ① history_search 新增 `startDate` / `endDate` 可选 slot（YYYY-MM-DD，本地时区，endDate 含当天）——用户主案例「查某一天」直接由专用命令覆盖，模型无需手算时间戳；timeRange 描述补「具体日期用 startDate/endDate」。② 新增 `chrome_api` 命令（AI 可见、dangerous:false、非斜杠）：slots `api`（必填 string）+ `args`（可选 object，API 原生参数），描述写明只读白名单与兜底定位                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | `executor.ts`                   | ① `searchHistory` 支持 startDate/endDate：正则 `/^\d{4}-\d{2}-\d{2}$/` 校验，非法值 INVALID_PARAMS（`sw.invalidDateParam`，带原值插值方便模型自查；**非字符串形态（数字时间戳/对象）同样拒绝**，静默忽略会让模型以为日期过滤已生效）；解析用 `new Date(s + 'T00:00:00')` 落本地时区；endDate 含当天（setDate(+1) 后归零，DST 安全）；**日期窗存在时优先于 timeRange**（忽略枚举校验）；label 直接回显日期串（`start ~ end`）。② 新增 `executeChromeApi`：只读白名单 `history.search` / `sessions.getRecentlyClosed`（两个真实能力缺口：任意毫秒时间窗搜索、最近关闭列表——downloads/bookmarks/tabs 等已有专用 intent）；白名单外拒绝（`sw.chromeApiNotAllowed` + suggestion 提示优先级链）；args 类型不符拒绝（`sw.chromeApiArgsInvalid`）；history.search 缺省 text=''，startTime/endTime/maxResults 缺省走 Chrome 文档默认值，必须是毫秒数 |
| 3   | `prompts.ts`                    | 操作原则 #19 从「表达不了就如实告知」改写为上面的三级优先级链，点名 history_search 的 startDate/endDate 用法（某一天 = start/end 同一天）与 chrome_api 的时间戳单位（毫秒）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | `useAIEngine.ts`                | 步骤摘要器补 `r.sessions` 分支（`step.sessionsListed`）：chrome_api::sessions.getRecentlyClosed 的结果不再落进末尾的裸 JSON 兜底；history.search 结果复用既有 `r.items` 分支（`step.historyFound`）。**审计顺手修复（存量 bug）**：agent loop 的「脚本返回 undefined，请补上 return 重试」system 提示原本对所有命令生效——SW 侧命令（tabs_observe / history_search 等）结果本就没有 `.result` 字段，每步都被塞这条幽灵提示，模型误判执行失败转而重试（此前查历史反复重试的诱因之一）。现加守卫：仅 `browser_*`（content script 工具，结果带 `.result`）才检查；别名 browser_tab_* 不在 registry，AI 发不出来，前缀判断安全                                                                                                                                                                                                                   |
| 5   | `locales/{zh-CN,en,de,es}.json` | sw 段新增 `invalidDateParam` / `chromeApiNotAllowed` / `chromeApiNotAllowedHint` / `chromeApiArgsInvalid` / `chromeApiFailed`；step 段新增 `sessionsListed`；**更新 `invalidTimeRangeHint`**（原文案让模型「all 搜索后自己筛日期」，现改为引导用 startDate/endDate，与能力现状一致）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | 文档                            | 本文档 + history-search-timerange-fix.md 增补 §7 指向本文档                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 3. 与既有链路的一致性审计（2026-11-19 复核）

逐条核对「其它场景自然语言是怎么调 API 的」，确认 chrome_api 挂在既有模式上、
没有发明第五条通道：

| 既有模式         | 链路                                                                                    | 代表                                             | chrome_api 的落点                                     |
| ---------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| DOM 操作         | browser_* → executeBrowserTool → content script（页面内执行），结果 `{success, result}` | browser_snapshot / browser_click                 | 不适用（DOM 才走这条）                                |
| 浏览器数据/控制  | 专用 intent（registry）→ MSG_EXECUTE → SW executor 包 chrome.*（校验/枚举/i18n）        | history_search / tabs_observe / downloads_search | **走这条**（swIntent: 'chrome_api'，SW 侧白名单校验） |
| 需用户激活的 API | SW 准备数据返回 clientExec 标志 → 面板执行                                              | tabs_group_by_domain                             | 不适用（白名单内 API 在 SW 可直接调）                 |

复核通过的点：模型输出是自由 JSON、无 schema 枚举约束（TOOL_ACTION_RE 与
dispatch 白名单都由 registry 动态生成，chrome_api 自动纳入）；sanitizeResult 按
key 通用截断、不按 intent 裁字段（chrome_api 原始结果完整回灌模型，大数组截 30
条并带 `_resultTruncated` 提示）；嵌套 args 有先例（batch 的 calls 数组、
sort_tabs 的 orderMap）。

**审计发现并已修复**：SW 消息监听器对 executeCommand 没有 try/catch，chrome.*
原生抛错会让发送端拿到误导性的 COM_DISCONNECTED——chrome_api 两个 helper 各自
try/catch 转成 `API_ERROR` 结构化结果（`sw.chromeApiFailed` 带真实错误文案）；
sessions.getRecentlyClosed 的 maxResults 钳制到 Chrome 上限 25（超限会被原生拒绝）。

## 4. 边界

- `chrome_api` 不进 SLASH_COMMANDS（无斜杠入口、无确认卡、无专属反馈卡）：
  仅 agent loop 消费原始 JSON 结果，renderExecutionResult 的通用 fallback 兜底。
- `delete_history` **不加**日期参数：按精确日期删历史属高危且低频，第一版保持
  枚举-only；搜索侧先用日期补齐，删除需求出现时再评估。
- 白名单是**显式枚举集合**，新增 API 只改 `CHROME_API_ALLOWLIST` + 对应 dispatch
  分支；不提供任意 namespace.method 反射调用（避免放大攻击面：写操作、
  chrome.cookies 等敏感读都进不来）。
- startDate/endDate 只传其一：仅 start = 从那天 0 点到现在；仅 end = 全部历史到
  那天末尾（与 Google 活动记录的 after/before 语义一致）。
- batch 允许携带 chrome_api（只读、dangerous:false），走 AGENT_CONFIRM_REQUIRED
  之外的普通通道。
- `invalidTimeRangeHint` 文案更新后，v2 的「all + lastVisitTime 手筛」路径不再被
  提示引导（history_search 已能直接查日期），但行为保留——历史时间戳筛选仍是
  模型的合法自由度。
- 「脚本无返回值」提示的 `browser_*` 前缀守卫依赖「别名不在 registry」这一事实
  （browser_tab_list 等只是 executor 内部 case，AI 发不出来）；若未来把别名
  登记进 registry 并对 AI 开放，需同步收窄该守卫。

## 5. 验证

type-check / eslint / prettier / check-i18n / build 全绿。真机回归：

1. 「查 2026 年 11 月 9 日的浏览记录」→ AI 一步调 history_search(startDate=endDate=2026-11-09) → 返回当天记录，label 显示日期
2. 「查 11 月 1 日到 9 日」→ startDate=2026-11-01&endDate=2026-11-09 → 含 9 日当天
3. 「最近关掉了哪些标签页」→ AI 调 chrome_api(sessions.getRecentlyClosed) → 返回最近关闭列表
4. chrome_api 传白名单外 API（如 cookies.getAll / history.deleteUrl）→ INVALID_PARAMS 拒绝，suggestion 提示专用命令优先
5. history_search 传非法日期（如 2026-13-40 / "last Monday"）→ INVALID_PARAMS + 原值回显
6. 原 timeRange 枚举路径不受影响：today/yesterday/week/month/all、/history 斜杠行为不变
7. 「搜今年 11 月 9 日的浏览记录」（v2 翻车原话）→ 不再需要 3 步试错，直接日期参数命中
8. 「打开多个标签页再逐个浏览」（多步 browser_* 任务）→ 每步不再出现「脚本返回 undefined，请补上 return 重试」幽灵提示；browser_snapshot 等脚本工具在真没写 return 时该提示仍会出现（守卫生效）
9. chrome_api 传超限参数（如 sessions maxResults=500）→ 正常返回 ≤25 条；构造 chrome 原生报错场景 → 返回 API_ERROR + 真实错误文案，不再是 COM_DISCONNECTED
