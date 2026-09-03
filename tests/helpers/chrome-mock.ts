import { vi } from 'vitest'

/** 创建各 Chrome namespace 的最小 mock，测试前可通过 vi.clearAllMocks 重置调用记录。 */
export function createChromeMock() {
  const tab = {
    id: 1,
    title: 'Test',
    url: 'https://example.com',
    windowId: 1,
    groupId: -1,
    active: false,
  }
  const download = { id: 1, state: 'in_progress', paused: false, url: 'https://example.com/file' }
  const storage = {
    get: vi.fn(async () => ({ key: 'value' })),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  }
  return {
    tabs: {
      query: vi.fn(async () => [tab]),
      get: vi.fn(async () => tab),
      create: vi.fn(async () => tab),
      update: vi.fn(async () => tab),
      remove: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined),
      duplicate: vi.fn(async () => tab),
      discard: vi.fn(async () => tab),
      pause: vi.fn(),
      highlight: vi.fn(async () => ({ windowId: 1 })),
      goBack: vi.fn(async () => undefined),
      goForward: vi.fn(async () => undefined),
      captureVisibleTab: vi.fn(async () => 'data:image/png;base64,test'),
      getZoom: vi.fn(async () => 1),
      setZoom: vi.fn(async () => undefined),
      getZoomSettings: vi.fn(async () => ({ mode: 'automatic' })),
      setZoomSettings: vi.fn(async () => undefined),
      group: vi.fn(async () => 2),
      ungroup: vi.fn(async () => undefined),
    },
    downloads: {
      download: vi.fn(async () => 1),
      search: vi.fn(async () => [download]),
      pause: vi.fn(async () => undefined),
      resume: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      open: vi.fn(async () => undefined),
      erase: vi.fn(async () => 1),
      removeFile: vi.fn(async () => undefined),
      show: vi.fn(async () => undefined),
    },
    storage: { local: storage, session: storage, sync: storage, managed: { get: storage.get } },
    cookies: {
      get: vi.fn(async () => ({
        name: 'sid',
        domain: 'example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        session: true,
        value: 'secret',
      })),
      getAll: vi.fn(async () => [
        {
          name: 'sid',
          domain: 'example.com',
          path: '/',
          secure: true,
          httpOnly: true,
          session: true,
          value: 'secret',
        },
      ]),
      getAllCookieStores: vi.fn(async () => [{ id: '0', tabIds: [1] }]),
      set: vi.fn(async () => ({
        name: 'sid',
        domain: 'example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        session: true,
        value: 'secret',
      })),
      remove: vi.fn(async () => ({ name: 'sid' })),
    },
    history: {
      search: vi.fn(async () => []),
      getVisits: vi.fn(async () => []),
      deleteUrl: vi.fn(async () => undefined),
      deleteRange: vi.fn(async () => undefined),
      deleteAll: vi.fn(async () => undefined),
    },
    contentSettings: {
      get: vi.fn(async () => ({ setting: 'default' })),
      set: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    },
    notifications: {
      create: vi.fn(async () => 'notification-1'),
      update: vi.fn(async () => true),
      clear: vi.fn(async () => true),
      getAll: vi.fn(async () => ({})),
    },
  }
}
