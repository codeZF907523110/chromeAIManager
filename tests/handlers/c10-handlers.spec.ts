import { describe, it, expect, vi } from 'vitest'

/**
 * C10 SW handler 单测：
 *   B24: notifications sanitizeNotificationText 不再整串替换
 *   B26: permissions observe 同时查 https / http，返回首个非 default
 *   B27: permissions update value=default 错误提示包含「permissions-clear」
 *   B28: navigation 黑名单包含 chromewebstore.google.com
 *   B34: history query 删除超出 10000 时返回 truncated
 *
 * 因涉及 .vue 等依赖，本文件采用静态扫描 + 直接构造简单 chrome mock 两套策略。
 * handlers 是纯函数 + chrome.* 调用，能用简单 mock 覆盖。
 */

import * as historyHandler from '../../src/service-worker/handlers/history'
import * as navHandler from '../../src/service-worker/handlers/navigation'
import * as permsHandler from '../../src/service-worker/handlers/permissions'

describe('B24 notifications sanitize — 不再整串替换', () => {
  it('敏感词 token 等长替换为 *，其余字符保留', async () => {
    // 借用 sanitizeNotificationText 通过 create() 的 title 字段间接验证
    const chromeMock = {
      notifications: {
        create: vi.fn(async () => 'notif-1'),
      },
    }
    vi.stubGlobal('chrome', chromeMock)
    const { create } = await import('../../src/service-worker/handlers/notifications')
    const result = await create({
      title: 'Hello',
      message: 'my token=abc123 has been issued',
    })
    expect(result.success).toBe(true)
    const callArgs = chromeMock.notifications.create.mock.calls[0][0]
    // token 等长替换为 *****（5 个字符），后接 "=abc123 has been issued"
    expect(callArgs.message).toBe('my *****=abc123 has been issued')
  })
})

describe('B26 permissions observe — 同时查 https/http', () => {
  it('返回首个非 default 值（http-only 站点不再被漏）', async () => {
    const calls: Array<{ primaryPattern: string }> = []
    const chromeMock = {
      contentSettings: {
        get: vi.fn(async ({ primaryPattern }: { primaryPattern: string }) => {
          calls.push({ primaryPattern })
          // 仅 http://… 下有 allow，https 落在 default
          if (primaryPattern.startsWith('http://')) {
            return { setting: 'allow' }
          }
          return { setting: 'default' }
        }),
      },
    }
    vi.stubGlobal('chrome', chromeMock)
    const result = await permsHandler.observe({ domain: 'example.com' })
    expect(result.success).toBe(true)
    const cookiesEntry = result.permissions?.find((p) => p.key === 'cookies')
    expect(cookiesEntry?.value).toBe('allow')
    // 必须同时调用过 http 与 https
    const patterns = calls.map((c) => c.primaryPattern)
    expect(patterns.some((p) => p.startsWith('https://'))).toBe(true)
    expect(patterns.some((p) => p.startsWith('http://'))).toBe(true)
  })
})

describe('B27 permissions update — default 提示含 clear 命令', () => {
  it('value=default 时提示使用 /permissions-clear', async () => {
    const result = await permsHandler.update({
      domain: 'example.com',
      setting: 'cookies',
      value: 'default',
    })
    expect(result.success).toBe(false)
    expect(result.suggestion).toContain('permissions-clear')
  })
})

describe('B28 navigation — chromewebstore 也在黑名单', () => {
  it('拒绝 chromewebstore.google.com', async () => {
    const result = await navHandler.navigate({
      url: 'https://chromewebstore.google.com/detail/foo',
    })
    expect(result.success).toBe(false)
    expect(result.code).toBe('PAGE_BLOCKED')
  })

  it('拒绝 chrome.google.com/webstore/...', async () => {
    const result = await navHandler.navigate({
      url: 'https://chrome.google.com/webstore/detail/foo',
    })
    expect(result.success).toBe(false)
    expect(result.code).toBe('PAGE_BLOCKED')
  })

  it('允许非 webstore 普通 https', async () => {
    const chromeMock = {
      tabs: {
        query: vi.fn(async () => [{ id: 1 }]),
        update: vi.fn(async () => ({ id: 1 })),
      },
    }
    vi.stubGlobal('chrome', chromeMock)
    const result = await navHandler.navigate({ url: 'https://example.com/page' })
    expect(result.success).toBe(true)
  })
})

describe('B34 history remove — 超量返回 truncated', () => {
  it('search 返回达到上限时返回 truncated:true', async () => {
    const fakeItems = Array.from({ length: 10000 }, (_, i) => ({
      url: `https://example.com/p${i}`,
    }))
    const chromeMock = {
      history: {
        search: vi.fn(async () => fakeItems),
        deleteUrl: vi.fn(async () => {}),
        deleteAll: vi.fn(async () => {}),
      },
    }
    vi.stubGlobal('chrome', chromeMock)
    const result = await historyHandler.remove({
      timeRange: 'today',
      query: 'foo',
    })
    expect(result.success).toBe(true)
    expect(result.truncated).toBe(true)
    expect(result.suggestion).toContain('上限')
  })
})
