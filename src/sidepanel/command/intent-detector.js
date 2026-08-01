/**
 * 意图识别器 — 已由 Agent Loop 替代，保留作为兼容层（不可用）
 */
import { repairJSON } from '../../shared/json-repair.js';
import { COMMANDS } from '../../shared/commands.js';

const MAX_RETRIES = 2;

export async function detectIntent(aiEngine, userInput, context) {
  const ctx = truncateIfNeeded(context, 40);
  const systemPrompt = buildSystemPrompt(ctx);

  let lastError, lastRaw;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      const raw = await aiEngine.prompt(systemPrompt, userInput, { temperature: 0.1 });
      lastRaw = raw;
      console.log('[AI管家] 原始响应:', raw);

      const json = repairJSON(raw);
      console.log('[AI管家] 解析结果:', json);

      if (!json.intent && !json.steps) {
        // 既无 intent 也无 steps，尝试修复
        const corrected = fuzzyMatch(json.intent || json[0]?.intent);
        if (corrected) {
          return { intent: corrected, slots: json.slots || {}, confidence: 0.5, raw };
        }
        return { intent: 'unknown', slots: {}, error: 'INTENT_NOT_FOUND', raw };
      }

      // 多步命令
      if (Array.isArray(json.steps) && json.steps.length > 0) {
        const commands = [];
        for (const step of json.steps) {
          if (!step.intent) continue;
          if (!COMMANDS.find(c => c.intent === step.intent)) {
            const corrected = fuzzyMatch(step.intent);
            if (corrected) step.intent = corrected;
            else continue; // 跳过无法识别的步骤
          }
          commands.push({ intent: step.intent, slots: step.slots || {}, confidence: json.confidence || 0.5 });
        }
        if (commands.length > 0) {
          return { commands, confidence: json.confidence || 0.5, raw };
        }
        return { intent: 'unknown', slots: {}, error: 'NO_VALID_STEPS', raw };
      }

      // 单步命令
      if (!COMMANDS.find(c => c.intent === json.intent)) {
        const corrected = fuzzyMatch(json.intent);
        if (corrected) { json.intent = corrected; } else {
          return { intent: 'unknown', slots: {}, error: 'INTENT_NOT_FOUND', raw };
        }
      }

      // chat 意图额外携带 reply 字段
      const extra = json.intent === 'chat' ? { reply: json.reply || '' } : {};
      return { intent: json.intent, slots: json.slots || {}, confidence: json.confidence || 0.5, ...extra };
    } catch (e) {
      lastError = e;
      console.error('[AI管家] 解析失败:', e.message);
    }
  }

  return { intent: 'unknown', slots: {}, error: lastError?.message || 'AI_PARSE_FAILED', raw: lastRaw };
}

function truncateIfNeeded(context, max) {
  if (!context.tabs || context.tabs.length <= max) return context;
  const wid = context.activeTab?.windowId;
  const cur = context.tabs.filter(t => t.windowId === wid);
  const oth = context.tabs.filter(t => t.windowId !== wid);
  return { ...context,
    tabs: [...cur.slice(0, Math.floor(max * 0.6)), ...oth.slice(0, Math.floor(max * 0.4))],
    _truncated: true
  };
}

function fuzzyMatch(raw) {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().replace(/[_-]/g, '');
  return COMMANDS.find(c => c.intent.toLowerCase().replace(/[_-]/g, '') === cleaned)?.intent || null;
}
