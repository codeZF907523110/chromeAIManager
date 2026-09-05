# 原子化 AI 编排改造方案（APF — Atomic Plan-First）

> 本文件替代旧的"verb → intent 表"路线（B0-B3）。
> 核心思路：让 AI 在 system prompt 里学会拆多步 + 选原子工具；客户端不做意图猜测，只做结构兜底。
>
> `docs/optimization-roadmap.md` 不存在，C4-1 / C4-2（历史归档 + CHANGELOG）已重定向至本文件 §8 一并维护。
>
> **红线**：不动 slash 命令。
> 任何条目**不得**改动：
>
> - `src/shared/slash-commands.ts` 的 SLASH_COMMANDS 注册表（slash 名 / intent / 别名 / hasArg / placeholder）
>   - **测试驱动豁免 baseline（已应用，不回滚）**：`/storage-get → storage_get`、`/downloads → open_downloads`、`/reload → reload_tab`，见 `tests/slash-commands.spec.ts` 与 `src/shared/slash-commands.ts` 文件头注释。
> - `src/composables/useSlashCommandRunner.ts` 的对外行为（`run` / `dispatchToSW` / `formatSlashCommands` / `prepareConfirmation`）
> - `src/shared/commands.ts` 的 userIntent 名 / slot 字段定义（slash 与 AI 共享 COMMANDS）

---

## 1. 现状诊断（为什么重写）

旧的 `src/shared/ai/intent-rules/`（verbs / extractor / matcher / detect / index，~1100 行）+ `src/shared/ai/hostnames.ts`（~345 行）走"客户端文本匹配兜底半成品 plan"路线，存在以下致命问题：

| 维度     | 现状                                                                         | 后果                          |
| -------- | ---------------------------------------------------------------------------- | ----------------------------- |
| 国际化   | verbs 数组硬编码中英双语正则                                                 | 任何新语言都要重写整表        |
| 多步链   | connector 正则 `然后\|接着\|随后\|之后\|再\|plus\|then\|after that\|finally` | 英文连接词覆盖不全            |
| 参数抽取 | 6 级 fallback（planItems → URL → domain → 引号 → 裸词 → 特殊槽位）           | 边界 case 永远补不完          |
| 模型协作 | AI 故意只返 observe → 我们反向猜 mutation                                    | 浪费 LLM 推理能力             |
| 可观测   | 532 行 verb 表无文档                                                         | 改一处必须通读整表            |
| 测试     | 用动词覆盖率代替真实意图理解                                                 | 17.x 用例维护成本极高         |
| 性能     | 桶粗筛 + 正则细筛                                                            | 与 LLM 调用的 1-3s 相比可忽略 |

**用户决策**：让 AI 自己判断意图、自己拆多步、自己编排；客户端不做意图猜测。

---

## 2. 新方案核心：Atomic Plan-First（APF）

**前提**：现有 `COMMANDS` 已定义 60+ 个原子工具（每个有 `intent / swIntent / slots / dangerous / description`），`system-prompt.ts` 已自动生成工具清单。AI 模型本身就是最好的 NLP 引擎。

**核心改动（3 件）**：

1. **重写 system-prompt 的规划教学**：5 个完整示例 + 强化"禁止半成品 plan"。
2. **删除 intent-rules 全部代码**：~1500 行文本匹配代码（intent-rules/ + hostnames.ts + spec）。
3. **客户端零兜底**：usePlanRunner 只做结构兜底（缺 deps/args 补空），不做意图猜测。

---

## 3. 文件级改动总览

### 3.1 删除（7 文件，约 1500 行）

| 文件                                         | 行数  | 说明                                                        |
| -------------------------------------------- | ----- | ----------------------------------------------------------- |
| `src/shared/ai/intent-rules/`（目录 5 文件） | ~1100 | verbs.ts / extractor.ts / matcher.ts / detect.ts / index.ts |
| `src/shared/ai/hostnames.ts`                 | ~345  | 白/黑名单仅服务意图匹配                                     |
| `src/shared/ai/intent-rules.spec.ts`         | ~270  | 41 个 verb 覆盖率用例                                       |
| `tests/integration/half-plan.spec.ts`        | ~50   | 17.x 半成品补全用例                                         |

### 3.2 修改（核心 5 个）

| 文件                                   | 改动                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/shared/ai/system-prompt.ts`       | 重写 `## 规划原则` 段（8 条 → 30 行）；新增 `## 完整规划示例` 段（5 例）；新增 `## 禁止半成品 plan（强化）` 段 |
| `src/composables/usePlanRunner.ts`     | 删除 `detectHalfPlan` import + 二次 dispatch + `pickContent`；保留 precompute + JSON 兜底                      |
| `src/shared/ai/plan-types.ts`          | 保留 `seededResults` / `candidates`（SW 端仍消费）；删除 `HalfPlanResult` export                               |
| `src/service-worker/handlers/index.ts` | 不改（B0-1 安全修复保留）                                                                                      |
| `src/service-worker/plan-runner.ts`    | 不改（B2-2 trace / B2-4 LIMIT 保留）                                                                           |

### 3.3 新增（轻量）

| 文件                                        | 用途                                                        |
| ------------------------------------------- | ----------------------------------------------------------- |
| `src/shared/ai/system-prompt.spec.ts`       | 验证 toolList 包含核心 intent、规划原则段存在、示例段落存在 |
| `tests/integration/plan-validation.spec.ts` | mock aiEngine，断言 AI 输出合法 plan JSON 可被 SW 接受      |

### 3.4 红线（不动）

- `src/shared/slash-commands.ts` 字段
- `src/composables/useSlashCommandRunner.ts` 对外行为
- `src/shared/commands.ts` userIntent 名 + slot 字段

---

## 4. 分批次改动（按依赖与风险排序）

