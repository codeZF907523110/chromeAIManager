# 浏览器智能管家 Bug 修复路线图

> 本文件按批次收口已审计的 36 个 bug，按依赖 / 风险 / 改动面排序。
> 每次提交后运行验收清单：lint + type-check + 全部测试 + 红线扫描。
>
> 命名延续 `apf-roadmap.md` 的 C 编号风格；本批次从 **C7** 开始。
>
> **红线**（与之前一致）：
> - `src/shared/slash-commands.ts` 既有 SLASH_COMMANDS 条目
> - `src/composables/useSlashCommandRunner.ts` 对外行为
> - `src/shared/commands.ts` userIntent 名 + slot 字段
> - `wrapCatReply` 在 slash / chat 闲聊 / clientExec 路径上的行为

---

## 0. 总览

| Batch  | 名称                       | 条目数 | 估时    | 阻塞关系 |
| ------ | -------------------------- | ------ | ------- | -------- |
| **C7**  | 安全 / 数据丢失            | 7      | 0.5 天  | 无       |
| **C8**  | 渲染 / 复盘 双渲 / emoji  | 4      | 0.5 天  | C7       |
| **C9**  | plan-runner / 状态一致性   | 3      | 0.5 天  | C7       |
| **C10** | SW handler 行为修正         | 8      | 0.5 天  | C7       |
| **C11** | UI 内存 / 并发 / 渲染器缺位 | 5      | 0.5 天  | C8       |
| **C12** | 文案 / 小 bug / 性能       | 9      | 0.5 天  | 无       |

每批含：修复文件清单 + 验收清单 + 风险评估 + 测试新增/修改点。

---

## 1. Bug 总清单（按严重度 + 文件定位）

