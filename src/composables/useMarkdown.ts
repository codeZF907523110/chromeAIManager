/**
 * Markdown 渲染管线
 *
 * 职责：
 *   1. 用 marked 同步解析 Markdown，自定义扩展识别 <lowercase-tag data-id="..." /> 占位符
 *   2. 未知标签按普通文本处理；只有 src/components/blocks/registry.ts 白名单内的标签被吞掉
 *   3. 占位符渲染为 <div data-custom-block data-tag data-id>，由 MessageBubble 渲染后挂载 Vue 组件
 *   4. 代码块走 highlight.js 语法高亮；token 颜色由 src/styles/highlight.css 按 data-theme 切换
 *   5. DOMPurify 加固：允许 target/rel/title，协议限制 https?:|mailto:
 *
 * 关键约束：marked.parse 强制 async:false。marked v5+ 在默认情况下可能返回 Promise；
 * 一旦拿到 Promise 会被 DOMPurify.sanitize 字符串化为空，整个气泡变空白。
 */

import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'

// 按需注册语言：核心库 + 主流语言。
// 用 lib/core 而不是直接 import highlight.js，避免打入未用语言。
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import lua from 'highlight.js/lib/languages/lua'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import nginx from 'highlight.js/lib/languages/nginx'
import objectivec from 'highlight.js/lib/languages/objectivec'
import perl from 'highlight.js/lib/languages/perl'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scala from 'highlight.js/lib/languages/scala'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import vbnet from 'highlight.js/lib/languages/vbnet'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

import { blockRegistry } from '../components/blocks/registry'

// 注册语言表：维护一个数组便于后续增删。
const LANGUAGE_MODULES: Array<[string, unknown]> = [
  ['bash', bash],
  ['c', c],
  ['cpp', cpp],
  ['csharp', csharp],
  ['css', css],
  ['diff', diff],
  ['dockerfile', dockerfile],
  ['go', go],
  ['graphql', graphql],
  ['ini', ini],
  ['java', java],
  ['javascript', javascript],
  ['json', json],
  ['kotlin', kotlin],
  ['lua', lua],
  ['makefile', makefile],
  ['markdown', markdown],
  ['nginx', nginx],
  ['objectivec', objectivec],
  ['perl', perl],
  ['php', php],
  ['plaintext', plaintext],
  ['powershell', powershell],
  ['python', python],
  ['r', r],
  ['ruby', ruby],
  ['rust', rust],
  ['scala', scala],
  ['scss', scss],
  ['shell', shell],
  ['sql', sql],
  ['swift', swift],
  ['typescript', typescript],
  ['vbnet', vbnet],
  ['xml', xml],
  ['yaml', yaml],
]

for (const [name, module] of LANGUAGE_MODULES) {
  hljs.registerLanguage(name, module as never)
}

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
 * marked 代码块渲染器：调用 highlight.js 生成带 token 标签的 HTML。
 *
 * 失败兜底：hljs 高亮抛错时返回原始 code 转义，不阻塞整个气泡渲染。
 *
 * @param code - 原始代码字符串
 * @param infostring - 围栏代码块的语言标记（如 ```ts 中的 ts）
 * @returns hljs 输出的 HTML（已含 token span）
 */
function highlightCode(code: string, infostring: string): string {
  const lang = (infostring || '').trim().split(/\s+/)[0] ?? ''
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    }
    // 未知语言走自动检测（成本可控，单气泡触发一次）
    return hljs.highlightAuto(code).value
  } catch {
    // 高亮失败时返回原 code，由 marked 走默认 escape
    return code
  }
}

// marked v18 的 renderer.code 签名是 ({ text, lang, escaped }) => string
// 走的是对象参数 + lang，不是 (code, infostring)
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }): string {
      const highlighted = highlightCode(text, lang ?? '')
      const langClass = lang ? ` language-${lang}` : ''
      return `<pre><code class="hljs${langClass}">${highlighted}</code></pre>`
    },
  },
})

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
    ADD_ATTR: ['target', 'rel', 'title', 'data-custom-block', 'data-tag', 'data-id', 'class'],
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