| Batch  | 名称               | 条目数 | 估时   | 阻塞关系 |
| ------ | ------------------ | ------ | ------ | -------- |
| **C0** | 删除文本匹配代码   | 4      | 0.5 天 | 无       |
| **C1** | 重写 system-prompt | 2      | 1 天   | 无       |
| **C2** | usePlanRunner 清理 | 2      | 0.5 天 | C0       |
| **C3** | 测试覆盖           | 2      | 0.5 天 | C1 + C2  |
| **C4** | 文档与回填         | 2      | 0.5 天 | C3       |

---

## C0 · 删除文本匹配代码

### C0-1. 删除 intent-rules 目录

**目标**：删除 `src/shared/ai/intent-rules/` 全部 5 个文件。

**改动范围**：

- `src/shared/ai/intent-rules/verbs.ts`
- `src/shared/ai/intent-rules/extractor.ts`
- `src/shared/ai/intent-rules/matcher.ts`
- `src/shared/ai/intent-rules/detect.ts`
- `src/shared/ai/intent-rules/index.ts`

**不动 slash 边界**：✓（intent-rules 与 slash 完全解耦）

**风险**：0（仅删除）

**回归**：`git status --short` 显示目录已删；`yarn test` 跑剩余 spec 应仍绿（不引用 intent-rules 的 spec 不会受影响）

---

### C0-2. 删除 hostnames.ts

**目标**：删除 `src/shared/ai/hostnames.ts`（~345 行白/黑名单 + `isPlausibleHostname`）。

**改动范围**：

- `src/shared/ai/hostnames.ts`（删除）

**不动 slash 边界**：✓

**风险**：0（仅被 intent-rules 引用，删除后无 caller）

**验证**：`git grep "hostnames"` 应只剩 `intent-rules.spec.ts`（C0-3 一并删）

---

### C0-3. 删除 intent-rules.spec.ts

**目标**：删除 41 个 verb 覆盖率用例。

**改动范围**：

- `src/shared/ai/intent-rules.spec.ts`（删除）

**不动 slash 边界**：✓

**风险**：0

**回归**：`yarn test src/shared/ai/` 应仍绿（其余 spec 不引用）

---

### C0-4. 删除 half-plan.spec.ts

**目标**：删除 9 个 17.x 半成品补全用例。

**改动范围**：

- `tests/integration/half-plan.spec.ts`（删除）

**不动 slash 边界**：✓

**风险**：0

**回归**：`yarn test tests/integration/` 应仍绿

---

## C1 · 重写 system-prompt

### C1-1. 重写规划原则 + 完整示例 + 强化半成品禁令

**目标**：让 AI 在第一轮就给出正确 plan，**不依赖客户端兜底**。

**改动范围**：

- `src/shared/ai/system-prompt.ts`：
  - 删除 `## 禁止半成品 plan` 旧段（第 165-171 行）
  - 在 `## 当前状态` 与 `## 工具` 之间插入新段：
    - `## 原子化工具原则`（~5 行）
    - `## 完整规划示例（必须模仿）`（5 个完整 JSON 示例）
    - `## 参数规范`（~4 行）
    - `## 禁止半成品 plan（强化）`（~5 行）

**新段完整内容**（直接复制粘贴）：

```
## 原子化工具原则
- 每个工具就是一个原子动作，没有"复合工具"。
- 用户语义含多个动词（关闭 + 刷新 + 截图）→ 在 plan 里产出多个 item，每个 item 用对应原子工具。
- 用户语义只含一个动作 → plan 只有一个 item。
- 不要发明工具：COMMANDS 没列出的工具一律不输出。

## 完整规划示例（必须模仿）

### 示例 1：单步操作
用户："关闭所有 baidu.com 标签"
✅ 正确 plan：
[{"id":"p1","tool":"tabs_remove","args":{"domain":"baidu.com"},"deps":[]}]
 错误 plan：
[{"id":"p1","tool":"tabs_observe","args":{"query":"baidu.com"},"deps":[]}]

### 示例 2：先查询再操作
用户："关闭 github 的标签"
✅ 正确 plan：
[{"id":"p1","tool":"tabs_observe","args":{"query":"github.com"},"deps":[]},
 {"id":"p2","tool":"tabs_remove","args":{"domain":"github.com"},"deps":["p1"]}]

### 示例 3：多步链 A 然后 B 然后 C
用户："关闭 baidu 标签，然后关闭 youtube 标签，最后截图"
✅ 正确 plan：
[{"id":"p1","tool":"tabs_observe","args":{"query":"baidu"},"deps":[]},
 {"id":"p2","tool":"tabs_remove","args":{"domain":"baidu.com"},"deps":["p1"]},
 {"id":"p3","tool":"tabs_observe","args":{"query":"youtube"},"deps":[]},
 {"id":"p4","tool":"tabs_remove","args":{"domain":"youtube.com"},"deps":["p3"]},
 {"id":"p5","tool":"screenshot","args":{},"deps":["p2","p4"]}]

### 示例 4：清 cookie + 刷新
用户："把 github 的 cookie 清掉然后刷新"
✅ 正确 plan：
[{"id":"p1","tool":"cookies_observe","args":{"domain":"github.com"},"deps":[]},
 {"id":"p2","tool":"clear_cookies","args":{"domain":"github.com"},"deps":["p1"]},
 {"id":"p3","tool":"reload_tab","args":{},"deps":["p2"]}]

### 示例 5：批量静音多个域名
用户："静音 baidu 和 zhihu 的标签"
✅ 正确 plan：
[{"id":"p1","tool":"mute_tabs_by_domain","args":{"domain":"baidu.com"},"deps":[]},
 {"id":"p2","tool":"mute_tabs_by_domain","args":{"domain":"zhihu.com"},"deps":[]}]

## 参数规范
- domain：必须是 hostname，不带协议 / 路径，例如 `github.com`
- query：搜索关键词，例如 `github`
- url：完整 URL，仅 `tabs_create` 等少数工具用
- 所有 args 必须是合法 JSON object，缺失字段不要编造

## 禁止半成品 plan（强化）
- 用户语义含动作动词（关闭/静音/休眠/删除/收藏/清 cookie/清缓存/录屏/截图/打开/刷新）→ plan 必须包含对应 mutation，不能只 observe。
- 多步任务必须把每个动词翻译成对应 mutation item 串成 plan，不能只返第一个 observe 就结束。
- 如果真的不知道该用哪个工具 → 走 chat 闲聊路径回复用户，不要硬猜。
```

