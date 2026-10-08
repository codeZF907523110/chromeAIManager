# 流式输出方案

> 状态：方案已定稿，等待实现。本文档只描述方案，不含实现代码。

## 1. 需求与目标

| 需求 | 结论 |
|------|------|
| 流式显示 | AI 回复不再等整个请求结束才显示，边生成边渲染（打字机效果） |
| 范围 | 用户可见内容：`args.reply`（chat / done / ask 的回复）+ `thought`（思考过程）实时显示 |
| 决策不变 | Agent 循环的工具调用、JSON 解析、重试、确认流程行为零变化（流式只改"显示层"） |
| 兜底 | 端点不支持流式时自动降级为现有非流式路径，功能不丢失 |
| 停止 | 流式中途点停止：保留已生成的部分文本，附加现有"已停止"反馈 |

## 2. 现状盘点（已核实）

| 环节 | 现状 | 对流式的影响 |
|------|------|--------------|
| 请求发起位置 | **全部在 sidepanel 进程**：`useAIEngine.agentLoop` → `AIEngine.chatWithHistory`（唯一调用点 `useAIEngine.ts:292`）→ `OpenAIAdapter.call`（`fetch`，非流式） | ✅ **无跨上下文传输问题**。业界 MV3 扩展流式的最大难点（SW → UI 的 chunk 转发、Port 保活、心跳）在本项目不存在 |
| SW 职责 | 只执行工具（executor.ts），不调用 AI | 不涉及 |
| Agent 协议 | 模型只输出一个 JSON：`{ thought, action, args, predict, step }`（`response_format: json_object` 强约束）；用户可见内容 = `args.reply`（chat/done/ask）+ `thought` | 流式显示需从**未完成的 JSON** 中增量提取字段（业界称 partial JSON parsing） |
| UI 管线 | `addMessage` 一次性 push 到 `messageLog`（deep reactive）→ MessageList renderItems → MessageBubble（`renderMarkdown` = marked + DOMPurify + v-html） | 需要新增"流式中"的临时渲染载体，结束后一次性落库 |
| 持久化 | `addMessage` 内手动 `persistMessage(msg)`（非 watcher） | 流式期间不创建消息即可避免 IndexedDB 写洪水 |
| 停止 | `AbortController`，adapter 内合并超时 + signal | 流式下直接复用，语义不变 |
| 超时 | 整体 60s 定时器 abort | 流式下语义需改为「首 token 超时 + 块间空闲超时」（见 §4.4） |
| 重试 | 失败重试 1 次（AbortError / 权限错误除外） | 流式下需区分「首块前失败」（可重试）与「流中失败」（保留部分，不重试） |
| Gemini Nano 适配器 | 只有 `session.prompt()`；Chrome Prompt API 实际有 `promptStreaming()` | v1 保持非流式，走降级路径（见 §6 范围） |
| 决策路径 | `repairJSON`（截断修复）/ `isTruncated` / action 分发，全部消费完整 `raw` | 保持不变——这是本方案的安全边界 |

## 3. 业界方案调研

| 方面 | 业界共识 | 依据 |
|------|----------|------|
| 流式协议 | OpenAI 兼容服务标准为 SSE：请求体加 `stream: true`，响应为 `data: {json}` 行序列，`delta.content` 增量拼接，`data: [DONE]` 结束。注意：分块分隔符是 `\r\n` 而非 `\n`，手动解析需用 `/\r?\n/` 容错；JSON 载荷会跨网络块截断，必须缓冲不完整行 | Simon Willison《How streaming LLM APIs work》、Vercel AI Gateway《OpenAI Chat Completions Streaming》 |
| MV3 扩展传输 | 若在 SW 调 API，需 `chrome.runtime.connect()` 长连接 Port 逐块转发 + 心跳保活 + `onDisconnect` 重连 | Chrome 官方 runtime 文档、MV3 生命周期实践文章 |
| **本项目适用性** | **请求在 sidepanel 发起，SSE 在 UI 进程内直接消费，上述传输层复杂度整体不适用** | 现状盘点 §2 |
| 流式结构化输出（JSON 协议下流式显示） | 业界标准做法是 **partial JSON parsing**：每收到一个 chunk 对累积缓冲做一次"尽力解析"，提取已完成字段的当前值，与上次值做 diff 得到增量。Vercel AI SDK `streamObject` 的 partial 模式、LangChainJS 的 `partial-json` 均为此思路；无需自写字符级状态机 | Vercel AI SDK 文档（streamObject / partialOutputStream）、LangChainJS partial-json |
| UI 渲染 | 流式 token 直接逐帧 setState 会造成渲染洪水，通行做法是 **节流重渲染**（约 80–120ms 或 rAF）+ markdown 增量重渲染 + **完成后一次性持久化**（流式期间不写库） | 主流聊天产品（ChatGPT / DeepSeek / Open WebUI）通行实现 |
| 超时语义 | 非流式按"整请求超时"；流式下通行做法是**首 token 超时**（TTFB）+ **块间空闲超时**（连接挂起检测），总时长不限（长生成合法超 60s） | OpenAI SDK 社区实践、Vercel AI SDK |
| 停止语义 | 中断 fetch，已渲染内容保留，追加"已停止"标记 | 同上 |

