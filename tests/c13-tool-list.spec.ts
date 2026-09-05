import { describe, expect, it } from 'vitest'

import { buildSystemPrompt, type ContextSnapshot } from '../src/shared/ai/system-prompt'

const EMPTY_CTX: ContextSnapshot = {
  activeTab: null,
  tabsSummary: '无标签',
  bookmarkFolders: [],
  windows: [],
}

function getToolSection(): string {
  const prompt = buildSystemPrompt(EMPTY_CTX)
  return prompt.match(/## 工具\n([\s\S]*?)\n## /)?.[1] ?? ''
}

describe('C13 工具清单投影', () => {
  it('P1-1：reload_tab 不出现在 AI 工具清单，tabs_reload 保留', () => {
    const toolSection = getToolSection()
    expect(toolSection).not.toMatch(/^- reload_tab\{/m)
    expect(toolSection).toMatch(/^- tabs_reload\{/m)
  })

  it('P1-2：tabs_update 明确标为内部工具并禁止直接选用', () => {
    const toolSection = getToolSection()
    expect(toolSection).toMatch(/^- tabs_update\{[^\n]*\}[^\n]*【内部工具】禁止直接选用/m)
    expect(toolSection).not.toMatch(/^- tabs_update\{[^\n]*reload=true 刷新页面/m)
  })

  it('P1-3：专用工具带有语义唯一的 ⭐ 提示', () => {
    const toolSection = getToolSection()
    expect(toolSection).toMatch(/^- find_tab\{[^\n]*⭐ /m)
    expect(toolSection).toMatch(/^- tabs_reload\{[^\n]*⭐ /m)
    expect(toolSection).toMatch(/^- tabs_create\{[^\n]*⭐ /m)
    expect(toolSection).toMatch(/^- tabs_duplicate\{[^\n]*⭐ /m)
    expect(toolSection).toMatch(/^- tabs_move\{[^\n]*⭐ /m)
  })

  it('工具清单使用 userIntent 作为 plan tool 名，而不是 SW 别名', () => {
    const toolSection = getToolSection()
    expect(toolSection).toMatch(/^- close_tabs_by_domain\{/m)
    expect(toolSection).not.toMatch(/^- close_tabs_by_domain\{[^\n]*tabs_remove/m)
  })

  it('工具清单保留专用移动工具的 userIntent 投影', () => {
    const toolSection = getToolSection()
    expect(toolSection).toMatch(/^- move_tab\{[^\n]*\}[^\n]*将标签页移动到指定位置/m)
    expect(toolSection).not.toMatch(/^- tabs_move\{[^\n]*将标签页移动到指定位置/m)
  })
})

describe('C13 语义聚类工具清单（重构验证）', () => {
  // 工具族在 prompt 里渲染为中文 hint，截取族段用 hint 前缀作为锚点
  function sectionAfter(hint: string): string {
    const toolSection = getToolSection()
    const idx = toolSection.indexOf(hint)
    if (idx < 0) return ''
    const nextIdx = toolSection.indexOf('### ', idx + hint.length)
    return toolSection.slice(idx, nextIdx < 0 ? undefined : nextIdx)
  }

  it('工具按语义族分组渲染（关闭/删除、刷新/重载、切换到已有标签 三个族标题同时出现）', () => {
    const toolSection = getToolSection()
    expect(toolSection).toMatch(/### 关闭\/删除类/)
    expect(toolSection).toMatch(/### 刷新\/重载页面/)
    expect(toolSection).toMatch(/### 切换到已有标签/)
    expect(toolSection).toMatch(/### 查询\/观察类/)
  })

  it('mutation 族（关闭/删除）排在 observe 族（查询/观察）之前', () => {
    const toolSection = getToolSection()
    const closeIdx = toolSection.indexOf('关闭/删除类')
    const dataReadIdx = toolSection.indexOf('查询/观察类')
    expect(closeIdx).toBeGreaterThan(-1)
    expect(dataReadIdx).toBeGreaterThan(-1)
    expect(closeIdx).toBeLessThan(dataReadIdx)
  })

  it('mute-toggle 族（静音/休眠/固定切换）含 mute_tabs_by_domain / unmute_tabs_by_domain / pin_tab / discard_tabs', () => {
    const muteSection = sectionAfter('静音/休眠/固定切换')
    expect(muteSection).toMatch(/mute_tabs_by_domain/)
    expect(muteSection).toMatch(/unmute_tabs_by_domain/)
    expect(muteSection).toMatch(/pin_tab/)
    expect(muteSection).toMatch(/discard_tabs/)
  })

  it('switch-find 族带"切换到 X 标签"的语义注释，find_tab 出现在该族内', () => {
    const switchSection = sectionAfter('切换到已有标签')
    expect(switchSection).toMatch(/find_tab/)
    expect(switchSection).toMatch(/切到/)
  })

  it('禁忌工具 tabs_update 渲染在【内部工具】族并被改写 description', () => {
    const toolSection = getToolSection()
    expect(toolSection).toMatch(/### 【内部工具】/)
    expect(toolSection).toMatch(/- tabs_update\{/)
    expect(toolSection).toMatch(/tabs_update\{[^\n]*【内部工具】禁止直接选用/)
  })

  it('reload-refresh 族只含 tabs_reload（reload_tab 已被 P1-1 移除）', () => {
    const refreshSection = sectionAfter('刷新/重载页面')
    expect(refreshSection).toMatch(/tabs_reload/)
    expect(refreshSection).not.toMatch(/^- reload_tab\{/m)
  })
})
