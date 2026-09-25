# 国际化（i18n）方案

> 状态：已实现（P1–P5 全部完成）。§1–§9 为方案，§10 为实现结果与差异记录。

## 1. 需求与目标

| 需求 | 结论 |
|------|------|
| 支持语言 | 首批：简体中文（zh-CN）、英语（en）、德语（de）、西班牙语（es）；后续按需追加（fr / ja / pt-BR / ru 等） |
| 默认语言 | 与用户系统/浏览器语言一致 |
| 找不到对应语言 | 回退英语（en） |
| 语言切换 | 设置面板可切换，持久化保存，切换立即生效（无需重启） |
| 扩展性 | 新增一种语言 = 新增 1 个 JSON 词条文件 + 1 行语言注册，不改任何逻辑代码 |

## 2. 业界方案调研

Chrome 扩展 + Vue 项目的国际化，业界标准做法是 **chrome.i18n 与 vue-i18n 分工**，而不是二选一：

| 方面 | 业界共识 | 依据 |
|------|----------|------|
| manifest 字段（扩展名/描述/快捷键说明） | 只能用 `chrome.i18n`：`_locales/<locale>/messages.json` + `__MSG_xxx__` + `default_locale`。Chrome Web Store 商店页展示的语言也取自这里 | Chrome 官方文档《Choose locales》 |
| 框架渲染的 UI | 用 `vue-i18n`（Vue 官方国际化库，当前主流 v11，Composition API）：运行时切换语言、懒加载语言包、复数/插值/嵌套、`useI18n()` | vue-i18n 官方文档 |
| Service Worker 中的文案 | 早期 MV3 有 `chrome.i18n.getMessage` 不可用的坑，**现已官方支持**（Chrome 官方 What's New 确认，同步 API 在 SW 中合法）。但业界更推荐直接 `import` 语言包 JSON + 轻量 `t()`，避免维护两套格式（chrome.i18n 占位符 `$name$` vs vue-i18n `{name}`，无法共用一份 JSON） | Chromium issue + LocalePack 分析 |
| 防漏翻/防死键 | `vue-i18n-extract`（静态扫描缺失/未使用 key，可进 lint/CI）+ VSCode `i18n Ally` 插件（编辑器内直接看翻译）+ `eslint-plugin-vue-i18n`（模板内 text 节点检测） | vue-i18n-extract README |
| 语言解析 | 通用链路：用户显式选择 → 系统语言精确匹配（zh-CN）→ 基础语言匹配（zh）→ 默认语言兜底（en） | 各框架 locale fallback 通用实践 |

结论：采用 **「vue-i18n 管 UI + `_locales/` 只管 manifest + SW 共用 vue-i18n 词条」** 的组合，一套 JSON 词条作为唯一事实来源。

## 3. 现状盘点

| 层 | 含中文的文件 | 文案性质 | 是否纳入本期 |
|----|--------------|----------|--------------|
| 组件（Vue 模板 + 脚本） | 15 个（App、MessageList、MessageBubble、CommandInput、ConfirmCard、TaskBlock + blocks/ 下 8 个） | 用户直接看到的 UI 文案 | ✅ 本期核心 |
| composables | 6 个（useAIEngine 的"思考中/执行中/已停止"、useSpeechRecognition 提示等） | 用户可见的运行时反馈 | ✅ 本期核心 |
| shared（commands.ts、slash-commands.ts、personality.ts、confirm.ts、block-renderers、thought-summary.ts） | 16 个文件，其中 prompts.ts 占大头 | ① 工具描述/系统提示词（**给 AI 看的**）；② 斜杠命令帮助（用户可见）；③ 猫娘语气词（用户可见）；④ 危险操作确认预览、markdown 工厂卡片、思考摘要占位词（用户可见） | ②③④ ✅；① 本期保持中文（见 §4.4） |
| service-worker（executor.ts 等） | 5 个 | 报错信息（"未找到标签页"等，经 UI 透出给用户） | ✅ 本期 |
| content（dom-perception 等） | 5 个 | console.log / 快照数据 | ❌ 不翻译（日志与数据，非 UI） |