结论：采用 **「sidepanel 内直连 SSE + partial JSON 增量提取 + 节流渲染 + 终态一次性落库」**，决策与显示彻底分离。

## 4. 总体设计

### 4.1 分层架构

```
┌─ useAIEngine（决策层，行为不变）────────────────────────────┐
│  raw = await aiEngine.chatWithHistoryStream(messages, opts, onDelta) │
│  ↑ 拿到的仍是完整 raw，后续 parse / repair / action 分发零改动        │
└──────────────┬───────────────────────────────────────────┘
               │ onDelta(rawDelta)  ← 原始文本增量（不是渲染用的）
┌──────────────▼───────────────────────────────────────────┐
│ AgentStreamFormatter（新增，显示层）                        │
│  累积缓冲 → 节流(100ms) partial parse → { thought, reply } │
│  与上次值 diff → liveThought / liveReply（响应式）          │
└──────────────┬───────────────────────────────────────────┘
┌──────────────▼───────────────────────────────────────────┐
│ MessageList：LiveBubble（流式气泡）+ 任务块 thought 实时行   │
│ 结束时一次性 addMessage 落库（内容与今日非流式产物完全一致）  │
└──────────────────────────────────────────────────────────┘
```

**安全边界（核心原则）**：流式只改"显示"，不改"决策"。`onDelta` 产出的任何中间解析结果只进显示层；决策层拿到的仍是完整 `raw`，走现有 `JSON.parse → repairJSON → action 分发` 链路。流式提取失败只影响显示体验，绝不会影响任务执行正确性。

### 4.2 Adapter 层：SSE 流式（openai-adapter.ts）

- 新增方法 `chatWithMessagesStream(messages, options, onDelta)`：请求体加 `stream: true`，`response.body.getReader()` + `TextDecoder` 手动解析 SSE。
- SSE 解析要点（来自调研）：按 `/\r?\n/` 切行、缓冲不完整行；只处理 `data: ` 前缀行；`[DONE]` 哨兵；`delta.content` 拼接；`finish_reason` 透传现有截断检测。
- `AIAdapter` 接口新增可选方法（`chatWithMessagesStream?`），`AIEngine` 门面新增 `chatWithHistoryStream`：后端不支持时（Gemini Nano v1）自动降级调现有非流式方法，`onDelta` 仅在结束时回调一次（UI 侧无感知差异）。
- **超时语义改造**：`options.timeout` 从"整请求超时"改为「首块超时 + 块间空闲超时」，两阈值均复用 `options.timeout`（默认 60s）。空闲计时以**任意字节到达**为活性信号（含 SSE 注释 keep-alive、`reasoning_content` 增量），而非"有内容增量"——避免误杀推理期间长时间静默的 R1 类模型。相对现状（60s 整请求硬超时）只放宽不收紧。**该语义仅对流式方法生效；非流式方法（含降级回退路径）维持现状整体超时，行为不变。**
- **非 SSE 响应识别**：若响应 `content-type` 非 `text/event-stream`（部分兼容端点忽略 `stream: true`，原样返回普通 JSON），按非流式解析该响应体直接返回完整文本，**不算错误、不触发重试**，等效于一次非流式调用。
- **重试语义**：首块前失败（含 4xx/5xx、网络错误）沿用现有重试 1 次；已收到首块后失败 → 不重试，抛错并携带已收到的部分文本。
- **降级回退**：若端点对 `stream: true` 返回错误（部分兼容端点不支持），自动改用非流式重试一次并在控制台记录；降级标记存 `AIEngine` 实例字段（sidepanel 生命周期内有效，会话级记忆），避免重复试错。
- 停止：现有 `AbortController` 合并机制原样生效，`reader` 随 abort 中断。

### 4.3 增量提取层：AgentStreamFormatter（新增 shared/agent-stream.ts）

