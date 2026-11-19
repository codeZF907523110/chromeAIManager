# 斜杠命令全量审计（自然语言不受干扰 + 隐患修复）

> 状态：已实施（2026-11-19，lint / type-check / i18n / build 全绿）
> 背景：用户要求逐条检查全部斜杠指令，确认「斜杠指令不能影响自然语言对话」，
> 并排查其它隐患。

## 1. 审计范围与方法

对 36 条斜杠命令沿整条链路逐层核对：

| 层     | 文件                                            | 核对点                                            |
| ------ | ----------------------------------------------- | ------------------------------------------------- |
| 注册表 | `shared/slash-commands.ts`                      | 36 个 intent、别名、hasArg、buildSlots 解析       |
| 匹配层 | `matchSlashCommand`                             | 精确/别名/前缀模糊匹配的劫持面                    |
| 输入层 | `components/CommandInput.vue`                   | picker 弹出条件、Enter/方向键/IME 组合输入        |
| 分发层 | `useAIEngine.handleSlashCommand → dispatchToSW` | intent 与 COMMANDS registry 对齐、precompute 覆盖 |
| 确认层 | `shared/confirm.ts` + `ConfirmCard.vue`         | 危险命令预览、0 勾选行为                          |
| 执行层 | `service-worker/executor.ts`                    | 斜杠 slot 兜底语义（上次已审计过 schema 消费）    |
| 反馈层 | `renderExecutionResult` + markdown factory      | 每个 intent 有反馈，无静默命令                    |

## 2. 确认正常、无需改动的点

1. **自然语言主通道**：`handleSubmit` 唯一分流点是「整行以 / 开头」；不以 / 开头
   的输入完全不进斜杠链路。AI 的回复不会被再解析为命令（只有用户输入走 handleSubmit）。
2. 36 个 slash intent 与 COMMANDS registry 全部对齐；`reset_context` /
   `show_help` / `clear_chat` 在 handleSlashCommand 本地处理，不依赖 registry。
3. 危险命令全部出确认卡；**0 勾选时确认按钮禁用**（ConfirmCard `:disabled` 含
   `selectedCount === 0`），onConfirm 里的「空选兜底全删」分支 UI 上不可达，
   属防御代码，安全。
4. `requiresPrecompute` 的 intent 在 precompute 全覆盖；dispatchToSW 与
   executeCommand 共享同一路径；force 等控制字段透传不被覆盖。
5. `/dark` `/light` 无参时 mode 由 buildSlots 按 intent 写死（page-theme v2.4 链路）。
6. `/sort` 无参 → precompute 默认 domain；`/find` 无参 → 全部标签；`/history`
   无参 → 今天（与 AI 侧默认一致）。
7. `/clear-history` 非法 timeRange → buildSlots 拒绝写入 → 预览为 null →
   「时间范围无效」提示，不会误删全部历史。
8. 中文 IME 组合输入期间 Enter 不触发提交/选择器导航（composition 事件 +
   `e.isComposing` 双保险）。
9. 所有 intent 在 renderExecutionResult 有渲染路径（markdown factory +
   fallback 兜底），无「执行了但没反应」的命令。
10. 别名/前缀歧义（如 `/u` → ungroup_all、`/c` → clear_history）为确定性
    first-match；危险命令有确认卡兜底，保留（模糊匹配是「AI 不可用时」的
    核心输入方式）。

## 3. 发现的问题与修复

