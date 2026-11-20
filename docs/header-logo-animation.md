# Header Logo 品牌动画 v2（sparkle 闪烁 + 渐变流光，无旋转）

> 状态：已实施（2026-11-20）
> v1（已废弃）：面切钻石 + conic 极光环旋转——用户反馈钻石造型不佳、旋转动画不要。
> v2 依据业界惯例重做造型与动画，`isThinking` 判定逻辑不变（v1 §3 继续有效）。

## 1. 业界参照（2026-11-20 检索）

- **sparkle（四角星）是 AI 功能的事实标准符号**：ShapeofAI（AI UX 图标库）记载
  sparkles 是 AI 功能的 de facto 标准标记；Gemini / Notion AI / GitHub Copilot 均
  以 sparkle 作为 AI 入口/品牌符号。
- **配套动画三件套**（均非旋转）：
  1. **breathe 呼吸**——主体 scale 起伏（ChatGPT logo 思考态同款）；
  2. **shimmer 渐变流光**——渐变色沿图形扫过（Gemini 品牌渐变、"Thinking…" shimmer
     sweep 是各家 AI 聊天界最普遍的 working 指示，PatternFly AI 动画规范亦收录）；
  3. **twinkle 闪烁**——小伴星错峰明灭（Notion AI / Copilot 的双子星构图）。
- PatternFly（企业级设计系统）为 AI indicator 提供的预制动画即 sparkle 呼吸/明灭。

## 2. v2 视觉设计

四层结构（24px 容器，替代 v1 的 glow/ring/gem）：

| 层                | 内容                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `icon-glow`       | 径向辉光呼吸（沿 v1，微调参数）                                          |
| `icon-spark`      | 主四角星：青→蓝→紫渐变填充，shimmer 流光循环 + breathe 呼吸              |
| `icon-spark-mini` | 两颗小伴星（右上青、左下紫）：twinkle 错峰明灭                           |

- 四角星形状用 CSS `mask-image`（内联 SVG data URI，凹弧四角星，Gemini sparkle 同构）+
  动态渐变背景实现——比 SVG `<linearGradient>` 动画（需 SMIL，已被弃用）更标准。
- 流光无缝循环：主星为静态渐变填充，白色高光带经 `::after` translateX 扫过——首尾
  均在星形之外，循环点不可见；transform 动画走合成器，性能优于 background-position。
- 无障碍：`prefers-reduced-motion: reduce` 下停止全部动画（沿用）。

## 3. 思考态（判定逻辑沿用 v1 §3，动画表现）

| 层          | idle                        | thinking                       |
| ----------- | --------------------------- | ------------------------------ |
| icon-spark  | shimmer 4s + breathe 3.2s   | shimmer 1.2s + 脉冲 0.9s（更大）|
| mini ×2     | twinkle 2.4s 错峰           | twinkle 1.1s 错峰              |
| icon-glow   | 呼吸 3.2s                   | 增强 0.9s（沿用 v1 keyframes）  |

## 4. 改动清单

| #   | 文件                           | 改动                                                                                 |
| --- | ------------------------------ | ------------------------------------------------------------------------------------ |
| 1   | `App.vue`                      | template：gem/ring 层换 spark/mini 层（纯 CSS，无 SVG 元素）；style：v1 环旋/gem 动画全删，换 sparkle 体系 |
| 2   | 本文档                         | v2 修订                                                                               |

`isThinking` computed、`:class="{ thinking }"` 绑定、无障碍 media query 均沿用不动。

## 5. 边界

- mask-image 的 data URI 为静态资源，Chrome 全支持（扩展目标环境）。
- `background-position` 动画非合成器属性，但 24px 小面积可忽略。
- 类名全局（App.vue 非 scoped style）：`icon-spark*` 全项目唯一，v1 的
  `icon-ring`/`icon-gem*` 随样式一并删除，无残留、无冲突。

## 6. 验证

type-check / eslint / prettier / check-i18n / build 全绿。真机回归：

1. header logo：主星渐变流光缓慢扫过 + 呼吸，两颗伴星错峰闪烁；无任何旋转
2. 发消息 → 思考/流式期间：流光加速、主星脉冲增强、伴星闪烁加快、辉光增强
3. 回答结束 → 回落 idle；确认卡等待期间 → idle；斜杠瞬时执行不闪
4. 明暗两主题下渐变与辉光均清晰
5. 系统「减少动态效果」→ 全部静止
