/**
 * AI 浏览器管家 — Side Panel 主逻辑
 * 架构 v2.1: 代码纯编排，AI 做全部决策
 */

import {
  MSG_GET_CONTEXT,
  MSG_GET_BOOKMARKS,
  MSG_EXECUTE,
  MSG_SET_DISPLAY_MODE,
  MSG_GET_DISPLAY_MODE,
  MAX_AGENT_STEPS,
  STEP_TIMEOUT_MS,
  TOTAL_TASK_TIMEOUT_MS,
  MAX_CONSECUTIVE_FAILURES,
  MAX_MESSAGES_COUNT,
} from "../shared/constants.js";
import { COMMAND_MAP } from "../shared/commands.js";
import { matchSlashCommand, SLASH_COMMANDS } from "./command/slash-commands.js";
import { generateConfirmPreview } from "./command/confirm.js";
import { AIEngine } from "./ai/engine.js";
import { buildAgentSystemPrompt } from "../shared/prompts.js";
import { repairJSON } from "../shared/json-repair.js";

const SESSION_KEY = "ai_commander_session";

class SidePanel {
  constructor() {
    this.messageContainer = document.getElementById("messages");
    this.settingsBtn = document.getElementById("settings-btn");
    this.settingsPanel = document.getElementById("settings-panel");
    this.modeSidepanelBtn = document.getElementById("mode-sidepanel");
    this.modePopupBtn = document.getElementById("mode-popup");
    this.commandInput = document.getElementById("command-input");
    this.commandSubmit = document.getElementById("command-submit");
    this.suggestionsEl = document.getElementById("suggestions");

    this.contextCache = null;
    this.isSettingsOpen = false;
    this.aiEngine = new AIEngine();
    this.commandHistory = [];
    this.historyIndex = -1;
    this._historyDraft = "";
    this.messageLog = [];

    // Agent 状态
    this._activeLoopId = null;
    this._conversationMessages = null;
    this._planTracker = null;
    this._lessons = [];
    this._contextSwitched = false;
    this._pageChanged = false;
    this._loopTimer = null;
    this._lastScreenshot = null;

    this.init();
  }

  async init() {
    await this._syncModeButtons();
    await this._recoverContext();
    await this.restoreSession();
    this.bindEvents();
    this.commandInput.focus();
  }