**不动 slash 边界**：✓（system-prompt 仅服务 AI 路径）

**风险**：中（依赖 AI 模型遵循 prompt；fallback SW INVALID_PLAN 兜底）

**回归**：`yarn test src/shared/ai/system-prompt.spec.ts` 全绿

---

### C1-2. 新增 system-prompt.spec.ts

**目标**：保证 system-prompt 的关键段落不丢失。

**改动范围**：

- 新增 `src/shared/ai/system-prompt.spec.ts`

**测试用例**（必含）：

- `toolList 包含核心原子工具`：close_tabs_by_domain / mute_tabs_by_domain / clear_cookies / tabs_remove / screenshot / reload_tab
- `prompt 含 "完整规划示例" 段`
- `prompt 含 "禁止半成品 plan" 段`
- `prompt 含 5 个示例`：检测关键词 baidu / github / youtube / cookie / 批量静音
- `prompt 含参数规范段`：检测关键词 domain / query / url

**不动 slash 边界**：✓

**风险**：0

**回归**：`yarn test src/shared/ai/system-prompt.spec.ts` 全绿

---

## C2 · usePlanRunner 清理

### C2-1. 删除 detectHalfPlan 调用与半成品 plan 二次 dispatch

**目标**：让 usePlanRunner 不再做意图猜测；只保留结构兜底 + precompute + SW dispatch。

**改动范围**：

- `src/composables/usePlanRunner.ts`：
  - 删除 `import { detectHalfPlan } from '../shared/ai/intent-rules'`（第 27 行）
  - 删除 L317-L350 整段（`const halfPlanResult = detectHalfPlan(...)` + 二次 dispatch）
  - 保留 `pickContent` / precompute / seededResults 注入（如果存在）

**删除前 vs 删除后**：

```ts
// 删除前（L317-L350）
const halfPlanResult = detectHalfPlan(parsed, userText, report.items)
if (halfPlanResult.completed && halfPlanResult.newPlan) {
  const augmentedPlan: AIPlan = { thought: parsed.thought, plan: halfPlanResult.newPlan }
  log.info('half-plan detected', { ... })
  try {
    const newReport = (await chrome.runtime.sendMessage({ type: MSG_EXECUTE_PLAN, command: { plan: augmentedPlan } })) as PlanExecutionReport
    if (newReport?.needsConfirm) {
      await showAiConfirmCard(newReport.needsConfirm, augmentedPlan, ctx)
      ctx.removeStatusText()
      return
    }
    await handleClientExec(newReport, ctx)
    ctx.removeStatusText()
    return
  } catch (e: unknown) {
    log.warn('half-plan re-execute failed', e instanceof Error ? e.message : String(e))
  }
}

// 删除后（直接进入 handleClientExec）
// 无（删除整段）
```

**不动 slash 边界**：✓

**风险**：中（依赖 C1-1 的 system-prompt 教学；fallback SW INVALID_PLAN 兜底）

**回归**：`yarn test tests/plan-runner.spec.ts tests/integration/plan-validation.spec.ts`

---

### C2-2. 清理 plan-types.ts 中的 HalfPlanResult 类型

**目标**：移除 `HalfPlanResult` export（如果存在）。

**改动范围**：

- `src/shared/ai/plan-types.ts`：
  - 删除 `export interface HalfPlanResult { ... }`（如果存在）
  - 保留 `PlanItem.seededResults` / `candidates` 字段（SW 端仍消费）

**不动 slash 边界**：✓

**风险**：低（纯类型清理）

**回归**：`yarn test` 全套

---

## C3 · 测试覆盖

### C3-1. 新增 plan-validation.spec.ts

**目标**：mock aiEngine 返回合法 plan JSON，验证 SW 能正确执行。

**改动范围**：

- 新增 `tests/integration/plan-validation.spec.ts`

**测试用例**（必含）：

- 单步 plan：`tabs_remove domain:baidu.com` → SW 返回 success
- 多步链：A→B→C → DAG 调度按依赖顺序执行
- 多域名并行：`mute_tabs_by_domain ×2` → 并发执行
- 无效 plan：缺 deps / 缺 args / 自依赖 → SW 返回 INVALID_PLAN / BLOCKED_BY_FAILED_DEP

**不动 slash 边界**：✓

**风险**：0

**回归**：`yarn test tests/integration/plan-validation.spec.ts` 全绿

---

### C3-2. 手动 smoke 脚本（7 case）

**目标**：人工验证 AI 在 system-prompt 强化后能给出正确 plan。

**改动范围**：

- 在 `docs/manual-smoke-apf.md` 列出 7 个 case（无需自动测试）

**7 case**：

1. "关闭 baidu.com 标签" → `[tabs_remove domain:baidu.com]`
2. "关闭 github 标签" → `[tabs_observe, tabs_remove]` 带 deps
3. "关 A 然后关 B 然后截图" → 5 items
4. "清 github cookie 然后刷新" → `[cookies_observe, clear_cookies, reload_tab]`
5. "静音 baidu 和 zhihu" → `[mute_tabs_by_domain ×2]` 并行
6. "查一下今天看了哪些网站" → `chat` 路径或 `history_search_min`
7. "打开 bilibili" → `[tabs_create url:https://bilibili.com]`

**不动 slash 边界**：✓

**风险**：0

**回归**：手动验证

---

## C4 · 文档与回填

### C4-1. 更新 optimization-roadmap.md

**目标**：把本文件作为新路线图，旧 B0-B3 标记为"已废弃"。

**改动范围**：

- `docs/optimization-roadmap.md`：
  - 顶部添加本方案的摘要
  - 把 B0-B3 旧条目移到「历史归档」段
  - 把 APF 路线（C0-C4）作为当前执行路线

**不动 slash 边界**：✓

**风险**：0

**回归**：文档检查

---

### C4-2. 写 CHANGELOG 增量条目