| ID  | 严重度 | 文件                            | 简述                                                                |
| --- | ------ | ------------------------------- | ------------------------------------------------------------------- |
| B01 | 🔴      | `theme-font.ts:19-21`           | `updateTheme` 是 no-op，返回 `success:true` 但根本没写 API         |
| B02 | 🔴      | `history.ts:188-189`            | `timeRange:'all'` 吞掉 `query`，全删历史                            |
| B03 | 🔴      | `bookmarks.ts:238-243`          | `updateNode` 不校验 `nodeId`，undefined 直接抛异常                  |
| B04 | 🔴      | `personality.ts:66-70`          | `wrapCatReplyFinal` 末尾追加 emoji 不去重标点                       |
| B05 | 🔴      | `tabs.ts:445-450`               | `tabs_remove` domain 分支过滤 pinned 后**丢了显式 tabIds 里的 pinned** |
| B06 | 🔴      | `tabs.ts:481-501`               | `tabs_remove_by_url` 显式 tabIds 模式**又过 query 过滤**           |
| B07 | 🔴      | `ConfirmCard.vue:105-109`       | `allTabIds` 短路用户勾选，「全不选」无效                            |
| B08 | 🔴      | `MessageBubble.vue:126-174`     | 流式更新每次新建 Vue app，从不 unmount，内存泄漏                    |
| B09 | 🔴      | `useAIEngine.ts:258-268`        | IndexedDB 失败递归触发更多写失败，错误风暴                          |
| B10 | 🔴      | `useAIEngine.ts:152-192`        | 无 in-flight 锁，并发 plan 双跑                                     |
| B11 | 🔴      | `tabs.ts:540-542`               | `groupByDomain` 重复 tabId 没去重；`groupId !== -1` 用法不一致      |
| B12 | 🔴      | `plan-runner.ts:252`            | `NEEDS_CONFIRM` 暂停时顶层 `success:false` 与 items 全 `success:true` 矛盾 |
| B13 | 🟠      | `render-result.ts:53`           | `markRendered` 在函数顶部无条件调用，stopped 早退会误判              |
| B14 | 🟠      | `render-result.ts:223-235`      | `close_tabs_by_domain` 渲染不读 `args.domain`，fallback 文案误导   |
| B15 | 🟠      | `render-result.ts:142-158`      | `clear_cookies` 文案不区分 `removed:0` 是「没有」还是「清错了」    |
| B16 | 🟠      | `usePlanRunner.ts:185-195`      | 空 plan 浪费 LLM round-trip                                         |
| B17 | 🟠      | `usePlanRunner.ts:332-347`      | 失败 plan 没 AI 复盘，全是「操作失败」气泡                          |
| B18 | 🟠      | `usePrecompute.ts:160-181`      | `close_tabs_by_domain` 无匹配时无「未找到」反馈                      |
| B19 | 🟠      | `browsing-data.ts:60-69`        | `cookies` / `history` 不在 `SENSITIVE_TYPES`，绕过 force            |
| B20 | 🟠      | `bookmarks.ts:13-14`            | `maxDepth=0` / `maxResults=0` 被 `\|\|` 覆盖成默认                   |
| B21 | 🟠      | `cookies.ts:122-144`            | `cookies.set` 返回 `null` 仍判 success                              |
| B22 | 🟠      | `cookies.ts:151-186`            | 协议错配删不掉 Secure cookie                                         |
| B23 | 🟠      | `tab-groups.ts:151,174,183`     | `tab_groups_*` 的 `clientExec` 在 render-result 没有渲染器          |
| B24 | 🟠      | `notifications.ts:15-17`        | `sanitizeNotificationText` 整串替换为 `*`                          |
| B25 | 🟠      | `useSlashCommandRunner.ts:283`  | `run()` 清空 `pendingConfirm`，plan 确认卡被吞，状态卡死             |
| B26 | 🟠      | `permissions.ts:74-106`         | `observe` 只查 https，HTTP-only 站点设置查不到                      |
| B27 | 🟠      | `permissions.ts:153-160`        | `value:'default'` 错误提示误导                                      |
| B28 | 🟠      | `navigation.ts:21-23`           | Web Store 黑名单漏掉 `chromewebstore.google.com`                    |
| B29 | 🟡      | `useAIEngine.ts:66-73`          | 状态消息写 IndexedDB，重启残留「思考中...」                          |
| B30 | 🟡      | `usePlanRunner.ts:305-308`      | `showAiConfirmCard` 后 `runningRef` 没重置，stop 按钮失效          |
| B31 | 🟡      | `MessageBubble.vue:180-186`     | 「组件缺失」双转义，显示字面 `&lt;...&gt;`                          |
| B32 | 🟡      | `MessageList.vue:32-58`         | `scrollTimer` 在 unmount 不 clear                                   |
| B33 | 🟡      | `App.vue:287-290`               | 200ms `setInterval` 轮询 isRunning，浪费                           |
| B34 | 🟡      | `history.ts:158-218`            | `history_remove(query)` maxResults:10000，超量截断                  |
| B35 | 🟡      | `bookmarks.ts:289-313`          | `remove-bookmark` 全文本匹配，误删风险                              |
| B36 | 🟡      | `cookies.ts:88-99`              | `cookies.get` 不存在时返回 `success:true, cookie:null`，文案不友好 |

---

## 2. 批次拆分

### C7 · 安全 / 数据丢失（7 条，最高优先级）

> 这些是用户最直观的「数据没了 / 操作假装成功」。修完整个体验就有兜底感。

**条目**：B01, B02, B03, B05, B06, B12, B19

**改动**：

1. **B01** `theme-font.ts:19-21` — `updateTheme` 返回 `success:false, code:NOT_SUPPORTED, message:'Chrome 不支持通过扩展修改浏览器主题'`
2. **B02** `history.ts:188-189` — 拆开 `range === 'all'` 早退；`query` 永远作为过滤器
3. **B03** `bookmarks.ts:238-243` — `updateNode` 头部加 `nodeId` 校验，非字符串返回 `INVALID_PARAMS`
4. **B05** `tabs.ts:445-450` — 显式 `tabIds` 中的 pinned 不被 domain 分支过滤；先合并 `explicitTabIds`，再单独处理 `domain` 扩展，最后 `allowPinned` 决定 pinned 是否保留
5. **B06** `tabs.ts:481-501` — 显式 tabIds 模式不再过 query，仅校验 tab 存在
6. **B12** `plan-runner.ts:252` — `NEEDS_CONFIRM` 暂停时 `success` 保持 `false`，并在 report 上加 `paused:true` 让前端区分；items 里的 `result.success` 含义不变（已执行的就是 true）
7. **B19** `browsing-data.ts:60-69` — `cookies` / `history` 加入 `SENSITIVE_TYPES`