| #   | 层   | 问题                                                                                                                                                                                                                                                                                                                                                                                                                                  | 修复                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | 匹配 | **自然语言被劫持成命令，两层缺口**：① 带参数的多 token 输入也走前缀模糊匹配（「/sor 是什么」模糊命中 sort）；② 首轮修复只堵了①，但「/sort 是什么意思」**精确命中** sort 命令名，把「是什么意思」当 order 真的执行排序（用户实测复现）。同理「/clear-history 昨天」非法范围被静默吞掉照样弹确认卡、「/screenshot 怎么用」拍默认截图、「/new-window github.com」开空窗口、「/set-site-perm example.com」缺权限类型直接报 INVALID_PARAMS | **两层规则**：① 前缀模糊仅限单 token 输入，带参数必须精确命中；② 精确命中命令名后，若参数非空但 buildSlots **一个合法 slot 都没解析出来** → 视为 UNKNOWN_SLASH 回落自然语言。为此补齐参数校验：sort_tabs 只接受 domain/title/域名/标题；set_site_permission 必须有 域名+权限类型 两个 token（delete_history / screenshot / new_window 原本就丢弃非法参数，天然满足零 slot 规则） |
| P2  | 分发 | **UNKNOWN_SLASH 一律报错拦截**：「/etc/hosts 是什么」这类以 / 开头的自然语言永远得不到 AI 回答                                                                                                                                                                                                                                                                                                                                        | handleSlashCommand 收到 UNKNOWN_SLASH 时回落 `handleNaturalLanguage(text)`：AI 可用则正常回答（/ 开头文本对模型就是普通消息）；AI 不可用则显示可用性提示（含 /help 引导，信息不丢失）                                                                                                                                                                                            |
| P3  | 匹配 | **别名 `Cookie` 永远失配**：cmdName 被 toLowerCase，别名原值含大写，includes 永远 false（死别名）                                                                                                                                                                                                                                                                                                                                     | 别名匹配两侧统一 toLowerCase（精确与前缀同改）                                                                                                                                                                                                                                                                                                                                   |
| P4  | 输入 | **句中 `/xxx` token 弹 picker 并劫持 Enter**：句子中间出现 /path 时 Enter 不发送而是改写输入为命令；且候选为空时 Enter 没 preventDefault，发送后输入框残留一个 `\n`（下次 Enter 发不出）                                                                                                                                                                                                                                              | picker 仅在**行首 token**（整行无空格且以 / 开头）时弹出；候选为空的 Enter 分支补 preventDefault；handleSend 发送后关闭 picker                                                                                                                                                                                                                                                   |
| P5  | 输入 | **选择器只能按命令名/别名过滤，且命中结果无序**：输入中文功能词（如「排序」，命令无中文别名时）永远搜不到命令；能搜到时也只是注册顺序，没有按匹配强度排序                                                                                                                                                                                                                                                                             | `filteredCommands` 改为**打分排序**：命令名精确(100) > 别名精确(90) > 名前缀(80) > 别名前缀(70) > 名包含(60) > 别名包含(50) > 描述前缀(40) > 描述包含(30)（描述与 help 表同源文案），不匹配即过滤；同分按注册顺序稳定排序，高亮固定第一名                                                                                                                                        |
| P6  | 输入 | **中文 IME 输入时选择器列表不刷新**：`handleInput` 读 `v-model` 的 ref，而 v-model 在 IME 组合输入期间不同步模型（compositionend 上屏时才写入，且此后不再有 input 事件）→ 「/排序」敲完列表停留在「/」时的全量状态。英文输入不走 IME 所以从未暴露                                                                                                                                                                                     | `handleInput` 改从 **DOM 取实时值**（`textareaRef.value?.value`，textarea 始终是真值）；新增 `onCompositionEnd` 处理器（置 isComposing=false 后显式刷新一次选择器），不依赖 v-model 的同步时序                                                                                                                                                                                   |

### 顺手清理（第一版干净原则）

- `buildSlots` 的 `new_window`：`chrome://` 判断不可达（前面的 http/https 检查
  已拦截），合并为一个正则判断。
- `SlashMatchResult` 的 `error` / `hint` 死字段与返回值里 handleSlashCommand
  不消费的 `cmd` 字段删除（错误统一走 `SlashError`）。
- `/history` 斜杠补 timeRange 解析：首 token 命中 `today|yesterday|week|month|all`
  时作为 timeRange、剩余为关键词——与 AI 侧 search_history 能力对齐
  （此前斜杠侧只能搜今天，与本次 timeRange 修复不一致）。

## 4. 边界

