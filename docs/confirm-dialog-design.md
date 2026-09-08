# 危险操作确认弹窗设计文档

> 本文档描述斜杠指令中"危险操作二次确认弹窗"的交互与数据流设计。
> 目标：所有"批量删除/关闭类"危险指令的确认弹窗统一为 **checkbox 可勾选** 形式，用户能逐项选择要操作的对象；模糊搜索支持标题与 URL。

## 1. 涉及的指令

| 指令 | intent | SW intent | checkbox | 说明 |
|------|--------|-----------|----------|------|
| `/close-duplicates` | `close_duplicate_tabs` | `tabs_remove` | ✅ | 关闭重复标签页 |
| `/close-url` | `close_tabs_by_url` | `tabs_remove_by_url` | ✅ | 按 URL/关键词模糊关闭 |
| `/ungroup-all` | `ungroup_all` | `tabs_remove` | ✅ | 取消标签分组 |
| `/remove-bookmark` | `remove_bookmark` | `bookmarks_remove_node` | ✅ | 删除匹配书签（可勾选） |
| `/clear-cookies` | `clear_cookies` | `cookies_remove` | ✅ | 清除 Cookie（可勾选） |
| 删历史/扩展/存储 | 各自 intent | 各自 | 视场景 | 单项/少量项 |

## 2. 数据流（斜杠指令路径）

```
handleSlashCommand
  → matchSlashCommand(text)          // slash-commands.ts：解析 /cmd args → slots
  → generateConfirmPreview(intent, slots, context)   // confirm.ts，本地算预览
  → pendingConfirm = { title, description, items, onConfirm, onCancel }
  → ConfirmCard.vue 渲染（items 每项有 tabId 才显示 checkbox）
  → 用户勾选 → onConfirm(selectedTabIds)
  → dispatchToSW(intent, { ...slots, force:true, tabIds:selectedTabIds })
  → precompute(intent, slots)   // requiresPrecompute=true 时运行
  → chrome.runtime.sendMessage → SW executor → chrome.tabs.remove(tabIds)
```

### 关键约束

1. **`buildSlots` 必须为命令填充 `slots.query`**——否则预览/SW 端拿到空 query，走"没找到匹配"兜底。
2. **`precompute` 不能覆盖用户勾选**：`payload = { ...slots, ...precompute }`，precompute 返回的 `tabIds` 会覆盖 `slots.tabIds`（用户勾选值）。precompute 必须"优先复用前端勾选的 `tabIds`，仅在没有时才自动计算"——与 SW 端 `removeTabsByUrl` 同构（业界通用模式：显式选择优先于自动匹配）。

## 3. /close-duplicates 改造（已完成）

### 3.1 confirm.ts —— 预览改为"每个待关标签"一行

每组保留首个，其余重复标签展开为独立行，每行带 `tabId` + `selected:true`，复用 `findDuplicateGroups`。`g.tabs.slice(1)` 跳过每组首个（保留项），与 precompute 既有"保留首个"语义一致。

### 3.2 useAIEngine.ts precompute —— 尊重用户勾选

有显式 `tabIds` 时直接复用，否则回退自动计算（与 `close_tabs_by_url` 同构）。

## 4. /close-url 修复

### 4.1 根因

`/close-url xxx` 一直返回"没找到匹配 '当前条件' 的标签"。`'当前条件'` 是 `slots.query` 为空时的兜底文案（`useAIEngine.ts:913`）。

链路追踪：`matchSlashCommand` → `buildSlots` 的 switch **完全缺失 `close_tabs_by_url` 分支**，导致参数 `args` 没写进 `slots.query`。`precompute` 对 `close_tabs_by_url` 是 `return slots`（透传），空 `query` 一路传到 `confirm.ts` 预览 → `if (!q) return null` → preview 为 null → 走兜底文案。

模糊搜索逻辑本身（title + url 子串匹配）在 `confirm.ts:53-91` 和 SW `removeTabsByUrl:418-446` 都已正确实现，无需改动。

