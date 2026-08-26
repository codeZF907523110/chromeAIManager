/**
 * Markdown 渲染管线
 *
 * 职责：
 *   1. 用 marked 同步解析 Markdown，自定义扩展识别 <lowercase-tag data-id="..." /> 占位符
 *   2. 未知标签按普通文本处理；只有 src/components/blocks/registry.ts 白名单内的标签被吞掉
 *   3. 占位符渲染为 <div data-custom-block data-tag data-id>，由 MessageBubble 渲染后挂载 Vue 组件
 *   4. DOMPurify 加固：允许 target/rel/title，协议限制 https?:|mailto:
 *
 * 关键约束：marked.parse 强制 async:false。marked v5+ 在默认情况下可能返回 Promise；
 * 一旦拿到 Promise 会被 DOMPurify.sanitize 字符串化为空，整个气泡变空白。
 */

import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { blockRegistry } from '../components/blocks/registry'

/**
 * marked 自定义扩展：解析 Markdown 中的自定义块占位符
 *
 * 语法：<tag-name data-id="<id>" ...attrs />
 *   - tag-name 必须在 blockRegistry 白名单内
 *   - 必须自闭合
 *   - 必须包含 data-id 属性
 */
const customTagExtension = {
  name: 'customTag',
  level: 'block' as const,
  start(src: string): number {
    return src.match(/<\s*[a-z][a-z0-9-]*\b/)?.index ?? -1
  },
  tokenizer(src: string) {
    // 行首允许 0~N 个空白；标签必须自闭合（/> 结尾），后可接换行
    const m = src.match(/^[ \t]*(<\s*([a-z][a-z0-9-]*)\b([^>]*?)\/>)[ \t]*(?:\n|$)/)
    if (!m) return undefined
    const [, , tagName, attrs] = m
    if (!blockRegistry.has(tagName)) return undefined
    const props: Record<string, unknown> = {}
    attrs.replace(/([a-z][a-z0-9-]*)\s*=\s*"([^"]*)"/g, (_match, k: string, v: string) => {
      props[k] = v
      return ''
    })
    if (!props['data-id']) return undefined
    return { type: 'customTag', raw: m[1], tagName, props }
  },
  renderer(token: { tagName: string; props: Record<string, unknown> }): string {
    const id = String(token.props['data-id'] ?? '')
    return `<div data-custom-block data-tag="${token.tagName}" data-id="${id}"></div>`
  },
}

marked.use({ extensions: [customTagExtension] })

/**
 * 把 markdown 字符串渲染成安全的 HTML
 * 占位符位置被替换为 <div data-custom-block>，由 MessageBubble 后续挂载 Vue 组件
 *
 * @param md - markdown 字符串
 * @returns 安全的 HTML 字符串
 */
export function renderMarkdown(md: string): string {
  // 强制同步解析：marked v5+ 默认可能返回 Promise（任何 tokenizer 是 async 的情况下），
  // 异步结果会让 DOMPurify.sanitize 拿到一个 Promise 对象字符串化为空，整个气泡变空白。
  const raw = marked.parse(md, { breaks: true, gfm: true, async: false }) as string
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel', 'title', 'data-custom-block', 'data-tag', 'data-id'],
    ALLOWED_URI_REGEXP: /^(https?:|mailto:)/i,
  })
}

/**
 * 给 MessageBody 分配组件 id（命令侧 / AI 输出侧用来生成 <tag data-id="..."> 占位符）
 *
 * @returns 一个不会和现有组件 id 冲突的新 id
 */
export function newBlockId(prefix = 'b'): string {
  // crypto.randomUUID 在 MV3 Service Worker / 浏览器均可用
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}
