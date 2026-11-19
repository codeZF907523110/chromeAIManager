# history_search 时间范围失效修复（timeRange 被完全忽略）

> 状态：已实施（2026-11-18，lint / type-check / i18n / build 全绿）
> 背景：用户让 AI 在历史记录里找某站点，AI 反复调整 timeRange（字符串、对象、
> start: 0 / start: 1 等写法都试了），返回的 timeRange 标签始终是「今天」，
> 7 次搜索 6 次为 0 条——历史明明存在，只是不在"今天"窗口里。

## 1. 根因

`executor.ts` 的 `searchHistory` **完全忽略 `payload.timeRange`**：

- 命令 schema 向 AI 宣告了 `timeRange: 'today | yesterday | week | month | all'`
  （history_search 与 /history 斜杠映射都宣告了该枚举）
- 但 SW 实现硬编码 `startTime = 今日 0 点、endTime = now`，返回标签写死
  `sw.today`——传什么都只搜今天，schema 与实现脱节
- 对照：`removeHistory`（delete_history）对同一枚举有完整解析，搜索缺失同款逻辑

## 2. 修复方案

| #   | 文件                            | 改动                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `executor.ts`                   | `searchHistory` 解析 `timeRange`（与 delete_history 同枚举）：today=今日 0 点起（缺省/未知/类型漂移一律回落 today，/history 现状不变）；yesterday=昨日 0 点 → 今日 0 点（setDate(-1) 后 setHours 归零，DST 安全）；week=now-7d；month=now-30d；all=0（全部历史）。返回的 `timeRange.label` 按范围取对应 sw 词条 |
| 2   | `locales/{zh-CN,en,de,es}.json` | sw 段补 4 个范围标签：`yesterday` / `week` / `month` / `all`（现只有 `today`）                                                                                                                                                                                                                                  |
| 3   | `commands.ts`                   | history_search 与 /history 斜杠映射的 timeRange 描述补「不传默认 today」；/history 斜杠枚举补齐 yesterday / all（与 AI 可见命令一致）；history_search 描述点明可按时间范围过滤，帮助模型路由                                                                                                                    |

不改动 delete_history 的删除时间窗语义（昨日窗口径与搜索略有差异，属既有行为，
本次不动，避免影响已验证的删除功能）。

## 3. 边界

- ~~`timeRange` 传对象/数字等非法类型时回落 today（宽容处理）~~
  **（v2 已废弃，见第 6 节）**：非法值现在直接拒绝
- `startTime: 0`（all）时 chrome.history.search 语义为全量，maxResults 仍兜底 50
- 结果渲染文案 `step.historyFound` 不含范围标签，本次只修数据链路；范围信息经
  `timeRange.label` meta 返回，前端后续要展示时可直接用

## 4. 验证

type-check / eslint / prettier / check-i18n / build 全绿。真机回归：

1. 「搜一下全部历史里的 xxx」→ AI 传 timeRange: 'all' → 能搜到非今天的记录
2. `/history`（不带参数）→ 仍为今天的记录（现状不变）
3. 「查昨天的历史」→ yesterday 窗口为昨日 0 点至今日 0 点
4. timeRange 传错值/漏传 → 不报错，按 today 执行

## 5. 同类 bug 全量审计（2026-11-19）

按「schema 宣告的 slot 是否真的被实现消费」对 91 个 swIntent 全量比对（脚本粗筛 +
人工复核）。误报排除三类后确认 **4 个真幽灵 slot**：

- **误报排除**：① `browser_*` 系列 slot 经 `executeBrowserTool` 整体透传给
  content script 消费；② `remove_bookmark` / `enable|disable|uninstall_extension` /
  `close_duplicate_tabs` / `sort_tabs` 的 query 类 slot 由面板侧 `precompute`
  先解析成 id/tabIds 再下发（SW 只收解析结果）；③ 多行 case 写法漏匹配
  （tabs_group_* / tabs_ungroup* 实际都有消费）。

### 修复

| intent                  | 幽灵 slot                                                                                             | 处理                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `zoom`                  | `tabId`（宣告「目标标签 ID」但 setZoom 永远作用活动标签）                                             | **兑现**：setZoom 支持 payload.tabId，缺省仍为活动标签（与描述一致）                                        |
| `bookmarks_create_node` | `nodeType`（schema+prompts 都在用，但实现按「有无 url」决定类型，bookmark 不带 url 会静默建成文件夹） | **兑现为校验**：nodeType=bookmark 且无 url → INVALID_PARAMS（复用 sw.urlRequired）；nodeType 不再是创建参数 |
| `bookmarks_create_node` | `allowDuplicate`（chrome.bookmarks 无此能力，无人消费）                                               | 从 schema 删除（第一版不做同名校验）                                                                        |
| `bookmarks_move_node`   | `beforeId`（chrome.bookmarks.move 仅支持 parentId/index，API 本身不存在该参数）                       | 从 schema 删除                                                                                              |

