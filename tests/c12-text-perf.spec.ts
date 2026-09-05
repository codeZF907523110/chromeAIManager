/**
 * C12 验收用例：
 *   B07: ConfirmCard 不再被 allTabIds 短路，始终按用户勾选收窄。
 *   B09: persistMessage 写失败时不递归触发 addMessageLocal（避免风暴）。
 *   B14: close_tabs_by_domain / tabs_remove removed 缺失时不再伪报 0。
 *   B15: clear_cookies removed=0 区分「按域无结果」与「无域可清」。
 *   B18: usePrecompute 域名缺/无匹配时输出 unmatched+reason。
 *   B31: MessageBubble 不再用 v-html 注入 markdown。
 *   B32: MessageList onBeforeUnmount 清掉 scrollTimer。
 */

import { describe, it, expect } from 'vitest'

const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const projectRoot = path.resolve(__dirname, '..')

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8')
}

describe('B07 ConfirmCard 收窄用户勾选', () => {
  it('ConfirmCard.vue 不再用 allTabIds 短路 selectedTabIds', () => {
    const src = readSrc('src/components/ConfirmCard.vue')
    // 旧实现里直接 `selectedTabIds = props.allTabIds || localItems.filter(...)`；
    // 修复后只用 localItems.filter 出来的 tabIds，allTabIds 仅作默认全选标记。
    expect(src).not.toMatch(/selectedTabIds\s*=\s*props\.allTabIds/)
    expect(src).toMatch(/selectedTabIds\s*=\s*localItems\.value/)
  })
})

describe('B09 persistMessage 写失败不再递归 addMessageLocal', () => {
  it('useAIEngine.ts 中 persistMessage 失败路径只 console.warn', () => {
    const src = readSrc('src/composables/useAIEngine.ts')
    const persistBlock = src.match(/async function persistMessage[\s\S]*?^\s*\}/m)
    expect(persistBlock, 'persistMessage 块必须存在').toBeTruthy()
    if (persistBlock) {
      // catch 分支不再调 addMessageLocal（会再触发 persistMessage 形成风暴）
      expect(persistBlock[0]).not.toMatch(/catch[\s\S]*?addMessageLocal\(/)
    }
  })
})

describe('B14 tabs_remove / close_tabs_by_domain 文案分情况', () => {
  it('render-result.ts 中 removed 缺失时走"标签操作完成"兜底', () => {
    const src = readSrc('src/shared/render-result.ts')
    expect(src).toMatch(/intent === 'tabs_remove' \|\| intent === 'close_tabs_by_domain'/)
    // removed 缺失分支存在"没有可关闭的标签"
    expect(src).toMatch(/没有可关闭的标签/)
    // 兜底"标签操作完成"
    expect(src).toMatch(/标签操作完成/)
  })
})

describe('B15 clear_cookies removed=0 区分语义', () => {
  it('clear_cookies 处理逻辑同时存在「有域无 cookie」与「无域空 cookie」分支', () => {
    const src = readSrc('src/shared/render-result.ts')
    expect(src).toMatch(/当前没有 \$\{domain\} 的 Cookie 可清除/)
    expect(src).toMatch(/Cookie 已是空的，无需清理/)
  })
})

describe('B18 usePrecompute 域名反馈', () => {
  it('close_tabs_by_domain 缺/无匹配返回 unmatched+reason', () => {
    const src = readSrc('src/composables/usePrecompute.ts')
    expect(src).toMatch(/missing_domain/)
    expect(src).toMatch(/'no_match'/)
    // 域名 trim 必做
    expect(src).toMatch(/slots\.domain\.trim\(\)/)
  })
})

describe('B31 MessageBubble 不用 v-html 注入 markdown', () => {
  it('contentEl 不再使用 v-html', () => {
    const src = readSrc('src/components/MessageBubble.vue')
    // template 区域里没有 v-html="renderedHtml"
    expect(src).not.toMatch(/v-html="renderedHtml"/)
    // 引入 applyMarkdownHtml 替代
    expect(src).toMatch(/applyMarkdownHtml/)
  })
})

describe('B32 MessageList onBeforeUnmount 清 scrollTimer', () => {
  it('MessageList.vue 引入 onBeforeUnmount 并 clearTimeout', () => {
    const src = readSrc('src/components/MessageList.vue')
    expect(src).toMatch(/import\s*\{[^}]*onBeforeUnmount[^}]*\}\s*from\s*'vue'/)
    expect(src).toMatch(/onBeforeUnmount\(\(\)\s*=>\s*\{[\s\S]*?clearTimeout\(scrollTimer\)/)
  })
})