### 4.2 修复

在 `slash-commands.ts` 的 `buildSlots` switch 补 `close_tabs_by_url` 分支，把 `args` 透传到 `slots.query`：

```ts
case 'close_tabs_by_url':
  // /close-url 必须带关键词；透传到 query，供预览/SW 端做 title+url 模糊匹配
  if (args.trim()) (slots as Record<string, string>).query = args
  break
```

### 4.3 不需改动

- `confirm.ts` `close_tabs_by_url` 预览：已支持 checkbox + title/url 模糊搜索。
- SW `removeTabsByUrl`：已支持 title+url 模糊匹配 + 优先用前端勾选 tabIds。
- `ConfirmCard.vue`：已支持 checkbox。

## 5. /remove-bookmark 改造为 confirm+checkbox

### 5.1 现状与根因

`/remove-bookmark xxx` 当前确认弹窗**无 checkbox**——`confirm.ts:129` 的 `remove_bookmark` 预览返回 `items: []`（空），因为 Context 里没存书签详情（只有 `bookmarkFolders` 路径数组）。所以 ConfirmCard 只显示标题/描述，`selectableCount===0`，确认按钮永不禁用 → 纯确认（无勾选）。

确认后 `onConfirm([])` 走 `else` 分支 → `dispatchToSW('remove_bookmark', { ...slots, force:true })`（无 tabIds）→ `precompute` 取 `MSG_GET_BOOKMARKS` 返回的 `results[0]`（仅第一个匹配）→ SW `removeBookmark({ nodeId })` 删单个。**用户看不到匹配了哪些书签，也无法选择，且总是删第一个。**

### 5.2 改造方案

对齐 `/close-url`：预览列出每个匹配书签（带 checkbox），用户勾选子集，SW 按 `selectedIds` 删除。

#### 5.2.1 confirm.ts —— 预览改为 checkbox 列表

`generateConfirmPreview` 现只读 `context`（同步、纯函数，无 Chrome API）。书签不在 Context 里，需由调用方预取后传入。扩展签名加可选 `matchedBookmarks` 参数，保持 confirm.ts 纯函数：

```ts
export function generateConfirmPreview(
  intent: string,
  slots: Record<string, unknown>,
  context: Context | null,
  matchedBookmarks?: chrome.bookmarks.BookmarkTreeNode[]
): ConfirmPreview | null {
  ...
  case 'remove_bookmark': {
    const query = slots.query as string | undefined
    if (!query) return null
    const items = (matchedBookmarks ?? []).map((b) => ({
      primary: b.title || b.url || '(无标题)',
      secondary: b.url || '',
      tabId: Number(b.id),           // 书签 id 是数字字符串，转 number 给 ConfirmCard
      selected: true,
    }))
    if (items.length === 0) return null
    return {
      title: `将删除 ${items.length} 个匹配书签`,
      description: `关键词: ${query}（可勾选要删除的书签）`,
      items,
    }
  }
}
```

- 书签 id 是 string（如 `"1043"`），`Number("1043")=1043` 是有效正数 → ConfirmCard 渲染 checkbox。
- 空匹配返回 null → handleSlashCommand 走"没找到匹配"兜底（与 close-url 一致）。

#### 5.2.2 useAIEngine.ts handleSlashCommand —— 预取匹配书签

`remove_bookmark` 是危险命令，在 `generateConfirmPreview` 前预取书签（复用既有 `MSG_GET_BOOKmarks` 通道，只返回叶子书签，与 precompute 同源）：

