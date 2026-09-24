# 聊天记录排序与停止反馈修复方案

## 问题 1：重启扩展后聊天记录顺序偶尔错乱

### 现象

重启扩展后，消息偶发乱序，如 `/reset` 与它的回复顺序颠倒：

```
正常：/reset → 已清除全部上下文，可以重新开始对话啦~
异常：已清除全部上下文，可以重新开始对话啦~ → /reset
```

### 根因

- `addMessage` 用 `Date.now()` 写 `createdAt`。`/reset`（user 消息）与它的回复在**同一个
  同步代码段内创建**，`createdAt` 落在同一毫秒是常态；
- `messageStore.list()` 按 `createdAt` **索引** `getAll()` 取数。IndexedDB 非唯一索引中
  同键多条记录的顺序 = **主键（`crypto.randomUUID()`）字典序 = 随机**；
- 内存中的 `messageLog.push` 顺序本来正确，所以乱序只在**重启加载**后出现——与用户描述一致。

### 业界方案

IM 领域标准做法：**单调递增序列号（seq）作为消息的稳定次序键**，时间戳只用于展示/裁剪，
不用于排序判定（微信/钉钉的消息 seq、Kafka offset 同理：同毫秒多条消息也必须有全序）。

### 修复方案

| # | 位置 | 改动 |
|---|------|------|
| 1 | `shared/message-store.ts` | meta store 新增 `lastMessageSeq` 计数器；`append()` 经 `nextSeq()`（同一 readwrite 事务内读+改+写）取单调递增 seq 写入记录 |
| 2 | `shared/message-store.ts` | `PersistedMessage` 增加 `seq: number` |
| 3 | `shared/message-store.ts` | `list()` 取数后显式排序：`createdAt` 升序 → 同毫秒按 `seq` 升序（老数据无 seq 兜底 0，只影响历史同毫秒消息的相对顺序，可接受） |

### 自查

- 单写方确认：`messageStore.append` 仅 `useAIEngine.persistMessage` 调用；
  meta 计数器方案在多写方场景下依然正确（计数器读写与递增在同一 IDB 事务内）；
- `trimOldest` 继续按 `createdAt` 索引裁剪"最早"，语义不变、不受影响；
- 不改 DB schema（不加 seq 索引），无需版本升级——排序在内存完成，100 条上限内开销可忽略；
- 不需要迁移：老记录缺 seq 时兜底 0，新消息 seq 从 1 单调递增，两者不会混排出错
  （新消息 createdAt ≥ 老消息，先按 createdAt 分开）。

## 问题 2：点击停止按钮后 ai-chat 无反馈

### 现象

任务执行中点停止，聊天里只有一条 system 小字日志（"已停止当前任务"），没有 AI 回复气泡。
用户视角："输入了指令但没有回答"。

### 根因

停止可能发生在三个时机，反馈行为不一致：

| 时机 | 现有行为 |
|------|----------|
| AI 请求中（最常见，点击后请求被 abort 抛 AbortError） | `handleStop` 只发 system 消息；循环 catch 分支静默 return——**无 ai-chat 反馈** |
| AI 响应已返回 | 循环内补 system + ai-chat——但 system 与 `handleStop` 发的**重复** |
| 工具执行中 | 循环顶部检查后静默 return——只有 `handleStop` 的 system 消息 |

### 修复方案

统一收敛到一个入口，反馈只发一次：

| # | 位置 | 改动 |
|---|------|------|
| 1 | `useAIEngine.ts` | 新增 `stopAgentLoop()` 并导出：`activeLoopId` 为空直接返回（防误触杂音）→ 发 system 标记 + ai-chat 猫式回复（对齐 `reportUserFacingError` 的双气泡惯例）→ `cleanup()` 中断 |
| 2 | `useAIEngine.ts` | 删除"AI 响应已返回"停止路径里的重复反馈（system + ai-chat + cleanup），改为静默 return |
| 3 | `App.vue` | `handleStop` 改为一行调用 `aiStopAgentLoop()`；destructure 里 `cleanup: aiCleanup` 随之移除（仅此一处使用） |

### 自查

- 三条中断路径中，反馈均由 `stopAgentLoop` 恰好发一次，循环内全部静默退出，无重复；
- 无任务时点停止：guard 拦截，不产生任何消息（停止按钮本身只在运行中展示，此处双保险）；
- `pendingConfirm` 挂起时点停止：`activeLoopId` 非空，正常走反馈 + cleanup（cleanup 内会
  清空 pendingConfirm），行为与之前一致；
- ai-chat 文案走 `wrapCatReply`，与其它 AI 反馈的猫设语气一致。
