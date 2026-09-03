/**
 * 斜杠命令运行器 — 自包含子系统
 *
 * 职责（与 AI 侧完全解耦）：
 *   - 解析用户斜杠输入（matchSlashCommand）
 *   - 危险命令构造独立确认卡（generateConfirmPreview）
 *   - SW dispatch（MSG_EXECUTE）+ precompute
 *   - 客户端命令路由（record_screen / stop_recording）
 *   - 结果渲染（通过 deps.renderExecutionResult / deps.addMessage 注入）
 *   - 嵌入按钮路径（dispatchToSW 供 MessageBubble 调用）
 *   - 录制生命周期（createRecordingExecutor + onScopeDispose）
 *
 * 与 useAIEngine / usePlanRunner 共享：底层 service-worker handler / commands.ts /
 * precompute / shared/render-result。不共享任何业务状态。
 */

import { onScopeDispose } from 'vue'
import { getCommand } from '../shared/commands'
import { MSG_EXECUTE } from '../shared/constants'
import { SLASH_COMMANDS, matchSlashCommand } from '../shared/slash-commands'
import { generateConfirmPreview } from '../shared/confirm'
import { findDuplicateGroups } from '../service-worker/utils/tab-matcher'
import { contextCache, precompute, refreshContext } from './usePrecompute'
import { renderExecutionResult } from '../shared/render-result'
import {
  createRecordingExecutor,
  type RecordingExecutor,
  type RecordingKind,
} from '../recording/executor'
import type { ConfirmCardData, ExecutionResult, MessageBody, MessageLog } from '../types'

/** 斜杠 runner 需要的外部依赖（由 App.vue 注入） */
export interface SlashRunnerDeps {
  /** 写入任意通道（ai-chat / system）的统一入口 */
  addMessage: (
    type: MessageLog['type'],
    text: string | MessageBody,
    image?: string,
    video?: string,
    recordingFile?: MessageLog['recordingFile']
  ) => void
  /** 清空所有聊天记录（/clear-chat 调用） */
  clearMessages: () => void
  /** 设置当前确认卡（由 App.vue 接管渲染） */
  setPendingConfirm: (value: ConfirmCardData | null) => void
  /** /reset 调用：中断当前 AI plan */
  cancelPlan: () => void
  /**
   * 截图 dataUrl → 渲染气泡 + 复制到剪贴板。
   * 副作用由调用方实现，本 runner 不直接写剪贴板。
   */
  showScreenshot: (dataUrl: string, tabTitle?: string) => void
}

/** 斜杠 runner 暴露给外部的接口 */
export interface SlashRunner {
  /** 处理一条斜杠命令文本 */
  run: (text: string) => Promise<void>
  /** 给嵌入按钮调用：发送 SW 消息并渲染结果 */
  dispatchToSW: (intent: string, slots: Record<string, unknown>) => Promise<ExecutionResult | null>
  /** AI 不可用时的降级提示文案 */
  formatSlashCommands: () => string
}

