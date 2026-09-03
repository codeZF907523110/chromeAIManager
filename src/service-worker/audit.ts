/** Service Worker 执行审计记录器；只保存非敏感摘要并限制记录数量。 */
export interface AuditEntry {
  timestamp: number
  tool: string
  success: boolean
  code?: string
  durationMs: number
  confirmed: boolean
  context?: {
    argKeys?: string[]
    tabCount?: number
  }
}

export const AUDIT_KEY = 'mv3_audit_entries'
const MAX_ENTRIES = 100
const SENSITIVE_KEY_PATTERN = /cookie|token|password|secret|apiKey|auth/i

/** 构造不含敏感字段的审计摘要；避免在审计中记录 payload、URL 全量、Cookie value 等。 */
export function sanitizeForAudit(input: unknown): unknown {
  if (input == null) return input
  if (Array.isArray(input)) return input.map(sanitizeForAudit)
  if (typeof input !== 'object') return input
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    result[key] = sanitizeForAudit(value)
  }
  return result
}

/** 提取参数 key 列表（不含 value）用于审计摘要。 */
export function summarizeArgsKeys(args: Record<string, unknown>): string[] {
  return Object.keys(args)
    .filter(
      (key) => key !== 'force' && key !== 'confirmationToken' && !SENSITIVE_KEY_PATTERN.test(key)
    )
    .sort()
}

/** 记录一次工具执行结果，不写入参数值、URL、Cookie 值或其它敏感数据。 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const current = (await chrome.storage.session.get(AUDIT_KEY)) as Record<string, unknown>
    const entries = Array.isArray(current[AUDIT_KEY]) ? (current[AUDIT_KEY] as AuditEntry[]) : []
    const sanitized: AuditEntry = {
      ...entry,
      context: entry.context ? { ...entry.context } : undefined,
    }
    entries.push(sanitized)
    await chrome.storage.session.set({ [AUDIT_KEY]: entries.slice(-MAX_ENTRIES) })
  } catch {
    // 审计失败不能影响浏览器操作结果。
  }
}

/** 读取当前审计条目，仅返回最近 100 条。 */
export async function readAuditEntries(): Promise<AuditEntry[]> {
  try {
    const current = (await chrome.storage.session.get(AUDIT_KEY)) as Record<string, unknown>
    return Array.isArray(current[AUDIT_KEY]) ? (current[AUDIT_KEY] as AuditEntry[]) : []
  } catch {
    return []
  }
}
