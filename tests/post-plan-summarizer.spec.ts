import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * post-plan-summarizer 测试
 *
 * mock aiEngine.chatWithHistory 验证：
 *  - 成功路径（带/不带引号包裹）
 *  - 失败兜底（抛错 / 空串 / AbortError / userText 为空）
 *
 * 注意：模块 import 时 aiEngine 已被 mock，所以 summarizePlanResult 内部
 * 调用的 chatWithHistory 就是 mock 版本。
 */

vi.mock('../src/composables/useAIEngine', () => ({
  aiEngine: {
    chatWithHistory: vi.fn(),
  },
}))

import { aiEngine } from '../src/composables/useAIEngine'
import { summarizePlanResult } from '../src/shared/ai/post-plan-summarizer'

const baseReport = {
  thought: '',
  items: [],
  success: true,
} as const

describe('summarizePlanResult', () => {
  beforeEach(() => {
    vi.mocked(aiEngine.chatWithHistory).mockReset()
  })

  it('成功：返回清理后的 AI 文本', async () => {
    vi.mocked(aiEngine.chatWithHistory).mockResolvedValueOnce('已经关闭了所有的百度页面喵~')
    const text = await summarizePlanResult({
      userText: '关闭所有的百度页面',
      report: {
        ...baseReport,
        items: [
          {
            id: 'p1',
            tool: 'tabs_remove',
            args: { domain: 'baidu.com' },
            result: { success: true, removed: 5 },
          },
        ],
      },
    })
    expect(text).toBe('已经关闭了所有的百度页面喵~')
  })

  it('成功：去掉 AI 误加的引号包裹', async () => {
    vi.mocked(aiEngine.chatWithHistory).mockResolvedValueOnce('"已关闭 3 个标签喵"')
    const text = await summarizePlanResult({
      userText: '关闭标签',
      report: baseReport,
    })
    expect(text).toBe('已关闭 3 个标签喵')
  })

  it('失败：抛错 → null', async () => {
    vi.mocked(aiEngine.chatWithHistory).mockRejectedValueOnce(
      Object.assign(new Error('network'), { name: 'TypeError' })
    )
    const text = await summarizePlanResult({
      userText: '关闭标签',
      report: baseReport,
    })
    expect(text).toBeNull()
  })

  it('失败：返回空串 → null', async () => {
    vi.mocked(aiEngine.chatWithHistory).mockResolvedValueOnce('   \n  ')
    const text = await summarizePlanResult({
      userText: '关闭标签',
      report: baseReport,
    })
    expect(text).toBeNull()
  })

  it('AbortError → null', async () => {
    const err = new Error('USER_STOPPED')
    err.name = 'AbortError'
    vi.mocked(aiEngine.chatWithHistory).mockRejectedValueOnce(err)
    const text = await summarizePlanResult({
      userText: '关闭标签',
      report: baseReport,
    })
    expect(text).toBeNull()
  })

  it('userText 为空 → null（不调 chatWithHistory）', async () => {
    const text = await summarizePlanResult({ userText: '', report: baseReport })
    expect(text).toBeNull()
    expect(aiEngine.chatWithHistory).not.toHaveBeenCalled()
  })
})