- 输入：`onDelta` 的原始文本增量；输出：节流后的 `{ thought, reply }` 增量（响应式 ref）。
- 解析方式：**partial JSON parse**（业界标准，见 §3）。每 100ms 对累积缓冲做一次尽力解析，提取已完成的 `thought` 与 `args.reply` 字符串值，与上次值 diff 得到新增片段。
- 解析器选型：引入 `best-effort-json-parser`（零依赖、约 2KB、专为流式截断 JSON 设计，Vercel AI SDK `streamObject` partial 模式同款依赖；备选 LangChain 同款 `partial-json`）。不采用 `repairJSON` 复用——它是终态修复（面向完整文本的截断恢复），不做增量；也不自写状态机——违反"优先业界方案"原则。若该包无 TS 类型声明，补一个本地 `.d.ts` shim（type-check 必须零错误）。解析器对未知字段/未知 `data:` 行（如 usage 统计块）自然容忍。
- 字段不确定性处理：不依赖 JSON 键顺序。**气泡的创建以 `reply` 增量出现为准**（`action` 键序可能在 `args` 之后，只作辅助提示不作门控条件）；工具调用步的 `args` 无 `reply` 字段，天然不出气泡。
- 解析失败（如字符串截断在代理对中间）：该 tick 跳过，下一 tick 继续，不影响累积缓冲。

### 4.4 UI 层：实时渲染（MessageList / 任务块）

- **流式气泡（LiveBubble）**：`useAIEngine` 新增 `liveReply` 状态（`{ active, content }`），经 props 传入 MessageList（与 `messages` 同级的独立 prop，不混入消息数组）。首次提取到 reply 增量且 action 为 chat/done/ask 时，MessageList 在消息流末尾渲染 LiveBubble（绑定 `liveReply.content`，走现有 `renderMarkdown` 管线）；流式结束后由 finalize 转正（见下），LiveBubble 随 `active=false` 消失。**不触碰 `messageLog` 的中间态**，持久化次数与今天完全一致（每条消息 1 次）。
- **finalize 收敛（三条路径统一，防止已显示文本凭空消失）**：
  - **成功**：消费层现有解析链从完整 `raw` 产出 reply → `addMessage('ai-chat', wrapCatReply(reply))`，与今天逐字节一致。安全原则的落地：**正式落库内容永远来自完整 raw 的现有解析**，LiveBubble 内容仅用于流式中的过渡显示；
  - **用户停止 / 流中错误**：abort 后完整 raw 不存在，此时以显示层 buffer 为准——LiveBubble 已显示的部分文本**原样转正落库**（不追加猫式追问、不加尾缀标记），随后分别走现有 stopAgentLoop 反馈 / reportUserFacingError 反馈。已核实两者恒定紧跟反馈（stopAgentLoop 必发 `engine.stopped` system 消息 + 猫式气泡；catch 各分支必发 reportUserFacingError），气泡后的停止/错误提示始终存在，无需额外的气泡内尾缀；
  - **首块前错误**：LiveBubble 尚未创建，无需 finalize，行为与今天完全一致。
  - finalize 由 useAIEngine 内单一函数承担，三个出口（正常完成 / stopAgentLoop / catch）都收敛到它，不允许旁路直接操作 `messageLog`；同时负责清理 `liveReply` / `liveThought` 状态。成功路径若现有链路未产出 reply 消息（工具步），finalize 丢弃 live 状态即可——防止键序异常导致的误挂气泡残留。
- **thought 实时显示**：`liveThought` 与 `liveReply` 同机制传入 MessageList，渲染在当前任务块的尾部作为"进行中思考行"（复用 MessageBubble 现有 `thinking-text` 形态）；**不动 renderItems 的块分组推导逻辑**，仅在块渲染处加一个 live 行条件渲染。流式结束后仍按现有逻辑落一条正式 `engine.thought` 消息（内容一致），live 行随之消失。
- **节流**：LiveBubble 内容更新与 partial parse 同频（100ms）；`renderMarkdown`（marked + DOMPurify）每次全量渲染，4KB 内文本在该频率下无性能压力。
- **滚动**：沿用现有滚动策略（jump-to-last-user-message 等），流式期间不新增强制滚动；仅当用户已处于底部时跟随新内容。
- **停止 / 错误路径**：行为统一由上方 finalize 收敛设计承担（转正落库 + 各自的现有反馈链路），此处不再单独处理。

### 4.5 i18n 与词条

