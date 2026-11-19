# Gemini Nano 真实 API 接入 + AI 不可用反馈与链接修复

> 状态：已实施（2026-11-16）
> 背景：默认模型改为 Gemini Nano 后实测两个问题——
> ① 任何浏览器都探测不到内置 AI，默认模型永远"不可用"；
> ② AI 不可用时的反馈是 system 折叠块 + 全量斜杠命令清单（应走聊天气泡），
>    且其中 URL 点击后在侧边栏内导航，扩展无返回按钮导致整个插件卡死。

## 问题 1：探测的 API 形态从未存在于 stable Chrome

`api-detector.ts` 检测的三个形态——`window.ai.languageModel`、`window.ai.assistant`、
`chrome.aiOriginTrial`——全是早期实验/origin-trial 形态，stable Chrome 里一个都不存在。
内置 AI 对扩展开放的真实 API 是 **`chrome.languageModel`（Chrome 138+ stable）**：

```js
chrome.languageModel.capabilities()          // → { available: 'readily' | 'after-download' | 'no', ... }
chrome.languageModel.create({ initialPrompts: [{ role: 'system', content }], temperature, topK })
                                             // → session：{ prompt(), promptStreaming(), destroy() }
```

无需 manifest 权限（built-in AI API 不列 permission）；Chrome <138 时
`chrome.languageModel` 为 undefined → 探测返回 NONE，走既有"添加云端模型"引导。

### 改动

| 文件 | 改动 |
|---|---|
| `src/shared/ai/api-detector.ts` | 重写：只检测 `chrome.languageModel`（readily 可用 / after-download 记日志 / 其余 NONE）。`AI_CAPABILITIES` 收敛为 `NONE \| LANGUAGE_MODEL`；删除 `getOriginTrialLM` 与 window.ai 全局类型声明（死形态） |
| `src/shared/ai/gemini-nano.ts` | `createSession` 改用 `chrome.languageModel.create`（`initialPrompts` 数组承载 systemPrompt）；构造函数去掉无用的 capabilityType 参数 |
| `src/shared/ai/engine.ts` | `new GeminiNanoAdapter()` 同步去参 |
| `src/env.d.ts` | 补 `chrome.languageModel` 命名空间类型（capabilities/create，session 的 prompt/destroy 与既有 `AISession` 接口兼容） |

## 问题 2：AI 不可用反馈形式 + 链接死锁

### 2a. 反馈改为聊天气泡

现状：`handleNaturalLanguage` 在 AI 不可用时 `addMessage('system', 原因+全量斜杠命令清单)`，
渲染成可折叠 system 块（用户不想要的"这种形式"）。

改为：`addMessage('ai-chat', wrapCatReply(原因 + “斜杠命令不受影响，输入 /help 查看全部”))`——
猫式聊天气泡，与 `reportUserFacingError` 双气泡惯例一致；全量命令清单不再 dump
（`/help` 本就是干这个的，`formatHelp` 表格版保留不动）。
连带删除唯一消费全量清单的 `formatSlashCommands()`（无死代码）。

### 2b. markdown 链接一律在浏览器新标签打开

现状：marked 默认渲染裸 `<a href>`，DOMPurify 放行后点击直接在侧边栏文档内导航，
扩展页无历史栈/返回按钮 → 整个插件卡死只能重开。

改两层（双保险）：

1. **渲染层**：`useMarkdown.ts` 注册 DOMPurify `afterSanitizeAttributes` 钩子，
   给所有带 href 的 `<a>` 统一盖 `target="_blank" rel="noopener noreferrer"`
   （中键/Cmd+点击走浏览器原生新标签）
2. **点击层**：`MessageBubble.vue` / `LiveBubble.vue` 的 v-html 容器加 `@click` 事件委托，
   命中 `a[href]` 且协议为 `http(s)/mailto` 时 `preventDefault` + `chrome.tabs.create`
   （普通左键点击由扩展主动开标签，杜绝侧边栏内导航）。
   `data:`/`blob:`（录屏下载卡）不拦截，`download` 属性行为保留

## 影响面与回归边界

