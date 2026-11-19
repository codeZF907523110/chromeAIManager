# 多窗口标签/分组操作方案（自然语言跨窗口移动）

> 状态：已实施（2026-11-16）
> 日期：2026-11-16
> 背景：用户反馈自然语言多窗口操作能力弱——「把窗口 A 的标签移到窗口 B」有 bug、
> 「把窗口 A 的分组移到窗口 B」会出问题。

## 1. 需求

用自然语言完成以下操作，一次性正确执行：

- 把窗口 A 的某个/某些标签页移动到窗口 B（可指定位置，默认追加到末尾）
- 把窗口 A 的某个标签分组**整组**移动到窗口 B（分组不散）
- 窗口内批量移动多个标签到末尾时顺序不反转

## 2. 现状问题盘点

| # | 问题 | 位置 | 根因 |
|---|---|---|---|
| 1 | tabs_move 无法跨窗口 | `executor.ts` moveTabs | `chrome.tabs.move` 只传 `{index}`，`windowId` 参数被丢弃；命令注册表也没声明该 slot，AI 无从得知 |
| 2 | 批量移动到末尾顺序反转 | `executor.ts` moveTabs | 倒序逐个 move 到同一 index 的技巧只对 `index>=0` 成立；`index=-1`（追加）时倒序逐个 append 会得到逆序 |
| 3 | 分组无法整组移动 | 命令注册表 | 没有暴露 `chrome.tabGroups.move`；AI 逐个 move 分组内标签会把分组拆散 |
| 4 | AI 难以定位"第 N 个窗口" | `executor.ts` observeWindows | 返回裸 `chrome.windows.Window`（无序号、无标签数），AI 无法把用户口语"第二个窗口"映射到 windowId |

## 3. 业界方案调研结论

- **`chrome.tabs.move(tabId, {index, windowId})`**：官方 API 天然支持跨窗口移动
  （[tabs.move](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-move)，
  `windowId` 默认为标签当前所在窗口）。