**验收**：
- `yarn lint` / `yarn type-check` / `yarn test` 全绿
- 新增测试：
  - `tests/handlers/theme-font.spec.ts` — `updateTheme` 返回 `NOT_SUPPORTED`
  - `tests/handlers/history.spec.ts` — `history_remove({ timeRange:'all', query:'x' })` 只删 query
  - `tests/handlers/bookmarks.spec.ts` — `updateNode({})` 返回 `INVALID_PARAMS`
  - `tests/handlers/tabs.spec.ts` — `remove({ tabIds:[pinnedId], domain:'x', __preConfirmed:true })` 关掉 pinned
  - `tests/handlers/tabs.spec.ts` — `removeByUrl({ tabIds:[t1,t2], query:'foo' })` 不受 query 过滤影响
  - `tests/handlers/browsing-data.spec.ts` — `remove({ dataToRemove:{cookies:true}, since:0 })` 必须 force

**风险**：
- B05 / B06 改动 pinned 行为，可能让 C5 已通过的「pinned 不勾不上」手动测试用例（`docs/manual-smoke-apf.md` Case 8）需要更新
- B12 改动 report 顶层语义，前端需要读 `paused` 标志而不是 `success`

---

### C8 · 渲染 / 复盘 / emoji（4 条）

> 涉及用户最直观的「回答别扭」与「重复消息」问题。

**条目**：B04, B13, B16, B17

**改动**：

1. **B04** `personality.ts:66-70` — `wrapCatReplyFinal` 末尾去重：剥离尾部 emoji/标点/空白再加 ` ${emoji}`
2. **B13** `render-result.ts:53` — `markRendered` 改为仅在**写过 `addAIChat` 的分支**调用；用局部 `written` flag 跟踪
3. **B16** `usePlanRunner.ts:185-195` — 空 plan 直接用 `parsed.thought ?? '好的喵~'`，跳过 LLM 调用
4. **B17** `usePlanRunner.ts:332-347` — 失败 plan（`report.success===false && !needsConfirm`）**强制**调 AI 复盘，让用户看到「整体没成功」的自然语言总结

**验收**：
- 现有 `tests/personality.spec.ts` 加 2 条 emoji 去重用例
- `tests/render-result.spec.ts` 加 3 条：`stopped` / `clientExec` / 真正写了 addAIChat 时 `markRendered` 才触发
- `tests/usePlanRunner.spec.ts` 加 1 条：空 plan 不调 chat
- 手动：输入「关闭所有百度页面」→ 看到「已经关闭了 N 个百度页面喵~  🐾」单条；输入「你好」→ 看到 AI 闲聊回复（无 emoji 重复）

**风险**：
- B13 改动 `markRendered` 调用位置，C6 的 `tests/post-plan-summarizer.spec.ts` 不受影响（那个是 LLM 调用层）

---

### C9 · plan-runner / 状态一致性（3 条）

> 涉及 plan 整体语义、前端状态与停止按钮行为。

**条目**：B10, B25, B30

**改动**：

1. **B10** `useAIEngine.ts:152-192` — 加 `inFlight` 锁：第二次进入 `handleNaturalLanguage` 时若正在跑，**先 abort 前一个**（已部分支持），再 `await` 一个新 promise 让旧 run 不写出残留
2. **B25** `useSlashCommandRunner.ts:283` — `run()` 开头不盲目清空 `pendingConfirm`：仅当新 intent 是 `clear_chat` / `reset_context` 时清，并发 `confirm` 状态互不破坏
3. **B30** `usePlanRunner.ts:305-308` — `showAiConfirmCard` 后立刻 `runningRef.value = false`（确认期间不算「在跑」）

**验收**：
- `tests/usePlanRunner.spec.ts` 加 2 条：连续两次 plan 第二次 abort 第一次；confirm 期间 runningRef 为 false
- `tests/useSlashCommandRunner.spec.ts` 加 1 条：slash `/help` 不会清掉正在展示的 plan 确认卡

**风险**：B10 涉及并发，需要小心避免「旧 run 抛 AbortError 后还写出 system 消息」

---

### C10 · SW handler 行为修正（8 条）

> 单点修复，每条独立，可并行测试。

**条目**：B02, B03, B20, B21, B22, B24, B26, B27, B28, B34, B35, B36

注意：B02 / B03 已在 C7。本批处理剩下的：B20, B21, B22, B24, B26, B27, B28, B34, B35, B36

**改动**：

