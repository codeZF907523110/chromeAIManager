# 回到本次提问（顶部上箭头）

## 背景

AI 回复（含 system 任务块、markdown 正文）有时很长，自动滚底后用户的提问被顶出可视区，
想回看「当前这条对话的 user 消息」只能手动长距离滚动。

## 目标语义（v2 修订）

点击箭头滚动到**当前视口所属对话的 user 气泡**，而不是全局最近一条 user 消息：

- 视图停在历史里第 N 条对话的任意消息（user / task system / ai-chat）上 → 点击回到第 N 条对话的 user 气泡。
- 视图停在最新对话 → 点击回到最新对话的 user 气泡（长回复被顶出屏幕的核心场景）。
- 目标 user 气泡已经可见时按钮隐藏，不提供无效点击。

### 定位算法

1. `findVisibleMessageIndex()`：按 DOM 顺序找第一个「底边越过容器顶边」的 `[data-msg-index]` 气泡，
   即视口顶部可见的消息（收起 TaskBlock 内的气泡 display:none，矩形为 0，被自然跳过）。
2. `findConversationUserIndex()`：从可见消息下标往前扫描最近的 `type === 'user'` 消息，
   即当前对话的 user 气泡（对话 = 一条 user 消息 + 其后到下一条 user 之前的所有消息）。
3. 滚动：`scrollIntoView({ behavior: 'smooth', block: 'start' })` + `scroll-margin-top: 12px`。

### 按钮显隐

`updateJumpBtn()`：目标 user 气泡顶边在容器顶边之上（`top < cTop - 1`）→ 显示；否则隐藏。
与点击目标同源，保证「显示即可点、点了必有效」。监听 scroll（passive）与 messages.length
变化时刷新，组件卸载移除监听。

## 实现要点

| 文件 | 改动 |
|---|---|
| `src/components/MessageBubble.vue` | 根节点加 `:data-msg-index="index"`（与 messageLog 下标一致；TaskBlock 内也传原始 `indices[i]`），供定位气泡 DOM；`.message-item` 增加 `scroll-margin-top` 防止贴顶裁边 |
| `src/components/MessageList.vue` | 外层包 `.messages-wrap`（`position: relative; flex: 1; min-height: 0`），内部保留滚动容器 `.messages`；顶部居中浮动按钮；`findVisibleMessageIndex` / `findConversationUserIndex` / `updateJumpBtn` / `scrollToCurrentUser` 四个函数，显隐与点击共用同一目标 |

### 不变的部分

- 不改「新消息自动滚到底部」逻辑（`scheduleScroll` / `scrollToBottom` 不动）。
- 不改 useAIEngine、消息渲染与任务块分组逻辑。

## 验证

1. 发送命令得到长回复 → 提问被顶出可视区 → 顶部出现 ↑ → 点击回到本次提问的 user 气泡。
2. 手动滚到历史中第 2 条对话的 ai-chat/system 消息上 → 点击 ↑ → 回到第 2 条对话的 user 气泡。
3. 滚回某条对话的 user 气泡可见位置 → 按钮自动隐藏。
4. 回归：新消息到达仍自动滚到底；侧边栏重开定位到底部；任务块展开/收起不受影响。