```ts
if (cmd.dangerous) {
  contextCache.value = await getContext()
  // remove_bookmark 预览需要匹配书签列表，预取后传给 generateConfirmPreview
  let matchedBookmarks: chrome.bookmarks.BookmarkTreeNode[] | undefined
  if (resolvedIntent === 'remove_bookmark' && slotsAny.query) {
    matchedBookmarks = (await chrome.runtime.sendMessage({
      type: MSG_GET_BOOKMARKS,
      options: { query: slotsAny.query as string },
    })) as chrome.bookmarks.BookmarkTreeNode[]
  }
  const preview = generateConfirmPreview(resolvedIntent, slotsAny, contextCache.value, matchedBookmarks)
  ...
}
```

#### 5.2.3 useAIEngine.ts onConfirm —— 勾选子集回传

`remove_bookmark` 走 checkbox 后，`onConfirm(selectedTabIds)` 携带勾选的书签 id（number[]）。需传给 SW 的 `selectedIds`（书签 id 是 string，SW 端 removeBookmark 已做 number→string 兼容）。

现有 onConfirm 的 `else if (selectedTabIds.length > 0)` 分支统一走 `tabIds` 字段，但书签删除 SW 端读 `selectedIds` 不是 `tabIds`。需为 `remove_bookmark` 单独走 `selectedIds`：

```ts
} else if (resolvedIntent === 'remove_bookmark') {
  if (selectedTabIds.length > 0) {
    await dispatchToSW(resolvedIntent, { ...slotsAny, force: true, selectedIds: selectedTabIds })
  } else {
    await dispatchToSW(resolvedIntent, { ...slotsAny, force: true })
  }
} else if (selectedTabIds.length > 0) {
  ...tabIds 分支
}
```

#### 5.2.4 useAIEngine.ts precompute —— 尊重用户勾选

precompute 现总是取 `results[0]` 返回 `{ nodeId }`。改为：有 `selectedIds` 时直接透传，否则回退取首个（与 close_tabs_by_url/close_duplicate_tabs 同构）：

```ts
case 'remove_bookmark': {
  const explicitIds = Array.isArray(slots.selectedIds) ? (slots.selectedIds as unknown[]) : []
  if (explicitIds.length > 0) {
    return { selectedIds: explicitIds }
  }
  if (!slots.query) return {}
  // 回退：取首个匹配
  ...既有逻辑...
}
```

#### 5.2.5 SW executor —— 无需改动

`removeBookmark` 已支持 `selectedIds`（逐个 `chrome.bookmarks.remove`），`force:true` 跳过二次确认。完美契合。

#### 5.2.6 ConfirmCard.vue —— 无需改动

书签 id 转 number 后为有效正数 → 渲染 checkbox + 全选/全不选 + 已选计数 + 空选禁用确认。

### 5.3 数据类型注意

- 书签 id 是 **string**（如 `"1043"`）。ConfirmCard 的 `tabId: number`，需 `Number(b.id)` 转换。
- `Number("1043")=1043` 正常；但若书签 id 含非数字字符会得 NaN → ConfirmCard 不渲染 checkbox。Chrome 书签 id 恒为数字字符串，安全。
- SW `removeBookmark` 的 `selectedIds` 已做 `Number(id)` → `String(id)` 往返转换，兼容 number 传入。

## 6. 影响面分析

| 路径 | 是否受影响 | 说明 |
|------|-----------|------|
| 斜杠指令 `/close-url` | ✅ 已修复 | query 正确传入，弹窗正常显示 checkbox |
| 斜杠指令 `/close-duplicates` | ✅ 已改造 | 弹窗 checkbox |
| 斜杠指令 `/remove-bookmark` | ✅ 改造目标 | 弹窗 checkbox，可勾选删除子集 |
| AI 自然语言路径 | ✅ 顺带修复 | precompute 改造后用户勾选不被重算覆盖 |
| `/ungroup-all` 等 | ❌ 不受影响 | 未触碰其代码 |
| ConfirmCard.vue / SW executor | ❌ 不改 | 已支持 |

## 6. 验证