/** 创建独立的斜杠命令控制器，完全不依赖 AI runner */
export function useSlashCommandRunner(deps: SlashRunnerDeps): SlashRunner {
  // ──── 录制执行器（slash 专属，生命周期归 slash runner 管） ────
  const recordingExecutor: RecordingExecutor = createRecordingExecutor({
    addSystemMessage: (text) => deps.addMessage('system', text),
    addAIChat: (text, recordingFile) => {
      if (recordingFile) {
        // 录制完成卡：通过 deps.addMessage 第 5 个参数传入 recordingFile
        // Markdown 部分留空，MessageBubble 会渲染 recording-file-card
        deps.addMessage(
          'ai-chat',
          { markdown: text || `${recordingFile.name}` },
          undefined,
          undefined,
          recordingFile
        )
      } else if (text) {
        deps.addMessage('ai-chat', text)
      }
    },
    addErrorMessage: (text) => deps.addMessage('system', text),
  })

  onScopeDispose(() => {
    recordingExecutor.dispose()
  })

  // ──── 渲染依赖（注入 shared/render-result） ────
  function renderResult(
    intent: string,
    response: unknown,
    slots?: Record<string, unknown>
  ): Promise<void> {
    return renderExecutionResult(intent, response, slots, {
      addAIChat: (text) => deps.addMessage('ai-chat', text),
      addSystem: (text) => deps.addMessage('system', text),
      showScreenshot: (dataUrl, tabTitle) => deps.showScreenshot(dataUrl, tabTitle),
    })
  }

  // ──── 客户端命令路由（录制） ────
  async function executeClient(intent: string): Promise<ExecutionResult | null> {
    if (intent === 'record_screen') {
      return recordingExecutor.start('screen' as RecordingKind)
    }
    if (intent === 'stop_recording') {
      return recordingExecutor.stop()
    }
    return null
  }

  // ──── /find 命令：前端直接完成搜索，返回 DataTable ────
  async function executeFindTab(slots: Record<string, unknown>): Promise<ExecutionResult | null> {
    const query = typeof slots.query === 'string' ? slots.query : ''
    if (!query) return null
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true })
      const matching = tabs.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(query.toLowerCase()) ||
          (t.url || '').toLowerCase().includes(query.toLowerCase())
      )
      // 返回 tabs 数组，render-result 会用 tabsSearchMarkdownBody 渲染 DataTable
      return { success: true, tabs: matching }
    } catch {
      return null
    }
  }

  // ──── SW dispatch（precompute + chrome.runtime.sendMessage） ────
  async function sendToSW(
    intent: string,
    slots: Record<string, unknown>,
    render: boolean
  ): Promise<ExecutionResult> {
    let payload = slots
    const command = getCommand(intent)
    if (command?.requiresPrecompute) {
      await refreshContext()
      payload = { ...slots, ...(await precompute(intent, slots)) }
    }
    try {
      // 用原始 intent（find_tab）而不是 swIntent（tabs_update），让参数校验能找到正确的契约
      const response = (await chrome.runtime.sendMessage({
        type: MSG_EXECUTE,
        command: { intent, payload },
      })) as ExecutionResult
      if (render) await renderResult(intent, response, slots)
      return response
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      deps.addMessage('system', `命令执行失败: ${message}`)
      return { success: false, code: 'COM_DISCONNECTED', message }
    }
  }

  // ──── 公开 dispatch（嵌入按钮用 + slash 内部共用） ────
  async function dispatchToSW(
    intent: string,
    slots: Record<string, unknown>
  ): Promise<ExecutionResult | null> {
    const command = getCommand(intent)
    if (!command) return null
    const clientResult = await executeClient(intent)
    if (clientResult) {
      await renderResult(intent, clientResult, slots)
      return clientResult
    }
    if (command.swIntent === null) return null
    return sendToSW(intent, slots, true)
  }

  // ──── 危险 slash 命令：构造独立确认卡 ────
  async function prepareConfirmation(
    intent: string,
    slots: Record<string, unknown>
  ): Promise<void> {
    console.log(`[AI管家] prepareConfirmation: intent=${intent}, slots=${JSON.stringify(slots)}`)
    await refreshContext()
    console.log(`[AI管家] context tabs count: ${contextCache.value?.tabs?.length ?? 0}`)
    const preview = await generateConfirmPreview(intent, slots, contextCache.value)
    console.log(
      `[AI管家] preview result: ${preview ? JSON.stringify({ title: preview.title, itemsCount: preview.items.length }) : 'null'}`
    )
    if (!preview) {
      deps.addMessage(
        'ai-chat',
        intent === 'ungroup_all' ? '当前没有任何标签分组呢' : '没有找到匹配项呢'
      )
      return
    }
    // 从 preview 中提取扩展字段（allTabIds 用于 close_duplicate_tabs 等批量操作）
    const allTabIds = (preview as unknown as Record<string, unknown>).allTabIds as
      number[] | undefined
    // 保存 preview 引用，用于 remove_bookmark 等需要访问 items 扩展字段的场景
    const previewRef = preview
    const card: ConfirmCardData = {
      title: preview.title,
      description: preview.description,
      items: preview.items,
      allTabIds,
      onConfirm: async (selectedTabIds) => {
        try {
          const payload: Record<string, unknown> = { ...slots, __preConfirmed: true }
          if (intent === 'ungroup_all') {
            // ungroup_all 使用 checkbox 勾选的 groupIds
            if (selectedTabIds.length) payload.selectedGroupIds = selectedTabIds
          } else if (intent === 'close_duplicate_tabs') {
            // close_duplicate_tabs: selectedTabIds 是用户勾选的 groupIndex 列表
            // 需要根据 groupIndex 收集对应的 tabIds
            const selectedGroupIndices = new Set(selectedTabIds)
            const selectedTabIdsList: number[] = []
            const duplicateGroups = findDuplicateGroups(
              contextCache.value?.tabs ?? [],
              slots.url as string | undefined
            )
            duplicateGroups.forEach((g, index) => {
              if (selectedGroupIndices.has(index)) {
                g.tabs.slice(1).forEach((t) => {
                  if (t.id !== undefined) selectedTabIdsList.push(t.id)
                })
              }
            })
            if (selectedTabIdsList.length) payload.tabIds = selectedTabIdsList
          } else if (intent === 'close_tabs_by_url') {
            // close_tabs_by_url: selectedTabIds 是用户勾选的 index 列表
            // 需要根据 index 收集对应的 tabIds
            const selectedIndices = new Set(selectedTabIds)
            const matching = (contextCache.value?.tabs ?? []).filter((t) => {
              if (!t.url || t.pinned) return false
              const lowerUrl = t.url.toLowerCase()
              const title = (t.title || '').toLowerCase()
              const q = ((slots.query as string) || '').toLowerCase().trim()
              return lowerUrl.includes(q) || title.includes(q)
            })
            const selectedTabIdsList = matching
              .filter((_, index) => selectedIndices.has(index))
              .map((t) => t.id)
              .filter((id): id is number => id !== undefined)
            if (selectedTabIdsList.length) payload.tabIds = selectedTabIdsList
          } else if (intent === 'remove_bookmark') {
            // remove_bookmark: selectedTabIds 是用户勾选的 index 列表
            // 需要根据 index 收集对应的 bookmarkIds
            const selectedIndices = new Set(selectedTabIds)
            const selectedBookmarkIds: string[] = []
            previewRef.items.forEach((item, index) => {
              if (selectedIndices.has(index) && item.bookmarkIds?.length) {
                selectedBookmarkIds.push(...item.bookmarkIds)
              }
            })
            if (selectedBookmarkIds.length) payload.selectedIds = selectedBookmarkIds
          } else if (intent === 'clear_cookies') {
            // clear_cookies: selectedTabIds 是用户勾选的 index 列表
            // 复用 previewRef.items 中的 bookmarkIds 字段携带 cookie name
            const selectedIndices = new Set(selectedTabIds)
            const selectedCookieNames: string[] = []
            previewRef.items.forEach((item, index) => {
              if (selectedIndices.has(index) && item.bookmarkIds?.length) {
                selectedCookieNames.push(...item.bookmarkIds)
              }
            })
            if (selectedCookieNames.length) payload.selectedNames = selectedCookieNames
          }
          await dispatchToSW(intent, payload)
        } finally {
          deps.setPendingConfirm(null)
        }
      },
      onCancel: () => {
        deps.addMessage('ai-chat', '好嘞，已帮你取消啦~')
        deps.setPendingConfirm(null)
      },
    }
    deps.setPendingConfirm(card)
  }

  // ──── 主入口：处理一条斜杠命令 ────
  async function run(text: string): Promise<void> {
    deps.setPendingConfirm(null)
    const result = matchSlashCommand(text)
    if (!result) return
    if ('error' in result) {
      deps.addMessage(
        'ai-chat',
        'error' in result && result.error === 'MISSING_ARG' && 'hint' in result && result.hint
          ? result.hint
          : '没认出来这个命令呢，要不试试 /help 看看有哪些可用的？'
      )
      return
    }
    const { intent, slots } = result
    const slotsAny = slots as Record<string, unknown>
    if (intent === 'show_help') {
      deps.addMessage('ai-chat', formatHelp())
      return
    }
    if (intent === 'clear_chat') {
      deps.clearMessages()
      return
    }
    if (intent === 'reset_context') {
      deps.cancelPlan()
      deps.addMessage('ai-chat', '已清除全部上下文，可以重新开始对话啦~')
      return
    }
    const command = getCommand(intent)
    if (!command) {
      deps.addMessage('ai-chat', '没认出来这个命令呢，要不试试 /help 看看有哪些可用的？')
      return
    }
    // 客户端命令（录制）走客户端路由，不入 SW
    if (command.clientIntent) {
      const result = await executeClient(intent)
      if (result) await renderResult(intent, result, slotsAny)
      return
    }
    // /find 直接在前端完成搜索，返回 DataTable
    if (intent === 'find_tab') {
      const result = await executeFindTab(slotsAny)
      if (result) await renderResult(intent, result, slotsAny)
      return
    }
    if (command.dangerous) {
      await prepareConfirmation(intent, slotsAny)
      return
    }
    await dispatchToSW(intent, slotsAny)
  }

  // ──── 帮助文本 ────
  function formatHelp(): string {
    const lines = ['可用命令：', '', '| 命令 | 别名 | 参数 | 说明 |', '| --- | --- | --- | --- |']
    for (const command of SLASH_COMMANDS) {
      const aliases = command.aliases?.length ? command.aliases.map((a) => `/${a}`).join('、') : '-'
      const arg = command.hasArg ? `<${command.placeholder || '参数'}>` : '-'
      lines.push(
        `| /${command.slash} | ${aliases} | ${arg} | ${command.description.replace(/\|/g, '\\|')} |`
      )
    }
    return lines.join('\n')
  }

  function formatSlashCommands(): string {
    return SLASH_COMMANDS.map((command) => `/${command.slash} — ${command.description}`).join('\n')
  }

  return { run, dispatchToSW, formatSlashCommands }
}
