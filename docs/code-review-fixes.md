# 代码审查问题修复方案（2026-11-16 批量）

> 状态：已实施（2026-11-16）
> 背景：对全项目代码做了一次系统审查（见对话记录），本文档记录除"补充自动化测试"外
> 全部问题的修复方案。自动化测试另行专项处理，不在本批。

## 修复清单

| # | 问题 | 修复方案 |
|---|---|---|
| F1 | task_plan 五阶段规划器：SW 全部返回"不可用"，但 registry 未 aiHidden 仍暴露给 AI；useAIEngine ~200 行 exec_plan 死分支；task-planner.ts 大半死代码 | **整条链路删除**：registry 条目、SW case + import、agent loop 分支（exec_plan/task_plan/askUserResponse）、task-planner.ts 文件、types/ai.ts 相关 action 联合类型 |
| F2 | 危险命令确认在 agent loop 被全面绕过（force:true），deleteAll 级破坏性操作无人工确认 | **分级确认**：新增 `AGENT_CONFIRM_REQUIRED` 集合（history_remove、bookmarks_remove_node——不可逆/影响面大），命中时不注入 force，走既有 NEEDS_CONFIRM 确认卡（用户确认后单步执行、本轮结束）；tabs_remove 等可逆操作维持 force |
| F3 | 上下文三套机制并存（内存续传 / sessionStorage 5min 恢复 / messageLog 重建），恢复路径要求 planTracker 非空，纯聊天永不恢复 | **收敛为两套**：messageLog 重建（跨轮/跨重启）+ conversationMessages 内存续传（chat/ask）。删除 sessionStorage 恢复链路（SESSION_KEY / recoverContext / persistPlanTracker）及 6 个 restore i18n 词条 |
| F4 | MAX_AGENT_STEPS=100 无预算控制 | 降为 50（业界 browser-use 等常用 30-50；总超时 16.7min 不变，双重上限） |
| F5 | 系统提示词同一指导重复 3 处（tabsBlock / 标签页注意事项 / 工作流段落） | 去重：删除工作流里的"标签页状态实时变化"整段与 tabsBlock 中与注意事项重复的教学句，保留"标签页操作注意事项"为唯一详述处 |
| F6 | system prompt 的 pageStructure 是任务开始时快照，却自称"当前页面"，导航后误导模型 | 标题改为"任务开始时的页面快照"并注明"最新状态以 browser_snapshot 返回为准"；环境信息段同步措辞 |
| F7 | chrome 类型双源（@types/chrome@0.2.9 + 手写 env.d.ts shim 合并生效） | 删除 @types/chrome 依赖，env.d.ts 成为唯一来源；补齐 shim 缺失的 windows.QueryOptions / CreateData / UpdateInfo / WindowState 等（以 type-check 报错为清单逐项补） |
| F8 | tabs_observe_groups 的 maxResults slot 是死的（实现不读参数） | observeGroups 接收 payload，按 maxResults 截断 |
| F9 | moveTabs 无 pinned 保护（reorderTabs 有）；pinned→非 pinned 位置 Chrome 直接报错 | 移动前查全部目标标签：pinned 与非 pinned 混合 → 报 PINNED_MIXED 建议先取消固定；全 pinned → 移到目标窗口最前（index 0，Chrome 自动落 pinned 区）；全非 pinned → 现有逻辑。tabIds 为空的活动标签路径同规则：pinned 活动标签一律落 index 0 |
| F10 | getFallbackWindowId 返回 -1 时注释称"等价于所有窗口"，实际 tabs.query({windowId:-1}) 返回空 | observeTabs 仅在 fallback > 0 时设置 windowId（否则查全部窗口）；修正注释 |
| F11 | checkDangerousConfirm throw 裸对象非 Error | 改为 NeedsConfirmError extends Error（携带 code/message/detail），调用方按既有字段读取，行为不变 |
| F12 | engine.chatWithHistory 降级路径"只取最后一条"静默丢历史 | 降级路径改为显式抛错（三个适配器均已实现 chatWithMessages，防止未来新适配器漏实现时静默降级） |
| F13 | API Key 明文存 chrome.storage.local | **决策：不改代码**。chrome.storage.local 仅本扩展上下文可读（扩展级隔离）；用同存储的密钥加密是安全表演；storage.session 会导致每次浏览器重启都要重填 key，UX 不可接受。业界扩展通行做法即明文本地存储。接受该风险并在此记录 |
| F14 | windows_observe 列出隐身窗口，普通标签移入隐身窗口会失败（校验只查存在性） | moveTabs / prepareGroupMove 的目标窗口校验增加 incognito 拒绝（WINDOW_INCOGNITO 错误码 + 新 i18n 词条） |
| F15 | 默认 Node 16 跑不动 ESLint 9（structuredClone 缺失，lint 直接崩） | 新增 .nvmrc（20.20.0）+ package.json engines.node >= 18 |

