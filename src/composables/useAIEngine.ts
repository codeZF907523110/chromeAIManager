/**
 * AI 浏览器管家 — 主逻辑 Composable
 * 封装所有 AI 引擎、Agent 循环、命令处理的业务逻辑
 */

import { ref, readonly } from 'vue';
import type {
  ChatMessage,
  MessageLog,
  AIResponse,
  Context,
  Lesson,
  PlanTracker,
  ExecutionResult,
  DisplayMode,
} from '../types';
import {
  MSG_GET_CONTEXT,
  MSG_GET_BOOKMARKS,
  MSG_EXECUTE,
  MSG_SET_DISPLAY_MODE,
  MAX_AGENT_STEPS,
  STEP_TIMEOUT_MS,
  TOTAL_TASK_TIMEOUT_MS,
  MAX_CONSECUTIVE_FAILURES,
  MAX_MESSAGES_COUNT,
} from '../shared/constants.js';
import { COMMAND_MAP } from '../shared/commands.js';
import { matchSlashCommand, SLASH_COMMANDS } from '../sidepanel/command/slash-commands.js';
import { generateConfirmPreview } from '../sidepanel/command/confirm.js';
import { AIEngine } from '../sidepanel/ai/engine.js';
import { buildAgentSystemPrompt } from '../shared/prompts.js';
import { repairJSON } from '../shared/json-repair.js';

const SESSION_KEY = 'ai_commander_session';

interface AgentState {
  messageLog: MessageLog[];
  commandHistory: string[];
  historyIndex: number;
  historyDraft: string;
  contextCache: Context | null;
  isSettingsOpen: boolean;
  activeLoopId: string | null;
  conversationMessages: ChatMessage[] | null;
  planTracker: PlanTracker | null;
  lessons: Lesson[];
  lastScreenshot: string | null;
  displayMode: DisplayMode;
  commandInputValue: string;
}

