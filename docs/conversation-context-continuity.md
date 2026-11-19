# 对话上下文延续方案（跨轮次记忆）

> 状态：已实施（2026-11-16）
> 日期：2026-11-16
> 背景：用户反馈「上一次的对话下一次问的时候就不记得了，完全没有上下文能力」。

## 1. 需求

连续提问时 AI 能记住之前轮次的内容：

- 「把窗口 A 的 XX 标签移到窗口 B」→ 任务完成 →「刚才那个标签现在在哪？」→ AI 应知道"刚才"指什么
- 重启侧边栏后，新问题仍能引用之前的对话内容

## 2. 现状问题盘点（根因）

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| 1 | **以 `done` 结束的任务轮次不保存上下文** | `useAIEngine.ts` agentLoop | `conversationMessages` 只在 `chat`/`ask` 结束时赋值；`done`（正常完成的工具任务，最常见情形）不保存，且 `done` 路径的 `cleanup()` 还会显式清空它。下一轮 `messages = [system, user]` 从零开始 |
| 2 | **持久化消息只给 UI 显示，从不回喂模型** | `loadPersistedMessages` | IndexedDB 的 100 条消息只渲染气泡，组装模型请求时完全没用它——重启后「界面记得、模型失忆」 |
| 3 | **内存态 + 5 分钟 sessionStorage 恢复条件苛刻** | `recoverContext` | `conversationMessages` 是页面 ref，侧边栏关闭即丢；sessionStorage 恢复要求 `planTracker` 非空且 5 分钟内，纯聊天轮次永远恢复不了 |

## 3. 业界方案调研结论

对话式产品（ChatGPT / Claude / Cursor 等）的通用做法：

- **每轮请求都带对话历史**，历史从持久化存储重建，而非依赖内存
- **system 提示词每轮重建**（本项目的浏览器上下文实时变化，更必须如此）
- **长度控制**：只带最近 N 轮，超限从最旧整轮丢弃（不做摘要压缩，第一版从简）

**决策**：从已持久化的 `messageLog` 重建历史（`user` → user 轮，`ai-chat` → assistant 轮）。
`ai-chat` 存的正是给用户看的干净 markdown 回复，**不含工具中间态 JSON**——比复用
agent loop 的完整 transcript 更省 token，且信息足够（最终回复已总结任务结果）。

## 4. 总体设计

### 4.1 历史重建函数 `buildHistoryFromLog`

```
输入：messageLog（已从 IndexedDB 加载）
过滤：只取 type === 'user' | 'ai-chat'；system/error 步骤日志不进历史
排除：最后一条 user 消息（handleSubmit 先把本轮指令写入 log 再进 agentLoop，
      不排除会与本轮【用户指令】重复）
截断：从最新往旧收集，超过 HISTORY_MAX_MESSAGES(20) 条或累计超过
      HISTORY_MAX_CHARS(20000) 字符即停（两个上限都在 shared/constants.ts）
合并：相邻同角色的消息合并为一条（斜杠命令等场景可能产生连续同角色消息，
      合并后兼容性更好）
输出：ChatMessage[]（不含 system，system 由 agentLoop 每轮重建置顶）
```

### 4.2 agentLoop 组装变更

```ts
if (conversationMessages.value) {
  // 既有路径不动：chat/ask 中断续传，复用完整 loop transcript
  messages = [...conversationMessages.value]
  messages[0] = { role: 'system', content: systemPrompt }
  messages.push({ role: 'user', content: '【用户指令】\n' + userText })
} else {
  messages = [
    { role: 'system', content: systemPrompt },
    ...buildHistoryFromLog(),          // ← 新增：从持久化 log 重建历史
    { role: 'user', content: '【用户指令】\n' + userText },
  ]
}
```

### 4.3 明确不做的事（边界）

- **不动 chat/ask 的 `conversationMessages` 续传路径**：`ask` 后的"继续"仍复用完整
  transcript（含工具结果），精度最高；本方案只补「else 分支从零开始」的缺口
- **`done` 路径不保存 `conversationMessages`**：`cleanup()` 会清空它，且完整 transcript
  含大量工具快照（重、贵）；重建路径的「最终回复」已足够回答"刚才做了什么"
- **不做历史摘要压缩**：第一版从简，20 条/20k 字符上限已控制成本；后续可演进
- `/clear` 清空对话时 messageLog 与 conversationMessages 一起清，历史自然归零（既有行为）

## 5. 改动文件清单

| 文件 | 改动 |
|---|---|
| `src/shared/constants.ts` | 新增 `HISTORY_MAX_MESSAGES = 20`、`HISTORY_MAX_CHARS = 20000` |
| `src/composables/useAIEngine.ts` | 新增 `buildHistoryFromLog()`；agentLoop else 分支注入重建历史 |

## 6. 测试要点

1. 任务完成（done）后追问「刚才做了什么」→ AI 能引用上一轮结果
2. 纯聊天后追问 → 上下文延续（既有 chat 路径 + 重建路径都验证）
3. 重启侧边栏后追问 → 仍记得之前的对话（IndexedDB 重建）
4. 历史超过 20 条/20k 字符 → 只带最近部分，请求正常（不超模型上下文）
5. `/clear` 后提问 → 无历史
6. 斜杠命令（如 /help）的回复进入历史后不破坏请求格式
7. lint / type-check / build 三绿
