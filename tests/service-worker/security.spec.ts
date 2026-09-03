import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchTool } from '../../src/service-worker/handlers'
import {
  isAuthorizedSender,
  validateMessageEnvelope,
} from '../../src/service-worker/message-validation'

const chromeMock = {
  storage: { session: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('service worker security', () => {
  it('拒绝未授权 sender 和非扩展 URL', () => {
    expect(isAuthorizedSender(undefined, 'ext')).toBe(false)
    expect(isAuthorizedSender({ id: 'other' }, 'ext')).toBe(false)
    expect(isAuthorizedSender({ id: 'ext', url: 'https://example.com' }, 'ext')).toBe(false)
    expect(
      isAuthorizedSender({ id: 'ext', url: 'chrome-extension://ext/sidepanel.html' }, 'ext')
    ).toBe(true)
  })

  it('拒绝未知消息字段', () => {
    expect(validateMessageEnvelope({ type: 'EXECUTE', extra: true })).toBe(false)
    expect(validateMessageEnvelope({ type: 'EXECUTE', command: { intent: 'tabs_observe' } })).toBe(
      true
    )
  })

  it('权限不足时在 handler 前拒绝工具（callback 风格 mock）', async () => {
    const permissions = {
      contains: vi.fn((_request, callback) => callback(false)),
    }
    vi.stubGlobal('chrome', { ...chromeMock, permissions })
    const result = await dispatchTool('notifications_clear', { notificationId: 'n1' })
    expect(result).toMatchObject({ success: false, code: 'PERMISSION_DENIED' })
    expect(permissions.contains).toHaveBeenCalledWith(
      { permissions: ['notifications'] },
      expect.any(Function)
    )
  })

  it('权限 Promise 风格 mock 同样生效', async () => {
    const permissions = { contains: vi.fn(async () => false) }
    vi.stubGlobal('chrome', { ...chromeMock, permissions })
    const result = await dispatchTool('notifications_clear', { notificationId: 'n1' })
    expect(result).toMatchObject({ success: false, code: 'PERMISSION_DENIED' })
  })

  it('host 工具拒绝受保护页面', async () => {
    vi.stubGlobal('chrome', { ...chromeMock, permissions: { contains: vi.fn(async () => true) } })
    const result = await dispatchTool('cookies_observe', { domain: 'chrome.google.com' })
    expect(result).toMatchObject({ success: false, code: 'PERMISSION_DENIED' })
  })

  it('未知工具不会执行', async () => {
    expect(await dispatchTool('unknown_tool', {})).toMatchObject({
      success: false,
      code: 'UNKNOWN_TOOL',
    })
  })

  it('危险操作首次调用要求确认', async () => {
    const result = await dispatchTool('notifications_clear', { notificationId: 'n1' })
    expect(result.code).toBe('NEEDS_CONFIRM')
    expect((result.detail as Record<string, unknown>).confirmationToken).toEqual(expect.any(String))
  })

  it('裸 force 不能绕过确认', async () => {
    expect(
      await dispatchTool('notifications_clear', { notificationId: 'n1', force: true })
    ).toMatchObject({ success: false, code: 'CONFIRM_INVALID' })
  })

  it('确认详情不含敏感字段', async () => {
    const first = await dispatchTool('notifications_clear', { notificationId: 'n1' })
    const detail = first.detail as Record<string, unknown>
    const payload = detail.payload as { args?: Record<string, unknown> }
    expect(payload.args).toBeDefined()
    expect(payload.args).not.toHaveProperty('password')
    expect(payload.args).not.toHaveProperty('value')
  })

  it('确认 token 只能消费一次且绑定参数', async () => {
    const first = await dispatchTool('notifications_clear', { notificationId: 'n1' })
    const token = (first.detail as Record<string, unknown>).confirmationToken
    const confirmed = await dispatchTool('notifications_clear', {
      notificationId: 'n1',
      force: true,
      confirmationToken: token,
    })
    expect(confirmed.code).not.toBe('CONFIRM_INVALID')
    const replay = await dispatchTool('notifications_clear', {
      notificationId: 'n1',
      force: true,
      confirmationToken: token,
    })
    expect(replay.code).toBe('CONFIRM_INVALID')
  })
})