- ✅ `npm run lint` 通过（eslint + prettier 均 0 错误）——需 Node 18+ 运行
- ✅ `npm run type-check` 通过
- 待手动测试：
  - `/close-url github` → 弹窗列出 title/url 含 "github" 的标签，每行 checkbox
  - 取消勾选某几个 → 确认 → 仅关闭勾选项
  - `/close-duplicates` → 每个重复标签一行 checkbox

### 6.1 lint 环境修复记录

原 `npm run lint` 报 `Cannot find package 'eslint-plugin-prettier'`（eslint.config.js import 了但未安装）。修复过程：

1. **安装 `eslint-plugin-prettier@^5.5.6`**（v5 支持 flat config 的 `eslint-plugin-prettier/recommended` 子路径导出，匹配项目 eslint v9 + prettier v3）。
2. **Node 版本限制**：ESLint 9.39 依赖 `structuredClone`（Node 17+），项目 nvm default 指向 Node 16。需 `nvm use 20` 后才能跑 lint。项目已装 Node 20（`v20.20.0`），满足 `^20.19.0` 要求。
3. **`.agents/`、`.claude/` 加入 eslint ignores**：这两个是 Claude Code 技能/配置目录，含 `.tsx` 模板，被 `eslint . --ext .vue,.ts,.tsx` 误扫导致解析报错。加入 ignores 后不再扫描。
4. **修 `useAIEngine.ts` 三处未用 catch 变量**：`catch (e/error)` 改为 optional catch binding `catch {`（ES2019+），比 `_e` 更简洁。这些是既有代码的 lint 问题，借此次 lint 可运行一并修干净。
5. **修 `ConfirmCard.vue` 两处 prettier 格式**：`&&` 缺括号分组 + 长行换行。

## 7. 实施记录

| 文件 | 改动 | 状态 |
|------|------|------|
| `src/shared/slash-commands.ts` | `buildSlots` 补 `close_tabs_by_url` 分支填充 `slots.query` | ✅ 已完成 |
| `src/shared/confirm.ts` | `close_duplicate_tabs` 预览改 checkbox；`remove_bookmark` 预览改 checkbox（加 `matchedBookmarks` 参数） | ✅ 已完成 |
| `src/composables/useAIEngine.ts` | `precompute` 尊重用户勾选；3 处 catch 改 optional binding；`remove_bookmark` 预取书签 + onConfirm 走 `selectedIds` + precompute 尊重勾选 | ✅ 已完成 |
| `src/components/ConfirmCard.vue` | 修 prettier 格式（括号分组 + 换行） | ✅ 已完成 |
| `eslint.config.js` | 安装 `eslint-plugin-prettier@5`；ignores 加 `.agents/`、`.claude/` | ✅ 已完成 |
| `src/service-worker/executor.ts` | 无需改动（`removeBookmark` 已支持 `selectedIds`） | — |

## 8. /clear-history 结果文案修复（JSON 泄露给用户）

### 8.1 现象

`/clear-history all` 回复 `收到啦喵！ {"success":true}`——把 SW 返回的 JSON 直接展示给用户。

### 8.2 根因

`renderExecutionResult('delete_history', {success:true})` 无专属分支，走兜底：

1. `buildMarkdownBody('delete_history', result)` → `markdownFactories` 未注册 `delete_history` → `null`
2. `formatResultDescription({success:true})` → 所有字段都不匹配 → 最终兜底 `JSON.stringify(r).slice(0,100)` → `'{"success":true}'`
3. `wrapCatReply('{"success":true}')` → 显示 JSON

加剧因素：SW `removeHistory` 的返回字段不可靠——
- `range==='all'`：返回 `{ success: true }`（无 deleted）
- `deleteRange`：`chrome.history.deleteRange` 返回 `void`，所以 `{ success: true, deleted: undefined }`
- 仅带 `query` 或 `selectedUrls` 时才有真实 `deleted` 数字

`formatResultDescription` 的 `if (r.deleted !== undefined)` 对前两种场景都不命中。

### 8.3 修复方案

