# 网页主题控制方案（AI 设置当前页面的深色 / 浅色模式）

> 状态：已实施 v2.4（2026-11-16，注入机制换为 executeScript + `<style id>`，见文末补丁）
> 日期：2026-10-23（方案）/ 2026-10-26（实施，v1 失败后重构）
> 前置说明：此前曾误将需求实现为「插件侧边栏自身 UI 主题」，经确认回滚（相关误做的
> theme_update / theme_observe 占位命令与 set_theme 死分支已一并清理）。
> 本方案才是需求本意：**让 AI / 斜杠指令把「当前浏览器网页」变暗或恢复**。

## 1. 需求

用户对星猫说「把这个页面变暗」「切回浅色」，或敲 `/dark` / `/light`，当前网页立即切换：

- **dark**：网页整体变暗（Dark Reader 效果）
- **light**：移除暗化，恢复网页本来的样子

## 2. 业界方案调研结论

Dark Reader（该品类事实标准，[官方文档](https://darkreader.org/help/en)）提供四种模式：

| 模式 | 原理 | 评价 |
|---|---|---|
| **Filter** | CSS `filter: invert(1) hue-rotate(180deg)` 整页反色，媒体元素再反转回来 | 快、实现轻；GPU 开销；对「本来就是暗色」的网站会反亮 |
| Filter+ | Filter + 自定义 SVG 滤镜，色彩更准 | 复杂度中等 |
| **Dynamic** | 解析页面全部样式表，逐色分析后动态生成新暗色 CSS | 效果最好、无 GPU 开销；**工程量巨大**（Dark Reader 核心资产） |
| Static | 生成一套静态自定义主题 | 灵活性差 |

另有 [Chrome 内置 Auto Dark Mode](https://developer.chrome.com/blog/auto-dark-theme/)（浏览器级，
扩展无法控制开关）与 `chrome.debugger` + CDP `Emulation.setEmulatedMedia`（模拟
prefers-color-scheme，但 debugger 权限会触发「已开始调试此浏览器」黄色警告条，不可接受）。

**第一版决策：采用 Filter 模式（滤镜反色法）**——业界验证过的轻量方案，大量「一键暗黑」
扩展同款；Dynamic 模式作为远期演进方向，本期不做。**light 语义 = 移除滤镜恢复原样**
（滤镜法无法凭空为暗色网站生成浅色主题，与 Dark Reader 的 light 行为一致）。

## 3. 现状盘点（零新增权限）

| 已有 | 说明 |
|---|---|
| `scripting` 权限 + `host_permissions: <all_urls>` | manifest.json 已声明 |
| content.js 全站注入（document_idle） | manifest content_scripts 已配置，源码在 `src/content/`（index/messages/dom-perception/page-extractors/screenshot） |
| SW → content 消息转发 + 动态注入兜底 | `executor.ts` 的 `forwardScreenshotToContent` / `injectContentScript`（含 chrome:// 受限页检测先例），可复用该模式 |
| `chrome.storage.local` | 站点偏好持久化 |

## 4. 总体设计（v2：SW 直接注入 CSS，不依赖 content script）

> v1（已废弃）经 content script 消息转发实现即时切换，真机测试失败：重载扩展后
> 已打开页面的旧 content script 成为孤儿收不到消息，动态注入兜底受防重标记/时序影响
> 仍报「Content Script 未响应」。v2 改用 `chrome.scripting.insertCSS / removeCSS`——
> Chrome 为「向标签页注入样式」设计的专用 API，SW 直达，零消息往返；
> 自动应用改由 SW 顶层 `tabs.onUpdated` 监听驱动，content script 完全退出本功能。

### 4.1 暗化 CSS 配方（与 v1 相同，位置移至 SW 模块）

```css
html {
  filter: invert(1) hue-rotate(180deg);
  background-color: #fff; /* 反色后根背景变暗 */
}
img, video, picture, canvas, svg, iframe, embed, object,
[style*="background-image"] {
  filter: invert(1) hue-rotate(180deg);
}
```

- `hue-rotate(180deg)` 抵消反色造成的色相偏移，主色观感接近原色
- CSS 常量在 SW 模块内单一来源；insertCSS 与 removeCSS 必须传同一字符串才能配对移除

### 4.2 注入路径：SW 直达（insertCSS / removeCSS）

```
切换请求（斜杠 / AI tool call）
  → SW executor.pageThemeSet(tab, mode)
    → chrome.scripting.insertCSS({ target: { tabId }, css })   // dark
    → chrome.scripting.removeCSS({ target: { tabId }, css })   // light
    → 同步站点记忆
```

- 注入的 CSS 生命周期与文档绑定：页面导航/刷新后自动消失，因此无需「移除残留」逻辑
- 受限页（chrome:// 等）insertCSS 直接抛错 → 映射为友好错误文案

### 4.3 站点记忆 + 自动应用（SW 顶层 tabs.onUpdated 监听）

- storage key：`page_theme_sites`，结构 `{ [hostname]: 'dark' }`（只记 dark；
  light = 恢复原样 = 删除该域名记忆）
- SW 内存缓存（Set）镜像站点表：启动/首事件时从 storage 水合，切换时同步写回，
  避免每次页面加载都读 storage
- `tabs.onUpdated`：
  - `loading`：清该 tab 的「已注入」标记（新文档），域名命中记忆则 insertCSS
  - `complete`：兜底重试（loading 阶段注入失败时自愈，仍以标记防重复）
- `tabs.onRemoved`：清理「已注入」标记
- 已注入标记（Set<tabId>）防止同文档重复 insertCSS；removeCSS 对未注入页是安全 no-op
- 监听器在 SW 顶层同步注册（MV3 事件唤醒规则，与 index.ts 既有监听器同款）

### 4.4 命令设计

**AI 主命令**（COMMANDS 注册，AI 可见）：

```ts
{
  intent: 'page_theme_set',
  description: '把当前网页切换为深色模式（滤镜反色）；mode=light 恢复页面原始颜色',
  dangerous: false,
  slots: { mode: { type: 'string', description: 'dark | light' } },
  swIntent: 'page_theme_set',
}
```

**斜杠指令**（两条直觉短命令，走「向后兼容斜杠」现成模式——独立 intent + aiHidden +
swIntent 映射，`find_tab → tabs_observe` 同款）：

| 输入 | intent | 映射 |
|---|---|---|
| `/dark`（别名：暗黑、夜间模式） | `page_theme_dark` | swIntent: `page_theme_set` + mode=dark |
| `/light`（别名：恢复、还原页面） | `page_theme_light` | swIntent: `page_theme_set` + mode=light |

**结果文案**：`renderExecutionResult` 加 `page_theme_set` 专属分支（成功：按 mode 出
「已把页面调成深色喵~」/「已恢复页面原样」；失败走既有失败拦截）。

### 4.5 AI 路由优先（自然语言直达专用工具）

真机测试发现：用户说「将当前网站的主题颜色改成浅色」，AI 走了 browser_snapshot →
找页面主题按钮 → 点击 的通用 DOM 路径（慢、依赖页面结构、还可能点错），而没有一步
调用 page_theme_set。修复为双层路由引导（function calling 最佳实践——工具描述即提示词）：

1. **工具描述增强**（commands.ts）：page_theme_set 的 description 写明触发词
   （深色/浅色/夜间/护眼/太亮太暗/页面颜色）与「直接用本工具、不要用 browser_click
   点页面自带的主题按钮」的禁止项
2. **系统提示词通用原则**（prompts.ts「操作模式判断」段）：凡是专用命令能直接完成的
   请求必须优先用专用命令一步完成，禁止用通用 DOM 操作模拟用户点击绕路——这是通用
   规则，主题之外的场景（截图、分组等）同样受益

### 4.5 受限页面处理

chrome://、Chrome Web Store、edge:// 等无法注入 content script → `injectContentScript`
返回 false（现成逻辑）→ 返回友好错误「该页面（浏览器内部页面）不支持暗化」。

## 5. 改动清单

| # | 文件 | 改动 | 预估量 |
|---|---|---|---|
| 1 | `src/shared/page-theme.ts`（新增） | 暗化 CSS 常量 + style 元素 id 常量（SW 与 content 共用的单一来源） | ~30 行 |
| 2 | `src/content/messages.ts` | +PAGE_THEME_APPLY 处理：注入/移除 style、返回结果 | ~40 行 |
| 3 | `src/content/index.ts` | 启动时读站点记忆自动应用 | ~15 行 |
| 4 | `src/service-worker/executor.ts` | +`page_theme_set` case 与实现（消息转发 + 注入兜底 + 站点记忆读写 + 受限页错误） | ~70 行 |
| 5 | `src/shared/commands.ts` | +`page_theme_set`（AI 可见）+`page_theme_dark`/`page_theme_light`（aiHidden 斜杠映射） | ~30 行 |
| 6 | `src/shared/slash-commands.ts` | +`/dark`、`/light` 条目 | +10 行 |
| 7 | `src/composables/useAIEngine.ts` | renderExecutionResult +page_theme_set 文案分支 | ~15 行 |
| 8 | `src/locales/{zh-CN,en,de,es}.json` | +slash.page_theme_*.desc、+intent.pageThemeSet 等 | ~20 行 |
| 9 | `manifest.json` | **零改动**（权限全现成） | 0 |

## 6. 已知局限（如实告知用户，第一版接受）

1. **反色法本质**：对本身就是暗色的网站（GitHub Dark）会反成亮色——再敲 `/light` 恢复即可；
   AI 也可借助现有截图能力先看一眼再决定
2. `position: fixed` 元素在 filter 祖先下定位基准变化，个别悬浮元素可能错位
3. iframe 内部的媒体元素不受「反转回原色」规则影响（content script 不进 iframe），
   iframe 中的图片可能颜色异常
4. Dynamic 模式（逐站点智能配色）是消除这些局限的正解，列为远期演进

## 7. 测试计划

1. **lint / type-check / build 三绿**（Node 18 PATH）
2. 手动：
   - `/dark` → 亮色网站（如 baidu.com）整体变暗、图片颜色正常；刷新页面暗化保持（站点记忆）
   - `/light` → 恢复原样；刷新后不再自动变暗
   - AI 对话「把这个页面变暗」→ tool call 生效 + 猫娘文案反馈
   - `chrome://version` → 友好错误提示
   - 扩展重载后对已打开页面执行 `/dark`（content 未注入场景）→ 动态注入兜底生效
   - 回归：截图、browser_snapshot 等 content 通道功能不受影响

## 8. 待确认

1. ~~本方案是否按「第一版只做 Filter 模式 + 站点记忆」的范围实施？~~ 已确认实施
2. ~~上一轮误做的「插件侧边栏 UI 主题」：保留还是回滚？~~ 已确认回滚

## 9. 实施记录（与方案的差异）

### v2 重构（v1 真机失败后的修复）

v1 经 content script 消息转发实现，真机报「Content Script 未响应」：扩展重载后已打开
页面的旧 content script 是孤儿收不到消息，动态注入兜底仍不可靠（防重标记/时序）。
v2 将整个功能改为 SW 自包含：

- 即时切换：`chrome.scripting.insertCSS / removeCSS` 直接注入/移除 CSS（Chrome 为此
  场景设计的专用 API），零消息往返
- 自动应用：SW 顶层 `tabs.onUpdated`（loading 注入 + complete 兜底）+ `onRemoved` 清理
- content 端改动全部回退（page-theme.ts 删除、PAGE_THEME 消息移除），该功能完全退出
  content script
- 新增 `src/service-worker/page-theme.ts` 模块：CSS 常量、站点记忆（内存镜像 + storage
  同步）、appliedTabs 防重复注入、事件注册；executor 与 SW 入口仅做薄接线
- 错误映射：受限页 insertCSS 抛错 → `sw.pageThemeBlocked`（不再依赖 csNotResponding）
- `src/env.d.ts` 按既有惯例补 `scripting.insertCSS/removeCSS` 与 `tabs.onUpdated/onRemoved` 类型

### v2.1 修复：/light 无参时 mode 丢失

真机测试发现 `/light` 回复「已切换为深色」：`matchSlashCommand` 仅在 args 非空时调用
`buildSlots`，而 /dark、/light 是无参命令 → `page_theme_light` 的 `mode:'light'` 映射
从未执行 → slots 为空传到 SW → SW 缺省按 dark 处理（/dark「正常」纯属默认值巧合，
v2 文档中「SW 端缺省 dark 让无参斜杠自然工作」的判断是错的）。修复：matchSlashCommand
对这两个「无参固定模式」命令在 args 为空时也调用 buildSlots（else-if 仅命中这两个
intent，其它命令行为不变）。

### v2.2 审查修复（2026-10-26 全面复查）

1. rememberSite 水合失败时不再用空集覆盖（会把其它已记域名全部丢失），改为跳过本次写入
2. /light 在受限页（chrome:// 等）removeCSS 抛错改为按成功处理——受限页不可能有本扩展
   注入的 CSS，「恢复原样」天然已达成
3. 删除 setPageTheme 中无人传参的 payload.tabId 死分支
4. 过时注释修正（constants.ts 的 v1 content 架构描述、buildSlots 触发条件描述）

### v2.3 修复：路由切换后 /light「没反应」（同文档重复注入）

**现象（2026-11-16 用户真机复现）**：/dark 生效 → 用户操作页面导致路由跳转（新文档加载）
→ /light 回复成功但**页面仍是暗的**（再敲一次 /light 才恢复）。

**根因链（三条事实拼出来）**：

1. 官方文档（developer.chrome.com/docs/extensions/reference/api/scripting）：
   removeCSS 与 insertCSS 按 css/files/origin 严格配对，一次 removeCSS 只移除**一份**
   匹配注入；移除不存在的样式是静默 no-op。社区实证（SO 79614743「需要点击多次才能
   移除 CSS」）确认：同段 CSS 注入 N 份就要 remove N 次
2. `appliedTabs: Set<tabId>` 防重标记在**异步间隙失效**：onUpdated `loading` 分支先删
   标记，随后 `hydrateSites()`（storage I/O）与 `insertCSS`（IPC）都在途、尚未落定时，
   `complete` 兜底事件进来，`appliedTabs.has()` 双双通过 → **同一文档注入两份 CSS**
3. 手动 /dark 与自动暗化并发（同理）、SW 死亡重启后标记丢失 + 事件补发，都会产生重复注入

于是复现路径成为必然：/dark 注入并记住域名 → 路由跳转 → loading 自动暗化注入中 →
complete 兜底再注入一份 → /light 只移除一份 → 页面仍暗。

**修复（保持 insertCSS 架构不变，消灭重复注入源头）**：

| # | 文件 | 改动 |
|---|---|---|
| 1 | `page-theme.ts` | `appliedTabs` 由 `Set<tabId>` 改为 **`Map<tabId, Promise<void>>`（single-flight）**：同 tab 进行中的注入被后续 applyDarkCss 共享（返回同一 promise），同一文档至多一份；注入失败删标记让 complete 兜底可重试 |
| 2 | `page-theme.ts` | `removeDarkCss` 先 await 在途注入落定（失败忽略）再 removeCSS——杜绝「removeCSS 先执行、在途注入后落定把页面盖回」的次序颠倒 |
| 3 | `page-theme.ts` | `loading` 分支清标记改为「await 在途注入落定后删除」（`resetInjectionMark`）——跨文档在途注入落定前不放行新注入 |
| 4 | `executor.ts` | `setPageTheme` light 分支重排：先 `rememberSite(domain, false)` 撤记忆再 `removeCSS`——两步之间进来的 onUpdated 事件看到记忆已撤，不会再自动暗化盖回（旧顺序 removeCSS → 读域名 → rememberSite，中间窗口期事件会用旧记忆重新注入） |

业界参照：Dark Reader 类扩展用 content script 注入带 id 的 `<style>` 元素（存在性检查
天然幂等）；本项目 v1 的 content script 架构已因「孤儿 CS」真机失败被否，v2 的
insertCSS 架构下 single-flight Map 是最小且完备的防重方案。

**边界（本次不动，如实记录）**：

- /light 只作用于当前活动标签的当前域名（按域名记忆的设计语义）。/dark 了 A 站后跳到
  未记忆的 B 站再敲 /light，页面本来就不是暗的、无视觉变化——这不是 bug，是「恢复
  当前页原样」的定义；回到 A 站会自动暗化（记忆仍在），敲 /light 即恢复
- insertCSS 以 tabId 为目标、由 Chrome 在执行时刻决定落点文档：若 /dark 的在途注入
  恰好跨越文档边界（毫秒级窗口），落进新文档后 loading 分支放行的新注入可能与之形成
  重复——窗口极小且需人手毫秒级操作，第一版接受；single-flight 已消灭全部常态竞态
- rememberSite 水合失败（storage 异常）时跳过记忆写入：当前页立即恢复，但下次加载该站
  仍会自动暗化（记忆残留），再敲一次 /light 即可——异常场景，v2.2 既定行为

**验证**：type-check / eslint / prettier / build 全绿（i18n 无词条改动）。真机回归清单：

1. 原始复现路径：/dark → 点击页面链接跳转（新路由）→ /light → 一次恢复原样（此前要点两次）
2. SPA 路由（pushState 跳转）后 /light → 恢复原样
3. /dark 后立即连敲 /light（移除与在途注入并发）→ 终态为原样
4. /dark 后刷新页面 → 自动暗化保持；/light → 恢复且刷新后不再自动暗化（记忆已撤）
5. chrome://version 上 /dark 报友好错误、/light 静默成功（v2.2 行为不变）
6. 回归：截图、browser_snapshot 等 content 通道功能不受影响（本改动不触碰消息链路）

### v2.4 重构（2026-11-16）：弃用 insertCSS/removeCSS 配对语义，换 `<style id>` 幂等方案

**v2.3 修复后真机复测仍失败**：/dark → 同标签页路由跳转 → /light 确定性无反应。
single-flight 只消灭了「我们自己并发注入」的重复，但根治不了 insertCSS/removeCSS
**按字符串配对**这套有状态机制的固有缺陷——

- 一次 removeCSS 只移除一份匹配注入；样式残留（Chromium 对注入样式的生命周期存在
  同站导航/同进程渲染器残留怪癖）、历史重复注入、升级残留任一发生，页面就有
  removeCSS 够不着的「影子副本」，/light 除不净
- 配对还要求 css/files/origin 逐字段相等，任何漂移都会静默 no-op

**业界参照**：Dark Reader / Stylus 类样式扩展注入**固定 id 的 `<style>` 元素**，
按 id 幂等增删（存在检查 / remove），无任何配对语义。v1 的「孤儿 content script」
问题在此不适用：`chrome.scripting.executeScript({ func })` 每次注入全新脚本执行，
无常驻脚本可变孤儿，仍是 SW 自包含、零常驻 content script。

### 改动

| 文件 | 改动 |
|---|---|
| `page-theme.ts` | `applyDarkCss` 改 executeScript：document 里已有该 id 的 `<style>` 则跳过，否则创建（textContent = 暗化 CSS）挂到 documentElement；`removeDarkCss` 改 executeScript：按 id querySelectorAll 全量 remove，并保留一次配对 removeCSS 清 v2.x insertCSS 升级残留（无残留为 no-op） |
| `page-theme.ts` | 删除 appliedTabs 防重 Map、resetInjectionMark、onRemoved 清理——DOM 侧 id 检查天然幂等，SW 侧不再需要任何防重状态（复杂度净下降） |
| `page-theme.ts` | applyDarkCss 内 documentElement 未就绪时跳过，由既有 complete 兜底事件自愈 |
| `env.d.ts` | executeScript 补 func/args 形态类型（原只有 files 形态） |
| `executor.ts` | setPageTheme 逻辑零改动（apply/remove 签名不变）；注释更新 |

自动暗化监听（onUpdated loading/complete）与站点记忆（darkSites + storage）不变；
loading 与 complete 重复调用 applyDarkCss 由 DOM id 检查天然去重。

### 验证

type-check / eslint / prettier / build 全绿。真机回归（重点 1-3 为本次缺陷路径）：

1. /dark → 同标签页路由跳转（普通点击跳转与 SPA pushState 都测）→ /light 一次恢复
2. /dark → 路由跳转 → 再 /dark → /light 一次恢复（多份叠加场景）
3. v2.x 旧构建上 /dark 过的页面升级新构建后 /light → 升级残留一并清除
4. /dark 后刷新 → 自动暗化保持；/light → 恢复且刷新不再自动暗化
5. chrome://version /dark 报友好错误、/light 静默成功；截图 / snapshot 等通道不受影响



| # | 方案原设计 | 实际实现 | 原因 |
|---|---|---|---|
| 1 | 暗化 CSS 常量放 `src/shared/page-theme.ts` | 放 `src/content/page-theme.ts` | CSS 只被 content 端使用，聚合进 content 模块更内聚；跨端共享的只有 storage key（放 `shared/constants.ts`） |
| 2 | `page_theme_set` mode 必填 | mode 缺省视为 dark | `/dark` 无参数时 matchSlashCommand 不触发 buildSlots、slots 为空，SW 端缺省 dark 让无参斜杠自然工作（命令描述已注明） |
| 3 | —— | 顺带清理旧主题遗留死代码：executor 的 theme_observe/theme_update no-op、commands 的 THEME 组、renderExecutionResult 的 set_theme 死分支、四语言的 intent.themeMode*/themeModeSet/themeColorSet/themeSet/step.themeSet 死词条、check-i18n 白名单的 intent.themeMode. 前缀 | 这些均服务于已不存在命令；不清理会与 page_theme_set 语义撞车，误导 AI 路由 |

最终改动文件：`content/page-theme.ts`（新增：滤镜 CSS + 注入/移除 + 站点记忆自动应用）、
`content/messages.ts`（+PAGE_THEME 消息类型）、`content/index.ts`（门禁前分流 + 启动自动应用）、
`shared/constants.ts`（+STORAGE_KEY_PAGE_THEME_SITES）、`service-worker/executor.ts`
（+setPageTheme：消息转发/注入兜底/站点记忆读写 + case；−旧 THEME 占位）、
`shared/commands.ts`（+page_theme_set / page_theme_dark / page_theme_light；−旧 THEME 组）、
`shared/slash-commands.ts`（+/dark、/light + buildSlots 映射）、
`composables/useAIEngine.ts`（set_theme 死分支 → page_theme 文案分支；−step.themeSet 死引用）、
4 语言 json（+page_theme 词条；−旧 theme 死词条）、`scripts/check-i18n.mjs`（−intent.themeMode. 前缀）。
manifest.json **零改动**。