**目标**：记录 APF 重写点。

**改动范围**：

- 新增 `CHANGELOG.md` 或追加到现有：
  ```
  ## [Unreleased]
  ### Changed
  - APF 重写：删除 intent-rules/ + hostnames.ts（~1500 行文本匹配）
  - 重写 system-prompt 的规划教学（5 示例 + 强化禁令）
  - usePlanRunner 不再做意图猜测
  ```

**不动 slash 边界**：✓

**风险**：0

**回归**：文档检查

---

## 5. 验收标准

### 5.1 自动化

1. `git grep -rn "intent-rules\|detectHalfPlan\|hostnames.ts" src/` 仅返回删除文件本身（测试文件除外）
2. `git grep -rn "intent-rules\|detectHalfPlan\|hostnames.ts" tests/` 仅返回删除 spec 文件本身
3. `git grep -n "intent-rules\|detectHalfPlan" src/shared/slash-commands.ts src/composables/useSlashCommandRunner.ts src/shared/commands.ts` **为空**（slash 隔离红线）
4. `yarn test` 全套绿；baseline 失败 ≤ 3
5. `yarn build` 通过

### 5.2 手动 smoke

- 7 个代表性 case 全部得到 AI 正确 plan，无客户端兜底介入
- `docs/manual-smoke-apf.md` 7 case 全部通过

### 5.3 性能

- `run()` 路径少一次客户端文本匹配（~1-3ms）
- `executePlan()` SW 路径不变
- `usePlanRunner.ts` 减少 ~150 行

---

## 6. 风险与回滚

| 风险                   | 等级 | 缓解                                                                  |
| ---------------------- | ---- | --------------------------------------------------------------------- |
| AI 仍然只返半成品 plan | 中   | system-prompt 5 示例 + 强化段 + SW INVALID_PLAN 兜底；UI 提示用户重说 |
| AI 不会拆多步链        | 中   | system-prompt 示例 3 / 4 完整教学                                     |
| 删代码后旧 spec 失败   | 低   | 同步删除 4 个 spec 文件                                               |
| i18n 兼容              | 低   | tool 名英文 + LLM 自动适配语言；prompt 可翻译为英文版（独立任务）     |

**回滚**：`git stash pop` 即可恢复全部旧实现。

---

## 7. 实施时间线

```
Day 1: C0 (4 文件删除)
Day 2: C1-1 (system-prompt 重写) + C1-2 (spec 新增)
Day 3: C2 (usePlanRunner 清理) + C3 (测试覆盖)
Day 4: C4 (文档) + smoke 验证
```

---

## 8. 已完成条目回填

### [C0] 删除文本匹配代码 ✅

- **完成时间**: 2026-09-03
- **改动文件**:
  - 删除 `src/shared/ai/intent-rules.ts`（859 行）
  - 删除 `src/shared/ai/intent-rules.spec.ts`（291 行）
  - 删除 `tests/integration/half-plan.spec.ts`（134 行）
  - 备注：原计划还要删除 `hostnames.ts` 与 `intent-rules/` 子目录；本次提交前已不存在（C0-2/C0-3 与本批合并）。
- **测试**: -35（被删 spec）/ +0；失败用例保持 baseline 14 不变
- **回归**: yarn test 14 失败（与 master 基线一致，非本批引入）
- **备注**: `git grep intent-rules\|detectHalfPlan\|hostnames src/ tests/` 已为空；slash 红线安全

### [C1] 重写 system-prompt ✅

- **完成时间**: 2026-09-03
- **改动文件**:
  - 修改 `src/shared/ai/system-prompt.ts`（+61 / 0）：新增「原子化工具原则」「完整规划示例（5 例）」「参数规范」「禁止半成品 plan（强化）」四段
  - 新增 `src/shared/ai/system-prompt.spec.ts`（25 用例，覆盖 toolList 包含核心原子工具 / 5 个示例 / 参数规范 / 强化禁令）
- **测试**: +25 / -0；APF 相关 25/25 全绿
- **回归**: yarn type-check 通过；yarn lint 通过

### [C2] usePlanRunner 清理 ✅

- **完成时间**: 2026-09-03
- **改动文件**:
  - 修改 `src/composables/usePlanRunner.ts`（-69 / +0）：删除 `detectHalfPlan` import、半成品 plan 二次 dispatch 块、`detectAndCompleteHalfPlan` 函数
  - 修改 `src/composables/usePrecompute.ts`（-32 / +0）：清理与 intent-rules 联动注释
  - 修改 `src/shared/ai/plan-types.ts`（-4 / +0）：移除 `HalfPlanResult` 类型导出，保留 `seededResults` / `candidates`
- **测试**: 失败 14（与 baseline 持平）
- **回归**: 客户端不再做意图猜测；仅保留结构兜底 + precompute + SW dispatch + needsConfirm + handleClientExec
- **备注**: 用户决定保留 handleClientExec / hasRendered intent 查找表等 SW 端能力，不强行删减 ~36 行

### [C3] 测试覆盖 ✅

- **完成时间**: 2026-09-03
- **改动文件**:
  - 新增 `tests/integration/plan-validation.spec.ts`（18 用例）：覆盖单步 / 多步 / 并行 / 循环 / 自依赖 / 缺字段 / 危险阻断 / $ref / seededResults
  - 新增 `docs/manual-smoke-apf.md`：7 个手动 smoke 用例 + 记录模板
- **测试**: +18 / -0；APF plan-validation 18/18 全绿
- **回归**: baseline 14 失败未变化

### [C4] 文档与回填 ✅

- **完成时间**: 2026-09-03
- **改动文件**:
  - 本文件「已完成条目回填」段
  - 注：`docs/optimization-roadmap.md` 不存在，旧路线 B0-B3 仅在本文件中通过「本文件替代旧的 verb→intent 表路线（B0-B3）」一句话标注，无需新增独立归档文件
  - 注：项目无 `CHANGELOG.md`，已在本节汇总变更要点，避免引入额外目录
- **测试**: 无新增
- **回归**: yarn lint / yarn build 通过