在 `renderExecutionResult` 加 `delete_history` 专属分支，基于 slots（timeRange）+ 返回字段生成友好文案，不依赖不可靠的 `deleted`：

```ts
if (intent === 'delete_history') {
  const timeRange = (slots?.timeRange as string) || 'all'
  const label = { today:'今天', yesterday:'昨天', week:'最近一周', month:'最近一个月', all:'全部' }
  const rangeLabel = label[timeRange] || timeRange
  const deleted = typeof r.deleted === 'number' ? r.deleted : null
  const msg = deleted != null
    ? `已删除${rangeLabel}的 ${deleted} 条浏览历史`
    : `已删除${rangeLabel}的浏览历史`
  addMessage('ai-chat', { markdown: wrapCatReply(msg) })
  return
}
```

- `slots.timeRange` 来自斜杠指令解析（`buildSlots` 已处理 `delete_history`），可靠。
- `r.deleted` 有则带数量，无则只说"已删除 X 的浏览历史"（deleteAll/deleteRange 无法精确计数）。
- AI 路径（`history_remove`，无 slots）不命中此分支（intent 不同），走既有逻辑。

### 8.4 不改 SW 端

不在 SW `removeHistory` 给 `all`/`deleteRange` 补 `deleted` 字段——`deleteAll`/`deleteRange` 本就无法返回删除条数（API 返回 void），强行塞假数字会误导。前端文案已兼容无 `deleted` 的情况。

## 9. 实施记录（clear-history 文案）

| 文件 | 改动 | 状态 |
|------|------|------|
| `src/composables/useAIEngine.ts` | `renderExecutionResult` 加 `delete_history` 专属分支，基于 `slots.timeRange` 生成友好文案 | ✅ 已完成 |
| `src/service-worker/executor.ts` | 无需改动 | — |

### 9.1 验证

- ✅ `type-check` / `lint` 通过（Node 20）
- 待手动测试：
  - `/clear-history all` → "已删除全部的浏览历史"
  - `/clear-history today` → "已删除今天的浏览历史"
  - `/clear-history week github` → "已删除最近一周的 N 条浏览历史"（只删匹配项，不再误删全部）
  - `/clear-history foo`（非法范围）→ "时间范围不对哦，可用 today/yesterday/week/month/all..."
  - `/clear-history`（无参）→ 同上提示

### 9.2 实施记录（timeRange+query 拆分）

| 文件 | 改动 | 状态 |
|------|------|------|
| `src/shared/slash-commands.ts` | `buildSlots` 的 `delete_history` 拆分 timeRange（首 token）+ query（剩余），校验 timeRange 合法性 | ✅ 已完成 |
| `src/shared/confirm.ts` | `delete_history` 预览：timeRange 缺失时返回 null（拦截非法输入） | ✅ 已完成 |
| `src/composables/useAIEngine.ts` | preview=null 兜底对 `delete_history` 给时间范围提示 | ✅ 已完成 |
| `src/shared/commands.ts` / SW `removeHistory` | 无需改动（slot 已声明、SW 已正确消费） | — |

### 9.2 修复 timeRange+query 参数拆分（误删全部历史的风险）

**问题**：`/clear-history week github` 这种"时间范围+关键词"形式，`buildSlots` 把整个 `"week github"` 塞进 `timeRange`，SW 端 `range` 匹配 today/yesterday/week/month/all 全部失败 → `startTime=0` → `deleteRange({0, now})` = **误删全部历史**。

**根因**：`buildSlots` 的 `delete_history` 分支只设 `timeRange = args`，没拆分 `timeRange`（首 token）与 `query`（剩余）。而 `commands.ts` 已声明 `query` slot、SW `removeHistory` 已正确消费 `timeRange` + `query`——缺陷纯在前端解析。

**修复**：`buildSlots` 的 `delete_history` 分支拆分首 token 为 `timeRange`，剩余为 `query`；并校验 `timeRange` 是合法值，非法则 return（不填 slot，让前端给"参数无效"提示，绝不让非法 range 流到 SW 触发 `startTime=0`）：

