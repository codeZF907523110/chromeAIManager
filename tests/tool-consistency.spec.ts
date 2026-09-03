import { describe, expect, it } from 'vitest'
import { findToolConsistencyIssues } from '../src/shared/tool-consistency'

describe('tool consistency', () => {
  it('当前公开命令没有悬空 handler', () => {
    const issues = findToolConsistencyIssues()
    expect(issues.filter((issue) => issue.kind === 'missing-handler')).toEqual([])
  })

  it('downloads_open 只保留唯一公开定义', () => {
    const issues = findToolConsistencyIssues()
    expect(
      issues.find((issue) => issue.name === 'downloads_open' && issue.kind === 'duplicate-tool')
    ).toBeUndefined()
  })
})
