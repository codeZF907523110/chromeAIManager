import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeClientExec } from '../src/shared/client-exec'

const chromeMock = {
  tabs: {
    get: vi.fn(async (id: number) => ({ id })),
    group: vi.fn(async () => 2),
    ungroup: vi.fn(async () => undefined),
    query: vi.fn(async () => [{ id: 1 }]),
  },
  tabGroups: {
    get: vi.fn(async (id: number) => ({ id, title: 'Work' })),
    update: vi.fn(async () => ({ id: 2, title: 'Work' })),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('client exec', () => {
  it('创建分组并回读成员', async () => {
    const result = await executeClientExec({
      clientExec: 'tabs_group_create',
      tabIds: [1],
      title: 'Work',
    })
    expect(result?.success).toBe(true)
    expect(chromeMock.tabs.group).toHaveBeenCalled()
    expect(chromeMock.tabGroups.get).toHaveBeenCalledWith(2)
  })
  it('拒绝重复 tabId', async () => {
    const result = await executeClientExec({
      clientExec: 'tabs_group_move',
      groupId: 2,
      tabIds: [1, 1],
    })
    expect(result?.success).toBe(false)
    expect(result?.code).toBe('INVALID_PARAMS')
  })
  it('未知 clientExec 返回 null', async () => {
    expect(await executeClientExec({ clientExec: 'unknown' })).toBeNull()
  })
})