  bindEvents() {
    this.commandInput.addEventListener("input", () => this.onInputChange());
    this.commandInput.addEventListener("keydown", (e) => {
      if (this._paletteEl && this._paletteEl.style.display !== "none") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.navigatePalette(1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          this.navigatePalette(-1);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          this.hidePalette();
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.selectPalette();
          return;
        }
      }
      if (e.key === "ArrowUp" && !e.shiftKey) {
        e.preventDefault();
        this.navigateHistory(-1);
        return;
      }
      if (e.key === "ArrowDown" && !e.shiftKey) {
        e.preventDefault();
        this.navigateHistory(1);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSubmit();
      }
    });
    this.commandSubmit.addEventListener("click", () => this.handleSubmit());
    this.settingsBtn.addEventListener("click", () => this.toggleSettings());
    this.modeSidepanelBtn.addEventListener("click", () =>
      this._switchMode("sidepanel"),
    );
    this.modePopupBtn.addEventListener("click", () =>
      this._switchMode("popup"),
    );
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "EXECUTE_RESULT") this.renderExecutionResult(msg);
    });
    window.addEventListener("beforeunload", () => this.saveSession());
  }

  async handleSubmit() {
    const text = this.commandInput.value.trim();
    if (!text) return;
    this.commandInput.value = "";
    this.renderUserMessage(text);
    if (
      this.commandHistory.length === 0 ||
      this.commandHistory[this.commandHistory.length - 1] !== text
    ) {
      this.commandHistory.push(text);
    }
    this.historyIndex = -1;
    this._historyDraft = "";
    try {
      if (text.startsWith("/")) await this.handleSlashCommand(text);
      else await this.handleNaturalLanguage(text);
    } catch (error) {
      this.renderError({ message: error.message });
    }
    this.commandInput.focus();
  }

  async handleSlashCommand(text) {
    // 中断活跃的 Agent Loop
    if (this._activeLoopId) this._cleanup();

    const result = matchSlashCommand(text);
    if (!result) {
      this.renderError({
        code: "UNKNOWN_SLASH",
        message: "未知命令。输入 /help 查看可用命令",
      });
      return;
    }
    if (result.error) {
      this.renderError({
        code: result.error,
        message: `未知命令: "${text}"。可用命令: ${SLASH_COMMANDS.map((c) => "/" + c.slash).join(", ")}`,
      });
      return;
    }
    const { intent, slots } = result;
    let resolvedIntent = intent;
    if (intent === "get_theme" && (slots.mode || slots.color))
      resolvedIntent = "set_theme";
    if (intent === "get_font_size" && slots.size)
      resolvedIntent = "set_font_size";
    if (intent === "get_font_family" && slots.family)
      resolvedIntent = "set_font_family";
    if (resolvedIntent === "show_help") {
      this.renderHelp(SLASH_COMMANDS);
      return;
    }
    const cmd = COMMAND_MAP[resolvedIntent];
    if (!cmd) {
      this.renderError({
        code: "UNKNOWN_INTENT",
        message: `未知意图: ${resolvedIntent}`,
      });
      return;
    }
    if (cmd.dangerous) {
      const context = await this.getContext();
      const preview = generateConfirmPreview(resolvedIntent, slots, context);
      if (preview) this.renderConfirmation(resolvedIntent, slots, preview);
      else this.renderSystemMessage("没有需要操作的内容");
    } else {
      await this.dispatchToSW(resolvedIntent, slots);
    }
  }

  // ──── Agent Loop ────

  async handleNaturalLanguage(text) {
    const ai = await this.aiEngine.checkAvailability();
    if (!ai.available) {
      this.renderSystemMessage(
        `AI 不可用: ${ai.reason || "未配置"}\n\n可用斜杠命令:\n${SLASH_COMMANDS.map((c) => "/" + c.slash + " — " + c.description).join("\n")}`,
      );
      return;
    }
    // 并发控制：中断旧任务
    if (this._activeLoopId) {
      if (this._conversationMessages) {
        // ASKING_USER 状态：直接中断
        this._cleanup();
      } else {
        // EXECUTING 状态：等待最多 3 秒
        await Promise.race([
          new Promise((r) => {
            const check = () => {
              if (!this._activeLoopId) r();
              else setTimeout(check, 100);
            };
            check();
          }),
          new Promise((r) => setTimeout(r, 3000)),
        ]);
        if (this._activeLoopId) this._cleanup();
      }
    }
    await this.agentLoop(text);
  }

  async agentLoop(userText) {
    const loopId =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this._activeLoopId = loopId;

    const startTime = Date.now();
    const context = await this.getContext();

    const pageData = await this.scanCurrentPage();
    context.pageStructure = pageData;
    context.recentLessons = this._lessons.slice(-3);

    const systemPrompt = buildAgentSystemPrompt(context);
    let messages;

    if (this._conversationMessages) {
      messages = [...this._conversationMessages];
      messages[0] = { role: "system", content: systemPrompt };
      messages.push({ role: "user", content: "【用户指令】\n" + userText });
    } else {
      this._planTracker = null;
      this._lessons = [];
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "【用户指令】\n" + userText },
      ];
    }
    this._conversationMessages = null;

    let stepCount = 0;
    let consecutiveErrors = 0;
    let jsonRetryCount = 0;
    const MAX_JSON_RETRIES = 3;

    this.renderSystemMessage("思考中...");

    while (stepCount < MAX_AGENT_STEPS) {
      // 检查是否被中断
      if (this._activeLoopId !== loopId) return;

      // 总超时检查
      if (Date.now() - startTime > TOTAL_TASK_TIMEOUT_MS) {
        this.messageContainer.lastChild?.remove();
        this.renderSystemMessage("任务执行超时（120 秒），已停止。");
        this._cleanup();
        return;
      }

      let raw;
      try {
        raw = await this.aiEngine.chatWithHistory(messages, {
          temperature: 0.2,
          maxTokens: 4096,
        });
      } catch (e) {
        this.messageContainer.lastChild?.remove();
        this.renderError({ message: `AI 调用失败: ${e.message}` });
        this._cleanup();
        return;
      }
      this.messageContainer.lastChild?.remove();

      let json;
      try {
        json = repairJSON(raw);
      } catch (_) {
        json = null;
      }
      if (!json || !json.action) {
        // 尝试提取 JSON 部分重试
        const jsonMatch = raw.match(/\{[\s\S]*"action"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            json = JSON.parse(jsonMatch[0]);
          } catch (_) {}
        }
        if (!json || !json.action) {
          jsonRetryCount++;
          if (jsonRetryCount >= MAX_JSON_RETRIES) {
            this.renderError({
              message: `AI 连续 ${MAX_JSON_RETRIES} 次返回格式异常，任务已停止。请重试或换一种说法。`,
            });
            console.error("[AI Commander] JSON parse failed after retries, raw:", raw);
            this._cleanup();
            return;
          }
          this.renderSystemMessage(`⚠️ AI 返回格式异常（第 ${jsonRetryCount}/${MAX_JSON_RETRIES} 次），将重试...`);
          messages.push({ role: "assistant", content: raw });
          messages.push({ role: "user", content: "请重新输出，严格按照 JSON 格式，只输出 JSON 对象，不要有其他内容。" });
          continue;
        }
      }
      jsonRetryCount = 0;

      // done
      if (json.action === "done") {
        this.renderAIChat(json.reply || json.content || "操作完成");
        this._cleanup();
        return;
      }

      // ask
      if (json.action === "ask") {
        messages.push({ role: "assistant", content: raw });
        this._conversationMessages = [...messages];
        this._activeLoopId = null; // 释放锁，等待用户回复
        this._persistPlanTracker();
        this.renderAIChat(json.reply || json.content || "请提供更多信息");
        return;
      }

      // scan
      if (json.action === "scan") {
        const scanResult = await this.scanCurrentPage(json.scanFilter);
        const scanStr = scanResult
          ? `页面扫描结果(${scanResult.totalCount || scanResult.count}元素): ${JSON.stringify(scanResult)}`
          : "扫描失败";
        messages.push({ role: "assistant", content: raw });
        messages.push({ role: "user", content: scanStr });
        this.renderSystemMessage("已重新扫描页面");
        continue;
      }

      // exec_tool
      if (json.action !== "exec_tool" || !json.toolCall) {
        // 兼容旧格式 exec + command
        if (json.action === "exec" && json.command) {
          json.action = "exec_tool";
          json.toolCall = {
            name: json.command.intent,
            args: json.command.slots || {},
          };
        } else {
          this.renderError({ message: `未知 action: ${json.action}` });
          this._cleanup();
          return;
        }
      }

      const toolCall = json.toolCall;
      const toolName = toolCall.name;
      if (toolName === "chat") {
        this.renderAIChat(toolCall.args?.reply || "");
        this._cleanup();
        return;
      }

      const thought = json.thought || "";
      stepCount++;
      this.renderSystemMessage(`执行中... (${stepCount}/${MAX_AGENT_STEPS})`);

      // 步骤超时控制
      let result;
      try {
        result = await Promise.race([
          this._executeCommand(toolName, toolCall.args || {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("ACT_TIMEOUT")), STEP_TIMEOUT_MS),
          ),
        ]);
      } catch (e) {
        result = {
          success: false,
          code: "ACT_TIMEOUT",
          message: "操作执行超时（10 秒未完成）",
          detail: { reason: "单步操作超过 " + STEP_TIMEOUT_MS / 1000 + " 秒" },
        };
      }
      this.messageContainer.lastChild?.remove();

      // 需要用户确认时，显示确认对话框并暂停循环
      if (result.success === false && result.code === "NEEDS_CONFIRM") {
        this.renderConfirmation(result.detail.intent || toolName, result.detail.slots || {}, {
          title: result.message,
          description: `包含 ${result.detail.childCount} 个子项的文件夹 "${result.detail.title}"`,
          items: result.detail.children,
          onConfirm: async () => {
            const confirmResult = await this._executeCommand(toolName, { nodeId: result.detail.nodeId, force: true });
            if (confirmResult.success) {
              this.renderSystemMessage(`✓ 已删除文件夹 "${result.detail.title}"`);
              this._cleanup();
            } else {
              this.renderError(confirmResult);
              this._cleanup();
            }
          },
          onCancel: () => {
            this.renderSystemMessage(`已取消删除 "${result.detail.title}"`);
            this._cleanup();
          },
        });
        return;
      }

      if (result.success === false && result.code === "NEEDS_CONFIRM") {
        // 需要确认，不计入错误
        consecutiveErrors = 0;
      } else if (result.success === false && result.code) {
        consecutiveErrors++;
      } else if (result.error) {
        consecutiveErrors++;
      } else {
        consecutiveErrors = 0;
      }

      // update tracker
      this._updatePlanTracker(userText, json.plan, thought, toolName, result);

      // verify prediction
      if (json.predict && !result.error && !result.code) {
        const mismatch = this._verifyPredict(json.predict, result);
        if (mismatch) messages.push({ role: "system", content: mismatch });
      }

      // record lesson
      const errMsg = result.code
        ? `[${result.code}] ${result.message || ""}`
        : result.error;
      if (errMsg) {
        this._addLesson(userText, toolName, errMsg);
      }

      messages.push({ role: "assistant", content: raw });
      const sanitized = _sanitizeResult(result);
      messages.push({
        role: "user",
        content: `执行结果(${toolName}): ${JSON.stringify(sanitized)}`,
      });

      if (result.result === undefined) {
        messages.push({
          role: "system",
          content:
            "脚本返回 undefined，通常表示脚本里没有写 return。请补上明确的 return 后重试。",
        });
      } else if (result.result === null) {
        messages.push({
          role: "system",
          content:
            "脚本返回 null，通常表示选择器未命中目标元素，或脚本主动返回了空值。优先调整选择器，不要先假设 iframe/Shadow DOM。",
        });
      }

      if (
        (result.triggered || result.result !== undefined) &&
        !result.error &&
        !result.code
      ) {
        const postScan = await this.scanCurrentPage();
        if (postScan?.elements?.length) {
          messages.push({
            role: "system",
            content: `[自动验证] 操作后页面状态(${postScan.totalCount || postScan.count}元素): ${JSON.stringify(postScan)}`,
          });
        }
      }

      // Screenshot: 保存 dataUrl，待会追加到 AI 回复气泡中
      if (toolName === "screenshot" && result.screenshot) {
        this._lastScreenshot = result.screenshot;
      }

      this._renderAgentStep(stepCount, thought, result, toolCall);

      // compress if too large
      if (messages.length > MAX_MESSAGES_COUNT) {
        this._compressMessages(messages);
      }

      if (consecutiveErrors >= MAX_CONSECUTIVE_FAILURES) {
        this.renderSystemMessage(
          `连续 ${consecutiveErrors} 步执行失败，已停止。`,
        );
        this._cleanup();
        return;
      }

      this.renderSystemMessage("思考中...");
    }

    this.messageContainer.lastChild?.remove();
    this.renderAIChat(
      "已达到最大执行步数。任务可能未完成，请继续告诉我下一步。",
    );
    this._cleanup();
  }

  // ──── Plan Tracker ────

  _updatePlanTracker(userGoal, plan, thought, intent, result) {
    if (!this._planTracker) {
      this._planTracker = {
        goal: userGoal,
        currentPlan: plan || "",
        steps: [],
      };
    }
    if (plan) this._planTracker.currentPlan = plan;
    this._planTracker.steps.push({
      step: this._planTracker.steps.length + 1,
      thought,
      intent,
      result: JSON.stringify(result).slice(0, 200),
      status: result.error || result.code ? "failed" : "ok",
    });
    if (this._planTracker.steps.length > 20) this._planTracker.steps.shift();
  }

  // ──── Lessons ────

  _addLesson(userInput, intent, error) {
    const domain = this.contextCache?.activeTab?.url
      ? new URL(this.contextCache.activeTab.url).hostname
      : "unknown";
    this._lessons.push({
      domain,
      userInput: userInput.slice(0, 60),
      intent,
      error: error.slice(0, 100),
      timestamp: Date.now(),
    });
    if (this._lessons.length > 10) this._lessons.shift();
  }

  // ──── Predict Verification ────

  _verifyPredict(predict, result) {
    const lowerPredict = predict.toLowerCase();
    const lowerResult = JSON.stringify(result).toLowerCase();
    const keywords = lowerPredict
      .split(/[\s,，、]+/)
      .filter((k) => k.length > 2);
    if (keywords.length === 0) return null;
    const matched = keywords.some((k) => lowerResult.includes(k));
    if (!matched) {
      return `⚠ 预测不匹配。预测: "${predict}" | 实际: ${JSON.stringify(result)}。请重新评估。`;
    }
    return null;
  }

  // ──── Context Management ────

  _cleanup() {
    this._activeLoopId = null;
    this._planTracker = null;
    this._conversationMessages = null;
    this._lessons = [];
    // 注意：不清除 _discoveries，跨轮保留
    this._contextSwitched = false;
    this._pageChanged = false;
    this._loopTimer = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  _compressMessages(messages) {
    const systemMsg = messages.find((m) => m.role === "system");
    const recent = messages.slice(-20); // 保留最近20条
    messages.length = 0;
    if (systemMsg) messages.push(systemMsg);
    messages.push(
      { role: "system", content: "[已省略中间对话]" },
      ...recent.filter((m) => m.role !== "system"),
    );
  }

  _persistPlanTracker() {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          planTracker: this._planTracker,
          lessons: this._lessons,
          timestamp: Date.now(),
        }),
      );
    } catch (_) {}
  }

  async _recoverContext() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      // 5 分钟过期
      if (Date.now() - data.timestamp > 5 * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      if (data.planTracker) {
        const proceed = confirm("上次的任务还在进行中，要继续吗？");
        if (proceed) {
          this._planTracker = data.planTracker;
          this._lessons = data.lessons || [];
          this.renderSystemMessage(
            "已恢复上次任务的上下文。请继续告诉我你的需求。",
          );
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (_) {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  // ──── Helpers ────

  async _executeCommand(intent, slots) {
    const cmd = COMMAND_MAP[intent];
    if (!cmd || cmd.swIntent === null) return { error: `未知命令: ${intent}` };
    try {
      let payload = slots;
      if (cmd.requiresPrecompute)
        payload = await this.precompute(intent, slots);
      return await chrome.runtime.sendMessage({
        type: MSG_EXECUTE,
        command: { intent: cmd.swIntent, payload },
      });
    } catch (e) {
      return {
        success: false,
        code: "COM_DISCONNECTED",
        message: "命令执行失败: " + e.message,
        detail: { reason: e.message },
      };
    }
  }

  _renderAgentStep(step, thought, result, toolCall) {
    const toolName = toolCall?.name || "未知工具";
    const summary = this._stepSummary({ ...result, intent: toolName });
    const hasError = result.error || result.code;
    const status = hasError ? "❌" : "✓";
    const text = `[${step}] 💭 ${thought}\n    ${status} ${summary}`;
    const el = document.createElement("div");
    el.className = "bubble bubble-system";
    el.style.cssText = "text-align:left;max-width:90%;";
    el.textContent = text;
    this.messageContainer.appendChild(el);
    this._addMessage("system", { text });
    this.scroll();
  }

  async scanCurrentPage(filter) {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return null;
      return await chrome.tabs.sendMessage(tab.id, {
        type: "PAGE_SCAN",
        filter,
      });
    } catch (_) {
      return null;
    }
  }

  // ──── Rest kept from original ────

  _stepSummary(result) {
    const r = result;
    if (r.code === "NEEDS_CONFIRM") return `⚠️ ${r.message}`;
    if (r.code) return `[${r.code}] ${r.message || "操作失败"}`;
    if (r.error)
      return `失败: ${typeof r.error === "object" ? JSON.stringify(r.error) : r.error}`;
    // DOM 脚本结果
    if (r.result !== undefined) {
      if (r.result === null) return "脚本结果: null（通常表示未命中元素）";
      const s =
        typeof r.result === "string" ? r.result : JSON.stringify(r.result);
      return "脚本结果: " + s.slice(0, 100);
    }
    // Tabs
    if (r.tabs) return `列出 ${r.observed || r.tabs.length} 个标签`;
    if (r.tab && r.active !== undefined)
      return r.active
        ? `切换到标签 *${r.tab.title || ""}*`
        : `更新标签 *${r.tab.title || ""}*`;
    if (r.tab) return `创建标签 *${r.tab.title || r.tab.url || ""}*`;
    if (r.moved !== undefined) return `移动 ${r.moved} 个标签`;
    if (r.removed !== undefined) return `关闭 ${r.removed} 个标签`;
    if (r.groupedTabs)
      return `创建分组 *${r.title || r.groupName}* (${r.groupedTabs} 个标签)`;
    if (r.groupId && !r.groupedTabs)
      return `更新分组 *${r.title || r.groupId}*`;
    if (r.ungrouped !== undefined) return `取消 ${r.ungrouped} 个分组`;
    if (r.groups) return `列出 ${r.groups.length} 个标签组`;
    if (r.reloaded) return "刷新标签";
    if (r.pinned !== undefined) return r.pinned ? "固定标签" : "取消固定";
    if (r.discarded !== undefined) return `休眠 ${r.discarded} 个标签`;
    if (r.duplicated !== undefined) return "复制标签";
    // Bookmarks
    if (r.nodes) return `观察到 ${r.observed || r.nodes.length} 个书签节点`;
    if (r.movedNode)
      return `移动 ${r.movedNode.nodeType === "folder" ? "文件夹" : "书签"} *${r.movedNode.title}*`;
    if (r.createdNode)
      return `创建 ${r.createdNode.nodeType === "folder" ? "文件夹" : "书签"} *${r.createdNode.title}*`;
    if (r.existingNode)
      return `目标已存在，复用 ${r.existingNode.nodeType === "folder" ? "文件夹" : "书签"} *${r.existingNode.title}*`;
    if (r.updatedNode)
      return `更新 ${r.updatedNode.nodeType === "folder" ? "文件夹" : "书签"} *${r.updatedNode.title}*`;
    if (r.openedNode) return `打开书签 *${r.openedNode.title}*`;
    if (r.removedNode)
      return `删除 ${r.removedNode.nodeType === "folder" ? "文件夹" : "书签"} *${r.removedNode.title}*`;
    if (r.bookmark) return `添加书签 *${r.bookmark.title}*`;
    // Windows
    if (r.windows) return `列出 ${r.windows.length} 个窗口`;
    if (r.window) return `创建窗口`;
    // History
    if (r.items) return `搜索到 ${r.found} 条历史`;
    if (r.deleted !== undefined && r.timeRange)
      return `删除 ${r.deleted} 条历史 (${r.timeRange})`;
    if (r.deleted !== undefined) return `删除 ${r.deleted} 条记录`;
    // Navigation
    if (r.navigated) return `导航至 ${r.navigated}`;
    if (r.dataUrl) return "截图已捕获";
    // Page
    if (r.zoomFactor !== undefined)
      return `缩放至 ${Math.round(r.zoomFactor * 100)}%`;
    if (r.opened) return `打开下载页面`;
    // Theme
    if (r.themeMode !== undefined) return `主题: ${r.themeMode}`;
    // Font
    if (r.fontSize !== undefined)
      return `字号: ${r.fontSizeLabel || r.fontSize + "px"}`;
    if (r.font) return `字体: ${r.font}`;
    // Cookies
    if (r.cookies) return `查看 ${r.found || 0} 个 Cookie (${r.domain})`;
    if (r.domain && r.deleted !== undefined)
      return `清除 ${r.domain} 的 ${r.deleted} 个 Cookie`;
    // Top Sites
    if (r.sites) return `展示 ${r.found || 0} 个常用网站`;
    // Extensions
    if (r.extensions) return `列出 ${r.found || 0} 个扩展`;
    if (r.id && r.enabled !== undefined)
      return r.enabled ? `启用扩展` : `禁用扩展`;
    if (r.id && r.uninstalled) return `卸载扩展`;
    // Permissions
    if (r.permissions) return `查看 ${r.domain} 的权限设置`;
    if (r.setting && r.value) return `设置 ${r.domain} 的 ${r.setting} 权限`;
    // Storage
    if (r.key && r.value !== undefined)
      return `存储 *${r.key}* = ${typeof r.value === "object" ? JSON.stringify(r.value) : r.value}`;
    if (r.storageRemoved) return `删除存储 *${r.storageRemoved}*`;
    // Recording
    if (r.recording) return `开始录制 ${r.recording}`;
    if (r.saved) return `录制已保存为 ${r.saved}`;
    if (r.stopped) return "录制已停止";
    // Sessions
    if (r.restored) return `恢复标签 ${r.restored}`;
    // Batch
    if (r.results && r.total !== undefined) return `批量执行 ${r.total} 个操作`;
    // ──── 旧格式兼容（逐步废弃） ────
    if (r.action === "query")
      return `查询 ${r.count} 个 "${r.value || r.selector || "元素"}"`;
    if (r.action === "modify")
      return `修改 ${r.changed} 个 "${r.value || r.selector}" 的 ${r.property}`;
    if (r.action === "remove")
      return `删除 ${r.removed} 个 "${r.value || r.selector}"`;
    if (r.action === "add")
      return `添加 <${r.tag}> 到 ${r.target || r.parentSelector || "body"}`;
    if (r.action === "style")
      return `修改 ${r.changed} 个 "${r.value || r.selector}" 样式`;
    if (r.action === "event") {
      const evLabels = {
        click: "点击",
        input: "输入",
        focus: "聚焦",
        blur: "失焦",
        submit: "提交表单",
        change: "变更",
        scroll: "滚动",
        select: "全选",
        keydown: "按键",
        keyup: "抬起",
      };
      return `${evLabels[r.eventType] || r.eventType} "${r.value || r.selector}"${r.eventValue ? " -> " + r.eventValue : ""}`;
    }
    if (r.enabled) return `启用扩展 *${r.enabled}*`;
    if (r.disabled) return `禁用扩展 *${r.disabled}*`;
    if (r.uninstalled) return `卸载扩展 *${r.uninstalled}*`;
    if (r.moved && r.to) return `移动 *${r.moved}* → ${r.to}`;
    if (r.reordered) return `调整 *${r.reordered}* 位置`;
    if (r.sortedBookmarks)
      return `整理 *${r.folder}* 中 ${r.sortedBookmarks} 个书签`;
    if (r.folder?.title) return `创建文件夹 *${r.folder.title}*`;
    if (r.renamed && r.to) return `重命名 *${r.renamed}* -> *${r.to}*`;
    if (r.renamed) return `重命名 ${r.renamed}*`;
    // 兜底
    return JSON.stringify(r).slice(0, 100);
  }

  onInputChange() {
    const val = this.commandInput.value;
    if (val.startsWith("/")) {
      const query = val.slice(1).toLowerCase();
      const filtered = SLASH_COMMANDS.filter(
        (c) =>
          c.slash.includes(query) ||
          (c.aliases || []).some((a) => a.includes(query)),
      );
      if (filtered.length > 0) this.showPalette(filtered);
      else this.hidePalette();
    } else {
      this.hidePalette();
    }
  }

  showPalette(commands) {
    if (!this._paletteEl) {
      this._paletteEl = document.createElement("div");
      this._paletteEl.className = "command-palette";
      const wrapper = this.commandInput.closest(".command-wrapper");
      wrapper.parentElement.insertBefore(this._paletteEl, wrapper);
      document.addEventListener("click", (e) => {
        if (
          !this._paletteEl.contains(e.target) &&
          e.target !== this.commandInput
        )
          this.hidePalette();
      });
    }
    this._paletteCommands = commands;
    this._paletteIndex = 0;
    this._paletteEl.innerHTML = commands
      .map(
        (c, i) =>
          `<div class="palette-item${i === 0 ? " active" : ""}" data-index="${i}"><span class="palette-cmd">/${c.slash}${c.hasArg ? " <" + (c.placeholder || "") + ">" : ""}</span><span class="palette-desc">${c.description}</span></div>`,
      )
      .join("");
    this._paletteEl.style.display = "block";
    this._paletteEl.querySelectorAll(".palette-item").forEach((item) => {
      item.addEventListener("click", () => {
        this._paletteIndex = parseInt(item.dataset.index);
        this.selectPalette();
      });
    });
  }

  hidePalette() {
    if (this._paletteEl) this._paletteEl.style.display = "none";
  }
  navigatePalette(dir) {
    if (!this._paletteCommands) return;
    this._paletteIndex = Math.max(
      0,
      Math.min(this._paletteCommands.length - 1, this._paletteIndex + dir),
    );
    this._paletteEl
      .querySelectorAll(".palette-item")
      .forEach((el, i) =>
        el.classList.toggle("active", i === this._paletteIndex),
      );
  }
  selectPalette() {
    if (!this._paletteCommands?.[this._paletteIndex]) {
      this.hidePalette();
      return;
    }
    const cmd = this._paletteCommands[this._paletteIndex];
    this.commandInput.value = "/" + cmd.slash + (cmd.hasArg ? " " : "");
    this.hidePalette();
    this.commandInput.focus();
    if (cmd.hasArg)
      this.commandInput.setSelectionRange(
        this.commandInput.value.length,
        this.commandInput.value.length,
      );
  }

  async dispatchToSW(userIntent, slots) {
    const cmd = COMMAND_MAP[userIntent];
    if (!cmd || cmd.swIntent === null) return null;
    let payload = slots;
    if (cmd.requiresPrecompute)
      payload = await this.precompute(userIntent, slots);
    const response = await chrome.runtime.sendMessage({
      type: MSG_EXECUTE,
      command: { intent: cmd.swIntent, payload },
    });
    this.renderExecutionResult(userIntent, response);
    return response;
  }

  async precompute(intent, slots) {
    if (!this.contextCache?.tabs) this.contextCache = await this.getContext();
    const { tabs } = this.contextCache;
    const activeTab = tabs.find((t) => t.active);

    switch (intent) {
      case "group_tabs": {
        const pattern = slots.pattern?.toLowerCase();
        let filtered = tabs;
        if (pattern)
          filtered = tabs.filter((t) => {
            try {
              return (
                new URL(t.url).hostname.includes(pattern) ||
                (t.title || "").toLowerCase().includes(pattern)
              );
            } catch {
              return false;
            }
          });
        return {
          tabIds: filtered.map((t) => t.id),
          title: slots.groupName,
          color: slots.color,
        };
      }

      case "close_duplicate_tabs": {
        const seen = new Map();
        const dupIds = [];
        for (const t of tabs) {
          const url = (t.url || "").replace(/\/$/, "");
          if (slots.url && !url.includes(slots.url)) continue;
          if (seen.has(url)) dupIds.push(t.id);
          else seen.set(url, t.id);
        }
        return { tabIds: dupIds };
      }

      case "close_tabs_by_domain":
      case "mute_tabs_by_domain":
      case "unmute_tabs_by_domain":
      case "discard_tabs": {
        const domain = (slots.domain || "").toLowerCase();
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
        const params = { tabId: matches[0]?.id };
        if (intent === "mute_tabs_by_domain") params.muted = true;
        if (intent === "unmute_tabs_by_domain") params.muted = false;
        if (intent === "discard_tabs") params.discarded = true;
        return params;
      }

      case "close_other_tabs": {
        return {
          tabIds: tabs
            .filter((t) => t.id !== activeTab?.id && !t.pinned)
            .map((t) => t.id),
        };
      }

      case "duplicate_tab": {
        if (!activeTab) return {};
        return {
          url: activeTab.url,
          active: true,
          index: (activeTab.index || 0) + 1,
        };
      }

      case "sort_tabs": {
        const order = slots.order || "domain";
        const sorted = [...tabs].sort((a, b) => {
          if (order === "title")
            return (a.title || "").localeCompare(b.title || "");
          const dA = a.url ? new URL(a.url).hostname : "";
          const dB = b.url ? new URL(b.url).hostname : "";
          return dA.localeCompare(dB) || (a.index || 0) - (b.index || 0);
        });
        return { tabIds: sorted.map((t) => t.id), index: 0 };
      }

      case "pin_tab": {
        if (!activeTab) return {};
        return { tabId: activeTab.id, pinned: !activeTab.pinned };
      }

      case "reload_tab":
        return { tabId: activeTab?.id, reload: true };

      case "rename_group": {
        if (!activeTab || activeTab.groupId === -1) return {};
        return { groupId: activeTab.groupId, title: slots.name };
      }

      case "remove_bookmark": {
        if (!slots.query) return {};
        try {
          const results = await chrome.runtime.sendMessage({
            type: MSG_GET_BOOKMARKS,
            options: { query: slots.query },
          });
          const node = results?.[0];
          if (!node) return {};
          return { nodeId: node.id };
        } catch {
          return {};
        }
      }

      case "enable_extension":
      case "disable_extension":
      case "uninstall_extension": {
        if (!slots.query) return {};
        try {
          const exts = await chrome.management.getAll();
          const q = slots.query.toLowerCase();
          const match = exts.find(
            (e) => e.id === slots.query || e.name.toLowerCase().includes(q),
          );
          if (!match) return {};
          if (intent === "enable_extension")
            return { id: match.id, enabled: true };
          if (intent === "disable_extension")
            return { id: match.id, enabled: false };
          return { id: match.id };
        } catch {
          return {};
        }
      }

      default:
        return slots;
    }
  }

  async getContext() {
    this.contextCache = await chrome.runtime.sendMessage({
      type: MSG_GET_CONTEXT,
      options: { mode: "detailed" },
    });
    return this.contextCache;
  }

  // ──── 显示模式切换 ────

  async _syncModeButtons() {
    // 不再依赖 active 样式，仅确保模式设置生效
  }

  async _switchMode(mode) {
    // 直接持久化到 storage（确保窗口关闭前完成）
    await chrome.storage.local.set({ displayMode: mode });

    if (mode === "sidepanel") {
      if (window.parent !== window) {
        // 在 overlay iframe 中：关闭 overlay 并打开侧边栏
        window.parent.postMessage({ type: "CLOSE_OVERLAY" }, "*");
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
      // 通知 SW 更新 sidePanel 行为
      await chrome.runtime.sendMessage({ type: MSG_SET_DISPLAY_MODE, mode });
    } else {
      // 切换到弹窗模式：注入 overlay 打开弹窗，然后关闭当前 side panel
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["src/content/overlay.js"],
        });
      } catch (_) {}
      window.close();
      await chrome.runtime.sendMessage({ type: MSG_SET_DISPLAY_MODE, mode });
    }
    await this._syncModeButtons();
  }

  toggleSettings() {
    this.isSettingsOpen = !this.isSettingsOpen;
    this.settingsPanel.style.display = this.isSettingsOpen ? "block" : "none";
    if (this.isSettingsOpen) this.loadSettings();
  }

  async loadSettings() {
    const settings = await chrome.storage.local.get({
      aiProvider: "auto",
      apiKey: "",
      apiEndpoint: "https://api.deepseek.com",
      modelName: "deepseek-chat",
    });
    const form = this.settingsPanel.querySelector("form");
    form.querySelector('[name="aiProvider"]').value = settings.aiProvider;
    form.querySelector('[name="apiKey"]').value = settings.apiKey;
    form.querySelector('[name="apiEndpoint"]').value = settings.apiEndpoint;
    form.querySelector('[name="modelName"]').value = settings.modelName;
    form.onsubmit = async (e) => {
      e.preventDefault();
      await chrome.storage.local.set(Object.fromEntries(new FormData(form)));
      this.aiEngine.reset();
      this.toggleSettings();
    };
  }

  async saveSession() {
    try {
      await chrome.storage.session.set({
        lastInput: this.commandInput.value,
        messageLog: this.messageLog.slice(-50),
        timestamp: Date.now(),
      });
    } catch (_) {}
  }
  async restoreSession() {
    try {
      var raw = sessionStorage.getItem("ai_message_log");
      if (raw) {
        this.messageLog = JSON.parse(raw);
        this._replayMessages();
      }
      const data = await chrome.storage.session.get(["lastInput"]);
      if (data.lastInput) this.commandInput.value = data.lastInput;
    } catch (_) {}
  }

  _addMessage(type, data) {
    this.messageLog.push({ type, ...data });
    if (this.messageLog.length > 100) this.messageLog.shift();
    try {
      sessionStorage.setItem(
        "ai_message_log",
        JSON.stringify(this.messageLog.slice(-50)),
      );
    } catch (_) {}
  }
  async _persistMessages() {
    // 不再需要异步写 chrome.storage，sessionStorage 已在 _addMessage 中同步写入
  }
  _replayMessages() {
    for (const msg of this.messageLog) {
      const el = document.createElement("div");
      switch (msg.type) {
        case "user":
          el.className = "bubble bubble-user";
          el.textContent = msg.text;
          break;
        case "system":
          el.className = "bubble bubble-system";
          el.textContent = msg.text;
          break;
        case "ai":
          el.className = "bubble bubble-ai";
          el.textContent = msg.text;
          break;
        case "ai-chat":
          el.className = "bubble bubble-ai";
          el.innerHTML = this.mdToHtml(msg.text);
          break;
        case "error":
          el.className = "bubble bubble-error";
          el.textContent = msg.text;
          break;
      }
      this.messageContainer.appendChild(el);
    }
    this.scroll();
  }

  renderUserMessage(text) {
    const el = document.createElement("div");
    el.className = "bubble bubble-user";
    el.textContent = text;
    this.messageContainer.appendChild(el);
    this._addMessage("user", { text });
    this.scroll();
  }
  renderSystemMessage(text) {
    const el = document.createElement("div");
    el.className = "bubble bubble-system";
    el.textContent = text;
    this.messageContainer.appendChild(el);
    this._addMessage("system", { text });
    this.scroll();
  }
  renderAIChat(text) {
    const el = document.createElement("div");
    el.className = "bubble bubble-ai";
    el.innerHTML = this.mdToHtml(text);
    // 有待显示截图时，追加图片并复制到剪贴板
    if (this._lastScreenshot) {
      const img = document.createElement("img");
      img.src = this._lastScreenshot;
      img.style.maxWidth = "100%";
      img.style.borderRadius = "8px";
      img.style.marginTop = "8px";
      el.appendChild(img);
      window.parent.postMessage(
        { type: "COPY_SCREENSHOT", dataUrl: this._lastScreenshot },
        "*",
      );
      this._lastScreenshot = null;
    }
    this.messageContainer.appendChild(el);
    this._addMessage("ai-chat", { text });
    this.scroll();
  }
  renderError(error) {
    const el = document.createElement("div");
    el.className = "bubble bubble-error";
    const code = error.code ? `[${error.code}] ` : "";
    el.textContent = `错误: ${code}${error.message || error}`;
    this.messageContainer.appendChild(el);
    this._addMessage("error", {
      text: `错误: ${code}${error.message || error}`,
    });
    this.scroll();
  }
  scroll() {
    this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
  }

  renderExecutionResult(intent, response) {
    // 兼容无 intent 的调用
    if (
      response === undefined &&
      intent !== undefined &&
      typeof intent === "object"
    ) {
      response = intent;
      intent = undefined;
    }
    // 处理结构化错误格式
    if (response.success === false && response.code) {
      const errMsg = `[${response.code}] ${response.message || "操作失败"}`;
      this.renderError({ code: response.code, message: response.message });
      return;
    }
    if (response.error) {
      this.renderError(response.error);
      return;
    }
    const result = response;
    let text = "操作完成";

    // intent 感知覆盖 — 优先匹配
    if (intent === "sort_tabs" && result.moved)
      text = `已按域名排序 ${result.moved} 个标签`;
    else if (intent === "pin_tab")
      text = result.tab?.pinned ? "已固定标签" : "已取消固定";
    else if (intent === "reload_tab") text = "已刷新";
    else if (intent === "rename_group")
      text = result.title ? `已重命名分组: ${result.title}` : "已重命名分组";
    else if (intent === "duplicate_tab") text = "标签已复制";
    else if (intent === "mute_tabs_by_domain" && result.tab) text = "已静音";
    else if (intent === "unmute_tabs_by_domain" && result.tab)
      text = "已取消静音";
    else if (intent === "discard_tabs" && result.tab) text = "已休眠";
    else if (intent === "remove_bookmark") text = "已删除书签";
    else if (intent === "clear_cookies") text = "Cookie 已清理";
    else if (intent === "close_duplicate_tabs" && result.removed)
      text = `已关闭 ${result.removed} 个重复标签`;
    else if (intent === "close_tabs_by_domain" && result.removed)
      text = `已关闭 ${result.removed} 个标签`;
    else if (intent === "close_other_tabs" && result.removed)
      text = `已关闭 ${result.removed} 个标签`;
    else if (result.closed) text = `已为你关闭 ${result.closed} 个标签页`;
    else if (result.focused) text = `已切换到: ${result.focused.title}`;
    else if (result.found && result.bookmarks)
      text = `为你找到 ${result.found} 个书签:\n${result.bookmarks.map((b) => `  ${b.title} — ${b.url}`).join("\n")}`;
    else if (result.items)
      text = `为你找到 ${result.found || result.items.length} 条历史记录:\n${result.items
        .map((it) => {
          const time = it.lastVisit
            ? new Date(it.lastVisit).toLocaleString("zh-CN")
            : "";
          return `  ${it.title}\n    ${it.url}${time ? "\n    " + time : ""}${it.visitCount ? " · 访问 " + it.visitCount + " 次" : ""}`;
        })
        .join("\n")}`;
    else if (result.cookies)
      text = `为你找到 ${result.found} 个 Cookie (${result.domain}):\n${result.cookies.map((c) => `  ${c.name} = ${c.value}${c.secure ? " [安全]" : ""}${c.httpOnly ? " [HttpOnly]" : ""}${c.sameSite ? " SameSite=" + c.sameSite : ""}`).join("\n")}`;
    else if (result.sites)
      text = `为你展示最常访问的 ${result.found} 个网站:\n${result.sites.map((s, i) => `  ${i + 1}. ${s.title} — ${s.url}`).join("\n")}`;
    else if (result.extensions)
      text = `为你找到 ${result.found} 个扩展:\n${result.extensions.map((e) => `  ${e.enabled ? "✓" : "✗"} ${e.name} (${e.id.slice(0, 12)}...)${e.description ? "\n    " + e.description : ""}`).join("\n")}`;
    else if (result.enabled) text = `已为你启用扩展 "${result.enabled}"`;
    else if (result.disabled) text = `已为你禁用扩展 "${result.disabled}"`;
    else if (result.uninstalled)
      text = `已为你卸载扩展 "${result.uninstalled}"`;
    else if (result.permissions) {
      const labels = { allow: "允许", block: "阻止", default: "默认" };
      text = `为你查看 ${result.domain} 的权限设置:\n${Object.entries(
        result.permissions,
      )
        .map(([k, v]) => `  ${k}: ${labels[v] || v}`)
        .join("\n")}`;
    } else if (result.setting && result.value) {
      const label = { allow: "允许", block: "阻止", default: "默认" };
      text = `已将 ${result.domain} 的 ${result.setting} 权限设置为 ${label[result.value] || result.value}`;
    } else if (result.key && result.value !== undefined)
      text = `存储 "${result.key}" = ${typeof result.value === "object" ? JSON.stringify(result.value) : result.value}`;
    else if (result.found) text = `为你找到 ${result.found} 条结果`;
    else if (result.sorted)
      text = `已按 ${result.order} 排序 ${result.sorted} 个标签`;
    else if (result.groupedTabs)
      text = `已创建分组 "${result.title || result.groupName}"，包含 ${result.groupedTabs} 个标签`;
    else if (result.ungrouped) text = `已取消 ${result.ungrouped} 个标签的分组`;
    else if (result.restored) text = `已恢复: ${result.restored}`;
    else if (result.navigated) text = `已导航至 ${result.navigated}`;
    else if (result.muted) text = `已静音 ${result.muted} 个标签`;
    else if (result.pinned !== undefined)
      text = result.pinned ? "已固定标签" : "已取消固定";
    else if (result.reloaded) text = "已刷新";
    else if (result.duplicated) text = "标签已复制";
    else if (result.removed) text = `已删除 ${result.removed} 个书签`;
    else if (result.storageRemoved)
      text = `已删除存储键 "${result.storageRemoved}"`;
    else if (result.bookmark)
      text = `已添加书签: ${result.bookmark.title}${result.bookmark.folder ? ` → ${result.bookmark.folder}` : ""}`;
    else if (result.opened) text = `已打开: ${result.opened}`;
    else if (result.reordered)
      text = `已将 "${result.reordered}" 调整到第 ${result.index} 位`;
    else if (result.moved && result.to)
      text = `已将 "${result.moved}" 移动到 ${result.to}`;
    else if (result.moved) text = `标签已移到位置 ${(result.index || 0) + 1}`;
    else if (result.discarded) text = `已休眠 ${result.discarded} 个标签`;
    else if (result.unmuted) text = `已取消静音 ${result.unmuted} 个标签`;
    else if (result.screenshot) {
      const el = document.createElement("div");
      el.className = "bubble bubble-ai";
      const img = document.createElement("img");
      img.src = result.screenshot;
      img.style.maxWidth = "100%";
      img.style.borderRadius = "8px";
      el.appendChild(img);
      this.messageContainer.appendChild(el);
      this.scroll();
      window.parent.postMessage(
        { type: "COPY_SCREENSHOT", dataUrl: result.screenshot },
        "*",
      );
      this._addMessage("system", {
        text: `[截图: ${result.tabTitle || "页面"}]`,
      });
      return;
    } else if (result.zoom !== undefined)
      text = `缩放: ${Math.round(result.zoom * 100)}%`;
    else if (result.windowId) text = "新窗口已打开";
    else if (result.domain && result.deleted !== undefined)
      text = `已为你清除 ${result.domain} 的 ${result.deleted} 个 Cookie`;
    else if (typeof result.deleted === "string")
      text = `已删除文件夹 "${result.deleted}"`;
    else if (result.deleted)
      text = `已清理 ${result.deleted} 条${result.timeRange ? ` (${result.timeRange})` : ""}历史记录`;
    else if (result.timeRange)
      text = `已清除${result.timeRange === "all" ? "全部" : ""}历史记录`;
    else if (result.groupsCreated !== undefined)
      text =
        result.groupsCreated > 0
          ? `已创建 ${result.groupsCreated} 个分组`
          : "当前页面暂无需要分组";
    else if (result.groups)
      text = `为你找到 ${result.total} 个分组:\n${result.groups.map((g) => `  ${g.title} (${g.count} 个标签)\n    ${g.tabs.map((t) => t.title).join(" · ")}`).join("\n")}`;
    else if (result.renamed && result.to)
      text = `已将文件夹 "${result.renamed}" 重命名为 "${result.to}"`;
    else if (result.renamed) text = `已重命名分组: ${result.renamed}`;
    else if (result.sortedBookmarks)
      text = `已整理 "${result.folder}" 中的 ${result.sortedBookmarks} 个书签`;
    else if (result.folder?.title)
      text = `已创建书签文件夹 "${result.folder.title}"`;
    else if (result.applied) text = result.message || "设置已生效";
    else if (result.darkMode !== undefined)
      text = result.darkMode ? "夜间模式已开启" : "夜间模式已关闭";
    else if (result.themeMode) {
      const modeLabel = { light: "浅色", dark: "深色", device: "跟随设备" };
      text = `当前主题模式: ${modeLabel[result.themeMode] || result.themeMode}`;
    } else if (result.fontSize && result.fontSizeLabel)
      text = `当前字号: ${result.fontSizeLabel} (${result.fontSize}px)`;
    else if (result.fonts)
      text = `当前字体设置:\n标准: ${result.fonts.standard}\n衬线: ${result.fonts.serif}\n无衬线: ${result.fonts.sansSerif}\n等宽: ${result.fonts.fixed}`;
    else if (result.fontSize) text = `字号: ${result.fontSize}`;
    else if (result.font) text = `字体: ${result.font}`;
    else if (result.recording)
      text = result.message || `已开始录制 ${result.recording}`;
    else if (result.saved) text = `录制已保存为 ${result.saved}`;
    else if (result.stopped) text = "录制已停止";
    else if (result.message) text = result.message;
    else if (result.action === "query")
      text = `找到 ${result.count} 个匹配元素:\n${result.items.map((it) => `  [${it.index}] ${it.text || it.html || ""}`).join("\n")}`;
    else if (result.action === "modify")
      text = `已修改 ${result.changed} 个 "${result.value}" 的 ${result.property}`;
    else if (result.action === "remove")
      text = `已删除 ${result.removed} 个元素`;
    else if (result.action === "add") text = `已添加 <${result.tag}>`;
    else if (result.action === "style")
      text = `已修改 ${result.changed} 个元素样式`;
    else if (result.action === "event") {
      const label = {
        click: "点击",
        input: "输入",
        focus: "聚焦",
        blur: "失焦",
        submit: "提交表单",
        change: "变更",
        scroll: "滚动",
        select: "全选",
        keydown: "按键",
        keyup: "抬起",
        dblclick: "双击",
      };
      text = `已对 "${result.value}" 触发 ${label[result.eventType] || result.eventType} 事件`;
    }
    const el = document.createElement("div");
    el.className = "bubble bubble-ai";
    el.textContent = text;
    this.messageContainer.appendChild(el);
    this._addMessage("ai", { text });
    this.scroll();
  }

  renderConfirmation(intent, slots, preview, options = {}) {
    const card = document.createElement("div");
    card.className = "confirm-card";
    card.innerHTML = `<div class="confirm-card-title">${preview.title}</div>${preview.description ? `<div class="confirm-card-desc">${preview.description}</div>` : ""}${preview.items?.length ? `<div class="confirm-card-items">${preview.items.map((item) => `<div class="confirm-card-item"><span class="primary">${item.primary || item.title}</span><span class="secondary">${item.secondary || ""}</span></div>`).join("")}</div>` : ""}<div class="confirm-card-actions"><button class="btn-cancel">取消</button><button class="btn-confirm">确认执行</button></div>`;
    card.querySelector(".btn-cancel").addEventListener("click", () => {
      card.remove();
      const cancelMsg = options.cancelMessage || "操作已取消";
      this.renderSystemMessage(cancelMsg);
      if (options.onCancel) options.onCancel();
    });
    card.querySelector(".btn-confirm").addEventListener("click", async () => {
      const btn = card.querySelector(".btn-confirm");
      btn.disabled = true;
      btn.textContent = "执行中...";
      if (options.onConfirm) {
        try {
          await options.onConfirm();
          card.remove();
        } catch (error) {
          card.remove();
          this.renderError({ message: error.message });
        }
      } else {
        try {
          const response = await this.dispatchToSW(intent, slots);
          card.remove();
          if (response) this.renderExecutionResult(intent, response);
        } catch (error) {
          card.remove();
          this.renderError({ message: error.message });
        }
      }
    });
    this.messageContainer.appendChild(card);
    this.scroll();
  }

  renderHelp(commands) {
    const text =
      "可用命令:\n\n" +
      commands
        .map(
          (c) =>
            `  /${c.slash}${c.hasArg ? " <" + (c.placeholder || "参数") + ">" : ""}  —  ${c.description}`,
        )
        .join("\n");
    const el = document.createElement("div");
    el.className = "bubble bubble-system";
    el.textContent = text;
    this.messageContainer.appendChild(el);
    this._addMessage("system", { text });
    this.scroll();
  }
  mdToHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+?)\*/g, "<em>$1</em>");
  }

  navigateHistory(direction) {
    const len = this.commandHistory.length;
    if (len === 0) return;
    if (direction === -1) {
      if (this.historyIndex === -1) {
        this._historyDraft = this.commandInput.value;
        this.historyIndex = 0;
      } else if (this.historyIndex < len - 1) this.historyIndex++;
      else return;
    } else {
      if (this.historyIndex <= 0) {
        this.historyIndex = -1;
        this.commandInput.value = this._historyDraft;
        this._historyDraft = "";
        this.commandInput.setSelectionRange(
          this.commandInput.value.length,
          this.commandInput.value.length,
        );
        return;
      }
      this.historyIndex--;
    }
    this.commandInput.value = this.commandHistory[len - 1 - this.historyIndex];
    this.commandInput.setSelectionRange(
      this.commandInput.value.length,
      this.commandInput.value.length,
    );
  }
}

/**
 * 对执行结果进行安全精简，防止 base64 dataUrl 等大字符串撑爆 AI 上下文 token。
 * - 删除任何键名包含 dataUrl / data_url 的字段
 * - 将超过 500 字符的字符串值截断为前 200 字符 + 长度提示
 */
function _sanitizeResult(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return obj.length > 500
      ? obj.slice(0, 200) + `...[截断, 原长 ${obj.length} 字符]`
      : obj;
  }
  if (typeof obj !== "object") return obj;

  // Use JSON parse/stringify to deeply clone and clean, with cycle detection
  const seen = new WeakSet();
  try {
    const str = JSON.stringify(obj, (key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      // Skip large URL fields
      if (/data[_]?url|screenshot/i.test(key)) return undefined;
      // Truncate long strings
      if (typeof val === "string" && val.length > 500) {
        return val.slice(0, 200) + `...[截断, 原长 ${val.length} 字符]`;
      }
      return val;
    });
    return JSON.parse(str);
  } catch (e) {
    // Fallback: return a safe summary
    return { _error: "serialization failed", _keys: Object.keys(obj) };
  }
}

document.addEventListener("DOMContentLoaded", () => new SidePanel());