术语约定（贯穿全项目）：
- **用户可见文案** → 必须走词条（UI 文字、运行时反馈、报错、命令帮助）；
- **AI 可见文案** → 系统提示词、工具描述，本期保持中文不动；
- **日志/数据** → 不动。

## 4. 总体架构

### 4.1 三类词条，一套来源

```
src/locales/
├── index.ts            # 语言注册表（LOCALES）+ 解析链 + 懒加载入口
├── zh-CN.json          # 中文（基准语言，key 的来源）
├── en.json             # 英语（兜底语言）
├── de.json             # 德语
└── es.json             # 西班牙语

_locales/               # 仅供 manifest 使用（Chrome 强制格式）
├── en/messages.json    # name / description / 快捷键说明
├── zh_CN/messages.json
└── ...

manifest.json           # "name": "__MSG_extName__", "default_locale": "en"
```

- **vue-i18n 词条（src/locales/*.json）**：全部用户可见文案的唯一来源。UI 组件、composables、SW 三处共用。
- **`_locales/`**：只放 manifest 必须走 chrome.i18n 的 2~3 条字段（扩展名、描述、快捷键说明），内容极少且几乎不变，与 src/locales 的人为重复可忽略（`extName` / `extDesc` 两条）。

### 4.2 i18n 引导（src/locales/index.ts）

- 安装 `vue-i18n@11`（Composition 模式），**直接 JSON import 词条，不引入 `@intlify/unplugin-vue-i18n`**——调整原因：SW 侧（§4.5）需要以原始 JSON 对象消费同一份词条，unplugin 会把 JSON 预编译成 AST 函数导致 SW 无法复用；词条总量小（每语言约 10KB），运行时编译成本可忽略。unplugin 预编译列为后续可选优化。
- `createI18n({ legacy: false, locale: <解析结果>, fallbackLocale: 'en', messages: { 'zh-CN': ..., en: ... } })`，其余语言按需 `setLocale(code)` 时动态 `import()` 对应 JSON（vue-i18n 官方懒加载模式），避免首屏把全部语言打进 sidepanel bundle。
- 组件内用 `useI18n()`；非组件模块（composables 单例、SW）直接 `import { i18n } from '@/locales'` 用 `i18n.global.t()`。

### 4.3 语言解析链与设置项

解析优先级（启动时执行一次，切换设置时覆盖）：

```
1. chrome.storage.local 里用户显式选择的语言（useSettings 新增 locale 状态，沿用 themeMode 的存取模式）
2. chrome.i18n.getUILanguage()（等价 navigator.language）精确匹配：zh-CN → zh-CN
3. 基础语言匹配：zh-TW → zh-CN；de-AT → de
4. 兜底 en（vue-i18n fallbackLocale 双保险）
```

设置面板（App.vue 设置区域）新增语言下拉框，选项来自 `LOCALES` 注册表（`{ code: 'de', label: 'Deutsch' }`，label 用该语言的母语写法，任何界面语言下都可辨认）。切换 = `setLocale(code)` + 持久化，立即生效。

### 4.4 AI 层语言策略（关键设计）

AI 的回复语言**不靠翻译词条**，靠两条业界通用做法：

| # | 手段 | 说明 |
|---|------|------|
| 1 | 系统提示词新增一条语言规则 | "始终用用户消息所用的语言回复；用户切换语言时跟随切换。工具调用与 JSON 结构不受影响。" LLM 原生具备语言匹配能力，提示词约束是 Agent 产品（Playwright MCP、browser-use 等）的通行做法 |
| 2 | 本地拼接的"罐头文案"走 t() | "思考中...""执行中...""已停止""聊天记录已经清空啦喵～"等由代码生成、非模型输出的文案，全部改走 `t()`，随界面语言切换 |
| 3 | personality.ts 猫娘语气词 | 各语言的猫娘口味短语移入对应 locale 文件（如 en 用 "meow"，de 用 "Miau"），保留人设但不硬编码中文 |
| 4 | prompts.ts（系统提示词/工具描述）**本期保持中文** | 这是给 AI 看的工程指令，翻译它收益低（模型多语言理解无障碍）、风险高（改动提示词会破坏大量调教好的行为规则），且这几千行中文是 token 成本最低的维护形态。列为后续可选优化 |

斜杠命令：命令名（`/clear-chat`）保持英文关键词不变；帮助/描述文案进词条。

### 4.5 Service Worker 文案

SW（executor.ts 报错信息）**复用 src/locales 词条**：

- 新增 `src/shared/sw-i18n.ts`：约 20 行的 `t(key, params?)`，内部 `import` 当前 locale 的 JSON（构建期打包，无需懒加载）。
- locale 来源：SW 收到消息时从 `chrome.storage.local` 读一次用户设置（SW 处理函数本就是 async，成本可忽略），带模块级缓存，`storage.onChanged` 时失效。
- 词条文件同一个，**不存在 chrome.i18n 与 vue-i18n 双份翻译**。

### 4.6 持久化消息的语言

IndexedDB 里已保存的历史消息是"当时渲染好的文案"，切换语言后旧消息仍显示旧语言——这与所有聊天产品一致（历史即快照），**不做历史消息重翻译**。

## 5. 新增一种语言的流程（扩展性验证）

1. 复制 `src/locales/en.json` → `src/locales/<code>.json` 并翻译；
2. 在 `LOCALES` 注册表加一行 `{ code, label }`；
3. （可选）`_locales/<code>/messages.json` 提供 manifest 字段翻译。

不需要改任何逻辑代码、组件或构建配置——这是本方案的扩展性验收标准。

## 6. 实施阶段

| 阶段 | 内容 | 涉及 |
|------|------|------|
| P1 基建 | 安装 vue-i18n + unplugin；建 src/locales（zh-CN、en 两份词条）；i18n 引导 + 解析链；useSettings 增 locale 状态；设置面板语言切换器；manifest 接入 `_locales/`；SW t() 助手 | package.json、vite.config.ts、src/locales/*、useSettings.ts、App.vue、manifest.json、sw-i18n.ts |
| P2 组件抽词 | 15 个组件的中文文案替换为 `t()`，key 按组件分域（`msgList.*`、`commandInput.*`…） | 组件 + zh-CN/en.json |
| P3 运行时反馈 | useAIEngine 罐头文案、personality 语气词、斜杠命令帮助（描述/占位从注册表移除，改由 `slash.*` 词条提供）、useSpeechRecognition 提示走 t()（识别语言跟随界面语言）；confirm.ts 确认预览、block-renderers（markdown 工厂）、thought-summary.ts 占位词走 t()；recording/executor.ts 录制反馈走 `rec.*`；useSettings.addModel 校验报错走 t()；系统提示词追加语言规则 | composables、shared/personality.ts、slash-commands.ts、confirm.ts、block-renderers、thought-summary.ts、recording/executor.ts、useSettings.ts、prompts.ts（只加 1 条规则） |
| P4 SW 报错 | executor.ts 用户可见 `message`/`suggestion` 文案改走 swT()（`sw.*` 词条，随 storage 语言即时切换）；权限类型 label 改存 `labelKey`、消费点经 swT 取词（保证语言切换后新结果生效）；无消费者的 `message` 字段直接删除（task-planner 两处 + ExecPlanResult.message）；task-planner 的 `error` 字段属 AI 对话内容，按方案保持中文 | service-worker/executor.ts、task-planner.ts、shared/sw-i18n.ts、zh-CN/en.json |
| P5 补语言 + 防回归 | 新增 de、es 全量词条；防回归校验进 lint 流程（业界工具实测均不适配，改为小型校验脚本 `scripts/check-i18n.mjs`，评估过程见 §6.1）；文档更新（技术文档 + 本方案"已实现"章节） | de/es.json、scripts/check-i18n.mjs、package.json scripts、docs |

### 6.1 防回归校验工具选型（P5 实测记录）

原计划接入 `vue-i18n-extract`，实测两个业界工具均与本项目的代码形态冲突，结论如下（均已实测验证后弃用）：

| 工具 | 实测结果 | 弃用原因 |
|------|----------|----------|
| `vue-i18n-extract@2.0.7` | `cat.followUps`（数组词条）被误报为 missing；`slash.*`/`step.event.*`/`intent.historyRange.*`/`shot.mode*`/`intent.themeMode.*` 等动态 key 模板字面量全部误报为 unused（且每种语言重复一行，噪音大） | 无 ignores/排除配置，无法过滤动态 key |
| `@intlify/eslint-plugin-vue-i18n@4.5.1` | `no-missing-keys` 按函数名识别 `t()`（本地包装器可覆盖，实测可用），但不识别 SW 侧 `swT()`；动态 key 模板字面量静默跳过（✅ 不误报）；`no-unused-keys` 无法识别本项目非组件 `t()` 包装器调用，1734 条全量误报 | 死 key 方向不可用；缺 key 方向只覆盖 `t()` 不覆盖 `swT()`；需额外引入 jsonc/yaml 两个 parser 依赖 |

结论：改为自带小型校验脚本 `scripts/check-i18n.mjs`（Node 原生，零依赖），一次性覆盖两个方向，且对动态 key 做精确校验而非白名单放行：

1. **结构对齐**：4 个语言文件（zh-CN/en/de/es）扁平化后 key 集合必须完全一致（缺 key / 多余 key 均报错）；
2. **占位符对齐**：每个词条的 `{param}` 集合在 4 个语言中必须一致（防翻译时漏/改插值参数）；
3. **缺 key（静态）**：扫描 `src/**/*.{ts,vue}` 中 `t('…')`、`swT('…')`、`$t('…')`、`i18n.global.t('…')`、`i18n.global.tm('…')` 的字符串字面量实参，key 必须存在于词条；
4. **缺 key（动态）**：`slash.<intent>.{desc,ph}` 与 `slash-commands.ts` 注册表逐条联动校验（`hasArg` 的命令必须有 `ph` 词条）；`step.event.*`、`intent.historyRange.*`、`intent.themeMode.*` 前缀 key 必须存在；
5. **死 key**：词条中的 key 若既未被静态扫描命中、又不属上述动态前缀（含 `shot.mode*`，它以字面量形式存于取值映射中），报为死 key；`slash.*` 的死 key 按注册表精确判定（intent 从注册表移除后其词条立即报死）。

脚本以 `pnpm check:i18n` 运行，并串入 `pnpm lint` 链。

每个阶段独立可验证、不影响既有功能，完成后跑 `pnpm lint && pnpm type-check && pnpm build`。

## 7. 验证方案

1. 构建：lint / type-check / build 全绿；
2. 默认语言：系统语言为中文时启动显示中文；把 Chrome 语言切到德语、无存储偏好时显示英语还是德语按解析链验证（de 系统语言 → de；不支持语言如 it → en）;
3. 切换：设置面板切到 en → 全部 UI 文案、罐头反馈、SW 报错（可人为触发一个 tabs 报错）即时变英文，重启扩展后保持；
4. 兜底：临时删掉某个 key，界面显示 en 文案而不是裸 key；
5. AI 回复语言：用英文发指令，AI 思考/回复/工具调用正常且用英文反馈；
6. 回归：主题切换、模型设置、聊天持久化、Agent 任务执行（DOM/标签页）全流程正常。

## 8. 不在本次范围

- prompts.ts 系统提示词/工具描述的多语言化（后续可选优化）；
- 历史消息的重翻译；
- 复数规则/日期本地化精细打磨（聊天 UI 场景少，vue-i18n 内置能力兜底即可）;
- RTL 语言（ar/he）布局支持。

## 9. 自查

- **业界方案优先**：chrome.i18n（manifest）+ vue-i18n（UI）分工、懒加载词条、fallbackLocale、提示词约束 AI 回复语言，均为官方/社区标准做法，无自造方案；
- **扩展性**：新增语言 = 1 JSON + 1 行注册（§5），词条单一来源避免双份翻译；
- **不影响既有功能**：SW 词条、提示词规则、罐头文案均为替换展示层文字，逻辑分支不动；prompts.ts 仅追加 1 条语言规则，不重写；
- **第一版干净**：不引入 legacy API（`legacy: false` Composition 模式）、不做历史消息迁移、不为日志做多语言；
- **风险点已识别**：manifest 换 `__MSG_*__` 后若 `_locales` 缺 `default_locale` 会导致加载失败（P1 中一并验证）；SW 读取 locale 有 storage 依赖（有缓存 + 默认值兜底，不会阻塞消息处理）。

## 10. 已实现（2026-09）

P1–P5 全部完成。首批 4 语言（zh-CN / en / de / es），每语言 528 个 key、24 个词条域（app / settings / task / list / bubble / confirm / input / voice / blocks / landmark / stats / codeBlock / engine / warn / shot / intent / step / slash / rec / cat / preview / factory / thought / sw）。

### 10.1 产物清单

| 产物 | 说明 |
|------|------|
| `src/locales/index.ts` | 语言注册表 `LOCALES` + 解析链（显式选择 → 精确 → 基础语言 → en）+ vue-i18n 引导（`legacy: false`） |
| `src/locales/{zh-CN,en,de,es}.json` | 唯一词条来源，UI / composables / SW 三处共用 |
| `src/shared/sw-i18n.ts` | SW 侧 `swT(key, params?)`：读 storage 用户语言（带缓存，`storage.onChanged` 失效），`sw.*` 域 |
| `_locales/{en,zh_CN}/messages.json` + manifest | `__MSG_extName__` / `__MSG_extDesc__` + `default_locale: "en"` |
| 组件 / composables / shared / SW 抽词 | 15 个组件、useAIEngine 罐头文案、personality、斜杠帮助、语音提示、confirm 预览、markdown 工厂卡片、思考摘要、recording 反馈、useSettings 校验报错 |
| `scripts/check-i18n.mjs` + `pnpm check:i18n` | 防回归校验（§6.1），串入 `pnpm lint` 链 |

### 10.2 与方案的差异（均已实测验证）

1. **未引入 `unplugin-vue-i18n`**（§4.2 已注明）：SW 侧需以原始 JSON 对象复用同一份词条，unplugin 预编译成 AST 函数后无法复用；改为直接 JSON import + 运行时编译（词条量小，成本可忽略）。
2. **死代码删除**（第一版干净原则，非方案偏离项）：斜杠注册表的 `description` / `placeholder` 字段整体移除（改由 `slash.*` 词条提供）；`ExecPlanResult.message` 与 task-planner 两处无消费者 `message` 字段删除；`slash.argPlaceholder` 经校验脚本发现零消费后删除。
3. **权限类型 label 改存 `labelKey`**（P4）：SW 权限类型不再存中文串，消费点经 `swT` 取词，保证语言切换后新结果生效。
4. **词条域多于 §4.1 预估**：实际 24 域 / 528 key（方案初稿按组件域估算）。`shot.*` 反馈文案取自 `useAIEngine.ts` 截图链路（`prefix` + `copiedTail`/`manualTail` 空格拼接）。
5. **prompts.ts 保持中文**（用户确认，§4.4 第 4 条）：仅追加 1 条「始终跟随用户消息语言回复」规则，不重写提示词。
6. **防回归改为自研脚本**（§6.1）：业界两工具实测均不适配（数组误报 / 动态 key 全量误报 / 死 key 方向不可用）。

### 10.3 验证结果

- `pnpm lint && pnpm type-check && pnpm build` 全绿（lint 链已含 `check:i18n`，当前 528 key / 63 个源码文件）。
- 校验脚本负向用例 6 组全部按预期报错并拦截：
  1. 单语言缺 key（`[de] 缺少 key: blocks.tabsMore`）；
  2. 占位符不一致（`{count}` → `{counts}`）；
  3. 死 key（4 语言新增无消费词条）；
  4. 带参斜杠命令缺 `ph`（与注册表联动）;
  5. 源码 `t()` 引用不存在的 key；
  6. 注册表 intent 改名 → 新 intent 词条报缺失、旧词条报死 key（双向联动）。
- 每个用例备份/还原后校验恢复通过，未污染词条文件。
