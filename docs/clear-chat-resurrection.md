# /clear-chat 清空失效与零反馈修复方案

## 现象

发送 `/clear-chat` 后聊天区什么都不显示（连 `/clear-chat` 这条 user 消息也消失了）；
重启扩展后消息又重新出现。

## 根因

两层问题叠加：

### 1. 落盘在途写与清库竞态 → 消息"复活"（数据层）

`addMessage` 的持久化是 fire-and-forget：

```
handleSubmit('/clear-chat')
  ├─ addMessage('user', '/clear-chat')      ← 同步 push + void persistMessage(msg)（异步落盘开始）
  └─ handleSlashCommand → clearMessages()
       └─ await messageStore.clear()        ← 清库事务
```

`messageStore.append` 内部有多个 await 断点（`openDB` → `nextSeq`(meta 事务) → `put`(messages 事务)）。
IndexedDB 对重叠 store 的事务按**创建顺序**提交，因此实际时序是：

```
t1  user 消息的 nextSeq 事务（meta）
t2  clear 事务（messages）          ← 创建早于 put 事务
t3  user 消息的 put 事务（messages） ← 创建晚于 clear 事务，在清库之后落地
```

结果：内存 `messageLog` 被清空，但 `/clear-chat` 这条记录**在清库之后写进了 IndexedDB**，
重启后 `loadPersistedMessages` 把它读回来 → "又展示出来了"。

### 2. clear_chat 分支零反馈（交互层）

```
if (resolvedIntent === 'clear_chat') {
  clearMessages()   // messageLog.value = [] 连刚 add 的 user 消息一起抹掉
  return            // 没有任何 ai-chat 回复
}
```

用户视角：输入命令 → 聊天区瞬间全空、无任何回应，与"必须做到有 user 也有 ai-chat"
的反馈约定（见 docs/message-ordering-and-stop-feedback.md 问题 2）相悖。

## 业界方案

持久化与清空这类破坏性操作之间存在**写序依赖**，标准做法是序列化写队列 /
在清空前等待在途写落定（SQLite 的 checkpoint、IM 的 sync barrier 同理）：
清库必须是一个 **barrier**——它之前发起的所有写都落定后才能执行。

## 修复方案

| # | 位置 | 改动 |
|---|------|------|
| 1 | `useAIEngine.ts` | `persistMessage` 拆为注册层 + 执行层：执行层 `appendToStore` 保持原 try/catch 兜底逻辑；注册层把任务 promise 登记进 `pendingPersists`（Set），落定后移除。调用点 `void persistMessage(msg)` 签名不变 |
| 2 | `useAIEngine.ts` | `clearMessages` 在 `messageStore.clear()` 前 `await Promise.allSettled([...pendingPersists])`，作为清库 barrier；在途写全部落定后再清库，杜绝"put 晚于 clear 落地" |
| 3 | `useAIEngine.ts` | clear_chat 分支补交互：先取 `messageLog.value.at(-1)`（刚 add 的 `/clear-chat` user 消息）→ `await clearMessages()` → 内存恢复为 `[userMsg]` 并显式重新落盘（put 按 id upsert，幂等）→ `addMessage('ai-chat', ...)` 猫式反馈。最终用户看到：user 消息 + AI 反馈，且重启后不复活旧记录 |
| 4 | `useAIEngine.ts` | `deleteMessage` 同样在 `removeMany` 前加 barrier 等待——同一竞态类：刚 add 的消息若正被删除，其落盘 put 也可能晚于 delete 落地而复活 |

## 自查

- barrier 用 `Promise.allSettled` 而非 `all`：appendToStore 内部已兜底 try/catch 永不
  reject，语义等价，但 allSettled 表达"无论成败都继续清库"的意图更准确；
- 重新落盘放在 `clearMessages` **之后**且被 await，时序确定性由代码顺序保证，
  不再依赖事务创建顺序；原先 fire-and-forget 的那次 put 即使晚到，也是同 id 同内容
  的 upsert，结果一致；
- `at(-1)` 取的是 handleSubmit 刚 addMessage 的 user 消息（handleSlashCommand 是
  handleSubmit 同步链路的下一步，中间无其它 addMessage）；空数组时跳过恢复，仅给反馈；
- 反馈文案走 `wrapCatReply`，与 /reset、停止反馈的猫设语气一致；
- `messageLog` 是 `ref<MessageLog[]>`，整体赋值 `[userMsg]` 响应式正常；
- 既有命令路径零改动：persistMessage 对外签名不变，clearMessages/deleteMessage
  只是在原逻辑前追加 barrier。

## 验证

1. `pnpm lint && pnpm type-check && pnpm build` 全绿；
2. 手动：发送 `/clear-chat` → 聊天区只剩 user 消息 + AI 反馈 → 重启扩展 →
   仍只有这两条，旧消息不复活；
3. 手动：删除单条消息后立即重启扩展 → 被删消息不复活。
