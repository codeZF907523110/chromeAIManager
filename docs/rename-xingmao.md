# 产品更名：星猫（StarCat）

> 状态：已实施（2026-11-20）
> 背景：原名「AI 浏览器管家 / AI Browser Commander」是纯描述性名称，缺记忆点。
> 用户定名 **星猫**：✦ 星（品牌符号）+ 猫（AI 回复的猫设人格），两个字、好记。
> 要求：名字带「星」、贴合 AI 浏览器管家语义（猫由用户本人选定，覆盖此前「不用猫名」的约束）。

## 1. 命名方案

- **应用内品牌（header / 打招呼）**：短名「星猫」/ "StarCat"——界面空间小，只放品牌；
- **商店名（manifest extName）**：业界惯例「品牌 + 描述」保搜索关键词——
  `星猫 - AI 浏览器管家` / `StarCat - AI Browser Assistant` /
  `StarCat - KI-Browser-Assistent` / `StarCat - Asistente de Navegación con IA`。
- 猫设回复文案（喵）保持不变，与新名天然呼应。

## 2. 改动清单

| #   | 文件                              | 改动                                                                                                                                                         |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `_locales/*/messages.json` ×4     | extName 换「星猫 - AI 浏览器管家」/ StarCat 描述式四语言                                                                                                     |
| 2   | `src/locales/*.json` ×4           | `app.brand` → 星猫/StarCat；`empty.title` 打招呼同步                                                                                                         |
| 3   | `public/index.html`               | `<title>` → 星猫 - AI 浏览器管家                                                                                                                             |
| 4   | README / PRIVACY / docs、源码注释 | 「AI 浏览器管家」→ 星猫、「AI Browser Commander」→ StarCat 全量替换；dom-operation-architecture.md 内 manifest 示例同步为新 extName                          |
| 5   | `personality.ts`                  | **AI 人设名**「塔比（Tabby）」→「星猫（StarCat）」：身份段落改写来历双关（Tabby/Tab 谐音 → 星=品牌 ✦、猫=她自己），标准自我介绍同步；useAIEngine.ts 注释同步 |
| 6   | docs/page-theme.md、promotion-*   | 人设名残留同步替换；知乎文「名字来历」句改写为星猫来历                                                                                                       |

## 3. 边界

- manifest.json 本身用 `__MSG_extName__` 引用，无需改。
- 猫设语气词（喵）、称呼（主人）等功能文案不含旧名，保持不变。
- 用户口述的「塔克」实为人设名「塔比」的误记：提示词里定义的 AI 自称是唯一名字来源，
  现已统一为星猫；模型不会再自报名字。
- IndexedDB 里已持久化的历史对话中可能仍出现「塔比」——那是历史消息原文，不做改写。

## 4. 验证

type-check / eslint / prettier / check-i18n / build 全绿；旧名全仓 grep 零残留。
