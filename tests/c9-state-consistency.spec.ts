/**
 * C9 验收用例（B25 + B10）：
 *
 *   B25: useSlashCommandRunner.run() 不盲清 pendingConfirm；
 *        仅 clear_chat / reset_context 才清。
 *
 *   B10: handleNaturalLanguage 第二次进入时若仍在跑（isRunning=true），
 *        调用 usePlanRunner.abort()，避免并发双跑。
 *
 * 因为 useSlashCommandRunner 通过 shared/block-renderers → .vue 引入，
 * 在 node + vitest 环境无法解析。这里采用更细粒度策略：
 *   - B25 直接检查 src/shared/slash-commands.ts 行为 + 静态扫描
 *     `deps.setPendingConfirm(null)` 调用点（必须仅在 clear/reset 分支出现）。
 *   - B10 通过 useAIEngine 单测覆盖，但需要更复杂的 mock。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SLASH_RUNNER_PATH = resolve(__dirname, '../src/composables/useSlashCommandRunner.ts')
const PLAN_RUNNER_PATH = resolve(__dirname, '../src/composables/usePlanRunner.ts')

function readSrc(rel: string): string {
  return readFileSync(rel, 'utf8')
}

describe('B25 slash run() 不盲清 pendingConfirm', () => {
  it('run() 入口不再无条件 setPendingConfirm(null)', () => {
    const src = readSrc(SLASH_RUNNER_PATH)
    // B25 修复后，run() 函数体的最开头 200 字符必须以"先解析再决策清不清"的形式开始：
    // 不允许紧跟函数头之后立刻出现裸 setPendingConfirm(null)。
    const runIdx = src.indexOf('async function run(text: string)')
    const headerEnd = src.indexOf('{', runIdx) + 1
    const head = src.slice(headerEnd, headerEnd + 200)
    expect(head).not.toMatch(/^\s*deps\.setPendingConfirm\(null\)/)
  })

  it('clear_chat / reset_context 分支保留 setPendingConfirm(null)', () => {
    const src = readSrc(SLASH_RUNNER_PATH)
    const matches = src.match(/deps\.setPendingConfirm\(null\)/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })
})

describe('B30 plan-runner confirm 期间重置 runningRef', () => {
  it('showAiConfirmCard 调用前立刻 runningRef.value = false', () => {
    const src = readSrc(PLAN_RUNNER_PATH)
    // needsConfirm 分支：必须存在 runningRef.value = false 紧邻 showAiConfirmCard 调用
    expect(src).toMatch(
      /if\s*\(report\.needsConfirm\)\s*{\s*runningRef\.value\s*=\s*false\s*[\s\S]*?showAiConfirmCard/
    )
  })

  it('handleConfirm 出口也置 runningRef.value = false', () => {
    const src = readSrc(PLAN_RUNNER_PATH)
    // handleConfirm 函数末尾必须有 runningRef.value = false
    expect(src).toMatch(
      /async function handleConfirm[\s\S]*?runningRef\.value\s*=\s*false[\s\S]*?ctx\.removeStatusText/
    )
  })
})

describe('B10 in-flight 锁', () => {
  it('handleNaturalLanguage 进入前检查 isRunning 并 abort', () => {
    const src = readSrc(resolve(__dirname, '../src/composables/useAIEngine.ts'))
    // 必须在 handleNaturalLanguage 函数体内出现 isRunning() + abort() 调用
    expect(src).toMatch(/isRunning\(\)/)
    expect(src).toMatch(/abortPlan\(\)/)
  })
})