- **零新增词条**：流式不引入新文案——停止/中断的提示由现有反馈链路（`engine.stopped` 等）承担，部分转正的气泡不加尾缀（见 §4.4 finalize）。无需改动 locale 文件，`check:i18n` 不受影响。

## 5. 边界与异常

| 场景 | 行为 |
|------|------|
| 端点不支持 `stream: true` | 自动降级非流式（会话内记忆），功能不丢失 |
| 首块前失败（超时/4xx/5xx/网络） | 沿用现有重试与错误反馈，UI 与今天一致 |
| 流中失败 / `[DONE]` 前断连 | 已显示部分原样转正落库 + 现有错误反馈；决策层走 catch 现有分支 |
| 端点忽略 `stream: true` 返回普通 JSON | 按 content-type 识别 → 非流式解析，等效一次非流式调用，不报错不重试 |
| reply 迟迟未出现（工具调用步） | 不出气泡，thought 实时行照常工作 |
| partial parse 中间态失败 | 跳过该 tick，显示停顿一拍，不累积错误 |
| `finish_reason=length` 截断 | 现有 `isTruncated` / 精简重试逻辑原样生效（决策层） |
| 用户停止 | abort → 已显示部分原样转正落库 + 现有停止反馈（stopAgentLoop 恒定追加），无重复气泡 |
| Gemini Nano 后端 | 门面自动降级非流式，行为与今天一致 |

## 6. 实施阶段

| 阶段 | 内容 | 涉及 |
|------|------|------|
| P1 Adapter 流式 | `chatWithMessagesStream` + SSE 解析 + 超时语义改造 + 降级回退；`AIAdapter`/`AIEngine` 接口扩展 | openai-adapter.ts、engine.ts、types/ai.ts |
| P2 增量提取 | `best-effort-json-parser` 引入；agent-stream.ts（节流 partial parse → liveThought/liveReply）；agentLoop 唯一调用点接入（决策链路不动） | shared/agent-stream.ts、useAIEngine.ts、package.json |
| P3 UI 渲染 | LiveBubble + 任务块 thought 实时行 + 停止保留部分 + 滚动策略核对 | MessageList.vue、新增 LiveBubble、MessageBubble 复用 |
| P4 防回归 + 文档 | 边界场景手测清单执行；`check:i18n` 词条补充；本方案"已实现"章节 + 相关文档更新 | docs |

每个阶段独立可验证、不影响既有功能，完成后跑 `pnpm lint && pnpm type-check && pnpm build`。

## 7. 验证方案

1. 构建：lint / type-check / build 全绿；
2. 流式主链路：真实流式端点（DeepSeek / OpenAI）发 chat 指令 → reply 逐步渲染、markdown 实时格式化、结束后气泡内容与今天非流式产物结构一致并正常持久化（刷新后仍在）；
3. 任务链路：多步任务执行中 thought 实时更新、工具步不出气泡、done 总结流式渲染、任务块收起/展开行为不变；
4. 停止：流式中途停止 → 部分内容转正落库（刷新后仍在）+ "已停止"反馈，已显示文本不消失、无重复消息；
5. 降级：指向不支持流式的端点（首个流式请求报错 → 自动回退非流式），以及端点忽略 `stream:true` 返回普通 JSON（按非流式等效处理），两种情况功能均完整；
6. 超时：人为挂起端点 → 首块超时/空闲超时按新语义触发；
7. 回归：斜杠命令直连路径（不涉及 AI）行为不变；确认卡、截图、语音、模型设置、i18n 切换全流程正常；`pnpm check:i18n` 通过。

## 8. 不在本次范围

- Gemini Nano 的 `promptStreaming()` 接入（v1 走降级，后续可选）；
- DeepSeek R1 类模型 `reasoning_content` 思考链的独立展示（当前协议 thought 已覆盖）；
- 非流式请求的彻底移除（降级路径需要长期保留）；
- token 级逐字渲染动画 / 光标特效打磨（节流渲染已达到主流产品体验）。

## 9. 自查

- **业界方案优先**：SSE 手动解析（官方格式 + `\r\n` 容错）、partial JSON 增量提取（Vercel AI SDK / LangChain 同思路 + 成熟零依赖解析器）、节流渲染与一次性落库（聊天产品通行做法），无自造方案；
- **决策与显示分离**：`onDelta` 只进显示层，决策层仍消费完整 raw，工具调用/重试/确认行为零变化——从架构上保证"不影响其它正常功能"；
- **扩展性**：`AIAdapter` 流式能力为可选接口，Gemini Nano 后续补 `promptStreaming` 只需实现同一方法；
- **第一版干净**：不引入传输层复杂度（无需 Port/心跳/重连），不自写字符级 JSON 状态机，非流式路径完整保留作为降级；
- **风险点已识别**：partial parse 对畸形中间态的容错（跳 tick 兜底）；端点流式兼容性（自动降级）；超时语义变更对现有长任务的影响（首块+空闲双阈值覆盖原单一定时器的全部场景）。

