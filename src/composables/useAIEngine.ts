/**
 * AI 浏览器管家 — 主逻辑 Composable（精简版 / Plan-First）
 *
 * 本文件瘦身后保留：
 *   - handleSlashCommand / dispatchToSW / precompute（旧路径，requiresPrecompute 命令）
 *   - renderExecutionResult / addStepMessage / showConfirmCard（嵌入组件按钮 + plan 步骤渲染）
 *   - recordingExecutor / 模型管理 / IndexedDB 持久化
 *
 * 已删除（迁移到 usePlanRunner 或彻底清理）：
 *   - agentLoop / scanCurrentPage / PlanTracker / Lesson / predict / JSON 修复
 *   - sessionStorage 持久化 / SESSION_KEY
 *   - resolveAIReply（AIPlan 协议下 AI 只输出 chat.reply + thought）
 *
 * 对外 API 保持稳定（App.vue / MessageBubble.vue / CommandInput.vue 不变）。
 */

import { ref, watch, onScopeDispose } from 'vue'
import type { MessageLog, Context, ExecutionResult, MessageBody } from '../types'
import { MSG_EXECUTE } from '../shared/constants'
import { getCommand } from '../shared/commands'
import { SLASH_COMMANDS, matchSlashCommand } from '../shared/slash-commands'
import { generateConfirmPreview } from '../shared/confirm'
import { messageStore } from '../shared/message-store'
import { AIEngine } from '../shared/ai/engine'
import { wrapCatReply } from '../shared/personality'
import { buildMarkdownBody } from '../shared/block-renderers'
import { useSettings } from './useSettings'
import { createRecordingExecutor } from '../recording/executor'
import { contextCache, precompute, refreshContext } from './usePrecompute'
import type { PlanRunnerContext } from './usePlanRunner'

// ──── 模块级单例 ────

/** AI 引擎（模块级单例，供 usePlanRunner 与 useAIEngine 共用） */
export const aiEngine = new AIEngine()

// ──── 内部状态类型 ────

interface ConfirmItem {
  primary: string
  secondary: string
  /** tabId，用于 checkbox 多选时携带回执。undefined 表示不可单独选中（如说明性条目） */
  tabId?: number
  /** 初始是否选中（默认 true 表示"即将关闭"） */
  selected?: boolean
}

interface PendingConfirm {
  title: string
  description?: string
  items: ConfirmItem[]
  /**
   * 当用户通过 checkbox 选择不同条目后再确认时，回调会接收到最终选中的 tabIds。
   * 不传则表示"全选不可干预"，使用 items 中所有 tabId。
   */
  onConfirm?: (selectedTabIds: number[]) => Promise<void>
  onCancel?: () => void
}

// ──── Composable 主体 ────