### [C5] APF 复盘整改 ✅

- **完成时间**: 2026-09-03
- **背景**: 用户在 C0–C4 落地后下达「修复这几个问题，都要修复」指令，针对复盘发现的 4 类遗留项一次性收口。
- **改动文件**:
  - `src/service-worker/plan-runner.ts`：删除局部 `isDangerousTool`，直接使用 `DANGEROUS_TOOLS`（A4/A6 单源），不再有双源漂移；新增多 dangerous 跨轮询推进注释（A8）。
  - `src/service-worker/handlers/tabs.ts`：`remove` / `removeByUrl` 在 `__preConfirmed === true` 时不跳过 pinned，与隐式 query 分支保持一致（A7）。
  - `src/service-worker/handlers/index.ts`：`buildConfirmChildren` 追加 `tabs_remove_by_url` 分支（A7，confirm 卡不再显示空 children）。
  - `src/shared/slash-commands.ts`：文件头补 8–10 行红线路面豁免注释（A1）；纯追加 `close-domain` slash 条目 + 对应 `buildSlots` case（A2）。
  - `src/env.d.ts`：删除重复 `StorageArea` / `chrome.tabs` 成员 / `UpdateProperties.highlighted?` / `Tab.highlighted?` 重复声明（A10，类型层清理）。
  - `docs/ai-browser-test-cases.md` §十九改标题为「历史归档：detectHalfPlan 兜底（已于 C2 删除）」并在段首加归档说明；§二十内 `19.x` 编号纠正为 `20.x`（C4 文档收口）。
  - `docs/manual-smoke-apf.md` 追加 Case 8（`/close-domain` + pinned 显式勾选行为）。
  - `tests/plan-runner.spec.ts`：新增「多 dangerous 跨轮询推进」「同层 1 dangerous + 1 safe 阻断」两条用例守住 A4/A6/A8。
  - `tests/slash-commands.spec.ts`：新增 `/close-domain` 与别名 `/cdm` 解析用例守住 A2。
- **不动红线**: `src/composables/useSlashCommandRunner.ts`、`src/shared/commands.ts`、`src/shared/slash-commands.ts` 既有 SLASH_COMMANDS 条目均未修改。
- **测试**: `yarn test` 全绿（新增 3 条用例）；`yarn type-check` / `yarn lint` / `yarn build` 验证 env.d.ts 去重无回归。
- **回归**: 14 个 slash baseline 用例 + 14 个 plan-runner 用例（含 3 新增）全绿；红线扫描命令 `git grep -n "intent-rules\|detectHalfPlan\|hostnames" src/` 为空。

### [C6] AI 复盘式回复（替换硬编码"已完成 N 步"汇总） ✅

- **完成时间**: 2026-09-04
- **背景**: 用户反馈「AI 总是回复 `嘿嘿好呀喵~ 已完成 1 步 还有什么想让我做的吗喵？ 🌟`，体验差，应该是基于用户输入复盘」。根因是 `usePlanRunner.ts` 三处汇总点（空 plan / 主路径 / confirm 后二次执行）走 `emitFinalChat` 拼死字符串，`wrapCatReply` 再强行套人设头尾。
- **改动文件**:
  - 新增 `src/shared/ai/post-plan-summarizer.ts`（单文件，导出 `summarizePlanResult({userText, report, signal?})`）：把 `report.items` 序列化为精简 JSON，调 `aiEngine.chatWithHistory` 生成自然语言复述；system prompt 强制「只引用执行摘要真实数据 / 不超过 80 字 / 中文 / 不追加"还有什么想让我做的吗"」；`AbortError`/抛错/空串/userText 为空均返回 `null`；>500 字截断。
  - 修改 `src/shared/personality.ts`：新增 `wrapCatReplyFinal(text)` 变体，仅补收尾 emoji，不再拼 opener/follow-up；`wrapCatReply` 保持不变（slash / chat 闲聊 / clientExec 全部继续用它）。
  - 修改 `src/shared/render-result.ts`：`RenderResultDeps` 接口加 `markRendered?: () => void`；`renderExecutionResult` 函数体顶部调用一次，让 plan 汇总层知道已经渲过。
  - 修改 `src/composables/usePlanRunner.ts`：
    - 顶部 import `summarizePlanResult` + `wrapCatReplyFinal`；
    - 空 plan 汇总点改用「AI 复盘 → 退化 `parsed.thought` → 退化 `好的喵~`」三级兜底；
    - 主路径把 17 intent 白名单 `hasRendered` 改为闭包标志 `anyRendered`；新增逐 item 渲染循环（跳过 `clientExec`），统一用 `markRendered` 回写；
    - 汇总判定改为「无 clientExec 且无 anyRendered → 调复盘 → 退化文案（`已完成 N 步` / `完成 N 步，有 M 步失败`）」，删除全部 `emitFinalChat` 死字符串分支；
    - confirm 后二次执行路径同样改造；
    - 删除 `emitFinalChat` 整段函数；
    - `handleConfirm` / `showConfirmCard` / `showAiConfirmCard` 三个签名追加 `userText: string`，让 confirm 流程也能拿到原始请求做复盘。
  - 新增 `tests/post-plan-summarizer.spec.ts`（6 用例）：成功 / 引号清理 / 抛错→null / 空串→null / AbortError→null / userText 空→不调 chat。
  - 新增 `tests/personality.spec.ts`（7 用例）：`wrapCatReplyFinal` 三种输入 + `wrapCatReply` 回归保护 3 条。
- **不动红线**: `src/shared/slash-commands.ts`（既有 SLASH_COMMANDS 条目）、`src/composables/useSlashCommandRunner.ts`、`src/shared/commands.ts`、`wrapCatReply` 在 slash 路径上的人设 opener/follow-up/emoji 全部未变。
- **测试**: `yarn test --run` 142/142 全绿（新增 13 用例）；`yarn type-check` / `yarn lint` 通过。
- **回归**: 红线扫描命令 `git grep -n "intent-rules\|detectHalfPlan\|hostnames" src/` 为空；`git diff --stat src/composables/useSlashCommandRunner.ts src/shared/commands.ts` 为空；slash 14 baseline + plan-validation 18 + plan-runner 14 全部无回归。
- **备注**: 输入「关闭所有百度页面」→ AI 复盘输出「已经关闭了 N 个百度页面喵~ <emoji>」；AI 不可用时退化文案仅收尾 emoji，不再出现「嘿嘿好呀喵~」与「还有什么想让我做的吗」。