export function useAIEngine() {
  const state = ref<AgentState>({
    messageLog: [],
    commandHistory: [],
    historyIndex: -1,
    historyDraft: '',
    contextCache: null,
    isSettingsOpen: false,
    activeLoopId: null,
    conversationMessages: null,
    planTracker: null,
    lessons: [],
    lastScreenshot: null,
    displayMode: 'sidepanel',
    commandInputValue: '',
  });

  const aiEngine = new AIEngine();
  let paletteEl: HTMLDivElement | null = null;
  let paletteCommands: typeof SLASH_COMMANDS | null = null;
  let paletteIndex = 0;

  // ──── 消息管理 ────

  function addMessage(type: MessageLog['type'], text: string) {
    state.value.messageLog.push({ type, text });
    if (state.value.messageLog.length > 100) {
      state.value.messageLog.shift();
    }
    try {
      sessionStorage.setItem(
        'ai_message_log',
        JSON.stringify(state.value.messageLog.slice(-50)),
      );
    } catch {
      // ignore
    }
  }

  // ──── Agent 主循环 ────

  async function agentLoop(userText: string) {
    const loopId =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.value.activeLoopId = loopId;

    const startTime = Date.now();
    const context = await getContext();

    const pageData = await scanCurrentPage();
    context.pageStructure = pageData;
    context.recentLessons = state.value.lessons.slice(-3);

    const systemPrompt = buildAgentSystemPrompt(context);
    let messages: ChatMessage[];

    if (state.value.conversationMessages) {
      messages = [...state.value.conversationMessages];
      messages[0] = { role: 'system', content: systemPrompt };
      messages.push({ role: 'user', content: '【用户指令】\n' + userText });
    } else {
      state.value.planTracker = null;
      state.value.lessons = [];
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '【用户指令】\n' + userText },
      ];
    }
    state.value.conversationMessages = null;

    let stepCount = 0;
    let consecutiveErrors = 0;
    let jsonRetryCount = 0;

    addMessage('system', '思考中...');

    while (stepCount < MAX_AGENT_STEPS) {
      if (state.value.activeLoopId !== loopId) return;

      if (Date.now() - startTime > TOTAL_TASK_TIMEOUT_MS) {
        addMessage('system', '任务执行超时（120 秒），已停止。');
        cleanup();
        return;
      }

      let raw: string;
      try {
        raw = await aiEngine.chatWithHistory(messages, {
          temperature: 0.2,
          maxTokens: 4096,
        });
        console.log('[AI Commander] Raw response:', raw?.slice(0, 500));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        addMessage('error', `AI 调用失败: ${message}`);
        cleanup();
        return;
      }

      let json: AIResponse | null;
      try {
        json = repairJSON(raw);
      } catch {
        json = null;
      }

      if (!json?.action) {
        const jsonMatch = raw.match(/\{[\s\S]*"action"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            json = JSON.parse(jsonMatch[0]) as AIResponse;
          } catch {
            json = null;
          }
        }
      }

      if (!json?.action) {
        jsonRetryCount++;
        if (jsonRetryCount >= 2) {
          const rawPreview = raw
            ? raw.slice(0, 200) + (raw.length > 200 ? '...' : '')
            : '(空响应)';
          addMessage('error', `抱歉，我不太理解您的请求。请尝试用更完整、更具体的方式描述。\n\nAI 返回的内容（前200字符）：${rawPreview}`);
          console.error('[AI Commander] AI failed to understand:', raw);
          cleanup();
          return;
        }
        console.warn('[AI Commander] JSON parse failed, retry', jsonRetryCount);
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content: '请重新输出，严格按照 JSON 格式，只输出 JSON 对象，不要有其他内容。',
        });
        continue;
      }
      jsonRetryCount = 0;

      if (json.action === 'done') {
        addMessage('ai-chat', json.reply || json.content || '操作完成');
        cleanup();
        return;
      }

      if (json.action === 'ask') {
        messages.push({ role: 'assistant', content: raw });
        state.value.conversationMessages = [...messages];
        state.value.activeLoopId = null;
        persistPlanTracker();
        addMessage('ai-chat', json.reply || json.content || '请提供更多信息');
        return;
      }

      if (json.action === 'scan') {
        const scanResult = await scanCurrentPage(json.toolCall?.args?.scanFilter as string);
        const scanStr = scanResult
          ? `页面扫描结果(${scanResult.totalCount || scanResult.count}元素): ${JSON.stringify(scanResult)}`
          : '扫描失败';
        messages.push({ role: 'assistant', content: raw });
        messages.push({ role: 'user', content: scanStr });
        addMessage('system', '已重新扫描页面');
        continue;
      }

      if (json.action === 'chat') {
        const reply = (json.toolCall?.args?.reply as string) || json.reply || '';
        addMessage('ai-chat', reply);
        messages.push({ role: 'assistant', content: raw });
        state.value.conversationMessages = [...messages];
        state.value.activeLoopId = null;
        persistPlanTracker();
        return;
      }

      if (json.action !== 'exec_tool' || !json.toolCall) {
        const action = json.action as string;
        if (action === 'exec' && json.toolCall) {
          json.action = 'exec_tool';
          json.toolCall = {
            name: (json.toolCall as { intent?: string }).intent || '',
            args: (json.toolCall as { slots?: Record<string, unknown> }).slots || {},
          };
        } else {
          addMessage('error', `未知 action: ${json.action}`);
          cleanup();
          return;
        }
      }

      const toolCall = json.toolCall;
      const toolName = toolCall.name;

      if (toolName === 'chat') {
        addMessage('ai-chat', toolCall.args?.reply as string || '');
        cleanup();
        return;
      }

      const thought = json.thought || '';
      stepCount++;
      addMessage('system', `执行中... (${stepCount}/${MAX_AGENT_STEPS})`);

      let result: ExecutionResult;
      try {
        result = await Promise.race([
          executeCommand(toolName, toolCall.args || {}),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('ACT_TIMEOUT')), STEP_TIMEOUT_MS),
          ),
        ]);
      } catch {
        result = {
          success: false,
          code: 'ACT_TIMEOUT',
          message: '操作执行超时（10 秒未完成）',
          detail: { reason: '单步操作超过 ' + STEP_TIMEOUT_MS / 1000 + ' 秒' },
        };
      }

      if (result.success === false && result.code === 'NEEDS_CONFIRM') {
        addMessage('system', `⚠️ ${result.message}`);
        return;
      }

      if (result.success === false && result.code) {
        consecutiveErrors++;
      } else if (result.error) {
        consecutiveErrors++;
      } else {
        consecutiveErrors = 0;
      }

      updatePlanTracker(userText, json.plan, thought, toolName, result);

      if (json.predict && !result.error && !result.code) {
        const mismatch = verifyPredict(json.predict, result);
        if (mismatch) {
          messages.push({ role: 'system', content: mismatch });
        }
      }

      const errMsg = result.code
        ? `[${result.code}] ${result.message || ''}`
        : result.error;
      if (errMsg) {
        addLesson(userText, toolName, errMsg);
      }

      messages.push({ role: 'assistant', content: raw });
      const sanitized = sanitizeResult(result);
      messages.push({
        role: 'user',
        content: `执行结果(${toolName}): ${JSON.stringify(sanitized)}`,
      });

      if (result.result === undefined) {
        messages.push({
          role: 'system',
          content: '脚本返回 undefined，通常表示脚本里没有写 return。请补上明确的 return 后重试。',
        });
      } else if (result.result === null) {
        messages.push({
          role: 'system',
          content: '脚本返回 null，通常表示选择器未命中目标元素，或脚本主动返回了空值。',
        });
      }

      if (
        (result.triggered || result.result !== undefined) &&
        !result.error &&
        !result.code
      ) {
        const postScan = await scanCurrentPage();
        if (postScan?.elements?.length) {
          messages.push({
            role: 'system',
            content: `[自动验证] 操作后页面状态(${postScan.totalCount || postScan.count}元素): ${JSON.stringify(postScan)}`,
          });
        }
      }

      if (toolName === 'screenshot' && result.screenshot) {
        state.value.lastScreenshot = result.screenshot as string;
      }

      addMessage(
        'system',
        `[${stepCount}] 💭 ${thought}\n    ${formatStepSummary(result, toolName)}`,
      );

      if (messages.length > MAX_MESSAGES_COUNT) {
        compressMessages(messages);
      }

      if (consecutiveErrors >= MAX_CONSECUTIVE_FAILURES) {
        addMessage('system', `连续 ${consecutiveErrors} 步执行失败，已停止。`);
        cleanup();
        return;
      }

      addMessage('system', '思考中...');
    }

    addMessage(
      'ai-chat',
      '已达到最大执行步数。任务可能未完成，请继续告诉我下一步。',
    );
    cleanup();
  }

  // ──── 命令处理 ────

  async function handleSlashCommand(text: string) {
    if (state.value.activeLoopId) cleanup();

    const result = matchSlashCommand(text);
    if (!result) {
      addMessage('error', '未知命令。输入 /help 查看可用命令');
      return;
    }
    if (result.error) {
      addMessage('error', `未知命令: "${text}"。可用命令: ${SLASH_COMMANDS.map((c) => '/' + c.slash).join(', ')}`);
      return;
    }

    const { intent, slots } = result;
    const slotsAny = slots as Record<string, unknown>;
    let resolvedIntent = intent;
    if (intent === 'get_theme' && (slotsAny.mode || slotsAny.color)) resolvedIntent = 'set_theme';
    if (intent === 'get_font_size' && slotsAny.size) resolvedIntent = 'set_font_size';
    if (intent === 'get_font_family' && slotsAny.family) resolvedIntent = 'set_font_family';

    if (resolvedIntent === 'show_help') {
      addMessage('system', formatHelp(SLASH_COMMANDS));
      return;
    }

    const cmd = COMMAND_MAP[resolvedIntent as string];
    if (!cmd) {
      addMessage('error', `未知意图: ${resolvedIntent}`);
      return;
    }

    if (cmd.dangerous) {
      const context = await getContext();
      const preview = generateConfirmPreview(resolvedIntent, slotsAny, context) as any;
      if (preview) {
        addMessage('system', `⚠️ ${preview.title}`);
      } else {
        addMessage('system', '没有需要操作的内容');
      }
    } else {
      await dispatchToSW(resolvedIntent as string, slotsAny);
    }
  }

  async function handleNaturalLanguage(text: string) {
    const ai = await aiEngine.checkAvailability();
    if (!ai.available) {
      addMessage(
        'system',
        `AI 不可用: ${ai.reason || '未配置'}\n\n可用斜杠命令:\n${formatSlashCommands()}`,
      );
      return;
    }

    if (state.value.activeLoopId) {
      if (state.value.conversationMessages) {
        cleanup();
      } else {
        await new Promise((resolve) => {
          const check = () => {
            if (!state.value.activeLoopId) resolve(true);
            else setTimeout(check, 100);
          };
          check();
        });
        await new Promise((r) => setTimeout(r, 3000));
        if (state.value.activeLoopId) cleanup();
      }
    }

    await agentLoop(text);
  }

  async function handleSubmit() {
    const text = state.value.commandInputValue.trim();
    if (!text) return;

    state.value.commandInputValue = '';
    addMessage('user', text);

    if (!state.value.commandHistory.includes(text)) {
      state.value.commandHistory.push(text);
    }
    state.value.historyIndex = -1;
    state.value.historyDraft = '';

    try {
      if (text.startsWith('/')) {
        await handleSlashCommand(text);
      } else {
        await handleNaturalLanguage(text);
      }
    } catch (error) {
      addMessage('error', error instanceof Error ? error.message : String(error));
    }
  }

  // ──── 工具函数 ────

  async function executeCommand(
    intent: string,
    slots: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const cmd = COMMAND_MAP[intent];
    if (!cmd || cmd.swIntent === null) return { error: `未知命令: ${intent}` };

    try {
      let payload = slots;
      if (cmd.requiresPrecompute) {
        payload = await precompute(intent, slots);
      }
      return await chrome.runtime.sendMessage({
        type: MSG_EXECUTE,
        command: { intent: cmd.swIntent, payload },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        code: 'COM_DISCONNECTED',
        message: '命令执行失败: ' + message,
        detail: { reason: message },
      };
    }
  }

  async function dispatchToSW(
    userIntent: string,
    slots: Record<string, unknown>,
  ) {
    const cmd = COMMAND_MAP[userIntent];
    if (!cmd || cmd.swIntent === null) return null;

    let payload = slots;
    if (cmd.requiresPrecompute) {
      payload = await precompute(userIntent, slots);
    }

    const response = await chrome.runtime.sendMessage({
      type: MSG_EXECUTE,
      command: { intent: cmd.swIntent, payload },
    });
    renderExecutionResult(userIntent, response);
    return response;
  }

  async function precompute(
    intent: string,
    slots: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!state.value.contextCache?.tabs) {
      state.value.contextCache = await getContext();
    }
    const { tabs } = state.value.contextCache;
    const activeTab = tabs.find((t) => t.active);

    switch (intent) {
      case 'group_tabs': {
        const pattern = slots.pattern?.toString().toLowerCase();
        let filtered = tabs;
        if (pattern) {
          filtered = tabs.filter((t) => {
            try {
              return (
                new URL(t.url).hostname.includes(pattern) ||
                (t.title || '').toLowerCase().includes(pattern)
              );
            } catch {
              return false;
            }
          });
        }
        return {
          tabIds: filtered.map((t) => t.id),
          title: slots.groupName as string,
          color: slots.color as string,
        };
      }

      case 'close_duplicate_tabs': {
        const seen = new Map<string, number>();
        const dupIds: number[] = [];
        for (const t of tabs) {
          const url = (t.url || '').replace(/\/$/, '');
          if (slots.url && !url.includes(slots.url as string)) continue;
          if (seen.has(url)) dupIds.push(t.id);
          else seen.set(url, t.id);
        }
        return { tabIds: dupIds };
      }

      case 'close_tabs_by_domain':
      case 'mute_tabs_by_domain':
      case 'unmute_tabs_by_domain':
      case 'discard_tabs': {
        const domain = (slots.domain?.toString() || '').toLowerCase();
        let matches = tabs;
        if (slots.all) {
          matches = tabs.filter((t) => !t.pinned);
        } else if (domain) {
          matches = tabs.filter((t) => {
            try {
              return new URL(t.url).hostname.includes(domain);
            } catch {
              return false;
            }
          });
        }
        const params: Record<string, unknown> = { tabId: matches[0]?.id };
        if (intent === 'mute_tabs_by_domain') params.muted = true;
        if (intent === 'unmute_tabs_by_domain') params.muted = false;
        if (intent === 'discard_tabs') params.discarded = true;
        return params;
      }

      case 'close_other_tabs': {
        return {
          tabIds: tabs
            .filter((t) => t.id !== activeTab?.id && !t.pinned)
            .map((t) => t.id),
        };
      }

      case 'duplicate_tab': {
        if (!activeTab) return {};
        return {
          url: activeTab.url,
          active: true,
          index: (activeTab.index || 0) + 1,
        };
      }

      case 'sort_tabs': {
        const order = (slots.order as string) || 'domain';
        const sorted = [...tabs].sort((a, b) => {
          if (order === 'title')
            return (a.title || '').localeCompare(b.title || '');
          const dA = a.url ? new URL(a.url).hostname : '';
          const dB = b.url ? new URL(b.url).hostname : '';
          return dA.localeCompare(dB) || (a.index || 0) - (b.index || 0);
        });
        return { tabIds: sorted.map((t) => t.id), index: 0 };
      }

      case 'pin_tab': {
        if (!activeTab) return {};
        return { tabId: activeTab.id, pinned: !activeTab.pinned };
      }

      case 'reload_tab':
        return { tabId: activeTab?.id, reload: true };

      case 'rename_group': {
        if (!activeTab || activeTab.groupId === -1) return {};
        return { groupId: activeTab.groupId, title: slots.name as string };
      }

      case 'remove_bookmark': {
        if (!slots.query) return {};
        try {
          const results = await chrome.runtime.sendMessage({
            type: MSG_GET_BOOKMARKS,
            options: { query: slots.query as string },
          });
          const node = results?.[0];
          if (!node) return {};
          return { nodeId: node.id };
        } catch {
          return {};
        }
      }

      case 'enable_extension':
      case 'disable_extension':
      case 'uninstall_extension': {
        if (!slots.query) return {};
        try {
          const exts = await chrome.management.getAll();
          const q = (slots.query as string).toLowerCase();
          const match = exts.find(
            (e) => e.id === slots.query || e.name.toLowerCase().includes(q),
          );
          if (!match) return {};
          if (intent === 'enable_extension') return { id: match.id, enabled: true };
          if (intent === 'disable_extension') return { id: match.id, enabled: false };
          return { id: match.id };
        } catch {
          return {};
        }
      }

      default:
        return slots;
    }
  }

  async function getContext(): Promise<Context> {
    state.value.contextCache = (await chrome.runtime.sendMessage({
      type: MSG_GET_CONTEXT,
      options: { mode: 'detailed' },
    })) as Context;
    return state.value.contextCache;
  }

  async function scanCurrentPage(filter?: string) {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return null;
      return await chrome.tabs.sendMessage(tab.id, {
        type: 'PAGE_SCAN',
        filter,
      });
    } catch {
      return null;
    }
  }

  async function switchMode(mode: DisplayMode) {
    state.value.displayMode = mode;
    await chrome.storage.local.set({ displayMode: mode });

    if (mode === 'sidepanel') {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'CLOSE_OVERLAY' }, '*');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
      await chrome.runtime.sendMessage({ type: MSG_SET_DISPLAY_MODE, mode });
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/overlay.js'],
        });
      } catch {
        // ignore
      }
      window.close();
      await chrome.runtime.sendMessage({ type: MSG_SET_DISPLAY_MODE, mode });
    }
  }

  // ──── 辅助函数 ────

  function cleanup() {
    state.value.activeLoopId = null;
    state.value.planTracker = null;
    state.value.conversationMessages = null;
    state.value.lessons = [];
    state.value.lastScreenshot = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }

  function compressMessages(messages: ChatMessage[]) {
    const systemMsg = messages.find((m) => m.role === 'system');
    const recent = messages.slice(-20);
    messages.length = 0;
    if (systemMsg) messages.push(systemMsg);
    messages.push(
      { role: 'system', content: '[已省略中间对话]' },
      ...recent.filter((m) => m.role !== 'system'),
    );
  }

  function persistPlanTracker() {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          planTracker: state.value.planTracker,
          lessons: state.value.lessons,
          timestamp: Date.now(),
        }),
      );
    } catch {
      // ignore
    }
  }

  function updatePlanTracker(
    userGoal: string,
    plan: string | undefined,
    thought: string,
    intent: string,
    result: ExecutionResult,
  ) {
    if (!state.value.planTracker) {
      state.value.planTracker = {
        goal: userGoal,
        currentPlan: plan || '',
        steps: [],
      };
    }
    if (plan) state.value.planTracker.currentPlan = plan;
    state.value.planTracker.steps.push({
      step: state.value.planTracker.steps.length + 1,
      thought,
      intent,
      result: JSON.stringify(result).slice(0, 200),
      status: result.error || result.code ? 'failed' : 'ok',
    });
    if (state.value.planTracker.steps.length > 20) {
      state.value.planTracker.steps.shift();
    }
  }

  function addLesson(userInput: string, intent: string, error: string) {
    const domain = state.value.contextCache?.activeTab?.url
      ? new URL(state.value.contextCache.activeTab.url).hostname
      : 'unknown';
    state.value.lessons.push({
      domain,
      userInput: userInput.slice(0, 60),
      intent,
      error: error.slice(0, 100),
      timestamp: Date.now(),
    });
    if (state.value.lessons.length > 10) {
      state.value.lessons.shift();
    }
  }

  function verifyPredict(
    predict: string,
    result: ExecutionResult,
  ): string | null {
    const lowerPredict = predict.toLowerCase();
    const lowerResult = JSON.stringify(result).toLowerCase();
    const keywords = lowerPredict.split(/[\s,，、]+/).filter((k) => k.length > 2);
    if (keywords.length === 0) return null;
    const matched = keywords.some((k) => lowerResult.includes(k));
    if (!matched) {
      return `⚠ 预测不匹配。预测: "${predict}" | 实际: ${JSON.stringify(result)}。请重新评估。`;
    }
    return null;
  }

  function sanitizeResult(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      return obj.length > 500
        ? obj.slice(0, 200) + `...[截断, 原长 ${obj.length} 字符]`
        : obj;
    }
    if (typeof obj !== 'object') return obj;

    const seen = new WeakSet();
    try {
      const str = JSON.stringify(obj, (key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        if (/data[_]?url|screenshot/i.test(key)) return undefined;
        if (typeof val === 'string' && val.length > 500) {
          return val.slice(0, 200) + `...[截断, 原长 ${val.length} 字符]`;
        }
        return val;
      });
      return JSON.parse(str);
    } catch {
      return { _error: 'serialization failed', _keys: Object.keys(obj as object) };
    }
  }

  function formatStepSummary(result: ExecutionResult, _toolName: string): string {
    const r = result as Record<string, unknown>;
    if (r.code === 'NEEDS_CONFIRM') return `⚠️ ${r.message}`;
    if (r.code) return `[${r.code}] ${r.message || '操作失败'}`;
    if (r.error)
      return `失败: ${typeof r.error === 'object' ? JSON.stringify(r.error) : r.error}`;
    if (r.result !== undefined) {
      if (r.result === null) return '脚本结果: null（通常表示未命中元素）';
      const s = typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
      return '脚本结果: ' + s.slice(0, 100);
    }
    if (r.tabs) return `列出 ${r.observed || (r.tabs as unknown[]).length} 个标签`;
    if (r.moved !== undefined) return `移动 ${r.moved} 个标签`;
    if (r.removed !== undefined) return `关闭 ${r.removed} 个标签`;
    if (r.groupedTabs) return `创建分组 *${r.title || r.groupName}* (${r.groupedTabs} 个标签)`;
    if (r.groups) return `列出 ${(r.groups as unknown[]).length} 个标签组`;
    if (r.reloaded) return '刷新标签';
    if (r.pinned !== undefined) return r.pinned ? '固定标签' : '取消固定';
    if (r.discarded !== undefined) return `休眠 ${r.discarded} 个标签`;
    if (r.duplicated !== undefined) return '复制标签';
    if (r.nodes) return `观察到 ${r.observed || (r.nodes as unknown[]).length} 个书签节点`;
    if (r.bookmark) return `添加书签 *${(r.bookmark as { title: string }).title}*`;
    if (r.windows) return `列出 ${(r.windows as unknown[]).length} 个窗口`;
    if (r.items) return `搜索到 ${r.found} 条历史`;
    if (r.navigated) return `导航至 ${r.navigated}`;
    if (r.zoomFactor !== undefined)
      return `缩放至 ${Math.round(r.zoomFactor as number * 100)}%`;
    if (r.themeMode !== undefined) return `主题: ${r.themeMode}`;
    if (r.fontSize !== undefined)
      return `字号: ${r.fontSizeLabel || r.fontSize + 'px'}`;
    if (r.font) return `字体: ${r.font}`;
    if (r.cookies) return `查看 ${r.found || 0} 个 Cookie (${r.domain})`;
    if (r.sites) return `展示 ${r.found || 0} 个常用网站`;
    if (r.extensions) return `列出 ${r.found || 0} 个扩展`;
    if (r.permissions) return `查看 ${r.domain} 的权限设置`;
    if (r.key && r.value !== undefined)
      return `存储 *${r.key}* = ${typeof r.value === 'object' ? JSON.stringify(r.value) : r.value}`;
    if (r.recording) return `开始录制 ${r.recording}`;
    if (r.saved) return `录制已保存为 ${r.saved}`;
    if (r.stopped) return '录制已停止';
    if (r.restored) return `恢复标签 ${r.restored}`;
    if (r.results && r.total !== undefined) return `批量执行 ${r.total} 个操作`;
    return JSON.stringify(result).slice(0, 100);
  }

  function formatHelp(commands: typeof SLASH_COMMANDS): string {
    return (
      '可用命令:\n\n' +
      commands
        .map(
          (c) =>
            `  /${c.slash}${c.hasArg ? ' <' + (c.placeholder || '参数') + '>' : ''}  —  ${c.description}`,
        )
        .join('\n')
    );
  }

  function formatSlashCommands(): string {
    return SLASH_COMMANDS.map((c) => '/' + c.slash + ' — ' + c.description).join('\n');
  }

  function renderExecutionResult(intent: string, response: unknown) {
    const result = response as ExecutionResult;
    if (result.success === false && result.code) {
      addMessage('error', `[${result.code}] ${result.message || '操作失败'}`);
      return;
    }
    if (result.error) {
      addMessage('error', result.error as string);
      return;
    }

    let text = '操作完成';
    const r = result as Record<string, unknown>;

    if (intent === 'sort_tabs' && r.moved)
      text = `已按域名排序 ${r.moved} 个标签`;
    else if (intent === 'pin_tab') {
      const tab = r.tab as { pinned?: boolean } | undefined;
      text = tab?.pinned ? '已固定标签' : '已取消固定';
    }
    else if (intent === 'reload_tab') text = '已刷新';
    else if (intent === 'rename_group')
      text = r.title ? `已重命名分组: ${r.title}` : '已重命名分组';
    else if (r.closed) text = `已为你关闭 ${r.closed} 个标签页`;
    else if (r.focused) {
      const focused = r.focused as { title?: string };
      text = `已切换到: ${focused.title || ''}`;
    }
    else if (r.found && r.bookmarks)
      text = `为你找到 ${r.found} 个书签:\n${(r.bookmarks as Array<{ title: string; url: string }>).map((b) => `  ${b.title} — ${b.url}`).join('\n')}`;
    else if (r.items)
      text = `为你找到 ${r.found || (r.items as unknown[]).length} 条历史记录:\n${(r.items as Array<{ title: string; url: string; lastVisit?: number; visitCount?: number }>).map((it) => `  ${it.title}\n    ${it.url}`).join('\n')}`;
    else if (r.message && typeof r.message === 'string') text = r.message;

    addMessage('ai-chat', text);
  }

  function mdToHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  }

  function navigateHistory(direction: number) {
    const len = state.value.commandHistory.length;
    if (len === 0) return;

    if (direction === -1) {
      if (state.value.historyIndex === -1) {
        state.value.historyDraft = state.value.commandInputValue;
        state.value.historyIndex = 0;
      } else if (state.value.historyIndex < len - 1) {
        state.value.historyIndex++;
      } else {
        return;
      }
    } else {
      if (state.value.historyIndex <= 0) {
        state.value.historyIndex = -1;
        const draft = state.value.historyDraft;
        state.value.commandInputValue = draft;
        state.value.historyDraft = '';
        return;
      }
      state.value.historyIndex--;
    }

    state.value.commandInputValue =
      state.value.commandHistory[len - 1 - state.value.historyIndex];
  }

  function toggleSettings() {
    state.value.isSettingsOpen = !state.value.isSettingsOpen;
  }

  async function loadSettings() {
    const settings = await chrome.storage.local.get({
      aiProvider: 'auto',
      apiKey: '',
      apiEndpoint: 'https://api.deepseek.com',
      modelName: 'deepseek-chat',
    });
    return settings;
  }

  async function saveSettings(settings: Record<string, unknown>) {
    await chrome.storage.local.set(settings);
    aiEngine.reset();
  }

  return {
    state: readonly(state),
    aiEngine,
    paletteEl,
    paletteCommands,
    paletteIndex,
    addMessage,
    agentLoop,
    handleSlashCommand,
    handleNaturalLanguage,
    handleSubmit,
    executeCommand,
    dispatchToSW,
    getContext,
    scanCurrentPage,
    switchMode,
    cleanup,
    navigateHistory,
    mdToHtml,
    renderExecutionResult,
    toggleSettings,
    loadSettings,
    saveSettings,
  };
}