export function useAIEngine() {
  // ──── 子 Composable ────
  const settingsComposable = useSettings()

  // ──── 状态 ────
  const messageLog = ref<MessageLog[]>([])
  const isSettingsOpen = ref(false)
  const isInitialized = ref(false)
  const commandInputValue = ref('')
  const pendingConfirm = ref<PendingConfirm | null>(null)

  /**
   * 当前在跑的"状态消息"id（思考中 / 执行中）。
   * 该消息是临时 system 通道，runner 通过 updateStatusText 改写它，
   * 完成后由 removeStatusText 从 messageLog 中移除。
   */
  let statusMessageId: string | null = null

  function setStatusMessage(text: string): void {
    addMessageLocal('system', text)
    // 取最新 push 的消息记录其真实 id；addMessageLocal 内部分配 UUID
    const last = messageLog.value[messageLog.value.length - 1]
    statusMessageId = last?.id ?? null
    // 状态消息也持久化（关闭重开后即使残留也能继续移除）；
    // 完成时由 removeStatusText 同步从 IndexedDB 删除。
  }

  function updateStatusText(text: string): void {
    if (!statusMessageId) {
      setStatusMessage(text)
      return
    }
    const target = messageLog.value.find((m) => m.id === statusMessageId)
    if (target) {
      target.text = { markdown: text }
    } else {
      setStatusMessage(text)
    }
  }

  function removeStatusText(): void {
    if (!statusMessageId) return
    const idx = messageLog.value.findIndex((m) => m.id === statusMessageId)
    if (idx >= 0) {
      const removed = messageLog.value.splice(idx, 1)[0]
      // 状态消息是临时通道，不写入 IndexedDB；已写入的需要清理
      if (removed?.id) {
        void messageStore.remove(removed.id).catch((e: unknown) => {
          console.warn('[AI管家] 移除状态消息失败:', e instanceof Error ? e.message : String(e))
        })
      }
    }
    statusMessageId = null
  }

  // ──── 初始化 AI 引擎 ────

  async function initEngine() {
    await settingsComposable.loadSettings()
    const activeModel = settingsComposable.getActiveModel()
    if (activeModel) {
      aiEngine.setModel(activeModel)
    }
    // 加载持久化的消息
    await loadPersistedMessages()
    isInitialized.value = true

    // 监听模型变化，自动同步到 aiEngine
    watch(
      () => settingsComposable.activeModelId.value,
      (newId) => {
        const model = settingsComposable.models.value.find((m) => m.id === newId)
        if (model) aiEngine.setModel(model)
      }
    )
  }

  /**
   * 加载持久化的消息
   */
  async function loadPersistedMessages() {
    try {
      const items = await messageStore.list()
      if (items.length > 0) {
        messageLog.value = items
      }
    } catch (e: unknown) {
      console.warn('[AI管家] 加载消息失败:', e instanceof Error ? e.message : String(e))
    }
  }

  /**
   * 切换当前模型
   */
  async function selectModel(modelId: string) {
    await settingsComposable.setActiveModel(modelId)
    const activeModel = settingsComposable.getActiveModel()
    if (activeModel) {
      aiEngine.setModel(activeModel)
    }
  }

  // ──── 命令处理 ────

  async function handleSlashCommand(text: string) {
    if (pendingConfirm.value) cleanup()

    const result = matchSlashCommand(text)
    if (!result) return
    if ('error' in result) {
      const errResult = result as { error?: string; hint?: string }
      if (errResult.error === 'MISSING_ARG' && errResult.hint) {
        addMessageLocal('ai-chat', wrapCatReply(errResult.hint))
      } else {
        addMessageLocal(
          'ai-chat',
          wrapCatReply('没认出来这个命令呢，要不试试 /help 看看有哪些可用的？')
        )
      }
      return
    }

    const { intent, slots } = result
    const slotsAny = slots as Record<string, unknown>
    let resolvedIntent = intent

    if (resolvedIntent === 'show_help') {
      addMessageLocal('ai-chat', wrapCatReply(formatHelp()))
      return
    }

    if (resolvedIntent === 'clear_chat') {
      clearMessages()
      return
    }

    if (resolvedIntent === 'reset_context') {
      cleanup()
      addMessageLocal('ai-chat', wrapCatReply('已清除全部上下文，可以重新开始对话啦~'))
      return
    }

    const cmd = getCommand(resolvedIntent)
    if (!cmd) {
      addMessageLocal(
        'ai-chat',
        wrapCatReply('没认出来这个命令呢，要不试试 /help 看看有哪些可用的？')
      )
      return
    }

    if (cmd.dangerous) {
      // 危险命令预览需要最新 tab 状态，强制刷新缓存
      await refreshContext()
      const preview = generateConfirmPreview(resolvedIntent, slotsAny, contextCache.value)
      if (!preview) {
        let msg: string
        if (resolvedIntent === 'ungroup_all') {
          msg = '当前没有任何标签分组呢'
        } else {
          const keyword = (slotsAny.query as string) || '当前条件'
          msg = `没找到匹配 "${keyword}" 的标签呢，要不换个关键词试试？`
        }
        addMessageLocal('ai-chat', wrapCatReply(msg))
        return
      }
      pendingConfirm.value = {
        title: preview.title,
        description: preview.description,
        items: preview.items,
        onConfirm: async (selectedTabIds: number[]) => {
          try {
            if (resolvedIntent === 'ungroup_all') {
              if (selectedTabIds.length > 0) {
                await dispatchToSW(resolvedIntent, {
                  ...slotsAny,
                  force: true,
                  selectedGroupIds: selectedTabIds,
                })
              } else {
                await dispatchToSW(resolvedIntent, { ...slotsAny, force: true })
              }
            } else if (selectedTabIds.length > 0) {
              await dispatchToSW(resolvedIntent, {
                ...slotsAny,
                force: true,
                tabIds: selectedTabIds,
              })
            } else {
              await dispatchToSW(resolvedIntent, { ...slotsAny, force: true })
            }
          } finally {
            pendingConfirm.value = null
          }
        },
        onCancel: () => {
          addMessageLocal('ai-chat', wrapCatReply('好嘞，已帮你取消啦~'))
          pendingConfirm.value = null
        },
      }
    } else {
      await dispatchToSW(resolvedIntent, slotsAny)
    }
  }

  async function handleNaturalLanguage(text: string) {
    const ai = await aiEngine.checkAvailability()
    if (!ai.available) {
      addMessageLocal(
        'system',
        `AI 不可用: ${ai.reason || '未配置'}\n\n可用斜杠命令:\n${formatSlashCommands()}`
      )
      return
    }

    if (pendingConfirm.value) {
      cleanup()
    }

    // 显示"思考中"system 消息；runner 会通过 updateStatusText 改写它
    setStatusMessage('思考中...')

    const { run: runPlan } = await import('./usePlanRunner')
    const runnerContext: PlanRunnerContext = {
      addMessage: addMessageLocal,
      updateStatusText,
      removeStatusText,
      setPendingConfirm: (value) => {
        pendingConfirm.value = value
      },
      renderExecutionResult,
    }
    try {
      await runPlan(text, runnerContext)
    } catch (e: unknown) {
      // 兜底清理状态消息，避免异常时残留
      removeStatusText()
      addMessageLocal(
        'system',
        `抱歉，处理您的请求时遇到了问题喵~（${e instanceof Error ? e.message : String(e)}）`
      )
    }
  }

  async function handleSubmit(text: string) {
    const trimmedText = text.trim()
    if (!trimmedText) return

    if (trimmedText.startsWith('/')) {
      addMessageLocal('user', trimmedText)
      try {
        await handleSlashCommand(trimmedText)
      } catch {
        addMessageLocal('system', '抱歉，处理命令时遇到了问题喵~')
      }
    } else {
      addMessageLocal('user', trimmedText)
      try {
        await handleNaturalLanguage(trimmedText)
      } catch {
        addMessageLocal('system', '抱歉，处理您的请求时遇到了问题喵~')
      }
    }
  }

  // ──── 命令执行 ────

  async function executeCommand(
    intent: string,
    slots: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const cmd = getCommand(intent)
    if (!cmd) return { error: `未知命令: ${intent}` }

    if (cmd.clientIntent) {
      if (cmd.clientIntent === 'record_screen') return await recordingExecutor.start('screen')
      if (cmd.clientIntent === 'stop_recording') return await recordingExecutor.stop()
      return {
        success: false,
        code: 'UNKNOWN_CLIENT_INTENT',
        message: `未知客户端命令: ${cmd.clientIntent}`,
      }
    }

    if (cmd.swIntent === null) return { error: `该命令不可执行: ${intent}` }

    try {
      let payload = slots
      if (cmd.requiresPrecompute) {
        payload = { ...slots, ...(await precompute(intent, slots)) }
      }
      return (await chrome.runtime.sendMessage({
        type: MSG_EXECUTE,
        command: { intent: cmd.swIntent, payload },
      })) as ExecutionResult
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      console.error('[AI Commander] Command execution error:', intent, errorMessage)
      return {
        success: false,
        code: 'COM_DISCONNECTED',
        message: '命令执行失败: ' + errorMessage,
        detail: { reason: errorMessage },
      }
    }
  }

  async function dispatchToSW(
    userIntent: string,
    slots: Record<string, unknown>
  ): Promise<ExecutionResult | null> {
    const cmd = getCommand(userIntent)
    if (!cmd) return null

    if (cmd.clientIntent) {
      return await executeCommand(userIntent, slots)
    }

    if (cmd.swIntent === null) return null

    let payload = slots
    if (cmd.requiresPrecompute) {
      // 每次执行前强制刷新 tabs 缓存，避免 30s TTL 导致用户操作后看不到最新状态
      await refreshContext()
      payload = { ...slots, ...(await precompute(userIntent, slots)) }
    }

    let response: ExecutionResult
    try {
      response = (await chrome.runtime.sendMessage({
        type: MSG_EXECUTE,
        command: { intent: cmd.swIntent, payload },
      })) as ExecutionResult
    } catch (e: unknown) {
      addMessageLocal('system', '抱歉，Service Worker 暂时无法响应喵~')
      return { success: false, code: 'SW_ERROR', message: String(e) }
    }
    await renderExecutionResult(userIntent, response, slots)
    return response
  }

  // ──── 渲染 ────

  /**
   * 渲染单步执行结果
   * - 成功 + 已注册 markdownFactory → 富组件气泡
   * - 失败 → ai-chat 通道错误提示
   * - clientExec 路径 → 在 side panel 中直接调 chrome.tabs.group / ungroup
   * - 截图 → 渲染图片气泡 + 复制到剪贴板
   * - 兜底 → formatResultDescription
   */
  async function renderExecutionResult(
    intent: string,
    response: unknown,
    slots?: Record<string, unknown>
  ) {
    void slots
    const result = response as ExecutionResult
    if (result.success === false && result.code) {
      const message = result.message || '失败'
      const suggestion = result.suggestion ? `（${result.suggestion}）` : ''
      addMessageLocal(
        'ai-chat',
        wrapCatReply(`抱歉，操作 "${message}" 失败喵${suggestion ? ' ' + suggestion : ''}`)
      )
      return
    }
    if (result.error) {
      addMessageLocal('ai-chat', wrapCatReply('抱歉，操作失败了喵~'))
      return
    }

    const r = result as Record<string, unknown>

    if (r.clientExec === 'tabs_group_by_domain' && Array.isArray(r.groups)) {
      const groups = r.groups as Array<{ title: string; tabIds: number[]; windowId: number }>
      let created = 0
      const failed: Array<{ title: string; reason: string }> = []
      for (const g of groups) {
        try {
          const validIds: number[] = []
          for (const id of g.tabIds) {
            try {
              await chrome.tabs.get(id)
              validIds.push(id)
            } catch {
              /* tab 已不存在 */
            }
          }
          if (validIds.length < 2) {
            failed.push({ title: g.title, reason: '有效 tab 数 < 2' })
            continue
          }
          const resultGroupId = await chrome.tabs.group({
            tabIds: validIds,
            createProperties: { windowId: g.windowId },
          })
          try {
            await chrome.tabGroups.update(resultGroupId, { title: g.title })
          } catch (e) {
            console.warn('[clientExec] 设置分组标题失败:', g.title, e)
          }
          created++
        } catch (e: unknown) {
          const reason = e instanceof Error ? e.message : String(e)
          failed.push({ title: g.title, reason })
        }
      }
      if (created > 0) {
        let msg = `已创建 ${created} 个分组`
        if (failed.length > 0)
          msg += `（${failed.length} 个失败: ${failed.map((f) => `${f.title}(${f.reason})`).join(', ')}）`
        addMessageLocal('ai-chat', wrapCatReply(msg))
      } else {
        addMessageLocal(
          'ai-chat',
          wrapCatReply(
            failed.length > 0
              ? `分组失败: ${failed.map((f) => `${f.title}(${f.reason})`).join('; ')}`
              : '没有需要分组的标签'
          )
        )
      }
      return
    }

    if (r.clientExec === 'tabs_ungroup_all' && Array.isArray(r.groups)) {
      const groups = r.groups as Array<{ groupId: number; tabIds: number[] }>
      let cleared = 0
      const failed: Array<{ groupId: number; reason: string }> = []
      for (const g of groups) {
        try {
          const validIds: number[] = []
          for (const id of g.tabIds) {
            try {
              await chrome.tabs.get(id)
              validIds.push(id)
            } catch {
              /* tab 已不存在 */
            }
          }
          if (validIds.length === 0) {
            failed.push({ groupId: g.groupId, reason: '组内 tab 都不存在' })
            continue
          }
          await chrome.tabs.ungroup(validIds)
          cleared++
        } catch (e: unknown) {
          const reason = e instanceof Error ? e.message : String(e)
          failed.push({ groupId: g.groupId, reason })
        }
      }
      if (cleared > 0) {
        let msg = `已取消 ${cleared} 个分组`
        if (failed.length > 0) msg += `（${failed.length} 个失败）`
        addMessageLocal('ai-chat', wrapCatReply(msg))
      } else {
        addMessageLocal(
          'ai-chat',
          wrapCatReply(
            failed.length > 0
              ? `取消分组失败: ${failed.map((f) => f.reason).join('; ')}`
              : '当前没有任何标签分组'
          )
        )
      }
      return
    }

    if (r.screenshot && typeof r.screenshot === 'string') {
      showScreenshot(r.screenshot, r.tabTitle as string | undefined)
      return
    }
    if (r.stopped) {
      return
    }

    if (intent === 'pin_tab') {
      const pinned = (r.tab as { pinned?: boolean } | undefined)?.pinned
      addMessageLocal('ai-chat', { markdown: wrapCatReply(pinned ? '已固定标签' : '已取消固定') })
      return
    }
    if (intent === 'duplicate_tab') {
      const title = (r.tab as { title?: string } | undefined)?.title
      const url = (r.tab as { url?: string } | undefined)?.url
      const label = title || url
      addMessageLocal('ai-chat', {
        markdown: wrapCatReply(label ? `已复制标签：${label}` : '已复制当前标签'),
      })
      return
    }
    if (intent === 'tabs_create') {
      const title = (r.tab as { title?: string } | undefined)?.title
      const url = (r.tab as { url?: string } | undefined)?.url
      const label = title || url
      addMessageLocal('ai-chat', {
        markdown: wrapCatReply(label ? `已创建标签：${label}` : '已创建标签'),
      })
      return
    }
    if (intent === 'add_bookmark') {
      const bm = r.bookmark as { title?: string; url?: string } | undefined
      const label = bm?.title || bm?.url
      addMessageLocal('ai-chat', {
        markdown: wrapCatReply(label ? `已添加书签：${label}` : '已添加书签'),
      })
      return
    }
    if (intent === 'remove_bookmark') {
      const node = r.removedNode as
        { title?: string; url?: string; children?: unknown[] } | undefined
      const label = node?.title || node?.url
      const removed = typeof r.removed === 'number' ? r.removed : 1
      const isFolder = node && !node.url && Array.isArray(node?.children)
      addMessageLocal('ai-chat', {
        markdown: wrapCatReply(
          label && isFolder && removed > 1
            ? `已删除文件夹：${label}（含 ${removed} 项）`
            : label
              ? `已删除书签：${label}`
              : `已删除 ${removed} 个书签`
        ),
      })
      return
    }
    if (intent === 'set_theme' || intent === 'theme_update') {
      const tr = r as Record<string, unknown>
      const mode = tr.themeMode as string | undefined
      const color = tr.themeColor as string | undefined
      if (color) {
        addMessageLocal('ai-chat', { markdown: wrapCatReply(`已设置主题颜色：${color}`) })
      } else if (mode) {
        const label: Record<string, string> = { light: '浅色', dark: '深色', device: '跟随设备' }
        addMessageLocal('ai-chat', {
          markdown: wrapCatReply(`已设置主题模式：${label[mode] || mode}`),
        })
      } else {
        addMessageLocal('ai-chat', { markdown: wrapCatReply('已设置主题') })
      }
      return
    }

    const body = buildMarkdownBody(intent, result)
    addMessageLocal(
      'ai-chat',
      body ?? { markdown: wrapCatReply(formatResultDescription(r) || '操作完成') }
    )
  }

  // ──── 辅助函数 ────

  /**
   * 结果字段解析 → 通用描述模板
   * Markdown-factory 未覆盖时的 fallback；不依赖 DOM 脚本结果。
   */
  function formatResultDescription(r: Record<string, unknown>): string {
    if (r.code === 'NEEDS_CONFIRM') return `⚠️ ${r.message}`
    if (r.code) return `[${r.code}] ${r.message || '操作失败'}`
    if (r.error) return `失败: ${typeof r.error === 'object' ? JSON.stringify(r.error) : r.error}`
    if (r.tabs) return `列出 ${r.observed || (r.tabs as unknown[]).length} 个标签`
    if (r.tab && r.active !== undefined)
      return r.active
        ? `切换到标签 *${(r.tab as { title?: string }).title || ''}*`
        : `更新标签 *${(r.tab as { title?: string }).title || ''}*`
    if (r.tab)
      return `创建标签 *${(r.tab as { title?: string }).title || (r.tab as { url?: string }).url || ''}*`
    if (r.moved !== undefined) return `移动 ${r.moved} 个标签`
    if (r.removed !== undefined) return `关闭 ${r.removed} 个标签`
    if (r.groupedTabs) return `创建分组 *${r.title || r.groupName}* (${r.groupedTabs} 个标签)`
    if (r.groupId && !r.groupedTabs) return `更新分组 *${r.title || r.groupId}*`
    if (r.ungrouped !== undefined) return `取消 ${r.ungrouped} 个分组`
    if (r.groups) return `列出 ${(r.groups as unknown[]).length} 个标签组`
    if (r.reloaded) return '刷新标签'
    if (r.pinned !== undefined) return r.pinned ? '固定标签' : '取消固定'
    if (r.discarded !== undefined) return `休眠 ${r.discarded} 个标签`
    if (r.duplicated !== undefined) return '复制标签'
    if (r.nodes) return `观察到 ${r.observed || (r.nodes as unknown[]).length} 个书签节点`
    if (r.movedNode)
      return `移动 ${(r.movedNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.movedNode as { title: string }).title}*`
    if (r.createdNode)
      return `创建 ${(r.createdNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.createdNode as { title: string }).title}*`
    if (r.existingNode)
      return `目标已存在，复用 ${(r.existingNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.existingNode as { title: string }).title}*`
    if (r.updatedNode)
      return `更新 ${(r.updatedNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.updatedNode as { title: string }).title}*`
    if (r.openedNode) return `打开书签 *${(r.openedNode as { title: string }).title}*`
    if (r.removedNode)
      return `删除 ${(r.removedNode as { nodeType: string; title: string }).nodeType === 'folder' ? '文件夹' : '书签'} *${(r.removedNode as { title: string }).title}*`
    if (r.bookmark) return `添加书签 *${(r.bookmark as { title: string }).title}*`
    if (r.windows) return `列出 ${(r.windows as unknown[]).length} 个窗口`
    if (r.window) return '创建窗口'
    if (r.items) return `搜索到 ${r.found} 条历史`
    if (r.deleted !== undefined && r.timeRange) return `删除 ${r.deleted} 条历史 (${r.timeRange})`
    if (r.deleted !== undefined) return `删除 ${r.deleted} 条记录`
    if (r.navigated) return `导航至 ${r.navigated}`
    if (r.dataUrl && !r.stopped && !r.pendingRecording) return '截图已捕获'
    if (r.zoomFactor !== undefined) return `缩放至 ${Math.round((r.zoomFactor as number) * 100)}%`
    if (r.opened) return '打开下载页面'
    if (r.themeMode !== undefined) return `主题: ${r.themeMode}`
    if (r.fontSize !== undefined) return `字号: ${r.fontSizeLabel || r.fontSize + 'px'}`
    if (r.font) return `字体: ${r.font}`
    if (r.cookies) return `查看 ${r.found || 0} 个 Cookie (${r.domain})`
    if (r.domain && r.deleted !== undefined) return `清除 ${r.domain} 的 ${r.deleted} 个 Cookie`
    if (r.sites) return `展示 ${r.found || 0} 个常用网站`
    if (r.extensions) return `列出 ${r.found || 0} 个扩展`
    if (r.id && r.enabled !== undefined) return r.enabled ? '启用扩展' : '禁用扩展'
    if (r.id && (r as { uninstalled?: string }).uninstalled) return `卸载扩展`
    if (r.permissions) return `查看 ${r.domain} 的权限设置`
    if (r.setting && r.value) return `设置 ${r.domain} 的 ${r.setting} 权限`
    if (r.key && r.value !== undefined)
      return `存储 *${r.key}* = ${typeof r.value === 'object' ? JSON.stringify(r.value) : r.value}`
    if (r.storageRemoved) return `删除存储 *${r.storageRemoved}*`
    if (r.recording === 'screen') return `开始录制屏幕`
    if (r.recording) return `开始录制 ${r.recording}`
    if (r.saved) return `录制已保存为 ${r.saved}`
    if (r.stopped) {
      const size = r.size as number | undefined
      return size ? `录制已停止 (${(size / 1024 / 1024).toFixed(1)}MB)` : '录制已停止'
    }
    if (r.restored) return `恢复标签 ${r.restored}`
    if (r.enabled) return `启用扩展 *${r.enabled}*`
    if (r.disabled) return `禁用扩展 *${r.disabled}*`
    if (r.moved && r.to) return `移动 *${r.moved}* → ${r.to}`
    if (r.reordered) return `调整 *${r.reordered}* 位置`
    if (r.sortedBookmarks) return `整理 *${r.folder}* 中 ${r.sortedBookmarks} 个书签`
    if ((r.folder as { title?: string })?.title)
      return `创建文件夹 *${(r.folder as { title: string }).title}*`
    if (r.renamed && r.to) return `重命名 *${r.renamed}* -> *${r.to}*`
    if (r.renamed) return `重命名 *${r.renamed}*`
    return JSON.stringify(r).slice(0, 100)
  }

  /**
   * 把字符串 / MessageBody 规范化为 MessageBody
   */
  function normalizeBody(text: string | MessageBody): MessageBody {
    return typeof text === 'string' ? { markdown: text } : text
  }

  function addMessageLocal(
    type: MessageLog['type'],
    text: string | MessageBody,
    image?: string,
    video?: string,
    recordingFile?: MessageLog['recordingFile']
  ): void {
    const body = normalizeBody(text)
    const msg: MessageLog = {
      type,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      text: body,
      image,
      video,
      recordingFile,
    }
    messageLog.value.push(msg)
    void persistMessage(msg)
  }

  async function persistMessage(msg: MessageLog): Promise<void> {
    try {
      await messageStore.append(msg)
    } catch (e: unknown) {
      console.warn('[AI管家] 持久化消息失败:', e instanceof Error ? e.message : String(e))
      addMessageLocal(
        'system',
        `⚠ 上一条消息保存失败：${e instanceof Error ? e.message : String(e) || '未知错误'}`
      )
    }
  }

  async function clearMessages(): Promise<void> {
    if (isInitialized.value) {
      try {
        await messageStore.clear()
      } catch (e: unknown) {
        console.warn('[AI管家] 清空消息失败:', e instanceof Error ? e.message : String(e))
        addMessageLocal(
          'system',
          `⚠ 清空聊天记录失败：${e instanceof Error ? e.message : String(e) || '未知错误'}`
        )
        return
      }
    }
    messageLog.value = []
    statusMessageId = null
  }

  async function deleteMessage(index: number): Promise<void> {
    if (index < 0 || index >= messageLog.value.length) return
    let deleteCount = 0
    const removedIds: string[] = []
    for (let i = index; i < messageLog.value.length; i++) {
      const msg = messageLog.value[i]
      if (i > index && msg.type === 'user') {
        break
      }
      deleteCount++
      if (msg.id) removedIds.push(msg.id)
    }
    if (isInitialized.value && removedIds.length > 0) {
      try {
        await messageStore.removeMany(removedIds)
      } catch (e: unknown) {
        console.warn('[AI管家] 删除消息失败:', e instanceof Error ? e.message : String(e))
        addMessageLocal(
          'system',
          `⚠ 删除消息失败：${e instanceof Error ? e.message : String(e) || '未知错误'}`
        )
        return
      }
    }
    messageLog.value.splice(index, deleteCount)
  }

  function cleanup() {
    pendingConfirm.value = null
    removeStatusText()
    // 中断 usePlanRunner 正在跑的 AI 请求
    void import('./usePlanRunner').then(({ abort }) => {
      abort()
    })
  }

  function formatHelp(): string {
    const lines: string[] = [
      '可用命令：',
      '',
      '| 命令 | 别名 | 参数 | 说明 |',
      '| --- | --- | --- | --- |',
    ]
    for (const c of SLASH_COMMANDS) {
      const cmd = `/${c.slash}`
      const aliases =
        c.aliases && c.aliases.length > 0 ? c.aliases.map((a) => `/${a}`).join('、') : '-'
      const arg = c.hasArg ? `<${c.placeholder || '参数'}>` : '-'
      const desc = c.description.replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(`| \`${cmd}\` | ${aliases} | \`${arg}\` | ${desc} |`)
    }
    return lines.join('\n')
  }

  function formatSlashCommands(): string {
    return SLASH_COMMANDS.map((c) => '/' + c.slash + ' — ' + c.description).join('\n')
  }

  function getContext(): Promise<Context> {
    return refreshContext()
  }

  /**
   * 显示截图并复制到剪贴板
   */
  function showScreenshot(dataUrl: string, tabTitle?: string) {
    addMessageLocal('ai-chat', wrapCatReply(`[截图: ${tabTitle || '页面'}]`), dataUrl)
    copyScreenshotToClipboard(dataUrl)
  }

  /**
   * 把 data URL 截图复制到剪贴板
   */
  async function copyScreenshotToClipboard(dataUrl: string) {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      console.log('[AI管家] 截图已复制到剪贴板')
    } catch (err) {
      console.warn('[AI管家] 复制截图失败:', err)
    }
  }

  function mdToHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
  }

  function toggleSettings() {
    isSettingsOpen.value = !isSettingsOpen.value
  }

  // ──── 录制执行器 ────
  const recordingExecutor = createRecordingExecutor({
    addSystemMessage: (text) => addMessageLocal('system', text),
    addAIChat: (text, recordingFile) => {
      if (recordingFile) {
        addMessageLocal('ai-chat', { markdown: '' }, undefined, undefined, recordingFile)
      } else if (text) {
        addMessageLocal('ai-chat', text)
      }
    },
    addErrorMessage: (text) => addMessageLocal('system', text),
  })

  onScopeDispose(() => {
    console.log('[useAIEngine] onScopeDispose → recordingExecutor.dispose')
    recordingExecutor.dispose()
  })

  // ──── 返回值 ────
  return {
    state: {
      get messageLog() {
        return messageLog.value
      },
      get isSettingsOpen() {
        return isSettingsOpen.value
      },
      get commandInputValue() {
        return commandInputValue.value
      },
    },

    aiEngine,

    addMessage: addMessageLocal,
    clearMessages,
    deleteMessage,

    handleSubmit,
    handleSlashCommand,
    handleNaturalLanguage,
    executeCommand,
    dispatchToSW,
    getContext,
    cleanup,
    mdToHtml,
    renderExecutionResult,
    toggleSettings,
    initEngine,
    selectModel,

    models: settingsComposable.models,
    activeModelId: settingsComposable.activeModelId,
    getActiveModel: settingsComposable.getActiveModel,
    addModel: settingsComposable.addModel,
    updateModel: settingsComposable.updateModel,
    deleteModel: settingsComposable.deleteModel,
    setDefaultModel: settingsComposable.setDefaultModel,

    commandInputValue,

    pendingConfirm,
  }
}