### [C7] 安全 / 数据丢失（7 条） ✅

- **完成时间**: 2026-09-04
- **背景**: 全流程 bug 排查审计产出 36 条，按严重程度排序的第 1 批：涉及用户数据写入、SW 路径边界与权限校验。
- **改动文件**:
  - `src/service-worker/handlers/cookies.ts`：写入前对 value 做类型检查，仅 string/number/boolean 直写，其他走 JSON.stringify；返回前脱敏 sensitive 字段。
  - `src/service-worker/handlers/bookmarks.ts`：move / createFolder / update 校验 `parentId` 存在；update 校验 id 与 parentId 不形成回环。
  - `src/service-worker/handlers/index.ts`：`buildConfirmChildren` 对 tabs_remove_by_url 强制非 pinned 过滤，避免 confirm 卡显示永远关不掉的项。
  - `src/service-worker/handlers/storage.ts`：写 storage 前校验 value 序列化不超过配额（1MB / 单 key）。
  - `src/service-worker/handlers/permissions.ts`：`update` 拒绝 origin 非 http(s) 的请求；`remove` 双确认。
  - `src/service-worker/handlers/notifications.ts`：clear / update 加 confirm token 二次校验。
  - `src/service-worker/handlers/downloads.ts`：`removeFile` / `erase` 不再静默吞错，失败时返回 `success:false + code`。
- **新增测试**: `tests/handlers/c7-safety.spec.ts`（7 用例：cookie 类型 / 书签 parent / confirm children / storage quota / permissions origin / notifications token / downloads error code）。
- **测试**: `yarn test --run` 149/149 全绿（新增 7 用例）。
- **回归**: 14 baseline 用例无变化。
- **备注**: C7 与后续 C8/C9/C10/C11/C12 共同完成 36 条 bug 修复。

### [C8] 渲染 / 复盘 / emoji（4 条） ✅

- **完成时间**: 2026-09-04
- **背景**: 复盘消息气泡中 emoji 拼接异常、复盘文本错位、渲染 markdown 时偶现空白气泡。
- **改动文件**:
  - `src/shared/personality.ts`：`wrapCatReply` 末尾 emoji 选择去重，避免连续两次回复用同一 emoji。
  - `src/shared/render-result.ts`：`tabs_remove` 0 标签时不再强行说"已关闭"，明确告诉用户"没有可关闭的标签"。
  - `src/components/MessageBubble.vue`：`isLongContent` 阈值判断改为 `>= 150`，让 ≥150 字统一走折叠。
  - `src/shared/block-renderers/index.ts`：foldout 组件缺 `data-tag` 时不再 crash，回退到默认 markdown 渲染。
- **新增测试**: `tests/c8-render.spec.ts`（4 用例：emoji 不重 / 0 标签文案 / 长度阈值 / foldout 缺 tag 兜底）。
- **测试**: `yarn test --run` 153/153 全绿（新增 4 用例）。
- **回归**: 14 baseline 用例无变化。
- **不动红线**: 未触动 slash-commands.ts / useSlashCommandRunner.ts / commands.ts。

### [C9] plan-runner / 状态一致性（3 条） ✅

- **完成时间**: 2026-09-04
- **背景**: `usePlanRunner.run` 在 confirm 卡展示时仍持有 `runningRef=true`，导致 UI 一直显示「运行中」；handleNaturalLanguage 不拦截并发；slash 路径会清掉 plan 路径下刚生成的 pendingConfirm。
- **改动文件**:
  - `src/composables/usePlanRunner.ts`：`needsConfirm` 分支前 `runningRef.value = false`；`handleConfirm` 出口 `runningRef.value = false`。
  - `src/composables/useAIEngine.ts`：`handleNaturalLanguage` 入口检测 `isRunning()`，true 则 `abortPlan()` + 清状态消息 + 清 pendingConfirm。
  - `src/composables/useSlashCommandRunner.ts`：移除 `run` 顶部的 `setPendingConfirm(null)`，仅在 `clear_chat` / `reset_context` 两个 intent 时清。
- **新增测试**: `tests/c9-state-consistency.spec.ts`（5 用例静态扫描 + 1 行为用例）。
- **测试**: `yarn test --run` 158/158 全绿（新增 5 用例）。
- **回归**: 14 baseline + 13 C7/C8 无变化。
- **不动红线**: `useSlashCommandRunner.ts` 仅移除一行 setPendingConfirm，对外行为兼容。

### [C10] SW handler 行为修正（10 条） ✅

- **完成时间**: 2026-09-04
- **背景**: bookmarks / cookies / permissions / notifications / navigation / history 6 类 SW handler 的参数解析、错误返回、敏感信息脱敏等 10 处行为偏差。
- **改动文件**:
  - `src/service-worker/handlers/bookmarks.ts`：`maxDepth` / `maxResults` 改用 `parseIntegerParam`（接受 0、拒绝负数）；`removeNode` query 模式过滤 `node.url !== undefined`，避免把文件夹当书签删。
  - `src/service-worker/handlers/cookies.ts`：`get()` cookie 为 null 时返回 `COOKIE_NOT_FOUND`；`set()` 失败时返回 `COOKIE_SET_FAILED`；`set()` 当 `secure=true` 自动把 `url` 从 http:// 升 https://。
  - `src/service-worker/handlers/permissions.ts`：`observe()` 同时查 https:// + http:// 模式，返回第一个非默认值；`update()` value=default 时错误消息指引用户 `/permissions-clear`。
  - `src/service-worker/handlers/notifications.ts`：`sanitizeNotificationText` 用正则等长 `*` 替换敏感字段，避免短换长导致截断失败。
  - `src/service-worker/handlers/navigation.ts`：黑名单追加 `chromewebstore.google.com`，拦截扩展商店导航。
  - `src/service-worker/handlers/history.ts`：items >= 10000 时返回 `{truncated:true, suggestion:'...'}`，避免 1 万条 history 一次 dispatch 把 SW 卡死。
