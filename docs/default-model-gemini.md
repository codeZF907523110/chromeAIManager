# 默认模型改为 Gemini Nano 方案

> 状态：已实施（2026-11-16）
> 背景：产品决策——开箱默认使用本地内置 AI（Gemini Nano，无需 API Key、离线、隐私），
> DeepSeek 不再预置，想用云端模型的用户自行在设置中添加。
> 已知取舍（决策时明确接受）：浏览器不支持内置 AI 或模型未下载（~2GB）时，
> 默认模型不可用，需引导用户添加云端模型；Nano 为端侧小模型，重任务质量弱于云端。

## 改动清单

| # | 文件 | 改动 |
|---|---|---|
| 1 | `src/shared/constants.ts` | `createDefaultModel` 改为 Gemini Nano：name 'Gemini Nano'、provider 'gemini-nano'、apiKey/apiEndpoint/modelName 置空（nano 后端不走这三个字段） |
| 2 | `src/shared/ai/engine.ts` | `checkAvailability` 失败分支细化：provider 为 gemini-nano/auto 且探测不到内置 AI 时，reason 明确说"浏览器不支持内置 AI 或模型未下载，请在设置添加云端模型"，不再误导性地提示"请配置 API Key" |
| 3 | `src/locales/{zh-CN,en,de,es}.json` | `engine.noBackend` / `engine.noBackendReply` 文案同步：默认模型是本地 Nano，不可用时引导添加云端模型 |
| 4 | `src/composables/useSettings.ts` | 连带 bug 修复：`addModel` 原对全部 provider 强制校验 apiKey/endpoint/modelName，而 gemini-nano 表单隐藏这三项——手动添加 Nano 模型必失败。改为 nano provider 跳过三项校验 |

## 不改的部分（边界）

- 设置 UI 的提供商下拉不变（openai/anthropic/gemini-nano/auto 四项都在），
  DeepSeek 仍可通过"添加模型 → OpenAI 兼容 API"手动配置
- `namePlaceholder`（"如：DeepSeek V3"）保留，作为添加云端模型的示例文案仍然合适
- 无存量迁移：项目未上线，已存过模型的开发机保留原有模型列表，仅首次初始化走新默认
- GeminiNanoAdapter 已实现 `chatWithMessages`（见 docs/code-review-fixes.md 复查补丁），
  agent loop 多轮链路可用

## 验证

type-check / eslint / prettier / check:i18n / build 全绿；
实机验证：新装环境首次打开默认选中 Gemini Nano；Chrome 无内置 AI 时提示添加云端模型；
手动添加 DeepSeek 后可切换使用。
