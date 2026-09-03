import { describe, expect, it } from 'vitest'
import { matchSlashCommand } from '../src/shared/slash-commands'

describe('slash command compatibility', () => {
  it('keeps storage keys in the key slot', () => {
    expect(matchSlashCommand('/storage-get theme')).toMatchObject({
      intent: 'storage_get',
      slots: { key: 'theme' },
    })
    expect(matchSlashCommand('/storage-remove theme')).toMatchObject({
      intent: 'storage_remove',
      slots: { key: 'theme' },
    })
  })

  it('keeps download command mapped to the legacy intent', () => {
    expect(matchSlashCommand('/downloads')).toMatchObject({ intent: 'open_downloads' })
  })

  it('preserves reload all and screenshot query arguments', () => {
    expect(matchSlashCommand('/reload all')).toMatchObject({
      intent: 'reload_tab',
      slots: { all: true },
    })
    expect(matchSlashCommand('/screenshot github')).toMatchObject({
      intent: 'screenshot',
      slots: { query: 'github' },
    })
  })

  it('does not turn a bare slash into the first command', () => {
    expect(matchSlashCommand('/')).toMatchObject({ error: 'UNKNOWN_SLASH' })
  })
})
