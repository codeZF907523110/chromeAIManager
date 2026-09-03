import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as groups from '../../src/service-worker/handlers/tab-groups'

const chromeMock = {
  tabGroups: {
    query: vi.fn(async () => [{ id: 2, title: 'Work', color: 'blue', windowId: 1 }]),
    get: vi.fn(async (id: number) => ({ id, title: 'Work', color: 'blue', windowId: 1 })),
    update: vi.fn(async () => ({ id: 2, title: 'Updated' })),
  },
  tabs: {
    query: vi.fn(async () => [{ id: 1, title: 'Tab', url: 'https://example.com', index: 0 }]),
    get: vi.fn(async (id: number) => ({ id })),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('tab groups handlers', () => {
  it('查询真实分组和 tabIds', async () => {
    const result = await groups.query({})
    expect(result.success).toBe(true)
    expect(result.groups[0].tabIds).toEqual([1])
  })
  it('拒绝非法颜色', async () => {
    const result = await groups.query({ color: 'invalid' })
    expect(result.code).toBe('INVALID_PARAMS')
  })
  it('查询指定分组', async () => {
    const result = await groups.get({ groupId: 2 })
    expect(result.group.id).toBe(2)
  })
  it('创建请求返回 clientExec', async () => {
    const result = await groups.create({ tabIds: [1], title: 'Work' })
    expect(result.clientExec).toBe('tabs_group_create')
  })
})
