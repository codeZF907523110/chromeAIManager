# 空对话引导页（首次使用指引）

> 状态：已实施（2026-11-20）
> 背景：聊天区无对话记录时是一片空白，首次使用者不知道能做什么、也不知道要先配模型。
> 用户要求：标题 + 描述 + 「去设置模型」入口 + 案例标签（点击把文案填进输入框），界面要美观。

## 1. 业界参照

AI 聊天产品的空状态统一模式（ChatGPT / Gemini / Kimi 等）：居中品牌标识 + 问候标题 +
能力描述 + 若干「示例 prompt 卡片」，点击示例**填入输入框**（不自动发送——用户保持
编辑权，业界一致做法）。配模型入口对扩展类产品是首次使用的关键引导。

## 2. 结构与交互

```
MessageList（messages.length === 0 时渲染）
└── ChatEmptyGuide（新组件，居中布局）
    ├── 品牌 sparkle（渐变四角星 + 柔光，与 header 品牌动画同构，静态不旋转）
    ├── 标题（渐变文字）
    ├── 能力描述（一句长句，列出代表能力）
    ├── 「去选择模型」按钮 → emit openSettings → App 调 toggleSettings 开设置抽屉
    └── 案例标签 ×6（lucide 图标 + 文案，网格排列）
         → emit useExample(text) → App：commandInput.value = text + 输入框聚焦
```

- **填入不发送**：点击标签只回填 `commandInputValue` 并聚焦输入框，用户可改后自行发送。
- 案例覆盖 6 个代表能力：查历史 / 按域名分组 / 关闭重复标签 / 整页截图 / 清理 Cookie /
  最近关闭的标签——每个都对应一条真实可用链路（专用命令或 chrome_api 兜底）。
- 案例文案走 i18n（4 locale 各自的自然语言，模型多语言均可理解）。

## 3. 视觉

- 垂直水平居中（`min-height: 100%` + flex center，在滚动容器内正确居中）；
- 入场动画：整体 fade-up + 子元素 stagger 递进入场（业界 onboarding 标准做法），
  `prefers-reduced-motion: reduce` 下关闭；
- 全部用 `--app-*` 主题变量，明暗两主题自适应；sparkle 与 header 同一渐变
  （cyan→blue→violet），mask 同构（复用 header-logo-animation.md 的星形）。

## 4. 改动清单

| #   | 文件                        | 改动                                                                         |
| --- | --------------------------- | ---------------------------------------------------------------------------- |
| 1   | `components/ChatEmptyGuide.vue` | 新组件：结构 + 样式 + 入场动画，emits `use-example` / `open-settings`        |
| 2   | `components/MessageList.vue` | 空列表时渲染 ChatEmptyGuide，事件透传                                        |
| 3   | `App.vue`                   | `applyExample`（回填输入框 + 聚焦）/ `openSettings`（开抽屉）两个 handler   |
| 4   | `locales/{zh-CN,en,de,es}.json` | `empty.*` 段：title / desc / setupModel / tryLabel / example1~6（共 556 keys） |

## 5. 边界

- 仅 `messages.length === 0` 触发；第一条消息出现后引导页消失，不再回来（除非清空聊天）。
- 清空聊天（clear_chat）回到空列表 → 引导页重新出现（预期行为，符合「指引」语义）。
- 引导页在滚动区内，无消息时不产生滚动条。
- 输入框已有草稿时点标签会**覆盖**草稿——业界同样如此（示例即替换式回填），可接受。

## 6. 验证

type-check / eslint / prettier / check-i18n / build 全绿。真机回归：

1. 清空聊天 / 首次安装 → 引导页居中显示：sparkle + 标题 + 描述 + 模型按钮 + 6 个案例
2. 点任一案例 → 文案填入输入框且输入框聚焦，不自动发送
3. 点「去选择模型」→ 设置抽屉打开
4. 发送一条消息 → 引导页消失；清空聊天 → 引导页回来
5. 明暗主题、中文/英文语言切换下文案与布局正常
6. 系统「减少动态效果」→ 入场动画静止
