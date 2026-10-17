/**
 * AI 适配器共享的端点权限检查
 *
 * Chrome 扩展向任意 API 端点发请求需要对应 origin 的主机权限。
 * manifest 未预声明 AI 端点（用户运行时自行配置），因此首次调用前
 * 通过 chrome.permissions 动态申请（复用浏览器已授权则静默通过）。
 */

/**
 * 确保已持有 AI 端点 origin 的主机权限，未持有则向用户申请
 *
 * @param endpoint 完整 API 端点（取其 origin 申请）
 * @throws 用户拒绝授权时抛出带端点信息的错误（上层按权限错误终止重试）
 */
export async function ensureEndpointPermission(endpoint: string): Promise<void> {
  const origin = new URL(endpoint).origin
  const ok = await chrome.permissions.contains({ origins: [`${origin}/*`] })
  console.log('[AI-debug] permissions.contains', { origin, granted: ok })
  if (ok) return
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
  console.log('[AI-debug] permissions.request RESULT', { origin, granted })
  if (!granted) throw new Error(`需要 ${origin} 的访问权限`)
}