- **`chrome.tabGroups.move(groupId, {index, windowId})`**：官方 API 支持把分组连同全部
  标签移动到另一个窗口，且**只允许 normal 类型窗口之间移动**
  （[tabGroups.move](https://developer.chrome.com/docs/extensions/reference/api/tabGroups#method-move)）。
  分组作为整体移动，组内顺序天然保留（Chrome 拖拽 UI 的"跨窗口组内逆序"是 UI 层已知行为，
  API 按组移动不受影响，见 [Chrome 支持帖](https://support.google.com/chrome/thread/114622820)）。
- **MV3 SW 静默挂起约束**：本项目已实证 `chrome.tabs.group` / `chrome.tabs.ungroup` /
  `chrome.tabGroups.update` 在 MV3 Service Worker（非用户激活上下文）会静默挂起，既有
  `clientExec` 模式（SW 计算校验 → side panel 执行 API）即为解决该约束的成熟模式。
  `tabGroups.move` 属同一分组生命周期 API 族，沿用 clientExec 模式，不冒险在 SW 直调。

**决策**：不发明新方案，全部走官方 API + 既有 clientExec 分发模式。

## 4. 总体设计

### 4.1 tabs_move 增强（SW 直执行，无需 clientExec）

`chrome.tabs.move` 本身在 SW 工作正常（既有代码一直在用），只补参数和修顺序：

```
slots 增加: windowId (number, optional) — 目标窗口 id（来自 windows_observe）
slots 修改: index → optional，缺省 -1（末尾）
```

执行逻辑（moveTabs 重写）：

- **窗口内移动**（无 windowId 或 windowId == 源窗口）：
  - `index >= 0`：保留既有倒序技巧（倒序逐个 move 到同一 index，最终按输入顺序落在 index 处）
  - `index === -1`：**正序**逐个 move 到 -1（append 语义下正序才能保持输入顺序）
- **跨窗口移动**（windowId 指定且非源窗口）：正序逐个
  `move([id], {windowId, index})`；index 缺省 -1（追加到目标窗口末尾），显式 index 时
  逐个 `index + i` 递增插入，保持输入顺序
- **校验**：windowId 先 `chrome.windows.get` 校验存在，不存在返回 `WINDOW_NOT_FOUND`
- 单标签 / 当前标签路径同样透传 windowId

### 4.2 新增 tabs_group_move（clientExec 模式）

命令注册：

```
intent: tabs_group_move
slots: groupId (number, 必填，来自 tabs_observe_groups)
       windowId (number, optional，来自 windows_observe；不传=窗口内移动)
       index (number, optional，缺省 -1=末尾)
dangerous: false（整组移动可逆、不丢数据）
```

链路：

1. SW `prepareGroupMove`：校验 groupId 存在（`chrome.tabGroups.get`）、目标窗口存在且为
   normal 类型（官方约束），返回 `{ clientExec: 'tabs_group_move', groups: [{groupId, index, windowId, title}] }`
2. side panel `executeClientExec` 新增分支：调
   `chrome.tabGroups.move(groupId, {index, windowId})`，返回
   `{ groupMoved: {title}, message }`（成功）或失败信息

### 4.3 windows_observe 增强

返回的每个窗口对象附加 `index`（第几个窗口，1-based）和 `tabCount`（该窗口标签数），
让 AI 能把"第二个窗口"映射到 windowId，并顺带感知各窗口规模。保留原始字段不删（不破坏
既有消费方）。

### 4.4 提示词引导（prompts.ts）

标签页操作注意事项补充：

- 跨窗口移动标签：tabs_move 传 windowId（来自 windows_observe），index 缺省追加到末尾
- 移动整个分组：必须用 tabs_group_move，禁止用 tabs_move 逐个移分组内标签（会拆散分组）
- 窗口定位：windows_observe 返回 index（第几个窗口）+ id

### 4.5 i18n 新增词条（4 语言）

| key | zh-CN |
|---|---|
| `sw.windowNotFound` | 未找到 id 为 {id} 的窗口 |
| `step.groupMoved` | 已移动分组「{title}」 |
| `engine.groupMoveFailed` | 移动分组失败：{list} |

## 5. 改动文件清单

| 文件 | 改动 |
|---|---|
| `src/shared/commands.ts` | tabs_move 增 windowId slot、index 转 optional；注册 tabs_group_move；windows_observe 描述更新 |
| `src/service-worker/executor.ts` | moveTabs 重写（windowId + 顺序修复）；新增 prepareGroupMove + 路由；observeWindows 增强（index/tabCount）；batch 内拦截 clientExec 命令（见 5.1） |
| `src/composables/useAIEngine.ts` | executeClientExec 增 tabs_group_move 分支；formatResultDescription 增 groupMoved / tabsMovedToWindow 摘要 |
| `src/shared/prompts.ts` | 标签页注意事项补充跨窗口/分组移动引导（第 1/3/4/7 条）；batch 说明排除分组命令 |
| `src/env.d.ts` | chrome 类型 shim 补齐：windows.get、tabGroups.move、tabs.MoveProperties、tabGroups.MoveProperties、windows.Window |
| `src/locales/{zh-CN,en,de,es}.json` | 新增 7 个词条（sw.windowNotFound / sw.observeWindowsFirst / sw.windowNotNormal / sw.batchClientExecUnsupported / sw.batchClientExecSuggestion / step.groupMoved / step.tabsMovedToWindow / engine.groupMoveFailed） |

### 5.1 实施中追加：batch 内 clientExec 防御

实施审查时发现既有隐患：`executeClientExec` 只处理 agent loop 的**顶层**结果，若 AI 把
clientExec 类命令（tabs_group_move / tabs_group_by_domain / tabs_ungroup 等）塞进 batch，
子结果会标记 success 但真正执行永远不会发生（静默失败）。修复：batchExecute 对返回
clientExec 的子调用显式判失败（`CLIENT_EXEC_NOT_SUPPORTED_IN_BATCH`），并在提示词
batch 说明中排除这些命令。

## 6. 不影响既有功能的边界

- 窗口内移动（不传 windowId）行为与旧版完全一致（index>=0 倒序技巧保留）
- `sort_tabs` 等引用 `swIntent: tabs_move` 的斜杠命令照常工作（precompute 自带 index）
- clientExec 既有两个分支（ungroup/group_by_domain）不动，新增分支并列
- windows_observe 仅增字段不删字段

## 7. 测试要点

已验证（2026-11-16）：type-check / eslint / prettier / check:i18n（542 key 四语言一致）/ build 全绿。

待真机验证（需真实双窗口 + 分组环境，加载 dist/ 后按以下用例操作）：

1. 「把窗口 A 的 XX 标签移到窗口 B」→ tabs_observe + windows_observe → tabs_move(tabIds, windowId) → 标签出现在 B 末尾，顺序正确
2. 多个标签跨窗口移动，输入顺序 = 目标窗口末尾顺序（不反转）
3. 「把 A 窗口的 XX 分组移到 B」→ tabs_observe_groups + windows_observe → tabs_group_move → 分组在 B 中保持分组与组内顺序
4. 窗口内移动到末尾（index=-1）顺序正确（旧版在此场景会逆序）
5. 传入不存在的 windowId / groupId → 明确报错 + suggestion
6. 把 tabs_group_move 塞进 batch → 显式报错引导单独调用（不再静默失败）
