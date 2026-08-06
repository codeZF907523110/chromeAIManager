/**
 * 容错 JSON 解析：处理 AI 输出常见格式问题
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
  } catch (e) {
    throw new Error('JSON 解析失败: ' + (e instanceof Error ? e.message : String(e)))
  }
}
