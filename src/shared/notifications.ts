/**
 * 系统通知工具
 *
 * 任务完成时调用 chrome.notifications 弹系统通知，提醒用户切回侧边栏查看结果。
 * 仅在侧边栏（extension page）上下文调用——chrome.notifications.create 在扩展页面可直接用，
 * 无需走 service worker。通知交互回调（onClicked 等）需在 SW 注册，第一版不需要。
 */

/** 通知图标：扩展自身图标，chrome.runtime.getURL 取运行时可访问的绝对 URL */
const NOTIFICATION_ICON = chrome.runtime.getURL('icons/icon-128.png')

/** 通知 id 固定，让新通知替换旧的，避免长时间堆积多条 */
const NOTIFICATION_ID = 'ai-commander-task-done'

/**
 * 截断文本到指定长度，超出加省略号。
 * @param text - 原文
 * @param max - 最大字符数
 * @returns 截断后的文本
 */
function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

/**
 * 从 AI done 回复里提取纯文本摘要（剥掉 markdown 语法符号）。
 * 用于通知正文，让用户一眼看到结果大意。
 * 只删 markdown 语法结构，不动正文字符（保留连字符、竖线等可能出现在内容里的字符）。
 * @param reply - AI 回复的 markdown 或纯文本
 * @returns 去掉 markdown 符号的纯文本
 */
function extractPlainSummary(reply: string): string {
  if (!reply) return ''
  return reply
    .replace(/```[\s\S]*?```/g, '') // 代码块
    .replace(/<[^>]+\/?>/g, '') // HTML/组件占位符标签
    .replace(/^#{1,6}\s+/gm, '') // 行首标题标记 # ## ###
    .replace(/^\s*[-*+]\s+/gm, '') // 行首无序列表标记
    .replace(/^\s*\d+\.\s+/gm, '') // 行首有序列表标记
    .replace(/^\s*>\s?/gm, '') // 行首引用标记
    .replace(/^\|.*\|\s*$/gm, '') // 表格行（含分隔行）
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **加粗** 保留文字
    .replace(/__([^_]+)__/g, '$1') // __加粗__ 保留文字
    .replace(/\*([^*]+)\*/g, '$1') // *斜体* 保留文字
    .replace(/_([^_]+)_/g, '$1') // _斜体_ 保留文字
    .replace(/`([^`]+)`/g, '$1') // `行内代码` 保留文字
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/\n+/g, ' ')
    .trim()
}

/**
 * 发送任务完成系统通知。
 * 通知失败静默忽略——通知是锦上添花，不能影响 agent 主流程。
 * @param userText - 用户原始指令（用于通知正文，标注是哪个任务）
 * @param replySummary - AI 完成回复的纯文本或 markdown（可选，提取摘要用）
 */
export async function notifyTaskDone(userText: string, replySummary?: string): Promise<void> {
  try {
    const commandText = truncate(userText || '', 40)
    const resultText = truncate(extractPlainSummary(replySummary || ''), 60)
    const message = [
      commandText ? `指令：${commandText}` : '',
      resultText ? `结果：${resultText}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    await chrome.notifications.create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: NOTIFICATION_ICON,
      title: '任务完成喵~',
      message: message || '任务已完成，请回到侧边栏查看结果',
      priority: 2,
      requireInteraction: false,
    })
  } catch (e) {
    // 通知权限被拒/ API 异常等，静默忽略，不影响主流程
    console.warn('[AI管家] 发送通知失败:', e)
  }
}