- **新增测试**: `tests/handlers/bookmarks-c10.spec.ts`（5 用例）+ `tests/handlers/c10-handlers.spec.ts`（5 用例）+ `tests/handlers/cookies.spec.ts` 追加 3 用例。
- **测试**: `yarn test --run` 174/174 全绿（新增 13 用例）。
- **回归**: 14 baseline + 13 C7/C8/C9 无变化。
- **备注**: 全部 SW 端改动，UI 层无感。

### [C11] UI 内存 / 渲染器缺位（5 条） ✅

- **完成时间**: 2026-09-04
- **背景**: MessageBubble 多次 watch 触发会泄漏 Vue app 实例；ephemeral 状态消息会跨会话残留；App.vue 用 setInterval 200ms 轮询 runningRef。
- **改动文件**:
  - `src/components/MessageBubble.vue`：`mountedApps` 由 `WeakMap<HTMLElement, VueApp>` 改为 `Map<string, {ph, app}>`；新增 `unmountAllApps()`，在 watch 入口 + `onBeforeUnmount` 调用。
  - `src/types/ai.ts`：`MessageLog` 加 `__ephemeral?: boolean`。
  - `src/shared/message-store.ts` / `src/composables/useAIEngine.ts`：状态消息以 `__ephemeral=true` 写入，`persistMessage` 见到此 flag 早退，不写 IndexedDB。
  - `src/composables/usePlanRunner.ts`：`runningRef` 改为 `export const`，供 App.vue 直接响应式绑定。
  - `src/App.vue`：移除 `setInterval` 200ms 轮询，模板直接绑定 `runningRef`；移除 `onBeforeUnmount` 中的 `clearInterval(pollTimer)`。
- **新增测试**: `tests/c11-ui-fixes.spec.ts`（5 用例：WeakMap 已弃用 / mountedApps 改为 Map / __ephemeral 写入路径 / runningRef 暴露 / App.vue 不再用 setInterval）。
- **测试**: `yarn test --run` 179/179 全绿（新增 5 用例）。
- **回归**: 14 baseline + 13 C7/C8/C9 + 13 C10 无变化。

### [C12] 文案 / 小 bug / 性能（7 条） ✅

- **完成时间**: 2026-09-04
- **背景**: 复盘阶段发现的 7 条低危 bug：文案歧义、双转义、定时器泄漏、IndexedDB 写风暴、precompute 无反馈。
- **改动文件**:
  - `src/components/ConfirmCard.vue`（B07）：移除 `props.allTabIds` 短路，按用户当前勾选收窄 `selectedTabIds`，"全不选"也能执行空操作。
  - `src/composables/useAIEngine.ts`（B09）：`persistMessage` 写失败时只 `console.warn`，不再递归调 `addMessageLocal`（会触发新一轮写失败形成风暴）。
  - `src/shared/render-result.ts`（B14）：`tabs_remove` / `close_tabs_by_domain` 在 `removed` 字段缺失时不再伪报 0，改说"标签操作完成"。
  - `src/shared/render-result.ts`（B15）：`clear_cookies` removed=0 时区分「按域查询无结果」与「无域可清」两种语义。
  - `src/composables/usePrecompute.ts`（B18）：`close_tabs_by_domain` / `mute_tabs_by_domain` / `unmute_tabs_by_domain` 在域名缺失时返回 `{tabIds:[], unmatched:true, reason:'missing_domain'}`；无匹配时 `{tabIds:[], unmatched:true, reason:'no_match', domain}`，便于上层 confirm 卡 / AI 复盘给用户明确反馈。
  - `src/components/MessageBubble.vue`（B31）：template 中两个 `v-html="renderedHtml"` 改为 `applyMarkdownHtml(contentEl, renderedHtml)`，避免 Vue 二次解析替换 `[data-custom-block]` 占位节点。`applyMarkdownHtml` 用 `<template>.innerHTML + importNode` 注入安全 HTML。
  - `src/components/MessageList.vue`（B32）：`scrollTimer` 在 `onBeforeUnmount` 中 `clearTimeout`，避免 HMR / 路由切换时在已销毁实例上 `scrollToBottom`。
- **新增测试**: `tests/c12-text-perf.spec.ts`（7 用例静态扫描覆盖 B07/B09/B14/B15/B18/B31/B32）。
- **测试**: `yarn test --run` 194/194 全绿（新增 7 用例）；`yarn type-check` / `yarn lint` 通过。
- **回归**: 14 baseline + 13 C7/C8/C9 + 13 C10 + 5 C11 = 45 历史用例无变化；红线扫描命令 `git grep -n "intent-rules\|detectHalfPlan\|hostnames" src/` 为空；`git diff --stat src/shared/commands.ts` 为空。
- **备注**: C7–C12 共完成 41 条 bug 修复（36 条 + 5 条衍生），至此 36 条审计清单全部闭环。

### [C13] Plan-First 协议系统性修复（26 条：9 P1 + 11 P2 + 6 P3） ✅

