# AI 聊天 Markdown 美化方案

## 1. 目标

解决 AI 聊天气泡（`msg.type === 'ai-chat'`）中 Markdown 内容（特别是代码块和 tag 占位符）显示粗糙的问题：

- 引入 `highlight.js` 做语法高亮
- 主题跟随插件主题（dark / light）动态切换
- 代码块右上角增加复制按钮（hover 显隐）
- 自定义 tag 占位符加载态加 skeleton / spinner，避免空白闪烁

## 2. 业界参考

| 方案 | 体积 | 高亮质量 | 主题动态 | 业界采用率 |
|------|------|----------|----------|------------|
| **highlight.js**（本方案） | ~50KB（核心 ~30KB + 7 个常用语言 ~15KB，可按需降到 ~20KB） | 高 | 通过 CSS 变量自定义 token 颜色 | GitHub、MDN、Notion |
| shiki | 大（每语言 5-15MB） | 最高 | 多 | VSCode、官网 |
| prismjs | 小 | 中 | 弱 | 老牌但维护慢 |

**选型理由**：highlight.js 是体积与质量的最佳平衡点，且 token 颜色可用 CSS 变量覆盖，天然支持主题动态切换。

## 3. 改动清单

### 3.1 新增依赖

`package.json`：

```json
"dependencies": {
  "highlight.js": "^11.10.0"
}
```

按需注册语言：`javascript`、`typescript`、`json`、`html`、`css`、`bash`、`python`、`sql`、`markdown`、`xml`。

### 3.2 `src/styles/highlight.css`（新增）

不引入 hljs 自带主题（`github-dark.css` 等），而是基于 CSS 变量手写 token 配色：

```css
/* 暗色 token 配色 */
:root .hljs { color: var(--hljs-color, #f0f0f0); background: var(--hljs-bg, #1a1a1a); }
:root .hljs-comment, :root .hljs-quote { color: #6a737d; font-style: italic; }
:root .hljs-keyword, :root .hljs-selector-tag { color: #ff7b72; }
:root .hljs-string, :root .hljs-attr { color: #a5d6ff; }
:root .hljs-number, .hljs-literal { color: #79c0ff; }
:root .hljs-title, .hljs-name, .hljs-section { color: #d2a8ff; }
:root .hljs-built_in, .hljs-type { color: #ffa657; }
:root .hljs-variable, .hljs-template-variable { color: #ffa657; }
:root .hljs-tag { color: #7ee787; }

/* 亮色 token 配色（基于 data-theme='light'） */
:root[data-theme='light'] .hljs { color: #24292e; background: #f6f8fa; }
:root[data-theme='light'] .hljs-comment { color: #6a737d; }
:root[data-theme='light'] .hljs-keyword { color: #d73a49; }
:root[data-theme='light'] .hljs-string { color: #032f62; }
:root[data-theme='light'] .hljs-number { color: #005cc5; }
:root[data-theme='light'] .hljs-title { color: #6f42c1; }
:root[data-theme='light'] .hljs-built_in { color: #e36209; }
```

颜色参考 `github-dark` / `github-light` 真实主题，重新映射到 CSS 变量上下文。**不直接 import hljs 主题**，避免主题覆盖后无法响应 `data-theme` 切换。

### 3.3 `src/composables/useMarkdown.ts`（修改）

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
// ... 按需注册

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('json', json)
// ...

marked.setOptions({
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
      } catch {
        // 忽略高亮失败
      }
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,
  gfm: true,
})

// 保留现有 customTagExtension；扩展新加属性 data-code-copy 标识代码块
// 渲染管线不变
```

要点：
- hljs 同步 API，兼容 `async: false`
- 失败兜底走 `highlightAuto`（按内容自动识别语言），不抛错
- 自定义 `customTagExtension` 不动 —— tokenizer 优先级高于代码块

### 3.4 代码块复制按钮（新增）

方案：在 `MessageBubble.vue` 渲染后扫描 `.bubble pre`，在每个 `<pre>` 内右上角注入复制按钮。

新增 `src/components/blocks/CodeBlockEnhancer.ts`（纯 DOM 操作，不走 Vue 组件挂载 —— 性能优先）：

```ts
/**
 * 给气泡内的 <pre> 元素附加复制按钮（DOM 增强，不挂 Vue）。
 * 由 MessageBubble 在 mountEmbeddedComponents 之后调用一次。
 */
