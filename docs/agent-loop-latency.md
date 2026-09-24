# Agent Loop「思考中」耗时诊断与修复方案

## 「思考中」在干什么

`agentLoop` 每一轮 = **一次非流式 LLM API 调用**（`OpenAIAdapter.call` → POST
`/v1/chat/completions`），期间没有任何本地计算。"思考中..." 的停留时间就是：
网络发出 → 服务端 prefill（读完整个 prompt）→ 生成完整 JSON → 返回 的总时长。

## 为什么会卡很久

| # | 原因 | 量级 |
|---|------|------|
| 1 | **上下文随步数线性膨胀（主因）**：browser_* 操作类工具每步返回操作后快照（`nodesText` 数百行 ≈ 6-8K token），`scan` 返回整页元素列表；这些结果 push 进 `messages` 后**永不裁剪**。第 N 步要把前 N-1 步的全部快照重发一遍，服务端 prefill 时间随步数叠加——第 2 步 1 份快照、第 4 步 3 份……全部重算 | 每多一步，每轮多 6-8K token prefill |
| 2 | **非流式请求**：必须等模型把整个 JSON 生成完才返回，期间 UI 只能停在"思考中"，无法感知进度 | 观感放大：慢 = 完全无反馈 |
| 3 | **失败路径放大**：单次调用超时 60s + 重试 1 次 + 间隔 1s → 最坏 ~2 分钟才报错 | 偶发 |

## 业界方案

Playwright MCP / browser-use 的上下文管理：**对话里只保留最新一份页面状态，
旧快照用占位符替代**。旧快照本就该作废——每次操作后 snapshotCache 重新采集，
旧消息里的 ref 已不可用（`findElementByRef` 的缓存校验会拒绝），留着只有 prefill 成本、
没有信息价值。

## 修复方案

| # | 位置 | 改动 |
|---|------|------|
| 1 | `useAIEngine.ts` | 新增 `foldStaleSnapshots(messages)`：从尾部向前扫描 user 消息，命中"整页 dump"特征（含 `"nodesText"` 或以 `页面扫描结果(` 开头）的，**保留最新一份，其余替换为占位符**（说明该步快照已被新快照取代）。在工具结果 push 后、`scan` 结果 push 后两个调用点执行，维持不变式：历史中至多一份页面 dump |
| 2 | `useAIEngine.ts` | `[AI-debug]` 日志增加 `totalChars`（messages 总字符数），便于后续观察请求体规模 |

不在本次范围（可后续单独做）：
- **SSE 流式输出**：`stream: true` 只改善观感（能看到生成进行中），不缩短总时长；
  涉及适配器改造，保持第一版简单，暂不做。
- 超时时间 60s×2 维持现状（真实失败确实需要报错）。

## 自查

- 只折叠"整页 dump"，FIND 匹配行（matches，≤10 行）与普通结果不受影响；
- 最新一份永远保留（尾部第一个命中项），AI 判断页面状态所依据的信息不丢失；
- 被折叠消息的步骤结论仍在 assistant 原始 JSON 里（那些很小、全量保留），
  折叠只丢"已过期的 ref 列表"；
- 占位符明确说明"页面当前状态以最新快照为准"，避免模型误用过期信息；
- 折叠在 push 后就地执行，不影响 `conversationMessages` 持久化（ask 路径保存的
  messages 同样享受不变式，恢复后上下文更小）；
- 提示词无需改动：第 4 条已引导"读操作结果自带的最新快照"，与折叠语义一致。

## 验证

1. `pnpm lint && pnpm type-check && pnpm build` 全绿；
2. 手动：连续执行 3-4 步 DOM 任务（快照 → find → click），观察 console
   `[AI-debug]` 的 totalChars 不再随步数线性增长，"思考中"时长稳定在秒级。

---

## 问题 2：「按分类排序标签页」被拆成逐个移动（假批量）

**现象**：排序 11 个标签，AI 执行了 `tabs_observe → tabs_move(1个) → tabs_observe →
tabs_move(1个) → …`，每移动一个标签就是一轮完整 LLM 调用，又慢又贵。

**根因**：工具集里只有 `tabs_move`（语义 = "把 tabIds 移到 index 起点"）。
整窗排序需要的是"把窗口变成这个顺序"——AI 用移动原语拼排序，每动一个 index
就变化一次，只能再 observe 确认再动下一个；提示词也没有禁止这种逐个模式。

**业界方案**：批量原语一次提交终态，而不是逐步逼近
（SQL `ORDER BY`、数组 `sort` 都是一次性描述目标顺序；agent 工具设计同理——
提供与任务粒度匹配的原语，避免模型用低层原语拼高层意图）。

**修复方案**：

| # | 位置 | 改动 |
|---|------|------|
| 1 | `service-worker/executor.ts` | 新增 `tabs_reorder { order: number[], windowId? }`：一次调用把窗口重排成期望顺序。算法：finalOrder = pinned（不参与，保持在前）+ order（去重、过滤 pinned/无效 id）+ 未列出标签（保持当前相对顺序）；正向逐个 `chrome.tabs.move(id, { index: i })` 收敛到终态；返回 `sorted`（id+title 列表）供 AI 直接验证，无需再 observe |
| 2 | `shared/commands.ts` | 注册 `tabs_reorder`（紧跟 tabs_move）；tabs_move 描述补"仅适用于小范围位置调整" |
| 3 | `shared/prompts.ts` | 标签页概览块追加规则：排序/分类重排**必须用 tabs_reorder 一次性提交完整目标顺序**，禁止逐个 tabs_move——每步都是一次完整 AI 调用，逐个移动既慢又容易中途索引错位 |

**自查**：
- 无效 id 显式报错（不静默忽略），防止 AI 传错列表还以为排好了；
- order 去重 + 过滤 pinned：与 finalOrder 拼接不会产生重复 id，避免 Chrome 对
  同一 id 二次 move 报错；pinned 标签始终在前，不会出现"pinned 移到非 pinned 位"的
  Chrome 报错；
- 从头向尾 move-to-index 的收敛性：处理到 i 时，位置 0..i-1 已是终态，
  把 finalOrder[i] move 到 i 即固定（它当前位置必然 ≥ i），全程无中间态依赖；
- 未列出标签排在 order 之后——语义可预期，AI 想全排就传全量 id；
- 返回 sorted 列表让 AI 免一步验证观察，进一步省一轮调用；
- tabs_move 原语义与实现零改动，既有任务不受影响。

## 验证（问题 2）

1. `pnpm lint && pnpm type-check && pnpm build` 全绿；
2. 手动：让 AI"将当前窗口的标签页按分类排序"，预期 2 步完成
   （tabs_observe → tabs_reorder），而不是 10+ 步逐个移动。

