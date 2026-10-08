# Agent Loop 反馈与分发健壮性修复方案

> 背景：录屏 bug（`record_screen` 被 unknownAction 终止 + 只有 system 气泡）暴露出一类结构性问题。
> 本文对其同类问题做全量排查，并把修复一起落地。

## 1. 问题清单

### A 类：命令白名单三处手工副本（录屏 bug 的结构性根因）

AI 可调用的命令集合目前被手工维护在三个地方，新增命令时漏配任何一处都会出 bug：

| 副本 | 位置 | 用途 | 已知漏配 |
| --- | --- | --- | --- |
| ① 提示词工具列表 | `prompts.ts` 的 `AI_VISIBLE_COMMANDS` | 告诉 AI 有哪些命令 | — |
| ② dispatch 白名单 | `useAIEngine.ts` 前缀链 + 特例枚举 | 决定哪些 action 放行执行 | `record_screen`/`stop_recording`（已临时补上） |
| ③ 工具温度正则 | `useAIEngine.ts` 的 `isToolCall` regex | 判定用 0.1 严格温度还是 1.2 闲聊温度 | 同样缺 `record_screen`/`stop_recording` |

**根修**：以 `commands.ts` 的 COMMANDS registry 为单一来源，`prompts.ts` 导出判定函数与正则片段，②③ 由它构建，今后新增命令零漏配。

### B 类：终止分支缺 ai-chat 反馈对

排查标准：凡是 **cleanup + return（任务终止）** 的分支必须有「system 日志 + ai-chat 回复」反馈对，否则用户看到 AI"沉默"。

| 分支 | 位置 | 现状 | 修复 |
| --- | --- | --- | --- |
| exec_plan 阶段①缺必要数据 | `engine.needMoreInfo` | 只有 system 即终止 | 补 `reportUserFacingError` |
| exec_plan 阶段②扫描失败 | `engine.scanProblem` | 只有 system 即终止 | 补 `reportUserFacingError` |
| exec_plan 阶段⑤任务完成/部分完成 | `engine.planTaskDone`/`planTaskPartial` | 只有 system 即终止，完成统计只写进 AI 对话历史未展示 | 补 `emitAIChat`（含步骤统计） |

### C 类：步超时误杀

| 场景 | 现状 | 修复 |
| --- | --- | --- |
| `browser_wait_for` | AI 可传 `timeout`（默认 5000ms，可传更大）等待页面条件，超过 `STEP_TIMEOUT_MS=10s` 即被误判 ACT_TIMEOUT | 新增 `WAIT_STEP_TIMEOUT_MS=30s`，按命令查表覆盖 |
| `batch` | SW 端 `batchExecute` 串行执行全部子调用且无内层超时，子调用可含慢命令（如 `browser_wait_for`），总时长可远超 10s | 新增 `BATCH_STEP_TIMEOUT_MS=60s`，查表覆盖 |

### D 类：action 名断裂与确认失败反馈（复审发现）

| 问题 | 现状 | 修复 |
| --- | --- | --- |
| **exec_plan / task_plan 名字断裂**（既有 bug） | 提示词工具列表教 AI 输出 registry 名 `task_plan`（五阶段描述），而 useAIEngine 的专用分支只收 `json.action === 'exec_plan'` —— AI 的正常输出永远进不了五阶段逻辑，落入 dispatch 死路径（执行段没有 task_plan 的 planResult 分支） | 专用分支条件改为 `exec_plan \|\| task_plan`，两个名字都接住 |
| 确认卡 onConfirm 失败 | `confirmRetryFailed` / `confirmError` 只有 system 气泡后即 cleanup 终止，与 onCancel（有 ai-chat `canceled`）不一致 | 补 `reportUserFacingError` 反馈对 |

### E 类：录屏启动提示通道错位（用户反馈）

`recordingExecutor.start()` 成功后无条件发 system 消息 `rec.started`（"已开始录屏，输入 /stop-recording 停止"），
在两个入口的体验割裂：

| 入口 | 问题 |
| --- | --- |
| agentLoop（自然语言"开始录屏"） | 该 system 夹在任务块中间，且与 AI 的 done 总结信息重复，观感怪异 |
| 斜杠 `/record-screen` | 它是**唯一**的成功反馈，不能直接删 |

**修复**：反馈职责归位到调用方 ——
1. `executor.start()` 删除 `addSystemMessage(rec.started)`，成功信息经 `{ success: true, recording }` 返回；
2. agentLoop 场景：`renderExecutionResult` 渲染 `[1] ✓ 开始录制屏幕` 块 + AI done 总结转述，无需该提示；
3. 斜杠场景：`dispatchToSW` 后按结果用 ai-chat 反馈（成功 `rec.startedReply` 猫语气；失败沿用
   `engine.opFailed` 包裹 executor 返回的精确 message），对齐 `unknownSlash`/`canceled` 的通道惯例；
4. `stop_recording` 已有 ai-chat 反馈（`rec.stoppedSize` + 录屏文件气泡），不动；
5. 删除 dead key `rec.started`，新增 `rec.startedReply`（4 语言）。

### 2.5 已核实无问题项（复审）

- 提示词正文硬编码的 27 个命令名（tabs_observe / tabs_reorder / browser_wait_for 等）全部存在于 registry。
- `emitAIChat(text, true)` 内部含 `cleanup()`，finalReview 分支移除显式 cleanup 后无双清理。
- `reportUserFacingError` 内部已包 `wrapCatReply`，新分支直接传 `t(...)` 即可（与 unknownAction 分支一致）。
- aiHidden 的 26 个斜杠兼容命令均不带 dispatch 前缀，白名单收窄前后行为一致。
- `isToolCall` 新正则对"未注册的 `browser_xxx`"不再匹配（原前缀正则会匹配）：此类为 AI 幻觉输出，
  温度判定落 chat 档无实际影响。
