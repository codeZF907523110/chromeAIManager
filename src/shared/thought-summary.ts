/**
 * AI 思考文本脱敏与截断
 *
 * 模型的 thought 字段包含内部推理（DOM ref、URL、代码块、调试碎片），
 * 直接展示既冗长又可能泄露上下文。本工具做四件事：
 *   1. 去掉代码块、行内代码、URL、base64 数据
 *   2. 把 DOM ref (ref=e15) 转成中文「元素」
 *   3. 把多行压成单行
 *   4. 截断到 200 字以内，避免气泡过长
 *
 * 设计目标：让用户能看到 AI 在想什么，但又不被技术细节淹没。
 */

/** 单条气泡的最大展示长度（字符数） */
const MAX_DISPLAY_LENGTH = 200

/**
 * 把模型原始 thought 脱敏并截断成适合 system 气泡展示的文本。
 *
 * @param raw 模型原始 thought 字段（可能为空、含代码、URL、ref 等）
 * @returns 处理后的展示文本；空字符串返回空串
 */
export function sanitizeThought(raw: string): string {
  if (!raw) return ''
  let s = raw
    .replace(/```[\s\S]*?```/g, '…') // 整段代码块 → 省略号
    .replace(/`[^`]+`/g, '…') // 行内代码 → 省略号
    .replace(/https?:\/\/\S+/g, '链接') // URL → 链接
    .replace(/\bdata:[\w/+-]+;base64,[\w+/=]+/g, '图片数据') // base64 → 图片数据
    .replace(/ref=e\d+/gi, '元素') // DOM ref → 元素
    .replace(/\s*\n\s*/g, ' ') // 多行压单行
    .replace(/\s+/g, ' ') // 多空格合一
    .trim()
  if (s.length > MAX_DISPLAY_LENGTH) {
    s = s.slice(0, MAX_DISPLAY_LENGTH - 3) + '...'
  }
  return s
}
