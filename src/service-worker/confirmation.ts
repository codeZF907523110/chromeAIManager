interface ConfirmationRecord {
  tool: string
  token: string
  expiresAt: number
  fingerprint: string
}

const confirmations = new Map<string, ConfirmationRecord>()

/** 生成参数指纹，过滤确认控制字段后绑定危险操作目标。 */
function fingerprint(args: Record<string, unknown>): string {
  const { force: _force, confirmationToken: _token, ...payload } = args
  return JSON.stringify(payload, Object.keys(payload).sort())
}

/** 创建绑定工具和参数的短期一次性确认 token。 */
export function issueConfirmation(tool: string, args: Record<string, unknown>): string {
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`
  confirmations.set(token, {
    tool,
    token,
    fingerprint: fingerprint(args),
    expiresAt: Date.now() + 5 * 60 * 1000,
  })
  return token
}

/** 校验工具、参数并消费确认 token，防止过期和重复使用。 */
export function consumeConfirmation(
  tool: string,
  args: Record<string, unknown>,
  token: unknown
): boolean {
  if (typeof token !== 'string') return false
  const record = confirmations.get(token)
  confirmations.delete(token)
  return (
    !!record &&
    record.tool === tool &&
    record.fingerprint === fingerprint(args) &&
    record.expiresAt > Date.now()
  )
}
