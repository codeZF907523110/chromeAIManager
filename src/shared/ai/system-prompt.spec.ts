import { describe, it, expect } from 'vitest'

import { buildSystemPrompt, type ContextSnapshot } from './system-prompt'
import { COMMANDS } from '../commands'

/**
 * system-prompt 段落守护：保证规划规则 7 段与 7 条规则全部存在且不依赖硬编码示例。
 * 工具清单保护：保证核心 intent 仍暴露给 AI。
 */
const EMPTY_CTX: ContextSnapshot = {
  activeTab: null,
  tabsSummary: '无标签',
  bookmarkFolders: [],
  windows: [],
}

describe('buildSystemPrompt — 规划规则段落（C13 重构）', () => {
  const prompt = buildSystemPrompt(EMPTY_CTX)

  it('包含「规划规则」段', () => {
    expect(prompt).toMatch(/## 规划规则/)
  })

  it('包含 7 条规则标题（规则 1 ~ 规则 7）', () => {
    for (let i = 1; i <= 7; i++) {
      expect(prompt).toMatch(new RegExp(`### 规则 ${i}：`))
    }
  })

  it('规则 1 描述"先识别用户语义动词"，并列出动词族映射', () => {
    expect(prompt).toMatch(/### 规则 1：先识别用户语义动词，再选工具族/)
    expect(prompt).toMatch(/close-remove/)
    expect(prompt).toMatch(/reload-refresh/)
    expect(prompt).toMatch(/switch-find/)
  })

  it('规则 2 强制 mutation 优先于 observe', () => {
    expect(prompt).toMatch(/### 规则 2：mutation 优先于 observe/)
    expect(prompt).toMatch(/半成品/)
  })

  it('规则 3 给出专用工具 vs 通用工具决策表', () => {
    expect(prompt).toMatch(/### 规则 3：专用工具 vs 通用工具的决策/)
    expect(prompt).toMatch(/tabs_reload/)
    expect(prompt).toMatch(/find_tab/)
    expect(prompt).toMatch(/tabs_duplicate/)
    expect(prompt).toMatch(/pin_tab/)
  })

  it('规则 4 列出禁忌工具 tabs_update', () => {
    expect(prompt).toMatch(/### 规则 4：禁忌工具/)
    expect(prompt).toMatch(/tabs_update/)
    expect(prompt).toMatch(/AI 不要直接选/)
  })

  it('规则 5 描述"先查询再修改"的边界', () => {
    expect(prompt).toMatch(/### 规则 5：先查询再修改/)
    expect(prompt).toMatch(/跳过 observe/)
  })

  it('规则 6 描述批量直接调用专用工具', () => {
    expect(prompt).toMatch(/### 规则 6：批量直接调用专用工具/)
    expect(prompt).toMatch(/mute_tabs_by_domain/)
  })

  it('规则 7 给出未知意图走闲聊的兜底', () => {
    expect(prompt).toMatch(/### 规则 7：未知意图走闲聊/)
    expect(prompt).toMatch(/chat/)
  })

  it('包含「参数规范」段（domain / query / url 三类规范）', () => {
    expect(prompt).toMatch(/## 参数规范/)
    expect(prompt).toMatch(/domain：/)
    expect(prompt).toMatch(/query：/)
    expect(prompt).toMatch(/url：/)
  })

  it('包含「错误模式」段，作为自检清单', () => {
    expect(prompt).toMatch(/## 错误模式/)
    expect(prompt).toMatch(/自检清单/)
  })

  it('【C13 重构】不再包含 7 个硬编码"完整规划示例"', () => {
    expect(prompt).not.toMatch(/## 完整规划示例/)
    expect(prompt).not.toMatch(/### 示例 1：单步操作/)
    expect(prompt).not.toMatch(/### 示例 2：先查询再操作/)
    expect(prompt).not.toMatch(/### 示例 3：多步链/)
    expect(prompt).not.toMatch(/### 示例 4：清 cookie/)
    expect(prompt).not.toMatch(/### 示例 5：批量静音/)
    expect(prompt).not.toMatch(/### 示例 6：切换到指定标签/)
    expect(prompt).not.toMatch(/### 示例 7：刷新当前窗口所有标签/)
  })

  it('【C13 重构】示例中的反例（baidu / 完整 JSON 字面）保留在规则 2 解释里', () => {
    // 反例字面量仍可作为规则解释存在，但不再单独成段
    expect(prompt).toMatch(/baidu\.com/)
    expect(prompt).toMatch(/github/)
    expect(prompt).toMatch(/cookies_observe/)
    expect(prompt).toMatch(/半成品/)
  })

  it('【C13 P2-4】pin_tab toggle 语义在 prompt 里明确标注（专用工具段 + 错误模式）', () => {
    // 规则 3 已经写「固定/取消固定当前标签 → pin_tab（toggle 语义…）」；
    // 这里再加一道守护，避免有人未来删掉 toggle 文案。
    expect(prompt).toMatch(/pin_tab.*toggle 语义/)
    expect(prompt).toMatch(/根据当前 pinned 状态自动切换/)
  })
})

describe('buildSystemPrompt — 语义聚类工具清单', () => {
  const prompt = buildSystemPrompt(EMPTY_CTX)

  it('工具按语义族分组（close-remove / reload-refresh / switch-find 三个族标题同时出现）', () => {
    expect(prompt).toMatch(/### close-remove 族|close-remove/)
    expect(prompt).toMatch(/reload-refresh/)
    expect(prompt).toMatch(/switch-find/)
  })

  it('mutation 族（close-remove）排在 observe 族（data-read）之前', () => {
    const closeIdx = prompt.indexOf('close-remove')
    const dataReadIdx = prompt.indexOf('data-read')
    expect(closeIdx).toBeGreaterThan(0)
    expect(dataReadIdx).toBeGreaterThan(0)
    expect(closeIdx).toBeLessThan(dataReadIdx)
  })

  it('【内部工具】族说明仍渲染 tabs_update', () => {
    expect(prompt).toMatch(/【内部工具】禁止直接选用：以下工具用于 SW 内部别名路由/)
    expect(prompt).toMatch(/- tabs_update\{/)
  })

  it('专用工具仍带 ⭐ 标识（find_tab / tabs_reload / tabs_create）', () => {
    expect(prompt).toMatch(/- find_tab\{[^\n]*⭐ /)
    expect(prompt).toMatch(/- tabs_reload\{[^\n]*⭐ /)
    expect(prompt).toMatch(/- tabs_create\{[^\n]*⭐ /)
    expect(prompt).toMatch(/- tabs_duplicate\{[^\n]*⭐ /)
    expect(prompt).toMatch(/- tabs_move\{[^\n]*⭐ /)
  })

  it('close_tabs_by_domain / mute_tabs_by_domain 出现在 close-remove / mute-toggle 族', () => {
    expect(prompt).toMatch(/- close_tabs_by_domain\{/)
    expect(prompt).toMatch(/- mute_tabs_by_domain\{/)
    expect(prompt).toMatch(/- unmute_tabs_by_domain\{/)
  })
})

describe('buildSystemPrompt — 核心原子工具暴露', () => {
  const prompt = buildSystemPrompt(EMPTY_CTX)

  const CORE_INTENTS = [
    'tabs_remove',
    'close_tabs_by_domain',
    'mute_tabs_by_domain',
    'unmute_tabs_by_domain',
    'clear_cookies',
    'screenshot',
    'tabs_create',
    'browsing_data_remove',
  ]

  for (const intent of CORE_INTENTS) {
    it(`toolList 包含 ${intent}`, () => {
      const cmd = COMMANDS.find((c) => c.intent === intent)
      expect(cmd, `COMMANDS 注册表应包含 ${intent}`).toBeDefined()
      const token = cmd?.swIntent || cmd?.intent || intent
      expect(prompt).toContain(token)
    })
  }

  it('reload_tab 不在 AI 工具清单（C13 P1-1）', () => {
    const toolSection = prompt.match(/## 工具[\s\S]*?(?=\n## )/)?.[0] ?? ''
    expect(toolSection).not.toMatch(/^- reload_tab\{/m)
    expect(toolSection).toMatch(/^- tabs_reload\{/m)
  })

  it('tabs_update 在清单但 description 被替换为禁止说明', () => {
    const toolSection = prompt.match(/## 工具[\s\S]*?(?=\n## )/)?.[0] ?? ''
    expect(toolSection).toMatch(/- tabs_update\{[^\n]*【内部工具】禁止直接选用/m)
    expect(toolSection).not.toMatch(/- tabs_update\{[^\n]*reload=true 刷新页面/m)
  })
})

describe('buildSystemPrompt — 兼容旧段落', () => {
  const prompt = buildSystemPrompt(EMPTY_CTX)

  it('保留「身份回答规则」段', () => {
    expect(prompt).toMatch(/身份回答规则/)
  })

  it('保留「当前状态」段', () => {
    expect(prompt).toMatch(/## 当前状态/)
  })

  it('保留「工具」段', () => {
    expect(prompt).toMatch(/## 工具/)
  })

  it('保留「输出格式」段', () => {
    expect(prompt).toMatch(/## 输出格式/)
  })

  it('保留「闲聊场景的回复规范」段', () => {
    expect(prompt).toMatch(/## 闲聊场景/)
  })
})

describe('buildSystemPrompt — 上下文注入', () => {
  it('activeTab 渲染为 hostname + title', () => {
    const prompt = buildSystemPrompt({
      activeTab: {
        id: 1,
        title: 'Vue 官方文档',
        url: 'https://cn.vuejs.org/',
        hostname: 'cn.vuejs.org',
      },
      tabsSummary: '1 个标签',
      bookmarkFolders: [],
      windows: [],
    })
    expect(prompt).toContain('Vue 官方文档')
    expect(prompt).toContain('cn.vuejs.org')
  })

  it('bookmarkFolders 多条用逗号分隔', () => {
    const prompt = buildSystemPrompt({
      activeTab: null,
      tabsSummary: '0',
      bookmarkFolders: [
        { id: '1', title: '技术', path: '/技术' },
        { id: '2', title: '生活', path: '/生活' },
      ],
      windows: [],
    })
    expect(prompt).toContain('技术 (1)')
    expect(prompt).toContain('生活 (2)')
  })

  it('bookmarkFolders 为空时显示"空"', () => {
    const prompt = buildSystemPrompt(EMPTY_CTX)
    expect(prompt).toMatch(/bookmark_folders: 空/)
  })

  it('activeTab 为 null 时显示"无"', () => {
    const prompt = buildSystemPrompt(EMPTY_CTX)
    expect(prompt).toMatch(/active_tab: 无/)
  })
})