- 单 token 拼错（如 `/histroy`）同样回落自然语言：AI 可用时模型会正常回应
  （往往能纠正），AI 不可用时得到可用性提示。`engine.unknownSlash` 词条在
  getCommand 兜底分支仍使用，词条不会变死键。
- 「参数不可解析 → AI」在 AI 不可用时表现为可用性提示，取代旧的部分场景文案
  （如 `/clear-history 昨天` 旧版弹「时间范围无效」）；裸 `/clear-history`
  （无参数）仍走原「时间范围无效」提示。
- `/cd github.com`：/cd 的参数此前被 buildSlots 完全忽略（带了也是全量去重），
  现在零 slot 规则回落 AI，AI 能带 url slot 精确去重；裸 `/cd` 行为不变。
- `/dark 一下` 之类带赘余参数的固定模式命令仍直接执行（mode 恒写入，参数
  是否可解析不影响）。
- 「参数位置补全第二个命令」的原 picker 设计（如 `/close-url /pi`）简化掉：
  补全后的产物会把 `/pi` 当 query 发送，语义不成立；现在句中 token 不再弹窗。
- `/history week` 若用户真想搜关键词「week」会被解析为时间范围——极低频，
  可用 `/history all week` 或自然语言绕过，写入文档不作特殊处理。
- 别名歧义 first-match 语义不变（`/u`、`/c` 等保持现状）。

## 5. 验证

type-check / eslint / prettier / check-i18n / build 全绿。真机回归：

1. 「/sort 是什么意思」→ 不再排序标签，交给 AI 正常回答（两层规则的核心用例）
2. `/sort title`、`/sort 域名`、裸 `/sort` → 正常执行排序
3. 「/etc/hosts 是什么」→ AI 正常回答（不再弹「未知命令」）
4. `/clear-history 昨天` → AI 理解后按 yesterday 执行；裸 `/clear-history`
   → 仍弹「时间范围无效」提示
5. `/screenshot 怎么用` → AI 回答；`/screenshot full|整页` → 正常截图
6. `/new-window github.com` → AI 补 https:// 后开标签；`/new-window
https://…` → 直接开新窗口
7. `/set-site-perm example.com` → AI 追问权限类型；`/set-site-perm
example.com popups block` → 直接执行
8. `/cd github.com` → AI 带关键词精确去重；裸 `/cd` → 全量去重确认卡
9. 断开 AI（不可用状态）输入 `/histroy` → 显示可用性提示 + /help 引导
10. `/Cookie`（大写别名）→ 能匹配 clear-cookies
11. 句中带路径的输入「帮我看看 /usr/bin 里有什么」→ Enter 直接发送给 AI，
    输入框不被改写、无残留换行
12. `/his` 单 token 模糊 → 仍命中 /history；`/s` → 仍命中 /sort
13. `/history week 关键词` → 按近 7 天 + 关键词搜索；`/history 关键词` → 仍默认今天
14. `/bm 标题 https://x.com`、`/clear-history today` 等标准多 token 用法不受影响
15. 选择器输入描述词（如「排序」，/sort 无中文别名，纯描述命中）→ 搜出对应
    命令且按权重排序：`/so` → /sort 排最前（名前缀）；「/排序」→ 描述含排序的
    命令按 描述前缀 > 描述包含 排列；Enter 默认选中第一名
16. 中文 IME 输入「/排序」过程中列表**实时刷新**（拼音中间态会临时按拼音过滤，
    上屏后立即按中文重排）；英文 `/so` 逐字符刷新不受影响；IME 候选词阶段的
    Enter 仍只确认候选词、不发送不选中

## 6. 二次审计（2026-11-19）：chrome.* 抛错兜底 + 摘要器按字段猜 intent 的分支错乱

「chrome_api 加 try/catch」这一修复引出同类问题排查：_*其余 90+ swIntent 的
chrome.* 调用仍在裸奔，且共享摘要器 formatResultDescription 按「结果字段猜
intent」的分支顺序存在错乱_*。该方法被 agent loop 步骤卡与斜杠反馈
（renderExecutionResult fallback）两路共用，错乱文案用户两边都看得见。