1. **B20** `bookmarks.ts:13-14` — `maxDepth` / `maxResults` 用 `typeof === 'number' && Number.isInteger()` 校验，`0` 也接受
2. **B21** `cookies.ts:122-144` — `cookies.set` 返回 `null` 时返回 `success:false, code:COOKIE_SET_FAILED`
3. **B22** `cookies.ts:151-186` — `cookie.secure === true` 一律用 `https` URL
4. **B24** `notifications.ts:15-17` — 改为正则替换敏感词为等长 `*`，而不是整串替换
5. **B26** `permissions.ts:74-106` — 同时查 `https://${domain}/*` 和 `http://${domain}/*`，返回非默认值
6. **B27** `permissions.ts:153-160` — 错误提示改为「如需重置，请用 clear 命令」
7. **B28** `navigation.ts:21-23` — 黑名单加 `chromewebstore.google.com`
8. **B34** `history.ts:158-218` — query 删除时分页（用 `startTime` 滚动），记录 `truncated:true` 时告知用户
9. **B35** `bookmarks.ts:289-313` — 删除前过滤到 `node.url !== undefined`（只删书签，不删文件夹）
10. **B36** `cookies.ts:88-99` — `get()` 找不到 cookie 返回 `success:false, code:COOKIE_NOT_FOUND`

**验收**：每条 1 条单元测试

**风险**：B26 改动 permission 查询语义，需检查 `permissions_observe` 在 chrome Web Store 站点（本身被 B28 拦）的行为不变

---

### C11 · UI 内存 / 并发 / 渲染器缺位（5 条）

> 前端可见问题：内存泄漏、缺失渲染器、状态卡死。

**条目**：B08, B11, B23, B29, B33

**改动**：

1. **B08** `MessageBubble.vue:126-174` — 每次 watch 触发时**先 unmount 所有已挂载 app**（用 Map 替代 WeakMap 方便枚举），再重新挂载
2. **B11** `tabs.ts:540-542` — `groupByDomain` 用 `Set<id>` 去重；统一 `groupId` 判断为 `=== -1 || === undefined`
3. **B23** `render-result.ts` — 为 `tab_groups_create` / `tab_groups_update` / `tab_groups_move_tabs` / `tab_groups_ungroup_tabs` 加渲染分支（已在 `handleClientExec` 处理，但走 plan 路径时也要兼容）；或调整 handler 让它们走 clientExec 流程而不在 SW 返回 clientExec
4. **B29** `useAIEngine.ts:66-73` — 状态消息加 `__ephemeral:true` 字段，`persistMessage` 跳过带此 flag 的消息
5. **B33** `App.vue:287-290` — 删 `setInterval`，用 `isRunning()` 直接绑定（usePlanRunner 已 export ref）

**验收**：
- 手动：长会话（50+ 条）开 DevTools Memory 面板，反复刷新页面 → 无泄漏
- `tests/render-result.spec.ts` 加 tab_groups_* 4 条
- 手动：开侧栏、发 AI 消息、关闭 Chrome、重开 → 不残留「思考中...」

**风险**：B23 改动路径，要确认不破坏 slash `/group-domain` / `/ungroup-all`

---

### C12 · 文案 / 小 bug / 性能（9 条）

> 最后清理：文案、误删、残留、性能。

**条目**：B07, B09, B14, B15, B18, B31, B32

**改动**：

1. **B07** `ConfirmCard.vue:105-109` — `allTabIds` 不短路；总是从 checkbox 收集；当 `allTabIds` 有值时把它的成员当作「默认全选」，用户取消勾选才排除
2. **B09** `useAIEngine.ts:258-268` — IndexedDB 失败时构造**不会再次失败**的 system 消息（直接 console.warn，不调 `addMessageLocal`）
3. **B14** `render-result.ts:223-235` — `close_tabs_by_domain` 渲染时同时读 `_slots.domain` 和 `r.domain`，fallback 文案明确「未匹配到标签」
4. **B15** `render-result.ts:142-158` — `clear_cookies` `removed:0` 时区分文案：domain 模式下「当前没有 ${domain} 的 Cookie」/ 全局模式「没有 Cookie 可清除」
5. **B18** `usePrecompute.ts:160-181` — 无匹配时返回 `{ empty:true, reason:'NO_MATCH' }`，前端拿到后写一条「未找到匹配的 X 标签」并阻止 dispatch
6. **B31** `MessageBubble.vue:180-186` — 用 `textContent` 而非 `innerHTML`，避免双转义
7. **B32** `MessageList.vue:32-58` — 加 `onBeforeUnmount(() => clearTimeout(scrollTimer))`