- `scanCurrentPage` 分支无单步超时，由循环顶部的 `TOTAL_TASK_TIMEOUT_MS` 总超时兜底。

## 2. 方案设计

### 2.1 registry 单一来源（prompts.ts）

```ts
/** AI 可调用的命令全集（dispatch 白名单与工具温度正则的共同来源） */
const AI_CALLABLE_COMMANDS = COMMANDS.filter(
  (c) => c.intent !== 'unknown' && c.intent !== 'show_help' && c.intent !== 'chat' && !c.aiHidden
)

/** 提示词工具列表：在全集上额外隐藏 navigate（引导 AI 用更具体的导航命令） */
const AI_VISIBLE_COMMANDS = AI_CALLABLE_COMMANDS.filter((c) => c.intent !== 'navigate')

/** dispatch 白名单判定：action 是否为 registry 中 AI 可调用的命令 */
export function isAiCallableIntent(intent: string): boolean

/** 正则片段（`a|b|c`）：供 useAIEngine 动态构建工具温度正则 */
export const AI_CALLABLE_INTENT_SOURCE: string
```

关键语义：dispatch 白名单 = `AI_CALLABLE_COMMANDS`（**含 navigate**），比提示词列表宽一档——提示词不教 navigate，但 AI 明确输出时仍放行，与现状一致。

### 2.2 dispatch 白名单与温度正则替换（useAIEngine.ts）

- dispatch 条件从 12 行前缀链 + 7 个特例枚举，替换为 `isAiCallableIntent(actionStr)`；
  `exec_tool`/`done`/`ask`（旧 toolCall 格式）与 unknownAction 分支保持不变。
- 行为差异说明：原先前缀匹配放行 registry 中不存在的 `browser_xxx`（执行失败重试浪费步数），
  现在落入 unknownAction 给出友好回复后终止——命令不存在时重试无意义，行为更正确。
- 工具温度正则改为动态构建：registry intents（动态）+ legacy 动作名
  `scan|exec_plan|askUserResponse|done|exec_tool|execute`（静态保留，维持既有温度行为）。

### 2.3 步超时查表（useAIEngine.ts + constants.ts）

```ts
// constants.ts
export const WAIT_STEP_TIMEOUT_MS = 30000

// useAIEngine.ts：特殊命令的步超时覆盖表（默认 STEP_TIMEOUT_MS）
const STEP_TIMEOUT_OVERRIDES: Record<string, number> = {
  record_screen: RECORDING_STEP_TIMEOUT_MS, // 屏幕选择器等待用户手动选择
  browser_wait_for: WAIT_STEP_TIMEOUT_MS,   // AI 可传更长 timeout 等待页面条件
}
```

### 2.4 反馈对补齐 + i18n

新增 4 个 key（4 语言，猫语气对齐 `consecutiveFailuresReply`）：

| key | 场景 |
| --- | --- |
| `engine.needMoreInfoReply` | 阶段①缺数据终止 |
| `engine.scanProblemReply` | 阶段②扫描失败终止 |
| `engine.planDoneReply` | 任务完成总结（带 success/skipped/failed 插值） |
| `engine.planPartialReply` | 任务部分完成总结（同上） |
| `engine.confirmRetryFailedReply` | 确认卡确认后命令执行失败 |
| `engine.confirmErrorReply` | 确认卡确认后命令执行抛异常 |

## 3. 排查过、确认无需修改的分支（避免重复排查）

- `consecutiveFailures`：已有 `consecutiveFailuresReply` 反馈对。
- `stepProblem`（单步失败）：过程日志，循环继续，AI 后续会向用户汇报。
- `askUserResponse` 暂停分支：非终止（用户回答后继续），且 `needUserData` system 气泡已展示 AI 的问题文本。
- 其余终止分支（`taskTimeout`/`noBackend`/`serviceUnavailable`/`emptyResponse`/`notUnderstood`/
  `unknownAction`/`unexpected`/`submitError`/`submitSlashError`/`swNoResponse`/`stopped`/`maxSteps`）：
  均已有反馈对。
- 过程类 system 日志（`running`/`thought`/`planAnalyzeDone`/`planScanDone`/`planAllDone`/`receivedUserData`）：
  后面必有继续执行或 ai-chat 收尾。

## 4. 改动文件

| 文件 | 改动 |
| --- | --- |
| `src/shared/prompts.ts` | 提取 `AI_CALLABLE_COMMANDS`，导出 `isAiCallableIntent`/`AI_CALLABLE_INTENT_SOURCE` |
| `src/composables/useAIEngine.ts` | dispatch 白名单替换、温度正则动态构建、步超时查表、exec_plan 专用分支收 task_plan、5 处反馈对 |
| `src/shared/constants.ts` | 新增 `WAIT_STEP_TIMEOUT_MS`/`BATCH_STEP_TIMEOUT_MS` |
| `src/types/ai.ts` | action 联合类型补 `task_plan` |
| `src/locales/{zh-CN,en,de,es}.json` | 新增 6 个 reply key + `rec.startedReply`，删除 `rec.started` |
| `src/recording/executor.ts` | start 成功后不再发 system 提示 |
| `docs/agent-loop-feedback-hardening.md` | 本文档 |

## 5. 验证

- `pnpm lint && pnpm type-check && pnpm build` 全绿（i18n 键数 529 → 535，四语言齐平）。
- 手动回归：录屏开始/停止、普通标签页操作、exec_plan 任务（AI 按 registry 输出 `task_plan` 应能进入五阶段流程）、`browser_wait_for` 长等待、确认卡确认失败场景。