```ts
case 'delete_history': {
  // /clear-history <时间范围> [关键词]：首 token 是 timeRange，剩余是可选 query
  const parts = args.trim().split(/\s+/)
  const timeRange = parts[0]
  const validRanges = ['today', 'yesterday', 'week', 'month', 'all']
  if (!validRanges.includes(timeRange)) return  // 非法 range 不填 slot，避免 SW 误删全部
  ;(slots as Record<string, string>).timeRange = timeRange
  if (parts.length > 1) {
    ;(slots as Record<string, string>).query = parts.slice(1).join(' ')
  }
  break
}
```

- 合法：`/clear-history week github` → `timeRange='week'`, `query='github'` → SW 走 search+deleteUrl，只删匹配项 ✓
- 合法：`/clear-history today` → `timeRange='today'`, 无 query → SW 走 deleteRange ✓
- 非法：`/clear-history foo` → return，slots 空 → 走"没找到匹配/参数无效"提示，不误删 ✓

**不改**：`commands.ts`（slot 已正确声明）、SW `removeHistory`（已正确消费）。

## 10. /clear-cookies 无参时被误拦截修复

### 10.1 现象

`/clear-cookies`（无参）回复"没找到匹配 '当前条件' 的标签"。期望：无参 = 清除当前页域名的 Cookie。

### 10.2 根因

`clear_cookies` 是 `dangerous: true`，走 `handleSlashCommand` 危险命令路径 → `generateConfirmPreview('clear_cookies', {}, context)` → `confirm.ts` 的 `clear_cookies` 分支 `if (!domain) return null` → preview 为 null → 走"没找到匹配 '当前条件'"兜底文案。

命令定义本就支持无参（`domain` slot optional，SW `removeCookies` 空 domain 时取当前活动 tab 的 hostname）。但 `confirm.ts` 把"无 domain"当成"无匹配项"拦截了。

### 10.3 修复（confirm.ts）

`clear_cookies` 无 domain 时从 `context.activeTab.url` 提取 hostname 生成预览（与 SW `removeCookies` 的兜底逻辑一致），而非返回 null：

```ts
case 'clear_cookies': {
  let domain = slots.domain as string | undefined
  if (!domain) {
    const activeUrl = context?.activeTab?.url
    if (activeUrl) {
      try { domain = new URL(activeUrl).hostname } catch { return null }
    }
  }
  if (!domain) return null
  return { title: `将清除域名 "${domain}" 下的所有 Cookie`, description: '...', items: [] }
}
```

### 10.4 修复（renderExecutionResult 文案）

`clear_cookies` 无专属渲染分支，走兜底 `formatResultDescription`。该函数读 `r.deleted`，但 SW 返回 `r.removed` → 不匹配 → JSON 兜底。加 `clear_cookies` 专属分支：

```ts
if (intent === 'clear_cookies') {
  const domain = r.domain as string | undefined
  const removed = typeof r.removed === 'number' ? r.removed : 0
  addMessage('ai-chat', { markdown: wrapCatReply(
    domain ? `已清除 ${domain} 的 ${removed} 个 Cookie` : `已清除 ${removed} 个 Cookie`
  ) })
  return
}
```

### 10.5 不改 SW 端

`removeCookies` 已正确：空 domain 取当前 tab hostname，返回 `{ success, removed, domain }`。

### 10.6 验证

- ✅ `type-check` / `lint` 通过
- 待手动测试：
  - `/clear-cookies`（无参）→ 弹窗"将清除域名 X 的所有 Cookie" → 确认 → "已清除 X 的 N 个 Cookie"
  - `/clear-cookies github.com` → 弹窗指定域名 → 确认 → 清除该域名

## 11. /clear-cookies 改造为 confirm+checkbox

### 11.1 目标

