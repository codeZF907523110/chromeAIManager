# Pin/Unpin 命令设计文档

> 本文档描述 `/pin`（固定标签）与 `/unpin`（取消固定）斜杠命令的设计。
> `/pin` 当前存在"回复成功但实际未固定"的 bug，本文档记录根因诊断与修复方案，并新增 `/unpin` 命令。

## 1. 现状

### 1.1 命令定义

| 指令 | intent | swIntent | 行为 |
|------|--------|----------|------|
| `/pin` | `pin_tab` | `tabs_update` | toggle 当前标签 pinned 状态（重复调用切换） |

- `slash-commands.ts`：`/pin`，aliases `['固定', 'p']`
- `commands.ts`：`pin_tab`，`requiresPrecompute: true`，`swIntent: 'tabs_update'`
- precompute：取当前 active tab，实时 `chrome.tabs.get` 拉 pinned，返回 `{ tabId, pinned: !isPinned }`
- SW `updateTab`：读 `payload.tabId` + `payload.pinned`，调 `chrome.tabs.update`

### 1.2 Bug 现象

`/pin` 回复"已固定标签"，但浏览器里标签页并未真正固定。

## 2. 根因诊断

### 2.1 根因

`/pin` 回复成功但未实际固定，根因是 precompute 的 pin_tab 分支依赖 context 缓存的 `activeTab`，而：

1. **`formatTab` 不返回 `pinned` 字段**（`context-collector.ts`）：context 缓存里所有 tab 都没有 `pinned`，`activeTab.pinned` 永远 `undefined`。
2. **`activeTab` 可能为空**：若 context 里无 `active:true` 的 tab，precompute 直接 `return {}`，payload 无 `tabId`/`pinned`。SW `updateTab` 兜底查当前 active tab 但 `updateProps` 为空 → `chrome.tabs.update(tabId, {})` 无操作 → 仍返回 `success: true` → 显示"已固定/已取消"但实际没改。

旧代码用 `chrome.tabs.get(activeTab.id!)` 兜底拉 pinned，但 `activeTab` 为空时根本到不了这步。

### 2.2 修复策略

采用方案 A（见下）：precompute 改为**实时 `chrome.tabs.query` 查当前 active tab**，不依赖 context 缓存，且 pin/unpin 固定语义（不 toggle），彻底规避 pinned 状态读取问题。

## 3. 修复方案（已实施）

### 3.1 修复 `formatTab` 缺 `pinned`（已实施）

`context-collector.ts` 的 `formatTab` 补 `pinned: t.pinned`；同步给全局 `TabInfo`（`env.d.ts`）补 `pinned?: boolean`（原全局定义缺此字段，与模块版 `types/chrome.ts` 不一致）。这让 context 反映真实 pinned 状态，`close_tabs_by_url`/`ungroup_all` 等依赖 pinned 跳过固定标签的逻辑也更准确。

### 3.2 precompute 改实时查询 + 固定语义（已实施）

```ts
case 'pin_tab':
case 'unpin_tab': {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!active?.id) return {}
  return { tabId: active.id, pinned: intent === 'pin_tab' }
}
```
与 SW 端 `updateTab` 的兜底查询同源，避免缓存与实时状态不一致。

## 4. 新增 `/unpin` 命令

### 4.1 需求

用户希望有专门的"取消固定"命令，而非依赖 `/pin` 的 toggle 语义（toggle 在状态不明时可能误操作）。

### 4.2 设计

新增 `unpin_tab` intent，与 `pin_tab` 对称，但 `pinned` 固定为 `false`（不 toggle）。

| 指令 | intent | swIntent | 行为 |
|------|--------|----------|------|
| `/pin` | `pin_tab` | `tabs_update` | 固定当前标签（pinned: true） |
| `/unpin` | `unpin_tab` | `tabs_update` | 取消固定当前标签（pinned: false） |

**决策：`/pin` 是否仍 toggle？**
- 方案 A：`/pin` 固定为 true，`/unpin` 固定为 false（语义明确，幂等，推荐）
- 方案 B：`/pin` 保持 toggle，`/unpin` 固定 false

采用 **方案 A**：`/pin` 改为固定为 true（不再 toggle），`/unpin` 固定为 false。理由：
- 幂等：重复 `/pin` 不会变成 unpin，符合用户对"固定"的直觉
- 明确：`/pin` 就是固定，`/unpin` 就是取消，无需记忆 toggle 状态
- 避免 precompute 里 `chrome.tabs.get` 拉 pinned 的逻辑（根因之一），简化代码

### 4.3 改动点

1. `slash-commands.ts`：
   - `/pin` 描述改为"固定当前标签页"
   - 新增 `/unpin`，aliases `['取消固定', 'up']`
2. `commands.ts`：新增 `unpin_tab` 命令定义（`swIntent: 'tabs_update'`, `requiresPrecompute: true`）
3. `useAIEngine.ts` precompute：
   - `pin_tab`：`return { tabId: active.id, pinned: true }`（去掉 toggle 逻辑）
   - 新增 `unpin_tab`：`return { tabId: active.id, pinned: false }`
   - 两者都实时查 active tab（不依赖 context 缓存的 pinned）
4. `renderExecutionResult`：`pin_tab` 显示"已固定标签"，新增 `unpin_tab` 显示"已取消固定"
5. SW `updateTab`：无需改动（已支持 `pinned`）

## 5. 影响面

| 路径 | 影响 |
|------|------|
| `/pin` | 行为从 toggle 改为固定 true |
| `/unpin` | 新增 |
| AI 自然语言 pin | precompute 改造后行为一致 |
| 其他命令 | `formatTab` 补 pinned 后，依赖 pinned 的逻辑更准确 |

## 6. 验证

- ✅ `npm run type-check` 通过（Node 20）
- ✅ `npm run lint` 通过（eslint + prettier 0 错误）
- 待手动测试：
  - `/pin` → 当前标签固定（左侧图标化）；重复 `/pin` 仍为固定（幂等）
  - `/unpin` → 当前标签取消固定；重复 `/unpin` 仍为未固定（幂等）
  - `/help` → 列表含 `/pin` 和 `/unpin`

## 7. 实施记录

| 文件 | 改动 | 状态 |
|------|------|------|
| `src/shared/slash-commands.ts` | `/pin` 描述改为固定；新增 `/unpin` | ✅ 已完成 |
| `src/shared/commands.ts` | `pin_tab` 描述更新；新增 `unpin_tab` 命令定义 | ✅ 已完成 |
| `src/composables/useAIEngine.ts` | precompute pin/unpin 合并：实时查 active tab + 固定语义；renderExecutionResult 新增 unpin_tab 文案 | ✅ 已完成 |
| `src/service-worker/context-collector.ts` | `formatTab` 补 `pinned` 字段 | ✅ 已完成 |
| `src/env.d.ts` | 全局 `TabInfo` 补 `pinned?: boolean` | ✅ 已完成 |
| `src/service-worker/executor.ts` | 无需改动（`updateTab` 已支持 `pinned`） | — |
