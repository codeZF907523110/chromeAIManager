import { describe, it, expect, vi } from 'vitest'

/**
 * C13 阶段 2 — AbortSignal 跨阶段
 *
 * 单元 1：gemini-nano abort 冒烟（Promise.race 实现细节）
 * 单元 2：usePlanRunner.run 冒烟（用 mock aiEngine 让 in-flight 阻塞，
 *          触发 abort() 验证 runningRef=false / removeStatusText 已被调用）。
 *
 * 不依赖真实 Chrome / window.ai；window.ai.session.prompt 模拟成可控 Promise。
 */

import { GeminiNanoAdapter } from '../src/shared/ai/gemini-nano'
import { AI_CAPABILITIES } from '../src/shared/ai/api-detector'

describe('C13 GeminiNanoAdapter abort', () => {
  function makeAdapterWithSlowPrompt() {
    // 构造一个永远 pending 的 prompt，便于测试 abort 在它返回前抛 AbortError。
    let pendingPrompt: ((input: string) => Promise<string>) | null = null
    const fakeSession = {
      prompt: (input: string) => {
        if (pendingPrompt) return pendingPrompt(input)
        return new Promise<string>(() => {
          /* pending */
        })
      },
      destroy: () => {
        /* noop */
      },
    }
    ;(globalThis as Record<string, unknown>).window = {
      ai: {
        languageModel: {
          create: async () => fakeSession,
        },
      },
    }
    return new GeminiNanoAdapter(AI_CAPABILITIES.WINDOW_AI_LM)
  }

  it('P2-10 主动 abort 时抛 AbortError，不再走 session.promise 解析', async () => {
    const adapter = makeAdapterWithSlowPrompt()
    const ctl = new AbortController()
    const promise = adapter.chat('sys', 'user', { signal: ctl.signal })
    // 让 adapter 进入 promptWithAbort 等待
    await new Promise((r) => setTimeout(r, 20))
    ctl.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('P2-10 已 abort 的 signal 在调用前就抛 AbortError', async () => {
    const adapter = makeAdapterWithSlowPrompt()
    const ctl = new AbortController()
    ctl.abort()
    await expect(adapter.chat('sys', 'user', { signal: ctl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})

describe('C13 usePlanRunner abort', () => {
  it('P2-10 abort() 把 in-flight chatWithHistory 中断，runningRef 归零', async () => {
    const seenSignals: Array<AbortSignal | undefined> = []
    vi.doMock('../src/composables/useAIEngine', () => {
      const abortErr = (): Error => {
        const e = new Error('Aborted')
        e.name = 'AbortError'
        return e
      }
      return {
        aiEngine: {
          async chatWithHistory(
            _messages: unknown[],
            options: { signal?: AbortSignal } = {}
          ): Promise<string> {
            seenSignals.push(options.signal)
            return new Promise<string>((_resolve, reject) => {
              options.signal?.addEventListener('abort', () => reject(abortErr()), { once: true })
            })
          },
        },
      }
    })
    vi.doMock('../src/shared/ai/system-prompt', () => ({
      buildSystemPrompt: () => 'sys',
    }))
    vi.doMock('../src/shared/constants', () => ({
      MSG_EXECUTE_PLAN: 'EXEC',
      MSG_GET_CONTEXT: 'GET_CTX',
    }))
    vi.doMock('../src/shared/ai/post-plan-summarizer', () => ({
      summarizePlanResult: async () => null,
    }))
    vi.doMock('../src/shared/personality', () => ({
      wrapCatReply: (s: string) => s,
      wrapCatReplyFinal: (s: string) => s,
    }))
    vi.doMock('../src/shared/confirm', () => ({
      buildReconfirmPayload: (p: unknown) => p,
    }))
    vi.doMock('../src/shared/render-result', () => ({
      renderExecutionResult: async () => {
        /* noop */
      },
    }))

    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg: { type?: string }) => {
          if (msg?.type === 'GET_CTX') {
            return {
              activeTab: null,
              tabCount: 0,
              domainDistribution: [],
              bookmarkFolders: [],
            }
          }
          return {
            items: [],
            success: true,
          }
        }),
      },
    }

    const runner = await import('../src/composables/usePlanRunner')

    const removed: string[] = []
    const ctx = {
      addMessage: (type: string) => {
        if (type === 'system') removed.push('add-system')
      },
      updateStatusText: () => {
        /* noop */
      },
      removeStatusText: () => removed.push('remove-status'),
      setPendingConfirm: () => {
        /* noop */
      },
      renderExecutionResult: async () => {
        /* noop */
      },
    } as import('../src/composables/usePlanRunner').PlanRunnerContext

    const runPromise = runner.run('测试 abort', ctx)
    await new Promise((r) => setTimeout(r, 10))
    expect(runner.isRunning()).toBe(true)
    expect(seenSignals.length).toBeGreaterThan(0)
    expect(seenSignals[0]?.aborted).toBe(false)

    runner.abort()
    await runPromise

    expect(runner.isRunning()).toBe(false)
    expect(removed).toContain('remove-status')
  })
})