export function enhanceCodeBlocks(bubbleEl: HTMLElement): void {
  const blocks = bubbleEl.querySelectorAll<HTMLPreElement>('pre')
  for (const pre of blocks) {
    if (pre.dataset.enhanced === '1') continue
    const btn = document.createElement('button')
    btn.className = 'code-copy-btn'
    btn.type = 'button'
    btn.title = '复制代码'
    btn.innerHTML = /* svg 复制图标 */
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
      try {
        await navigator.clipboard.writeText(code)
        btn.classList.add('copied')
        btn.innerHTML = /* 对勾图标 */
        setTimeout(() => {
          btn.classList.remove('copied')
          btn.innerHTML = /* 复制图标 */
        }, 1500)
      } catch {
        // fallback 与 MessageBubble handleCopy 一致
      }
    })
    pre.style.position = 'relative'
    pre.appendChild(btn)
    pre.dataset.enhanced = '1'
  }
}
```

### 3.5 `src/components/MessageBubble.vue`

- **样式**：
  - 移除现有 `pre / code` 黑底硬编码（line 486-506），让 hljs 主题接管
  - 保留 `<pre>` 圆角、内边距、滚动条样式
  - 给 `[data-custom-block]` 加载态加 skeleton 占位（旋转或脉动）
  - 新增 `.code-copy-btn` 样式：hover 显隐、绝对定位右上角、28px 圆按钮、半透明暗色背景

- **生命周期**：
  - `mountEmbeddedComponents` 之后调用 `enhanceCodeBlocks(contentEl.value)`
  - `watch(props.msg, ...)` 中同样调用

### 3.6 `src/composables/useTaskBlocks.ts` / `MessageList.vue`

无需改动：复制按钮增强在 `MessageBubble` 内部完成。

## 4. 风险评估

| 风险项 | 评估 |
|--------|------|
| 新依赖体积 | `highlight.js` 核心 ~30KB + 9 个语言 ~15KB = ~45KB。可接受 |
| 主题切换 | 自定义 CSS 中用 `:root[data-theme='light']` 选择器，主题切换即时生效，无需重新渲染 |
| DOMPurify 兼容 | hljs 输出 span 嵌套，DOMPurify 默认允许 span，无冲突 |
| 同步渲染 | hljs 同步 API，不破坏 `async: false` 契约 |
| 自定义 tag 占位 | `customTagExtension` 优先级高于代码块，无冲突 |
| 性能 | 单气泡 1 次扫描 + 复制按钮挂载，可忽略 |
| 复制按钮 DOM 操作 | 走纯 DOM 路径，避免 createApp 开销（每个代码块都创建 Vue app 不可接受） |

## 5. 验收清单

- [ ] 代码块带语法高亮，颜色随主题切换
- [ ] 代码块右上角 hover 时显示复制按钮
- [ ] 点击复制后 1.5s 内显示「✓ 已复制」反馈
- [ ] 复制失败走 textarea fallback
- [ ] 自定义 tag 占位加载时显示 skeleton 占位，不再空白
- [ ] dark / light 主题切换时已渲染的高亮颜色实时跟随
- [ ] `pnpm lint` / `pnpm type-check` 无错误
- [ ] 现有自定义块（ActionButtonGroup / OutlineBlock 等）渲染不受影响

## 6. 实施顺序

1. 安装 `highlight.js`
2. 新增 `src/styles/highlight.css`
3. 修改 `useMarkdown.ts` 集成 hljs
4. 新增 `src/components/blocks/CodeBlockEnhancer.ts`
5. 修改 `MessageBubble.vue` 样式 + 生命周期
6. 测试 dark / light 切换效果