把 `/clear-cookies` 的确认弹窗从"纯文案确认"改为 **checkbox 可勾选**：每个 Cookie 一行，用户可勾选子集删除（其余保留）。对齐 `/remove-bookmark` 的既有模式。

### 11.2 关键挑战：Cookie 无稳定 id

书签 id 是稳定数字字符串，可直接 `Number(b.id)` 当 `tabId`。但 `chrome.cookies.Cookie` **没有稳定 id 字段**——只有 `name, value, domain, path, sameSite, secure, httpOnly, ...`。删除 Cookie 靠 `chrome.cookies.remove({ url, name })`（url 由 `secure/domain/path` 构造）。

**业界通用方案**（与 `[...].map((x, i) => ({...x, id: i}))` 同构）：用**数组下标**作为 ConfirmCard 的 `tabId`（仅前端勾选 UI 用），`onConfirm` 把勾选的下标映射回闭包捕获的 Cookie 对象列表，构造 `{ name, domain, path, secure }` 传给 SW 的 `selectedCookies` 字段删除。下标仅在本轮预览内有效，无跨轮复用问题（每轮预取一次）。

### 11.3 改造方案

#### 11.3.1 confirm.ts —— 预览改为 checkbox 列表

扩展 `generateConfirmPreview` 签名加可选 `matchedCookies` 参数（与 `matchedBookmarks` 同构，保持纯函数）。每个 Cookie 一行，`tabId = 数组下标`：

```ts
case 'clear_cookies': {
  // domain 解析逻辑不变：无显式 domain 时从 activeTab.url 取 hostname
  let domain = slots.domain as string | undefined
  if (!domain) {
    const activeUrl = context?.activeTab?.url
    if (activeUrl) { try { domain = new URL(activeUrl).hostname } catch { return null } }
  }
  if (!domain) return null
  const items = (matchedCookies ?? []).map((c, i) => ({
    primary: c.name,
    secondary: `${c.domain}${c.path}`,
    tabId: i,            // 数组下标作 UI id（Cookie 无稳定 id）
    selected: true,
  }))
  return {
    title: items.length > 0
      ? `将清除域名 "${domain}" 下的 ${items.length} 个 Cookie`
      : `域名 "${domain}" 下没有 Cookie`,
    description: '此操作不可撤销，可能导致需要重新登录（可勾选要清除的 Cookie）',
    items,
  }
}
```

- 空匹配（该域名无 Cookie）不返回 null，而是显示空列表提示——让用户知道"查到了域名但没 Cookie"，比静默返回 null 走"没找到匹配"兜底更准确。
- `items` 为空时 ConfirmCard `selectableCount===0`，确认按钮不禁用（但 onConfirm 会因空选择不删任何 Cookie，无害）。

#### 11.3.2 useAIEngine.ts handleSlashCommand —— 预取 Cookie

`clear_cookies` 是危险命令。预览前预取域名下的 Cookie 列表（复用 `MSG_EXECUTE → cookies_observe` 通道，SW `observeCookies` 已支持空 domain 取当前 tab hostname）。结果存在闭包变量供 `onConfirm` 反查下标：

```ts
if (cmd.dangerous) {
  contextCache.value = await getContext()
  let matchedBookmarks, matchedCookies
  if (resolvedIntent === 'remove_bookmark' && slotsAny.query) { ...既有... }
  if (resolvedIntent === 'clear_cookies') {
    const obs = await chrome.runtime.sendMessage({
      type: MSG_EXECUTE,
      command: { intent: 'cookies_observe', payload: { domain: slotsAny.domain } },
    })
    matchedCookies = obs?.cookies
  }
  const preview = generateConfirmPreview(resolvedIntent, slotsAny, contextCache.value, matchedBookmarks, matchedCookies)
  ...
}
```

#### 11.3.3 useAIEngine.ts onConfirm —— 勾选子集回传

