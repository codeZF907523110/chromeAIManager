/**
 * 容错 JSON 解析：处理 AI 输出常见格式问题
 * - markdown 代码块、尾部逗号、单引号、unquoted keys
 * - max_tokens 截断恢复（补全缺失的闭合括号）
 */

import type { AIResponse } from '../types'

/**
 * 尝试修复并解析 AI 返回的 JSON 字符串
 * @param raw 原始字符串
 * @returns 解析后的 AIResponse 对象
 * @throws 解析失败时抛出错误
 */
export function repairJSON(raw: string): AIResponse {
  if (!raw || typeof raw !== 'string') {
    throw new Error('输入不是字符串')
  }

  let text = raw.trim()

  // 0. 检查是否为空
  if (!text) {
    throw new Error('JSON 字符串为空')
  }

  // 1. 移除 markdown 代码块
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '')

  // 2. 直接解析
  try {
    return JSON.parse(text) as AIResponse
  } catch {
    // 继续尝试修复
  }

  // 3. 提取花括号内容
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    text = text.slice(start, end + 1)
  }

  // 4. 修复常见问题
  // 4.1 修复尾部逗号
  text = text.replace(/,(\s*[}\]])/g, '$1')
  // 4.2 单引号转双引号 — 只替换 key 或 value 边界上的单引号，不破坏字符串内容中的合法单引号
  // 先提取并保护字符串值内容，避免误伤
  const protectedStrings: string[] = []
  text = text.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, (match) => {
    // 如果是双引号括起来的字符串，直接保留
    if (match.startsWith('"')) return match
    // 如果是单引号括起来的字符串，将其转成双引号并存入保护列表
    const inner = match.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')
    protectedStrings.push(inner)
    return `"__Q24_PLACEHOLDER_${protectedStrings.length - 1}__"`
  })
  // 修复剩余的孤立单引号（key 边界上的单引号）
  text = text.replace(/'/g, '"')
  // 还原被保护的字符串值
  text = text.replace(/__Q24_PLACEHOLDER_(\d+)__/g, (_, idx) => {
    return protectedStrings[parseInt(idx)] ?? '""'
  })
  // 4.3 修复 unquoted keys — 先保护字符串值内容，避免误匹配
  const protectedStringValues: string[] = []
  text = text.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
    protectedStringValues.push(match)
    return `__Q25_PLACEHOLDER_${protectedStringValues.length - 1}__`
  })
  text = text.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
  text = text.replace(/__Q25_PLACEHOLDER_(\d+)__/g, (_, idx) => {
    return protectedStringValues[parseInt(idx)] ?? '""'
  })

  try {
    return JSON.parse(text) as AIResponse
  } catch {
    // 继续尝试截断恢复
  }

  // 5. 截断恢复：输出被 max_tokens 截断时，JSON 末尾会缺闭合 } ]。
  // 补全未闭合的括号，让已有字段（action/args/reply 通常在前面）可被解析。
  const repaired = repairTruncation(text)
  if (repaired !== text) {
    try {
      return JSON.parse(repaired) as AIResponse
    } catch (e) {
      throw new Error('JSON 解析失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  throw new Error('JSON 解析失败: 结构不完整')
}

/**
 * 判断 AI 输出是否被 max_tokens 截断（末尾不完整）。
 * 用于解析失败时区分"截断"与"格式问题"，决定重试提示文案。
 * @param raw AI 原始输出
 * @returns true 表示输出被截断（字符串外有未闭合括号，或字符串未闭合）
 */
export function isTruncated(raw: string): boolean {
  const t = (raw || '').trim()
  if (!t) return false
  let inStr = false
  let escape = false
  let depth = 0
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') depth--
  }
  // depth > 0：有未闭合的括号；inStr：字符串未闭合 → 均为截断特征
  return depth > 0 || inStr
}

/**
 * 截断恢复：补全被截断 JSON 末尾缺失的闭合括号。
 * 先截掉末尾不完整的片段（半个字符串、未结束的值），再按未闭合栈补全 } ]。
 * @param text 经前面修复步骤处理后的 JSON 文本
 * @returns 补全闭合后的文本；若无需补全则原样返回
 */
function repairTruncation(text: string): string {
  let t = text.trim()
  // 从末尾向前找最后一个"完整值"的结束位置，截掉不完整的尾部片段
  const lastComplete = findLastCompleteValue(t)
  if (lastComplete >= 0 && lastComplete < t.length - 1) {
    t = t.slice(0, lastComplete + 1)
  }
  // 移除末尾多余的逗号
  t = t.replace(/,\s*$/, '')
  // 统计未闭合的 { [ ，按栈顺序补全对应的 } ]
  const stack: string[] = []
  let inStr = false
  let escape = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}') {
      if (stack[stack.length - 1] === '{') stack.pop()
    } else if (ch === ']') {
      if (stack[stack.length - 1] === '[') stack.pop()
    }
  }
  // 字符串未闭合时，先补一个闭合双引号
  if (inStr) t += '"'
  // 再次清理可能因补引号产生的孤立逗号
  t = t.replace(/,\s*$/, '')
  if (stack.length === 0) return t
  while (stack.length) {
    const open = stack.pop()
    t += open === '{' ? '}' : ']'
  }
  return t
}

/**
 * 找到最后一个"完整值"的结束位置。
 * 完整值 = 字符串值闭合后跟 , } ]（非 key 位置），或非字符串值后跟 , } ]。
 * 截断时末尾常残留半个值（如 "url":"chrome://exten），需截掉再补全括号。
 * 注意：字符串闭合后若跟 : 说明它是 key（值还没开始），不能算值结束。
 * @param text JSON 文本
 * @returns 最后一个完整值结束位置的索引；-1 表示无需截断
 */
function findLastCompleteValue(text: string): number {
  let inStr = false
  let escape = false
  // lastValueEnd：最后一个完整值结束的字符索引
  let lastValueEnd = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      if (!inStr) {
        inStr = true
      } else {
        // 字符串闭合：判断后面第一个非空字符是否为 :
        // 是 : → 这是 key，值未开始，不算值结束
        // 否则（, } ] 或 EOF）→ 这是字符串值，记为值结束
        inStr = false
        let j = i + 1
        while (j < text.length && /\s/.test(text[j])) j++
        if (text[j] !== ':') {
          lastValueEnd = i
        }
      }
      continue
    }
    if (inStr) continue
    if (ch === ',' || ch === '}' || ch === ']') {
      lastValueEnd = i - 1
    }
  }
  return lastValueEnd
}