对 executor 全部成功返回形状与摘要器分支逐条对照，确认 5 处问题并修复：

| #   | 问题                                                                                                                                                                         | 表现                                                                      | 修复                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | SW 消息监听器对 executeCommand 无就地兜底：chrome.* 原生抛错落到顶层 `.catch` 变 `{error}`，面板只能显示笼统「操作失败」，模型拿不到真实原因无法改参重试                     | 任意命令的 API 级异常（如 management.uninstall 被策略拦截）→ 「操作失败」 | `index.ts` MSG_EXECUTE 分支 try/catch → `{success:false, code:'EXEC_ERROR', message: sw.execFailed(intent+真实错误)}`；顶层 catch 保留给路由级异常                                                             |
| R1  | cookies_remove 返回 `{removed, domain}`，摘要器 cookies 分支判的是**不存在的 `deleted` 字段**（死分支），结果掉进通用 `removed` 分支渲染成「关闭了 N 个标签页」              | `/clear-cookies` 成功后反馈文案错误                                       | 分支条件改 `r.domain && r.removed !== undefined` 并**移到通用 removed 分支之前**；删除死分支                                                                                                                   |
| R2  | updateTab 刷新返回 `{tab, reloaded}` 与创建结果同形（都带 tab），`r.reloaded` 分支排在 `r.tab` 之后永远不可达                                                                | 「刷新标签页」显示为「创建了标签页」                                      | `r.reloaded` 判断移到 `r.tab` 之前（紧跟 `tab && active` 分支）                                                                                                                                                |
| R3  | windows_update 与 windows_create 都返回 `{window}`，无判别 → 「已更新窗口」显示为「已创建窗口」                                                                              | `/update-window`、AI windows_update 文案错误                              | updateWindow 返回值补 `updated: true`；摘要器 `r.window` 分支按 intent 区分创建/更新（step.windowUpdated 新词条）                                                                                              |
| R4  | 三个裸 `{success:true}` 返回（delete_history 清空全部、extensions_update、extensions_remove）没有任何可识别字段 → 落到末尾 JSON 兜底，步骤卡显示 `'{"success":true}'` 原始串 | `/clear-history all`、启停/卸载扩展的反馈为裸 JSON                        | deleteAll 返回 `message: sw.historyAllCleared`；updateExtension 返回 `{id, enabled}`（落既有启用/停用分支）；removeExtension 返回 `{uninstalled: id}`（落既有卸载分支）；摘要器末尾补通用 message 分支兜住同类 |

### 边界

- 摘要器既有 intent 判别先例（removedNode 先于 removed、bookmarks_remove_node
  区分）保持不变；本次只修「条件字段不存在」与「同形结果无判别」两类。
- `r.enabled` / `r.disabled`（按名字启停扩展的旧格式）排在通用 message 分支之前，
  行为不变；EXEC_ERROR 带 code，走 `[CODE] message` 失败分支，不进新 message 分支。
- 新词条：`sw.execFailed` / `sw.historyAllCleared` / `step.windowUpdated`（×4 locale）。
- chrome_api 自身的 try/catch（API_ERROR）保留——它是 API 语义级兜底，与 E1 的
  消息层兜底不重复。

### 回归（真机）

1. `/clear-cookies` → 「已清除 N 条 Cookie（域名）」；`/close-tab` → 「已关闭 N 个标签」（互不串扰）
2. AI「刷新当前页」→ 步骤卡「已刷新标签」而非「已创建」
3. AI「最大化另一个窗口」→ 「窗口已更新」而非「已创建窗口」
4. `/clear-history all` → 「已清空全部浏览历史」；AI 启停/卸载扩展 → 「已启用/已停用/已卸载」
5. 构造 API 异常（如卸载策略强制安装的扩展）→ 显示 `[EXEC_ERROR] 命令 … 执行失败：<真实原因>`