**验收**：
- `tests/usePlanRunner.spec.ts` 加 1 条：close_tabs_by_domain 无匹配时显示「未找到」
- `tests/ConfirmCard.spec.ts` 加 1 条：用户全不选 + 确认 → selectedTabIds 为空数组
- `tests/useAIEngine.spec.ts` 加 1 条：IndexedDB 持续失败时不会风暴
- 手动：刷新测试每条

**风险**：B07 改动 ConfirmCard 行为可能影响所有 5 个 slash 危险命令的回退路径，需全量 smoke

---

## 3. 验收清单（跨批次共用）

每次完成一个 Batch，必须：

1. `yarn lint` 全绿
2. `yarn type-check` 全绿
3. `yarn test` 全绿（含本批新增/修改用例）
4. 红线扫描：`git grep -n "intent-rules\|detectHalfPlan\|hostnames" src/` 为空
5. `git diff --stat src/composables/useSlashCommandRunner.ts src/shared/slash-commands.ts src/shared/commands.ts` 为空（或仅 pure additive）
6. `docs/apf-roadmap.md` 追加 `[C7]...[C12]` 段（仿 C6 模板）

---

## 4. 测试策略

### 自动（vitest）

| 路径                                         | 覆盖范围                       |
| -------------------------------------------- | ------------------------------ |
| `tests/handlers/*.spec.ts`                   | B01-B03, B20-B22, B24, B26-B28, B34-B36 |
| `tests/plan-runner.spec.ts`                   | B12, B16, B17                  |
| `tests/render-result.spec.ts`                 | B13, B14, B15, B23             |
| `tests/personality.spec.ts`                   | B04                            |
| `tests/usePlanRunner.spec.ts`                 | B18, B30                       |
| `tests/useSlashCommandRunner.spec.ts`         | B25                            |
| `tests/ConfirmCard.spec.ts`                   | B07                            |
| `tests/useAIEngine.spec.ts`                   | B09, B10, B29                  |
| 现有 142 用例                                | 无回归                         |

### 手动（Chrome 一次性验收）

| ID  | 操作                                                  | 期望                                                       |
| --- | ----------------------------------------------------- | ---------------------------------------------------------- |
| M1  | 输入「切换深色主题」                                  | AI 回复「Chrome 不支持通过扩展修改浏览器主题」              |
| M2  | `/history-remove today foo` (或等效)                  | 只删今天匹配 foo 的历史                                    |
| M3  | 输入「关闭所有百度页面」→ 勾上 pinned → 确认          | pinned 也被关                                              |
| M4  | 输入「关闭 url 包含 github 的标签」→ 勾上 3 个，再加 1 个非 github 的 → 确认 | 4 个都关（query 不再过滤已勾选）                       |
| M5  | ConfirmCard：勾掉全部 → 点确认                        | selectedTabIds 为空数组                                    |
| M6  | 长会话 50 条 → 反复刷新 message → DevTools Memory     | 无 Vue app 实例泄漏                                        |
| M7  | 连续两次发「关闭百度页面」                            | 第一次被第二次 abort，无重复输出                           |
| M8  | plan 跑完失败（模拟）                                 | 看到 AI 复盘「未能完成...」总结                            |
| M9  | 重启 Chrome                                           | 不残留「思考中...」                                        |
| M10 | 输入「关闭所有不存在的标签」                          | 看到「未找到匹配的标签」而非静默成功                       |

---

## 5. 风险速查

| 等级 | 条目 |
| ---- | ---- |
| P1   | B01, B02, B03, B05, B06, B12 |
| P2   | B07, B08, B09, B10, B13, B17, B19, B23 |
| P3   | 其余 |

---

## 6. 实施时间线

```
Day 1: C7（7 条）
Day 2: C8 + C9（4 + 3 = 7 条）
Day 3: C10 + C11（8 + 5 = 13 条）
Day 4: C12 + smoke + 文档（9 条 + 验证）
```

---

## 7. 待补

- [ ] 各 batch 完成后填回填段（同 C5/C6 模板）