## 影响面与回归边界

- F1 删除的是"永远失败"的死链路，AI 不再被教一个坏工具；正常 browser_* DOM 操作不受影响
- F2 行为变化：AI 执行删历史/删书签文件夹时会弹确认卡且本轮结束（确认后单步执行）。
  安全性优先于连续性，属预期取舍
- F3 删除的恢复弹窗在 messageLog 重建上线后已无信息增量（重建路径跨重启可用）
- F5/F6 只动提示词文案，不动工具协议
- F7 需全量 type-check 兜底，补齐 shim 后行为不变（运行时 chrome.* 由浏览器提供）
- 其余为局部修复，不触碰其它命令路径

## 验证

type-check / eslint / prettier / check:i18n / build 全绿；删除的 i18n 词条四语言同步清理。

实施补充（2026-11-16）：

- F1 连带清理：删除 exec_plan/task_plan 死链路后，check-i18n 暴露 17 个死词条
  （engine.plan* / engine.needUserData / engine.receivedUserData / engine.scanProblem(Reply) /
  engine.needMoreInfoReply / step.status*，含 F3 计划内的 6 个 engine.restore*），
  四语言同步删除
- F7：删除 @types/chrome 后 type-check 一次通过，env.d.ts 现有 shim 已覆盖全部使用面，
  无需新增接口；同步更新 executor.ts 里两处 "@types/chrome 较老" 的过时注释
- F15：node_modules 由 pnpm 管理（pnpm-lock.yaml），按 package.json 重装并清理残留 symlink；
  package-lock.json 为 gitignore 的本地缓存，已同步再生成

复查补丁（2026-11-16 二次审查发现）：

- **F12 修正**：方案前提"三个适配器均已实现 chatWithMessages"有误——GeminiNanoAdapter
  只实现了 chat()。直接抛错会让 Gemini Nano 后端的 agent loop 完全不可用。已为
  GeminiNanoAdapter 补实现 chatWithMessages：Chrome 内置 AI 只有单轮 prompt()，历史消息
  扁平化为文本 transcript 拼在当前指令前（仍优于旧的"只取最后一条"静默降级）
- **F2 堵漏**：batchExecute 给全部子调用注入 force:true，AI 可把 history_remove /
  bookmarks_remove_node 包进 batch 绕过人工确认（且原提示词在教 AI 这么做）。
  修复：AGENT_CONFIRM_REQUIRED 提升到 shared/commands.ts 共享（useAIEngine 与
  executor 单一来源）；batch 子调用命中时返回 CONFIRM_REQUIRED_SOLO 拒绝并引导
  单独调用（单独调用正常弹确认卡）；提示词中 3 处"batch 批量 bookmarks_remove_node"
  的教学同步改为"逐个单独调用"
- F9 补充：tabIds 为空的活动标签单移路径同样加 pinned 保护（pinned 活动标签落 index 0）