- 所有 markdown 消息里的链接（AI 回复、/help、确认卡以外的气泡）行为统一变为"新标签打开"，
  无既有功能依赖"侧边栏内跳转"
- `engine.aiUnavailable` 词条四语言改写（去掉 {commands} 占位）
- Gemini Nano 真正可用的环境（Chrome 138+ 且模型已下载）首次能跑通；不可用环境提示不变
- 斜杠命令路径、/help、确认卡流程均不动

## 补丁（2026-11-16 二次修复）：Chrome 138 标准化 API 形态兼容

上面对"问题 1"的修复只接对了 131-137 预览版形态（`chrome.languageModel.capabilities()`，
状态词 `readily/after-download/no`）。**Chrome 138 stable 已将该 API 标准化**：

- API 对象是标准全局 **`LanguageModel`**（与 Web Prompt API 同一接口，扩展页面/侧边栏可用）；
  旧 `chrome.languageModel` 命名空间里的 `capabilities()` 方法已移除
- 状态查询是 `LanguageModel.availability()`，状态词换为
  **`'available' | 'downloadable' | 'downloading' | 'unavailable'`**（不再是 readily 系列）

后果：Chrome 138+ 上旧探测调用 `capabilities()` 抛 TypeError → 被捕获 → 判 NONE，
用户明明装了 Gemini Nano 仍报"不支持"。

### 修复

| 文件 | 改动 |
|---|---|
| `api-detector.ts` | 新增 `getLanguageModelApi()`：先取标准全局 `LanguageModel`，再兜底 `chrome.languageModel`，两者方法签名一致；`detectAICapability()` 返回 `{ capability, rawStatus }`，兼容两代状态词（available/readily=就绪；downloadable/downloading/after-download=未下载；unavailable/no=设备不支持；no-api=浏览器无此 API） |
| `gemini-nano.ts` | `createSession` 经 `getLanguageModelApi()` 取 API 再 `create()`，不再写死 `chrome.languageModel` |
| `engine.ts` | `unavailableReason` 接收 rawStatus，按状态细分提示：未下载 / 设备不支持 / Chrome 版本过低（需 138+） |
| `env.d.ts` | 删除上一轮加的 `chrome.languageModel` 声明（真实形态经 api-detector 内部类型访问，shim 不再撒谎） |

## 验证

type-check / eslint / prettier / check:i18n / build 全绿；
实机：Chrome 138+ 环境默认模型直接可用；不支持的浏览器输入"你好"得到猫式气泡提示
（含 /help 引导，无命令清单 dump）；点击提示里的 deepseek 链接在浏览器新标签打开，
侧边栏不再卡死。

## 补丁（2026-11-16 三次修复）：不可用提示改为"原因码 + 结构化多语言文案"

**产品决策：扩展绝不自动触发模型下载，只给用户文字提示。**
（曾实现过确认卡 + `LanguageModel.create({ monitor })` 自动下载方案，已被否决并全部回退：
`startNanoDownload`/`monitor` 选项/`AIStatus.nanoStatus`/下载确认卡均删除。）

两个动机：

1. 原提示是一整段长句（手动步骤 + 云端模型引导挤在一起），气泡里格式混乱
2. `unavailableReason` 在引擎层硬编码中文，de/en/es 用户也会看到中文原因

### 设计：引擎返回原因码，UI 层本地化

- `AIStatus.reason` 语义改为稳定原因码：`no-model` / `nano-not-downloaded` /
  `nano-unsupported` / `nano-no-api` / `no-api-key` / `generic`
- `engine.ts` 的 `unavailableReason` 重命名为 `unavailableReasonCode`，只产出码，
  不产出文案；引擎层不再掺杂界面语言
- `useAIEngine.ts` 新增 `AI_REASON_KEYS` 映射（码 → `engine.reason*` 词条 key），
  未知码兜底 `reasonGeneric`，码缺失兜底 `notConfigured`
- 四语言新增 6 个结构化词条（多行 markdown，`\n` 分段）：列表步骤 + 注意块 +
  DeepSeek 链接；`aiUnavailable` 框架改为 "开场语\n\n{reason}\n\n/help 引导" 三段式