`nodeType` 保留宣告（prompts.ts 的书签整理流程在用），仅语义校准为一致性校验；
prompts.ts:147 的描述「bookmark 需传 url」与新校验一致，无需改动。

## 6. v2：timeRange 非法值从静默回落改为直接拒绝（2026-11-19）

### 真机翻车案例

用户自然语言问「搜今年 11 月 9 日的浏览记录」，AI 三步全部撞墙：

1. 传 `timeRange: "2025-11-09"`（日期字符串）→ 静默回落 today → 返回 100 条
   「今天」的历史，AI 拿到假成功结果
2. 改传 `"2026-11-09"` → 同样回落 today
3. 改传对象 `{start, end}` → 还是 today——浪费 3 步后用户手动停止，且 AI 始终
   没告知「不支持具体日期」这一能力边界

根因：v1 的「宽容回落 today」设计在斜杠场景合理（buildSlots 已校验枚举），
但 agent loop 场景下**假成功比失败更糟**——模型拿不到任何"参数不对"的信号，
只会无限换格式重试。

### 修复（快速失败 + 告知边界）

| #   | 文件                            | 改动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `executor.ts`                   | 新增 `isValidHistoryRange`（忽略大小写，缺省/null 视为未传）与 `invalidTimeRangeResult`（统一拒绝结果：`sw.invalidTimeRange` + suggestion `sw.invalidTimeRangeHint`）。`searchHistory`：缺省仍默认 today，显式传非法值（日期字符串/对象等）→ INVALID_PARAMS。`removeHistory`：timeRange 必填且必须合法枚举——**原来缺失/非法会走三元链默认分支 startTime=0，删掉全部历史**（用户确认"删某天"实际删全部，比搜索假成功危险得多），现直接拒绝；range 归一化小写防止 'Today' 漏进默认分支 |
| 2   | `locales/{zh-CN,en,de,es}.json` | sw 段新增 `invalidTimeRange`（合法枚举提示）与 `invalidTimeRangeHint`（替代方案：all + lastVisitTime 筛选，或如实告知）                                                                                                                                                                                                                                                                                                                                                              |
| 3   | `commands.ts`                   | history_search / delete_history 的 timeRange slot 描述补「不支持具体日期，枚举外的值会被直接拒绝」（模型在工具列表就能看到边界）                                                                                                                                                                                                                                                                                                                                                     |
| 4   | `prompts.ts`                    | 操作原则新增第 19 条：调用命令前先核对参数 schema 能否表达用户需求；表达不了不要编造参数硬调，改用替代方案（all + lastVisitTime 筛选）或如实告知用户                                                                                                                                                                                                                                                                                                                                 |

### 边界

- `/history` 斜杠缺省仍默认今天；`/clear-history` 非法范围在 buildSlots 拒绝
  （斜杠审计的零 slot 规则回落 AI），不经过 SW
- 删除的 selectedUrls 子集分支不需要 timeRange，校验放在该分支之后
- 用户要"某一天"的历史：AI 按 hint 用 `timeRange=all`（maxResults 有限，历史
  久远的记录可能搜不全）或如实告知仅支持相对范围——两种行为都可接受，
  由模型按上下文选择，但不再有假成功循环

## 7. v3：具体日期改由 startDate/endDate 直接支持（2026-11-19）

v2 的「all + lastVisitTime 手筛」只是过渡方案。用户进一步要求
「优先用专用命令，兜底调 Chrome API，不要把判断抛回给用户」——见
[chrome-api-fallback.md](./chrome-api-fallback.md)：

- history_search 新增 `startDate` / `endDate`（YYYY-MM-DD，本地时区，
  endDate 含当天），「查某一天」由专用命令一步覆盖；`invalidTimeRangeHint`
  文案同步改为引导用日期参数
- 新增 `chrome_api` 兜底通道（只读白名单：history.search /
  sessions.getRecentlyClosed），专用命令表达不了的毫秒级时间窗等需求直调
  Chrome API
- 操作原则 #19 改写为三级优先级链：专用命令 → chrome_api → 如实告知