## 10. 已实现（P1–P4 全部完成）

### 10.1 产物清单

| 文件 | 改动 |
|------|------|
| `src/shared/agent-stream.ts`（新增） | 流式显示层：`createAgentStreamFormatter` → `LiveStreamState{replyActive,replyText,thoughtText}` shallowRef；100ms 尾沿节流 partial parse；单调守卫；`push`/`flushNow`/`reset`/`clearThought` |
| `src/shared/ai/openai-adapter.ts` | `chatWithMessagesStream`（重试/降级编排）+ `streamCall`（首块/空闲双超时、content-type 识别、SSE 手动解析、`finish_reason=length` 可观测）；`buildBody`/`readError` 抽取共用；`StreamProtocolError` + `PROTOCOL_STATUS` 会话级 `streamUnsupported` 降级 |
| `src/shared/ai/engine.ts` | `chatWithHistoryStream` 门面：后端无流式能力（Gemini Nano）自动降级非流式、结束一次性回调全量 |
| `src/types/ai.ts`、`src/types/index.ts` | `StreamDeltaHandler` 类型 + `AIAdapter.chatWithMessagesStream?` 可选接口 |
| `src/composables/useAIEngine.ts` | agentLoop 唯一 AI 调用点接入（决策链路不动）；finalize 收敛：`finalizePartialLive`（stop/catch/解析终败三路径转正）、`emitAIChat` 成功收敛、思考落库点 `clearThought`、`cleanup` 兜底 reset；`state.liveStream` getter 供 UI |
| `src/components/LiveBubble.vue`（新增） | 实时回复气泡：`renderMarkdown`（marked+DOMPurify）同一管线 + CSS 闪烁光标 |
| `src/components/TaskBlock.vue` | `liveThought` 可选 prop + 块尾实时思考行（弱化日志视觉） |
| `src/components/MessageList.vue` | `liveStream` prop；LiveBubble 渲染于消息流末尾；`lastBlockId` 定位当前活动块；滚动跟随（距底 <80px 才跟随，上翻阅读不被拉回） |
| `src/App.vue` | `:live-stream="state.liveStream"` 透传 |
| `package.json` | `best-effort-json-parser@^1.5.1`（零依赖 CJS，带类型声明） |

### 10.2 与方案的差异

1. **live 状态形态**：方案行文为 liveReply / liveThought 两个状态，实现收敛为单一 `LiveStreamState` shallowRef（reply 与 thought 同源同帧更新，UI 侧 computed 拆分），语义等价、状态更少；
2. **新增 `clearThought()`**：finalize 三路径之外，"思考正式落库点"需要只清思考、保留回复气泡的颗粒度（否则任务块内实时思考行与正式思考消息短暂重复），属方案 §4.4 的实现细化，不改变收敛语义；
3. **`liveStream` 经 `state` getter 暴露**：对齐 useAIEngine 现有 `state.*` 取值惯例，而非顶层 ref；
4. **滚动跟随落为具体策略**：方案 §4.4 要求"核对滚动策略"，实现为 live 文本变化时"距底 <80px 才跟随"（沿用 50ms debounce）；
5. **LiveBubble 基础闪烁光标**：纯 CSS 一处 keyframes，用于提示"仍在输出"；§8 排除的是 token 级动画/特效打磨，此项为流式 UI 的基础可用性。

### 10.3 验证结果

- 构建门禁：`pnpm lint`（含 `check:i18n`，528 key × 4 语言）、`pnpm type-check`、`pnpm build` 全绿；源码 65 个文件，i18n 零新增词条（与 §4.5 一致）；
- 决策层零改动核验：agentLoop 的 `JSON.parse → repairJSON → action 分发` 链路、重试/确认/停止/持久化逻辑未触碰，`onDelta` 只进 `streamFormatter`（§4.1 安全边界成立）；
- 运行时项（§7 的 2–6：真实流式端点逐步渲染、停止转正后刷新持久化、两类降级、超时语义）需在浏览器连真实端点人工验证，构建级验证已覆盖类型与回归编译面。
