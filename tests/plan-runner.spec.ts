import { describe, it, expect, vi } from 'vitest'

// Mock handlers module so plan-runner 不依赖真实 Chrome API
vi.mock('../src/service-worker/handlers', () => ({
  dispatchTool: vi.fn(async (tool: string, args: Record<string, unknown>) => {
    if (tool === 'NEEDS_CONFIRM_TOOL') {
      return {
        success: false,
        code: 'NEEDS_CONFIRM',
        message: '确认',
        detail: { tool, payload: args },
      }
    }
    if (tool === 'FAIL_TOOL') {
      return { success: false, code: 'INTERNAL', message: '失败' }
    }
    if (tool === 'PERMISSION_TOOL') {
      return { success: false, code: 'PERMISSION_DENIED', message: '权限不足' }
    }
    if (tool === 'observe_tabs') {
      return { success: true, tabs: [{ id: 99, title: 'foo' }] }
    }
    return { success: true, result: args }
  }),
  DANGEROUS_TOOLS: new Set(['tabs_remove', 'NEEDS_CONFIRM_TOOL']),
}))

import { executePlan } from '../src/service-worker/plan-runner'
import type { AIPlan } from '../src/shared/ai/plan-types'

describe('executePlan', () => {
  it('空 plan 直接返回 success', async () => {
    const report = await executePlan({ thought: 'hi', plan: [] })
    expect(report.success).toBe(true)
    expect(report.items).toEqual([])
  })

  it('并发执行无依赖项（deps=[]）', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'tabs_remove', args: { tabIds: [1, 2], force: true }, deps: [] },
        { id: 'p2', tool: 'bookmarks_add_current_page', args: {}, deps: [] },
      ],
    } as AIPlan)
    expect(report.success).toBe(true)
    expect(report.items).toHaveLength(2)
    expect(report.items.find((i) => i.id === 'p1')?.result.success).toBe(true)
    expect(report.items.find((i) => i.id === 'p2')?.result.success).toBe(true)
  })

  it('危险操作首次返回 NEEDS_CONFIRM', async () => {
    const report = await executePlan({
      thought: '',
      plan: [{ id: 'p1', tool: 'NEEDS_CONFIRM_TOOL', args: { x: 1 }, deps: [] }],
    } as AIPlan)
    expect(report.needsConfirm?.itemId).toBe('p1')
    expect(report.success).toBe(false)
  })

  it('force:true 跳过 NEEDS_CONFIRM（依赖 dispatchTool 真实拦截逻辑 — 这里仅 mock）', async () => {
    // 此处 mock 的 NEEDS_CONFIRM_TOOL 不检查 force，仅验证 plan-runner 调度逻辑
    const report = await executePlan({
      thought: '',
      plan: [{ id: 'p1', tool: 'NEEDS_CONFIRM_TOOL', args: { x: 1, force: true }, deps: [] }],
    } as AIPlan)
    // mock 的 NEEDS_CONFIRM_TOOL 不区分 force；plan-runner 仍会把 NEEDS_CONFIRM 作为 detail
    expect(report.needsConfirm?.itemId).toBe('p1')
  })

  it('解析 $ref 占位符', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'observe_tabs', args: {}, deps: [] },
        {
          id: 'p2',
          tool: 'bookmarks_add_current_page',
          args: { tabId: '$ref:p1.tabs[0].id', force: true },
          deps: ['p1'],
        },
      ],
    } as AIPlan)
    expect(report.items[1].result).toMatchObject({
      success: true,
      result: { tabId: 99, force: true },
    })
  })

  it('依赖图循环 → 未执行项标 BLOCKED_BY_FAILED_DEP', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'observe_tabs', args: {}, deps: ['p2'] },
        { id: 'p2', tool: 'observe_tabs', args: {}, deps: ['p1'] },
      ],
    } as AIPlan)
    expect(report.items.every((i) => i.result.code === 'BLOCKED_BY_FAILED_DEP')).toBe(true)
  })

  it('NEEDS_CONFIRM 阻断后续调度', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'NEEDS_CONFIRM_TOOL', args: { x: 1 }, deps: [] },
        {
          id: 'p2',
          tool: 'tabs_remove',
          args: { tabIds: [1], force: true },
          deps: ['p1'],
        },
      ],
    } as AIPlan)
    expect(report.needsConfirm?.itemId).toBe('p1')
    expect(report.items.find((i) => i.id === 'p2')?.result.code).toBe('BLOCKED_BY_FAILED_DEP')
  })

  it('重复 id 报错（DUPLICATE_ITEM_ID）', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'observe_tabs', args: {}, deps: [] },
        { id: 'p1', tool: 'observe_tabs', args: {}, deps: [] },
      ],
    } as AIPlan)
    expect(report.success).toBe(false)
    expect(report.items[0].result.code).toBe('DUPLICATE_ITEM_ID')
  })

  it('顶层失败不阻断其他并行项', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'FAIL_TOOL', args: {}, deps: [] },
        { id: 'p2', tool: 'bookmarks_add_current_page', args: {}, deps: [] },
      ],
    } as AIPlan)
    expect(report.items.find((i) => i.id === 'p1')?.result.success).toBe(false)
    expect(report.items.find((i) => i.id === 'p2')?.result.success).toBe(true)
  })

  it('权限失败时依赖项被阻断', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'PERMISSION_TOOL', args: {}, deps: [] },
        { id: 'p2', tool: 'bookmarks_add_current_page', args: {}, deps: ['p1'] },
      ],
    } as AIPlan)
    expect(report.items.find((i) => i.id === 'p1')?.result.code).toBe('PERMISSION_DENIED')
    expect(report.items.find((i) => i.id === 'p2')?.result.code).toBe('BLOCKED_BY_FAILED_DEP')
  })

  it('嵌套数组/对象的 $ref 解析', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'observe_tabs', args: {}, deps: [] },
        {
          id: 'p2',
          tool: 'bookmarks_add_current_page',
          args: {
            group: { tabId: '$ref:p1.tabs[0].id', nested: { ids: ['$ref:p1.tabs[0].id'] } },
          },
          deps: ['p1'],
        },
      ],
    } as AIPlan)
    expect(report.items[1].result).toMatchObject({
      success: true,
      result: { group: { tabId: 99, nested: { ids: [99] } } },
    })
  })

  it('$ref 字段不存在时返回 REF_NOT_FOUND', async () => {
    const report = await executePlan({
      thought: '',
      plan: [
        { id: 'p1', tool: 'observe_tabs', args: {}, deps: [] },
        {
          id: 'p2',
          tool: 'bookmarks_add_current_page',
          args: { tabId: '$ref:p1.missing' },
          deps: ['p1'],
        },
      ],
    } as AIPlan)
    expect(report.items[1].result.code).toBe('REF_NOT_FOUND')
  })
})
