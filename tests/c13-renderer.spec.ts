import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * C13 阶段 5 — renderer 全覆盖验证。
 *
 * 由于 render-result.ts 间接依赖 block-renderers → .vue 组件（HistoryTable / TabList / DataTable），
 * 在 node + vitest 环境无法解析 .vue。我们改用「源码 + 关键字契约」守护测试：
 *   - 所有 P2-1/P2-2/P2-3/P2-5 要求的关键文案都能在源码里搜到
 *   - 兜底路径不再使用 JSON.stringify(r).slice(0,100)
 *   - tabs_observe / list_groups 都已接入 buildMarkdownBody
 */

const RENDER_RESULT_PATH = resolve(__dirname, '../src/shared/render-result.ts')

function readSrc(): string {
  return readFileSync(RENDER_RESULT_PATH, 'utf8')
}

describe('C13 renderer — 兜底不泄露 JSON', () => {
  it('formatResultDescription 末尾不再用 JSON.stringify(r).slice(0,100)', () => {
    const src = readSrc()
    // 唯一一处 JSON.stringify 是 markRendered 之后的 console.warn，不应出现在 description 兜底。
    expect(src).not.toMatch(/return JSON\.stringify\(r\)\.slice\(0,\s*100\)/)
  })

  it('未命中分支走"操作完成" + 字段数兜底', () => {
    const src = readSrc()
    expect(src).toMatch(/wrapCatReply\(formatResultDescription\(r\) \|\| '操作完成'\)/)
    expect(src).toMatch(/console\.warn\(\s*'\[render-result\] 未命中已知分支/)
  })
})

describe('C13 renderer — aiHidden 工具专属文案', () => {
  const src = readSrc()

  it('reload_tab 渲染专属文案', () => {
    expect(src).toMatch(/intent === 'reload_tab'[\s\S]*?已刷新.*个标签/)
    expect(src).toMatch(/intent === 'reload_tab'[\s\S]*?已刷新当前标签/)
  })

  it('move_tab 渲染移动位置文案', () => {
    expect(src).toMatch(/intent === 'move_tab'[\s\S]*?已移动 .* 个标签到第 .* 位/)
  })

  it('sort_tabs 渲染排序文案', () => {
    expect(src).toMatch(/intent === 'sort_tabs'[\s\S]*?按域名重新排序/)
  })

  it('discard_tabs 渲染休眠文案', () => {
    expect(src).toMatch(/intent === 'discard_tabs'[\s\S]*?已休眠 \$\{discarded\} 个标签/)
  })

  it('reopen_closed_tab 渲染恢复文案', () => {
    expect(src).toMatch(/intent === 'reopen_closed_tab'[\s\S]*?已恢复最近关闭的标签/)
    expect(src).toMatch(/intent === 'reopen_closed_tab'[\s\S]*?没有找到可恢复的标签/)
  })
})

describe('C13 renderer — list_groups / tabs_observe 接入 markdownFactory', () => {
  const src = readSrc()

  it('list_groups 调 buildMarkdownBody 渲染表格', () => {
    expect(src).toMatch(
      /intent === 'list_groups' \|\| intent === 'tabs_observe_groups'[\s\S]*?buildMarkdownBody\(intent, result\)/
    )
  })

  it('tabs_observe 调 buildMarkdownBody 渲染富组件', () => {
    expect(src).toMatch(/intent === 'tabs_observe'[\s\S]*?buildMarkdownBody\(intent, result\)/)
  })

  it('find_tab 同时调 buildMarkdownBody 和兜底', () => {
    expect(src).toMatch(
      /intent === 'find_tab'[\s\S]*?buildMarkdownBody\(intent, \{ success: true, tabs \}/
    )
  })

  it('未命中 markdownFactory 时 list_groups 走文案兜底', () => {
    expect(src).toMatch(
      /intent === 'list_groups' \|\| intent === 'tabs_observe_groups'[\s\S]*?当前有 \$\{groups\.length\} 个标签分组/
    )
    expect(src).toMatch(
      /intent === 'list_groups' \|\| intent === 'tabs_observe_groups'[\s\S]*?当前窗口没有标签分组/
    )
  })
})

describe('C13 renderer — 所有 aiHidden 分支都调 markRendered', () => {
  const src = readSrc()

  it('aiHidden 工具每个分支末尾都调 deps.markRendered?.()', () => {
    // 抽取出所有 aiHidden 分支，每个分支在 addAIChat 之后必须有 markRendered
    const branches = ['reload_tab', 'move_tab', 'sort_tabs', 'discard_tabs', 'reopen_closed_tab']
    for (const intent of branches) {
      const re = new RegExp(
        `intent === '${intent}'[\\s\\S]*?deps\\.addAIChat[\\s\\S]*?deps\\.markRendered\\?\\.\\(\\)`
      )
      expect(src, `分支 ${intent} 缺 markRendered`).toMatch(re)
    }
  })
})
