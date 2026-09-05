import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as themeFont from '../../src/service-worker/handlers/theme-font'

const chromeMock = {
  bookmarks: {
    get: vi.fn(async () => [{ id: '1', title: 'Bookmark', url: 'https://example.com' }]),
    getChildren: vi.fn(async () => [{ id: '2', title: 'Child' }]),
    getSubTree: vi.fn(async () => [{ id: '1', title: 'Folder', children: [] }]),
    search: vi.fn(async () => [{ id: '1', title: 'Bookmark', url: 'https://example.com' }]),
    getRecent: vi.fn(async () => [{ id: '1', title: 'Bookmark', url: 'https://example.com' }]),
    update: vi.fn(async () => ({ id: '1', title: 'x', url: 'https://x.com' })),
  },
}
vi.stubGlobal('chrome', chromeMock)
beforeEach(() => vi.clearAllMocks())

describe('theme handlers', () => {
  it('updateTheme 必须返回 NOT_SUPPORTED（不能静默成功）', async () => {
    const result = await themeFont.updateTheme({ mode: 'dark' })
    expect(result.success).toBe(false)
    expect(result.code).toBe('NOT_SUPPORTED')
  })
})