### 未下载词条的手动步骤（zh-CN 摘录）

1. 打开 **chrome://flags**，搜索 `optimization-guide-on-device-model`，设为
   **Enabled** 后重启浏览器
2. 打开 **chrome://components**，找到「Optimization Guide On Device Model」，
   点「检查更新」等待下载完成

注意：「Models Manifest」只是组件索引清单，它显示"已是最新"不代表模型本体已下载。

### 改动清单

| 文件 | 改动 |
|---|---|
| `types/ai.ts` | `AIStatus.reason` 注释改为原因码语义 |
| `engine.ts` | `unavailableReason` → `unavailableReasonCode`（返回码）；`未选择模型` → `no-model` |
| `useAIEngine.ts` | 新增 `AI_REASON_KEYS`；`handleNaturalLanguage` 按码取结构化词条 |
| `locales/{zh-CN,en,de,es}.json` | `aiUnavailable` 改三段式框架；新增 `engine.reason*` 6 词条 |
| `api-detector.ts` / `gemini-nano.ts` | 回退下载触发代码（`startNanoDownload`/`monitor`），探测链路 `{ capability, rawStatus }` 不变 |
| `docs/gemini-nano-download-trigger.md` | 删除（方案已被否决，文档标注"已实施"会误导） |

### 边界

- `chrome://` 地址用反引号/加粗纯文本展示（不在 DOMPurify 白名单，不会被渲染成
  侧边栏内跳转的链接），用户手动复制打开
- `[DeepSeek](https://...)` 链接走既有的 afterSanitizeAttributes（target=_blank）+
  `onMarkdownClick`（chrome.tabs.create 新标签打开）链路
- `rawStatus` 未知值时 nano/auto 分支返回 `generic`（与旧版"空 hint + 云端引导"语义等价）

## 补丁（2026-11-16 四次修复）：未下载提示改为当前官方下载机制

三次修复写入的 `reasonNanoNotDownloaded` 手动步骤
（chrome://flags 搜 `optimization-guide-on-device-model` + chrome://components
点「检查更新」）是 **131-137 预览版时代的老流程**，用户在当前 stable Chrome 上
实测两处都搜不到。

### 官方依据（developer.chrome.com/docs/ai/prompt-api，2026-10-21 更新）

- "the model is downloaded separately **the first time an origin uses the API**"——
  唯一官方下载机制是首次调用内置 AI（`LanguageModel.create()`，需用户激活）时
  由 Chrome 自动下载，**没有任何 flags/components 手动入口**
- 官方指定的状态查看页：**`chrome://on-device-internals`**（模型大小、下载进度）
- 硬件门槛：磁盘剩余 ≥ 22GB（Chrome profile 所在卷）；GPU 显存 > 4GB 或
  CPU 16GB RAM + 4 核；macOS 13+ / Windows 10-11 / Linux；初始下载需不计流量网络
- flag 消失原因：stable 已移除预览版 flag；components 里的
  「Optimization Guide On Device Model」条目只在模型下载被触发后才会出现

### 改动

| 文件 | 改动 |
|---|---|
| `locales/{zh-CN,en,de,es}.json` | `engine.reasonNanoNotDownloaded` 重写：删除 flags/components 两步，改为「硬件要求 → 用任意内置 AI 页面（官方 Prompt API Playground 演示）触发自动下载 → chrome://on-device-internals 查看进度」，保留 DeepSeek 云端备选 |

纯文案改动，原因码架构（`AI_REASON_KEYS` → `engine.reason*`）不变，
代码零改动。产品决策不变：扩展绝不调用 `create()` 触发下载（`detectAICapability`
对 `downloadable/downloading` 返回 NONE），提示引导用户自己去任意内置 AI 页面触发，
由 Chrome 而非本扩展完成下载。

定稿文案只陈述当前机制（自动下载时机 + 硬件要求 + 官方演示触发 + internals 查看进度），
**不提及已废除的 flags/components 手动入口**——用户只需要当前事实，提示不带历史包袱。
