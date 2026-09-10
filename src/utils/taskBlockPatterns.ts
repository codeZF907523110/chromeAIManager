/**
 * 任务块识别前缀集合。
 *
 * 只列出 useAIEngine.ts 里 agentLoop 内部 addMessage('system', ...) 使用的字符串前缀。
 * 块外独立 system 气泡（slash 命令错误、IndexedDB 警告、录制回调、recoverContext 恢复
 * 等）使用的字符串不在此集合内，会自然落到普通气泡渲染分支。
 *
 * 维护说明：如新增 agentLoop 内的 system 文案，要同步追加到本集合，否则会被当成
 * 普通气泡展示。
 */
export const TASK_BLOCK_PREFIXES: readonly string[] = [
  // 进度提示
  '思考中...',
  '执行中...',
  '已重新扫描页面',
  '页面扫描完成',
  '意图分析完成',
  '计划已就绪',
  '所有步骤执行完毕',
  // 步骤 summary："[N] ✓ toolName"
  '[',
  // 思考流
  '💭 AI 思考：',
  // 任务生命周期
  '已停止当前任务',
  '任务执行超时',
  '任务完成',
  '任务部分完成',
  // 连续失败
  '连续 ',
  // 用户交互
  '需要您提供一些信息',
  '需要用户提供数据',
  '已接收用户数据',
  // 失败兜底
  '抱歉，AI 服务',
  '抱歉，AI 没有返回',
  '抱歉，我没有理解',
  '抱歉，这个操作我无法执行',
  '抱歉，这个操作没有成功',
  '抱歉，执行过程中遇到',
  '抱歉，上一步执行遇到',
  '抱歉，处理请求时遇到',
  '抱歉，Service Worker',
] as const

/**
 * 判断一条 system 气泡文案是否属于 agentLoop 任务块成员。
 *
 * 简化策略：startsWith 任一前缀即视为任务块成员。纯字符串匹配无副作用，
 * 渲染层根据这个判定把连续的匹配项打包成 TaskBlock。
 *
 * @param text MessageLog.text.markdown
 * @returns 是否属于任务块
 */
export function isTaskSystemMessage(text: string): boolean {
  for (const p of TASK_BLOCK_PREFIXES) {
    if (text.startsWith(p)) return true
  }
  return false
}