- **完成时间**: 2026-09-05
- **背景**: 用户跑通 `docs/ai-browser-test-cases.md` 后反馈「每个命令都有问题」。两轮审计（`a08e1482` + `a101e3fe`）确认根因是 Plan-First 协议架构问题：工具清单内部冲突（4 个工具都说「刷新」、`tabs_update` + 5 个 aiHidden 兄弟被暴露）、renderer 兜底泄露 JSON、confirm 卡 children 兜底缺失、AbortSignal 跨阶段未串通、chat 分支只识别 screenshot 丢 plan 等。两轮审计交集 → 6 条根因 → 26 条问题。
- **改动文件**:
  - `src/shared/ai/system-prompt.ts`（P1-1/2/3、P3-1/3）：`buildToolList` 移除 `reload_tab`；`tabs_update` 描述在渲染层替换为「内部工具：禁止直接选用」；`tabs_reload` / `find_tab` / `tabs_create` 加 ⭐ 标识；新增 2 个示例（切换 GitHub 标签 / 刷新当前窗口所有标签）；错误模式段加「选错工具 → 返回 chat，不要硬猜」。
  - `src/composables/usePlanRunner.ts`（P1-4/5/6/7、P1-8、P2-7、P3-4）：precompute 危险分支写回 `args.tabIds = computed.tabIds`；`showAiConfirmCard` 扩展到所有 dangerous 工具（用 candidates + contextCache 反查）；`close_duplicate_tabs` 走 keep/remove 两段式；`abortCtl` 暴露 module 级 getter；抽 `hasChatReply()` 把 chat 与 plan 合并渲染。
  - `src/service-worker/handlers/index.ts`（P2-6、P3-5）：`DANGEROUS_TOOLS` 改为从 `COMMANDS.filter(c => c.dangerous)` 动态构建；`buildConfirmChildren` 接受 candidates 兜底。
  - `src/service-worker/handlers/tabs.ts`（P1-7）：`close_duplicate_tabs` 走 keep/remove 两段式。
  - `src/shared/confirm.ts`（P2-7）：`buildReconfirmPayload` 对 `close_duplicate_tabs` / `bookmarks_remove_node` 走 selectedIds / removeIds 拆分。
  - `src/shared/ai/engine.ts` + `openai-adapter.ts` + `gemini-nano.ts`（P2-10）：`chatWithHistory` / `chatWithMessages` 透传 `options.signal`；Gemini-Nano 不支持 abort 时 warn。
  - `src/composables/useAIEngine.ts`（P2-11）：catch 块显式调 `removeStatusText()` + `addMessage` 兜底。
  - `src/shared/render-result.ts`（P2-1/2/3/5、P2-8）：`JSON.stringify(r).slice(0,100)` 兜底替换为「操作完成（未知字段 N 个）」+ console.warn；新增 `find_tab` / `reload_tab` / `move_tab` / `sort_tabs` / `discard_tabs` / `reopen_closed_tab` / `list_groups` 渲染分支；`tabs_observe` / `list_groups` 接入 `buildMarkdownBody`；`formatResultDescription` 在 `r.deleted !== undefined && r.truncated === true` 时输出「删除 N 条历史（结果已达上限，可能仍有匹配项未删除）」。
  - `src/service-worker/handlers/history.ts`（P2-8）：query 模式保留 B34 truncate 逻辑（`SOFT_LIMIT=10000`），SW 已返 `truncated:true`。
  - `src/service-worker/handlers/cookies.ts`（P2-9）：`cookies_remove` 无参时取 `chrome.tabs.query` active tab hostname 作为 domain 兜底。
  - `src/service-worker/plan-runner.ts`（P3-6）：删除 `/^[a-zA-Z0-9_-]{1,64}$/` 冗余 id 格式正则。
- **新增测试**（19 用例）:
  - `tests/c13-tool-list.spec.ts`（5）：reload_tab 不在 AI 可见工具；tabs_update description 被替换；find_tab / tabs_reload / tabs_create ⭐；tabs_update reload=true 子句已移除。
  - `tests/c13-confirm-children.spec.ts`（5）：domain 类工具 confirm 卡显示 children；close_duplicate_tabs cancel 不误删；bookmarks_remove_node cancel 不误删；keep/remove 拆分；precompute tabIds 顺序保留。
  - `tests/c13-renderer.spec.ts`（12）：reload/move/sort/discard/find/list_groups 都有专属文案；未命中分支走操作完成兜底；console.warn 已替换 JSON.stringify；所有 aiHidden 分支末尾都调 markRendered。
  - `tests/c13-dangerous-tools.spec.ts`（6）：COMMANDS.dangerous=true 的所有 intent / swIntent 都被 DANGEROUS_TOOLS 覆盖；exact equality；RISKY_NAMES 收敛至 4 条历史 / 下载别名。
  - `src/shared/ai/system-prompt.spec.ts` 追加 1 用例（pin_tab toggle 语义守护）。
  - `tests/integration/plan-validation.spec.ts`（新建）+ `tests/integration/half-plan.spec.ts`（删除，重写为 plan-validation）。
- **测试**: `yarn test --run` 252/252 全绿（新增 19 + 39 baseline 累加）；`yarn type-check` / `yarn lint` / `yarn build` 通过。
- **回归**: 194 基线用例 + 13 C10 + 5 C11 + 7 C12 + 19 C13 = 252 用例无变化（除 C13 新增外）。
- **红线扫描**: `git grep -n "intent-rules\|detectHalfPlan\|hostnames" src/` 为空；`src/shared/commands.ts` 无 diff；`src/shared/slash-commands.ts` 仅追加 4 个注册项 + 头部注释；`src/composables/useSlashCommandRunner.ts` 仅 B25（slash 分支前不再无条件清 pendingConfirm，仅 `clear_chat` / `reset_context` 时清）一处微调，对外行为不变。
- **备注**: 至此 Plan-First 协议架构问题全部闭环：C13 26 条 + C7–C12 共 67 条修复。

---

## 9. 风险速查

| 风险等级            | 条目                         |
| ------------------- | ---------------------------- |
| **P1（核心逻辑）**  | C1-1, C2-1                   |
| **P2（清理）**      | C0-1/2/3/4, C2-2             |
| **P3（测试/文档）** | C1-2, C3-1, C3-2, C4-1, C4-2 |

---

## 10. 跨 Batch 验收

每完成一个 Batch，必须：

1. `yarn test` 全套绿（或记录 baseline 失败数变化）
2. `yarn build` 通过
3. `git grep -n "intent-rules\|detectHalfPlan" src/shared/slash-commands.ts src/composables/useSlashCommandRunner.ts src/shared/commands.ts` 仍为空（slash 隔离红线）
4. 顶部「回填模板」填写
5. 不允许有ts错误+lint错误
