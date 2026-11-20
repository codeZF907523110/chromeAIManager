# 截图气泡点击全屏预览

> 状态：已实施（2026-11-20）
> 背景：`/screenshot` 成功后气泡里的截图是裸 `<img>`，没有任何点击行为——
> 侧边栏宽度有限，整页长图基本不可读，需要点击放大全屏查看。

## 1. 链路

两条截图路收口到同一个漏斗，渲染点只有一处：

```
/screenshot（斜杠，useAIEngine.ts:2167）┐
AI screenshot / browser_take_screenshot ┴→ showScreenshot() → addMessage(…, dataUrl)
                                              → msg.image → MessageBubble.vue 裸 <img>
```

## 2. 方案

**用 Element Plus `el-image` 自带的全屏预览器**（`preview-src-list`），不自研 lightbox：

- 项目已全局注册 ElementPlus + 完整样式（main.ts `app.use(ElementPlus)`），零新增依赖；
- 预览器自带工具栏（放大/缩小/旋转/还原）、Esc 关闭、键盘导航——业界组件的标准能力；
- 符合规则「优先用业界成熟方案，不自己发明」。

关键 props：

| prop                 | 作用                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `preview-src-list`   | 传入单元素数组即可开启点击预览                                                           |
| `preview-teleported` | 预览层 teleport 到 body：侧边栏消息列表有 overflow 裁剪/可能的 transform 包含块，不传送会被裁剪或层级压住 |
| `hide-on-click-modal`| 点遮罩即关闭（默认必须点右上角关闭按钮，交互太重）                                       |

## 3. 改动清单

| #   | 文件                 | 改动                                                                                                                             |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `MessageBubble.vue`  | 裸 `<img>` 换成 `el-image`（带 preview-src-list / preview-teleported / hide-on-click-modal）；`.screenshot-img` 样式适配 wrapper div |

样式适配点：`el-image` 渲染为 wrapper div（原生 img 在内部），原 `.screenshot-img` 直接套在
wrapper 上。补 `width: fit-content`（按图片自然尺寸收缩，避免小图被拉伸成容器宽）、
`cursor: zoom-in`（提示可点击）；圆角补到内层 img（`overflow:hidden` 裁剪时圆角才生效）。

## 4. 边界

- 仅 `msg.image` 一处消费截图 data URL，斜杠/AI 两路同时生效；录屏 video 不涉及。
- IndexedDB 恢复的历史消息同样渲染 el-image，行为一致。
- data URL 大图：预览器加载的是同一 data URL，无额外网络开销。

## 5. 验证

type-check / eslint / prettier / check-i18n / build 全绿。真机回归：

1. `/screenshot` → 气泡内图片显示与原来一致（自然尺寸、圆角、不被拉伸）
2. 点击图片 → 全屏遮罩预览，工具栏可缩放/旋转，Esc 或点遮罩关闭
3. `/screenshot full` 超长图 → 预览里可缩放到可读比例
4. AI「截个图」→ 同样可点击放大
5. 重开侧边栏（IndexedDB 恢复）→ 历史截图仍可点击放大
6. 深色/浅色主题下预览遮罩与工具栏正常