`clear_cookies` 的 `onConfirm(selectedTabIds)` 携带勾选下标（number[]）。用闭包的 `matchedCookies` 把下标映射回 Cookie 对象，传 `selectedCookies` 给 SW：

```ts
} else if (resolvedIntent === 'clear_cookies') {
  if (selectedTabIds.length > 0 && matchedCookiesRef?.length) {
    const selectedCookies = selectedTabIds
      .map((i) => matchedCookiesRef[i])
      .filter(Boolean)
      .map((c) => ({ name: c.name, domain: c.domain, path: c.path, secure: c.secure }))
    await dispatchToSW(resolvedIntent, { ...slotsAny, force: true, selectedCookies })
  } else {
    await dispatchToSW(resolvedIntent, { ...slotsAny, force: true })
  }
}
```

- `matchedCookiesRef`：闭包捕获的预取列表，用 `let` 在 `handleSlashCommand` 作用域声明、`onConfirm` 闭包引用（与 `matchedBookmarks` 同样不持久化到 ref，因为每轮预览重新预取）。
- 空选择兜底走 `force:true` 无 `selectedCookies` → SW 按域名全删（与旧行为一致，安全兜底）。

#### 11.3.4 SW executor.removeCookies —— 支持 selectedCookies

加 `selectedCookies` 分支：有则逐个构造 url + remove；无则保持原域名全删逻辑：

```ts
async function removeCookies(payload) {
  const selectedCookies = payload.selectedCookies as Array<{name,domain,path,secure}> | undefined
  if (selectedCookies?.length) {
    for (const c of selectedCookies) {
      const url = `${c.secure ? 'https' : 'http'}://${c.domain}${c.path.startsWith('/') ? '' : '/'}${c.path}`
      await chrome.cookies.remove({ url, name: c.name })
    }
    return { success: true, removed: selectedCookies.length, domain: selectedCookies[0]?.domain }
  }
  // 既有域名全删逻辑不变
  ...
}
```

- `selectedCookies` 只需 `name/domain/path/secure` 四字段即可删除（其余 Cookie 字段无关）。
- `domain` 取首个 Cookie 的 domain 用于文案显示。

#### 11.3.5 ConfirmCard.vue / precompute —— 无需改动

- ConfirmCard：下标为有效非负数 → 渲染 checkbox。
- precompute：`clear_cookies` 无 `requiresPrecompute`，`onConfirm` 的 payload 直达 SW，不会被 precompute 覆盖。

### 11.4 数据类型注意

- `chrome.cookies.Cookie` 无 `id` 字段，下标映射方案仅限前端一轮预览内有效。
- `matchedCookies` 可能是 `undefined`（预取失败/无 Cookie）→ `generateConfirmPreview` 的 `(matchedCookies ?? [])` 兜底空数组。

## 12. 实施记录（clear-cookies checkbox）

| 文件 | 改动 | 状态 |
|------|------|------|
| `src/shared/confirm.ts` | `clear_cookies` 预览改 checkbox（加 `matchedCookies` 参数，`tabId=下标`） | ✅ 已完成 |
| `src/composables/useAIEngine.ts` | `handleSlashCommand` 预取 Cookie；`onConfirm` 加 `clear_cookies` 分支回传 `selectedCookies` | ✅ 已完成 |
| `src/service-worker/executor.ts` | `removeCookies` 加 `selectedCookies` 分支 | ✅ 已完成 |
| `src/components/ConfirmCard.vue` | 无需改动 | — |

### 12.1 验证

- ✅ `type-check` / `lint` 通过（Node 20）
- 待手动测试：
  - `/clear-cookies`（无参）→ 弹窗列出当前页域名的所有 Cookie，每行 checkbox → 取消勾选某几个 → 确认 → 仅清除勾选项
  - `/clear-cookies github.com` → 弹窗列出该域名 Cookie → 勾选子集删除
  - 当前页域名无 Cookie → 弹窗显示"域名 X 下没有 Cookie"（空列表）
