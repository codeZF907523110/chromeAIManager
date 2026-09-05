import { describe, it, expect } from 'vitest'
import { wrapCatReply, wrapCatReplyFinal } from '../src/shared/personality'

/**
 * wrapCatReplyFinal 单元测试 + wrapCatReply 回归保护
 *
 * wrapCatReplyFinal 用于 plan 跑完后的 AI 复盘回复——只补一个收尾 emoji，
 * 不再拼"嘿嘿好呀喵~"或"还有什么想让我做的吗"，避免破坏 AI 已经写好的自然语言。
 *
 * wrapCatReply 仍用于 slash / chat 闲聊 / clientExec 路径，必须保留人设头尾。
 */
describe('wrapCatReplyFinal', () => {
  it('非空文本末尾追加单个 emoji', () => {
    const out = wrapCatReplyFinal('已经关闭了所有的百度页面')
    expect(out).toMatch(/^已经关闭了所有的百度页面 \S+$/)
  })

  it('空串直接返回', () => {
    expect(wrapCatReplyFinal('')).toBe('')
  })

  it('⚠ 开头不包装', () => {
    expect(wrapCatReplyFinal('⚠ 出错')).toBe('⚠ 出错')
  })

  it('不追加 opener/follow-up（与 wrapCatReply 的关键区别）', () => {
    const out = wrapCatReplyFinal('已经关闭了所有的百度页面')
    expect(out).not.toMatch(/喵呜|好呀|还有什么/)
  })

  it('去除尾部已有的标点、空白、emoji，避免重复', () => {
    const out = wrapCatReplyFinal('已经关闭了 5 个标签喵~ 🐾')
    // 应该剥掉 "喵~" 中的 ~ 和 末尾 🐾 后再补单个 emoji
    expect(out).toMatch(/^已经关闭了 5 个标签喵 \S+$/)
  })

  it('去除尾部只有空白的情况', () => {
    const out = wrapCatReplyFinal('操作完成   ')
    expect(out).toMatch(/^操作完成 \S+$/)
  })
})

describe('wrapCatReply (slash / 闲聊路径回归)', () => {
  it('仍会拼 opener/follow-up', () => {
    const out = wrapCatReply('已关闭')
    expect(out).toMatch(/.+ 已关闭 .+ .+/)
  })

  it('空串直接返回', () => {
    expect(wrapCatReply('')).toBe('')
  })

  it('⚠ 开头不包装', () => {
    expect(wrapCatReply('⚠ 错误')).toBe('⚠ 错误')
  })
})
