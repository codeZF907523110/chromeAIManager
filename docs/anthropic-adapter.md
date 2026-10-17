# Anthropic 协议适配器 + AI 调用链路修复方案

> 状态：已实施 ｜ 日期：2026-10-17

## 1. 背景

用户使用智谱 AI（bigmodel.cn）时插件完全不可用。经抓包与 curl 对照测试，定位出 **4 个独立问题**：

| # | 问题 | 证据 |
|---|---|---|
| 1 | agent loop 首轮闲聊显式传 `temperature: 1.2`，智谱全系列模型限 `[0,1]`，返回 1210 错误（HTTP 400） | 用户抓包：`"temperature":1.2` → `{"code":"1210","message":"temperature参数非法：限制数值范围[0,1]"}` |
| 2 | 编辑当前模型的配置（endpoint/key/modelName）后 `aiEngine.backend` 缓存不刷新，插件继续用旧配置请求 | `useAIEngine.ts` 的 watch 只监听 `activeModelId`；`updateModel` 改字段不触发 |
| 3 | 智谱部分路径返回「HTTP 200 + 错误 body」（如 `{"code":500,"msg":"404 NOT_FOUND"}`），适配器解析 `choices` 得空串静默返回，上层只显示「AI 没有返回任何内容」，无诊断信息 | curl：`/api/anthropic/chat/completions` 返回 HTTP 200 + 404 body |
| 4 | 用户持有的智谱 GLM Coding Plan 额度**仅限 Anthropic 协议端点**（`/api/anthropic`），`glm-5.3-flash` 在 OpenAI 端点（`paas/v4`）返回「余额不足」；插件无 Anthropic 适配器，该额度无法使用 | curl：`/api/anthropic/v1/messages` 正常返回；`/api/paas/v4/chat/completions` 返回 429 余额不足 |

## 2. 改动清单

### A. 温度修复（让 glm-4.5-flash 立即可用）

三处 `1.2` → `1.0`（1.0 在 OpenAI/DeepSeek/智谱所有主流端点均为合法值，闲聊活泼度由提示词保障，温度差异可忽略）：

- `src/composables/useAIEngine.ts:327` — agent loop 闲聊分支
- `src/shared/ai/openai-adapter.ts:234` — chat 模式默认值
- `src/shared/ai/gemini-nano.ts:39` — 同步修改保持一致

### B. 配置缓存 bug（修改模型配置立即生效）

`useAIEngine.ts` initEngine 的 watch：监听源从 `activeModelId` 改为「激活模型的配置指纹」（id/provider/apiKey/apiEndpoint/modelName 拼接），任一变化即 `aiEngine.setModel()` 重建适配器。切换模型（id 变化）仍被覆盖，行为是原逻辑的超集。

### C. 「HTTP 200 + 错误 body」诊断性（给出真实错误而非空响应）

`openai-adapter.ts` 的 `call` 与 `streamCall` 解析响应后检测 `data.error` / `data.message` 字段，存在则抛出携带服务端 message 的 `StreamProtocolError`（状态码用 HTTP 实际状态，走既有降级/重试语义）。覆盖智谱等端点「200 包错误」的怪癖，上层能显示真实原因。

### D. Anthropic 协议适配器（支持 glm-5.3-flash / Coding Plan 额度）

新增 `src/shared/ai/anthropic-adapter.ts`，实现与 OpenAIAdapter 相同的 `AIAdapter` 接口：

| 项 | 实现 |
|---|---|
| URL | `${endpoint}/v1/messages`（endpoint 去尾斜杠；智谱填 `https://open.bigmodel.cn/api/anthropic`） |
| Headers | `x-api-key`、`anthropic-version: 2023-06-01`、`content-type: application/json` |
| Body | `model`、`system`（从 messages 提取 system role）、`messages`（非 system 部分）、`max_tokens`（必填，默认 4096）、`temperature`（闲聊 1.0 / 工具调用 0.1，与 openai 链路一致）、`stream` |
| jsonMode | Anthropic 协议无 `response_format`，忽略该选项（JSON 输出由 agent loop 系统提示词约束，与 OpenAI 链路的双保险策略等价） |
| 非流式解析 | `content[]` 拼接 `type === 'text'` 块；`stop_reason === 'max_tokens'` 打截断警告；顶层 `error`/`type: 'error'` 抛出 |
| 流式 SSE | `content_block_delta` 中 `delta.type === 'text_delta'` 的 `text` 增量回调；`thinking_delta`（思考模型的思考过程）静默忽略；`event: error` 抛错（仅 JSON 解析失败静默跳过，业务错误不吞）；`message_delta` 的 `stop_reason` 记录截断 |
| 消息角色 | 连续同角色消息（如任务暂停恢复时「暂停说明 + 用户新指令」两条 user）在 buildBody 内防御性合并——官方 API 自动合并，部分兼容端点可能报错 |
| 复用语义 | StreamProtocolError/PROTOCOL_STATUS 降级、首块/空闲超时、重试 1 次、权限申请——与 OpenAIAdapter 完全一致；权限检查抽为共享函数 `ensureEndpointPermission`（`src/shared/ai/permission.ts`），两个适配器共用 |

配套接入：

- `src/types/ai.ts`：`AIProvider` 增加 `'anthropic'`
- `src/shared/ai/engine.ts`：`provider === 'anthropic'` 分支创建 `AnthropicAdapter`
- `src/App.vue`：添加/编辑模型弹窗的 provider 下拉增加「Anthropic 兼容」选项；`getProviderLabel` 增加映射
- `src/locales/{zh-CN,en,de,es}.json`：新增 `app.providerAnthropic` 四语言词条

## 3. 不做的事

- 不做 Anthropic 原生 tool_use（agent loop 的 action JSON 协议靠提示词约束，与 OpenAI 链路现状一致，避免两套执行协议分叉）
- 不处理 `thinking_delta` 的前端展示（思考内容不进回复正文；现有 agent 思考展示走 `thought` 字段）
- 不改 `PROTOCOL_STATUS`、重试次数、超时阈值等既有语义

## 4. 验证

1. curl 模拟 Anthropic 协议（非流式/流式、thinking 模型）→ 已验证智谱端点行为
2. `pnpm lint` ✓（i18n 536 keys 四语言齐平）&& `pnpm type-check` ✓ && `pnpm build` ✓
3. 代码链路审查：温度显式传参优先级、anthropic 工厂分支、watch 指纹覆盖切换+编辑两场景、200+错误体不误伤正常响应——均确认
4. 真机（待用户）：glm-4.5-flash + `paas/v4`（走温度修复）；glm-5.3-flash + provider=Anthropic + `https://open.bigmodel.cn/api/anthropic`（走新适配器）；编辑配置立即生效（B）；错误端点给出真实错误信息（C）
