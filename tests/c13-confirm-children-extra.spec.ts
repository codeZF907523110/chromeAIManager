import { describe, expect, it, vi } from 'vitest'
import { buildConfirmChildren } from '../src/service-worker/handlers'

function setChrome(value: Record<string, unknown>): void {
  ;(globalThis as unknown as { chrome: Record<string, unknown> }).chrome = value
}

function clearChrome(): void {
  delete (globalThis as unknown as { chrome?: unknown }).chrome
}

describe('buildConfirmChildren — dangerous tool coverage', () => {
  it('notifications_clear uses notificationId as the child', async () => {
    const children = await buildConfirmChildren('notifications_clear', {
      notificationId: 'notification-42',
    })

    expect(children).toEqual([{ id: 'notification-42', title: '通知 notification-42', url: '' }])
  })

  it('notifications_clear without notificationId returns no children', async () => {
    const children = await buildConfirmChildren('notifications_clear', {})
    expect(children).toBeUndefined()
  })

  it('cookies_set shows the cookie name and URL without exposing its value', async () => {
    const children = await buildConfirmChildren('cookies_set', {
      url: 'https://example.com',
      name: 'sid',
      value: 'secret-value',
    })

    expect(children).toEqual([{ id: 'sid', title: 'sid', url: 'https://example.com' }])
    expect(JSON.stringify(children)).not.toContain('secret-value')
  })

  it('content settings branches show pattern and resource', async () => {
    await expect(
      buildConfirmChildren('content_settings_set', {
        primaryPattern: 'https://*.example.com/*',
        resourceId: 'notifications',
      })
    ).resolves.toEqual([
      {
        id: 'https://*.example.com/*',
        title: 'https://*.example.com/* / notifications',
        url: '',
      },
    ])

    await expect(
      buildConfirmChildren('content_settings_clear', {
        primaryPattern: 'https://*.example.com/*',
      })
    ).resolves.toEqual([
      {
        id: 'https://*.example.com/*',
        title: 'https://*.example.com/* / ',
        url: '',
      },
    ])
  })

  it('extensions_remove resolves query against non-app extensions', async () => {
    try {
      setChrome({
        management: {
          getAll: vi.fn().mockResolvedValue([
            { id: 'ext-a', name: 'A Helper', isApp: false },
            { id: 'ext-b', name: 'B Helper', isApp: false },
            { id: 'app-a', name: 'Helper App', isApp: true },
          ]),
        },
      })

      await expect(buildConfirmChildren('extensions_remove', { query: 'helper' })).resolves.toEqual(
        [
          { id: 'ext-a', title: 'A Helper', url: 'ext-a' },
          { id: 'ext-b', title: 'B Helper', url: 'ext-b' },
        ]
      )
    } finally {
      clearChrome()
    }
  })

  it('extensions_remove prefers candidate IDs over a management lookup', async () => {
    try {
      setChrome({ management: { getAll: vi.fn() } })
      await expect(
        buildConfirmChildren('extensions_remove', { candidates: ['ext-a', 'ext-b'] })
      ).resolves.toEqual([
        { id: 'ext-a', title: '', url: 'ext-a' },
        { id: 'ext-b', title: '', url: 'ext-b' },
      ])
    } finally {
      clearChrome()
    }
  })

  it('download branches include filename and URL when lookup succeeds', async () => {
    try {
      setChrome({
        downloads: {
          search: vi.fn().mockResolvedValue([
            {
              id: 7,
              filename: 'report.pdf',
              url: 'https://example.com/report.pdf',
            },
          ]),
        },
      })

      const expected = [{ id: 7, title: 'report.pdf', url: 'https://example.com/report.pdf' }]
      await expect(buildConfirmChildren('downloads_cancel', { downloadId: 7 })).resolves.toEqual(
        expected
      )
      await expect(buildConfirmChildren('downloads_erase', { downloadId: 7 })).resolves.toEqual(
        expected
      )
    } finally {
      clearChrome()
    }
  })

  it('download lookup failure has a stable fallback child', async () => {
    try {
      setChrome({ downloads: { search: vi.fn().mockRejectedValue(new Error('unavailable')) } })
      await expect(buildConfirmChildren('downloads_erase', { downloadId: 9 })).resolves.toEqual([
        { id: 9, title: 'download 9', url: '' },
      ])
    } finally {
      clearChrome()
    }
  })

  it('cookie removal lists cookie names and paths for a domain', async () => {
    try {
      setChrome({
        cookies: {
          getAll: vi.fn().mockResolvedValue([
            { name: 'sid', path: '/' },
            { name: 'csrf', path: '/api' },
          ]),
        },
      })
      await expect(
        buildConfirmChildren('cookies_remove', { domain: 'example.com' })
      ).resolves.toEqual([
        { id: 'sid', title: 'sid', url: 'path: /' },
        { id: 'csrf', title: 'csrf', url: 'path: /api' },
      ])
    } finally {
      clearChrome()
    }
  })

  it('browsing_data_remove lists only enabled data types', async () => {
    const children = await buildConfirmChildren('browsing_data_remove', {
      dataToRemove: { cache: true, cookies: true, history: false },
    })
    expect(children).toEqual([
      { id: 'cache', title: 'cache', url: '' },
      { id: 'cookies', title: 'cookies', url: '' },
    ])
  })

  it('storage area branches show the area or requested key', async () => {
    await expect(buildConfirmChildren('storage_area_clear', { area: 'local' })).resolves.toEqual([
      { id: 'local', title: '整个 local storage', url: '' },
    ])
    await expect(
      buildConfirmChildren('storage_area_remove', { area: 'session', key: 'auth.token' })
    ).resolves.toEqual([{ id: 'auth.token', title: 'session/auth.token', url: '' }])
  })

  it('storage_area_remove prefers candidate keys', async () => {
    await expect(
      buildConfirmChildren('storage_area_remove', {
        area: 'session',
        candidates: ['key-a', 'key-b'],
      })
    ).resolves.toEqual([
      { id: 'key-a', title: '', url: 'key-a' },
      { id: 'key-b', title: '', url: 'key-b' },
    ])
  })
})
