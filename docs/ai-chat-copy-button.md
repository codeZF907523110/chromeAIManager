# ai-chat 气泡复制按钮方案

## 1. 目标

在 AI 主动回复气泡（`msg.type === 'ai-chat'`）下方新增复制按钮，左对齐，鼠标悬停才展示，行为与 `user` 类型气泡的复制按钮一致。

## 2. 现状

- `MessageBubble.vue:50-69` 中 `operation-btns` 容器内已有复制 / 删除两个按钮，但都用 `v-if="msg.type === 'user'"` 限制，只对用户消息可见。
- `handleCopy` 函数（`MessageBubble.vue:141-162`）只依赖 `props.msg.text.markdown`，与 `msg.type` 无关，可直接复用。
- `msg.type` 取值（`src/types/ai.ts:15`）：`'user' | 'system' | 'ai' | 'ai-chat' | 'error'`。

## 3. 业界参考

参考 GitHub Copilot Chat、ChatGPT Web、Claude.ai 网页端：AI 回复气泡下方操作区通常包含「复制 / 重新生成 / 反馈」，按钮整体左对齐于气泡，悬停气泡时整组按钮淡入。本次改动只取「复制」一项，沿用现有 hover 显隐的交互。

## 4. 改动点

### 4.1 模板（`src/components/MessageBubble.vue`）

- 根 `<div class="message-item">` 增加 `'message-item-ai-chat': msg.type === 'ai-chat'` 修饰类（line 16）。
- 复制按钮 `v-if` 从 `msg.type === 'user'` 改为 `['user', 'ai-chat'].includes(msg.type)`（line 52）。
- 删除按钮保持 `v-if="msg.type === 'user'"` 不变（line 61），避免误删 AI 历史。

### 4.2 样式

新增 `.message-item-ai-chat { flex-direction: column; align-items: flex-start; }`，与现有 `.message-item-user` 对称，确保复制按钮容器左对齐。

`.operation-btns` 本身不需要改动 —— 它跟随 `.message-item` 的 `align-items`，左 / 右对齐由父容器修饰类决定。

## 5. 风险评估

| 风险项 | 评估 |
|--------|------|
| `disableFold` 任务块路径 | 任务块（`TaskBlock.vue`）只渲染 system 消息，user/ai-chat 不进块，无影响 |
| `handleCopy` 逻辑复用 | 仅依赖 `msg.text.markdown`，与类型无关，安全 |
| ai / error / system 类型 | 不在改动范围内，行为不变 |
| 样式对齐 | 复用现有对齐机制（`align-items`），无副作用 |

## 6. 验收清单

- [ ] ai-chat 气泡悬停后左下角出现复制图标
- [ ] 点击复制后剪贴板内容为 `msg.text.markdown`，弹出「已复制」提示
- [ ] 复制失败时仍走 fallback（textarea + execCommand），提示「复制失败，请手动复制」
- [ ] 删除按钮依旧只在 user 气泡出现
- [ ] user 气泡原有右对齐行为不变
- [ ] system / error 气泡无新增按钮
- [ ] `pnpm lint` / `pnpm typecheck` 无错误