/**
 * 危险操作 confirmation token 的 fingerprint 校验回归测试
 *
 * 覆盖：
 *   - 基础 happy path：args 一致 → 通过
 *   - 重发路径：用户在 confirm 卡里勾选 → args 新增按工具映射的派生字段 → 仍通过
 *   - 攻击场景：替换 domain / query / nodeId 等「操作目标」字段 → 拒绝
 *   - 攻击场景：往 args 里塞攻击者可控字段（如 url）→ 拒绝
 *   - 一次性：同一 token 第二次消费 → 拒绝
 *   - 派生字段白名单按工具映射：close_tabs_by_domain / tabs_remove 等
 *     仅允许新增 tabIds；不允许新增 selectedUrls。
 *   - bookmarks_remove_node 派生字段是字符串 ID，selectedIds 必须是 string[]。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeConfirmation, issueConfirmation } from '../../src/service-worker/confirmation'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('confirmation token fingerprint 校验', () => {
  it('happy path：args 一致 → 通过', () => {
    const token = issueConfirmation('tabs_remove', { tabIds: [1, 2] })
    expect(
      consumeConfirmation(
        'tabs_remove',
        { tabIds: [1, 2], force: true, confirmationToken: token },
        token
      )
    ).toBe(true)
  })

  it('happy path：force + confirmationToken 一致 → 通过（忽略控制字段）', () => {
    const token = issueConfirmation('tabs_remove', { tabIds: [1, 2] })
    expect(
      consumeConfirmation(
        'tabs_remove',
        { tabIds: [1, 2], force: true, confirmationToken: token },
        token
      )
    ).toBe(true)
  })

  describe('重发路径：派生字段在重发时新增（按工具映射）', () => {
    it('tabs_remove{domain} 重发新增 tabIds → 通过', () => {
      const token = issueConfirmation('tabs_remove', { domain: 'baidu.com' })
      const ok = consumeConfirmation(
        'tabs_remove',
        {
          domain: 'baidu.com',
          tabIds: [10, 11],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(true)
    })

    it('close_tabs_by_domain 重发新增 tabIds → 通过', () => {
      const token = issueConfirmation('close_tabs_by_domain', { domain: 'baidu.com' })
      const ok = consumeConfirmation(
        'close_tabs_by_domain',
        {
          domain: 'baidu.com',
          tabIds: [10, 11],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(true)
    })

    it('close_duplicate_tabs 重发新增 keepIds/removeIds → 通过', () => {
      const token = issueConfirmation('close_duplicate_tabs', {})
      const ok = consumeConfirmation(
        'close_duplicate_tabs',
        {
          keepIds: [0, 1],
          removeIds: [2, 3],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(true)
    })

    it('history_remove 重发新增 selectedUrls → 通过', () => {
      const token = issueConfirmation('history_remove', { query: 'github' })
      const ok = consumeConfirmation(
        'history_remove',
        {
          query: 'github',
          selectedUrls: ['https://github.com/foo'],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(true)
    })

    it('cookies_remove 重发新增 selectedNames → 通过', () => {
      const token = issueConfirmation('cookies_remove', { domain: 'example.com' })
      const ok = consumeConfirmation(
        'cookies_remove',
        {
          domain: 'example.com',
          selectedNames: ['sid'],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(true)
    })

    it('bookmarks_remove_node 重发新增字符串 selectedIds → 通过', () => {
      const token = issueConfirmation('bookmarks_remove_node', { nodeId: '42' })
      const ok = consumeConfirmation(
        'bookmarks_remove_node',
        {
          nodeId: '42',
          // bookmark ID 是字符串（与 chrome.bookmarks API 行为一致）
          selectedIds: ['42'],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(true)
    })

    it('ungroup_all 重发新增 selectedGroupIds → 通过', () => {
      const token = issueConfirmation('ungroup_all', {})
      const ok = consumeConfirmation(
        'ungroup_all',
        {
          selectedGroupIds: [1, 2],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(true)
    })
  })

  describe('按工具映射：派生字段超出白名单 → 拒绝', () => {
    it('close_tabs_by_domain 不能新增 selectedUrls（按工具白名单只允许 tabIds）', () => {
      const token = issueConfirmation('close_tabs_by_domain', { domain: 'baidu.com' })
      const ok = consumeConfirmation(
        'close_tabs_by_domain',
        {
          domain: 'baidu.com',
          tabIds: [10],
          // selectedUrls 不在 close_tabs_by_domain 的派生白名单 → 拒绝
          selectedUrls: ['https://baidu.com'],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(false)
    })

    it('history_remove 不能新增 tabIds（按工具白名单只允许 selectedUrls）', () => {
      const token = issueConfirmation('history_remove', { query: 'github' })
      const ok = consumeConfirmation(
        'history_remove',
        {
          query: 'github',
          tabIds: [99],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(false)
    })
  })

  describe('攻击场景：替换操作目标 → 拒绝', () => {
    it('tabs_remove{domain:baidu.com} 改成 domain:evil.com → 拒绝', () => {
      const token = issueConfirmation('tabs_remove', { domain: 'baidu.com' })
      const ok = consumeConfirmation(
        'tabs_remove',
        {
          domain: 'evil.com',
          tabIds: [99],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(false)
    })

    it('history_remove{query:github} 改成 query:facebook → 拒绝', () => {
      const token = issueConfirmation('history_remove', { query: 'github' })
      const ok = consumeConfirmation(
        'history_remove',
        {
          query: 'facebook',
          selectedUrls: ['https://facebook.com'],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(false)
    })

    it('bookmarks_remove_node{nodeId:42} 改成 nodeId:99 → 拒绝', () => {
      const token = issueConfirmation('bookmarks_remove_node', { nodeId: '42' })
      const ok = consumeConfirmation(
        'bookmarks_remove_node',
        {
          nodeId: '99',
          selectedIds: ['99'],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(false)
    })

    it('tabs_remove{tabIds:[1,2]} 重发时 tabIds 被改成 [9,10] → 拒绝', () => {
      const token = issueConfirmation('tabs_remove', { tabIds: [1, 2] })
      const ok = consumeConfirmation(
        'tabs_remove',
        {
          tabIds: [9, 10],
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(false)
    })
  })

  describe('攻击场景：往 args 塞非白名单字段 → 拒绝', () => {
    it('重发时新增 url 字段（攻击者替换关闭 URL）→ 拒绝', () => {
      const token = issueConfirmation('tabs_remove', { domain: 'baidu.com' })
      const ok = consumeConfirmation(
        'tabs_remove',
        {
          domain: 'baidu.com',
          tabIds: [10],
          url: 'https://evil.com', // ← 攻击者注入的字段
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(false)
    })

    it('重发时新增 evilField（任意未知字段）→ 拒绝', () => {
      const token = issueConfirmation('tabs_remove', { domain: 'baidu.com' })
      const ok = consumeConfirmation(
        'tabs_remove',
        {
          domain: 'baidu.com',
          evilField: 'pwned',
          force: true,
          confirmationToken: token,
        },
        token
      )
      expect(ok).toBe(false)
    })
  })

  describe('一次性 / 过期', () => {
    it('同一 token 第二次消费 → 拒绝', () => {
      const token = issueConfirmation('tabs_remove', { domain: 'baidu.com' })
      const ok1 = consumeConfirmation(
        'tabs_remove',
        { domain: 'baidu.com', tabIds: [10], force: true, confirmationToken: token },
        token
      )
      const ok2 = consumeConfirmation(
        'tabs_remove',
        { domain: 'baidu.com', tabIds: [10], force: true, confirmationToken: token },
        token
      )
      expect(ok1).toBe(true)
      expect(ok2).toBe(false)
    })

    it('token 不存在 → 拒绝', () => {
      expect(
        consumeConfirmation(
          'tabs_remove',
          { tabIds: [1], force: true, confirmationToken: 'fake-token' },
          'fake-token'
        )
      ).toBe(false)
    })

    it('token 不是字符串 → 拒绝', () => {
      expect(
        consumeConfirmation(
          'tabs_remove',
          { tabIds: [1], force: true, confirmationToken: 123 },
          123
        )
      ).toBe(false)
    })

    it('tool 名不一致 → 拒绝', () => {
      const token = issueConfirmation('tabs_remove', { domain: 'baidu.com' })
      expect(
        consumeConfirmation(
          'cookies_remove',
          { domain: 'baidu.com', tabIds: [10], force: true, confirmationToken: token },
          token
        )
      ).toBe(false)
    })
  })
})
