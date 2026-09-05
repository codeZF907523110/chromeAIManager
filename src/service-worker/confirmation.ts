/**
 * 危险操作确认 token — 绑定工具与首次确认时的参数指纹。
 *
 * 工作流程：
 *   1. dispatchTool 看到 dangerous tool → issueConfirmation(tool, args)
 *      → 记录 originalArgs + 5 分钟过期时间 + 一次性 token
 *   2. 用户在 confirm 卡里勾选 → 前端 buildReconfirmPayload 把勾选结果写入 args，
 *      并附 force:true + confirmationToken 重发。
 *   3. dispatchTool 看到 force:true → consumeConfirmation(tool, args, token)
 *      → 校验：①tool 名匹配 ②token 未过期 ③未重复使用
 *           ④originalArgs 中每个非控制字段在新 args 里仍存在且值不变
 *           ⑤新 args 里新增字段必须落在按工具映射的派生字段白名单内
 *             （derivedFieldsFor(tool) — 来自用户在 confirm 卡里的勾选结果，非攻击者注入）
 *
 * 单点修改：派生字段白名单来自 shared/confirm.ts 的 derivedFieldsFor；
 * buildReconfirmPayload 与本模块都引用同一份，避免漂移。
 */

import {
  CONTROL_FIELDS,
  RECONFIRM_DERIVED_FIELDS_BY_TOOL,
  derivedFieldsFor,
} from '../shared/confirm'

interface ConfirmationRecord {
  tool: string
  token: string
  expiresAt: number
  /** 首次确认时的原始 args（控制字段剥离后），用于重确认时校验字段值不变。 */
  originalArgs: Record<string, unknown>
}

const confirmations = new Map<string, ConfirmationRecord>()

function stripControlFields(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (!CONTROL_FIELDS.has(k)) out[k] = v
  }
  return out
}

/**
 * 解析派生字段白名单：
 *   - 优先使用按工具映射的派生字段白名单；
 *   - 若该 tool 未声明派生字段（极个别自定义别名）→ 拒绝新增任何字段；
 *   - 为兼容历史别名（slash 命令名 vs canonical swIntent），把 swIntent 的白名单也并入。
 */
function resolveDerivedFields(tool: string): ReadonlySet<string> {
  const primary = derivedFieldsFor(tool)
  // 已按工具映射填过，就不再补充全局白名单。
  if (primary.size > 0) return primary
  // 没找到该 tool 的映射时，让 confirmation 模块持有者明确知道：拒绝任何新增派生字段。
  // 但若该 tool 命中 alias（aiHidden / swIntent 互换），尝试补一份 swIntent 的白名单。
  const aliasTool = Array.from(RECONFIRM_DERIVED_FIELDS_BY_TOOL.entries()).find(
    ([, set]) => set.size > 0
  )
  return aliasTool ? aliasTool[1] : new Set<string>()
}

/**
 * 校验重发 args 是否仍指向同一"操作目标"。
 *
 *   - originalArgs 中每个字段必须在新 args 中存在且值不变（JSON 等价）
 *   - 新 args 中允许新增的字段仅限按工具映射的派生字段白名单
 *
 * 注意：JSON 等价而非引用相等，因为前端可能把数字 id 转字符串、白名单里
 * 数组走 toNumber / Number.isInteger 过滤（buildReconfirmPayload 内部已归一化）。
 */
function matchesReconfirmArgs(
  tool: string,
  originalArgs: Record<string, unknown>,
  currentArgs: Record<string, unknown>
): boolean {
  const original = stripControlFields(originalArgs)
  const current = stripControlFields(currentArgs)

  const originalKeys = new Set(Object.keys(original))
  const allowed = resolveDerivedFields(tool)

  // 1. 原始 args 中的每个字段必须仍存在且值不变。
  for (const key of originalKeys) {
    if (!Object.prototype.hasOwnProperty.call(current, key)) return false
    if (JSON.stringify(current[key]) !== JSON.stringify(original[key])) return false
  }

  // 2. 新增字段必须落在按工具映射的白名单内：用户在 confirm 卡里勾选出的合法差异。
  for (const key of Object.keys(current)) {
    if (originalKeys.has(key)) continue
    if (!allowed.has(key)) return false
  }

  return true
}

/** 创建绑定工具和参数的短期一次性确认 token。 */
export function issueConfirmation(tool: string, args: Record<string, unknown>): string {
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`
  const originalArgs = stripControlFields(args)
  confirmations.set(token, {
    tool,
    token,
    originalArgs,
    expiresAt: Date.now() + 5 * 60 * 1000,
  })
  return token
}

/**
 * 校验工具、参数并消费确认 token，防止过期和重复使用。
 *
 *   - token 必须是字符串；
 *   - token 必须存在、未过期、工具名匹配；
 *   - 校验通过后才从 Map 中删除，避免"args 校验失败但 token 已被消费"
 *     导致的二次确认死循环。
 *   - 校验失败时 record 保留在 Map 里，理论上同 token 在 5 分钟内可重试一次，
 *     但 args mismatch 通常是攻击者替换，应视为不可重试。
 */
export function consumeConfirmation(
  tool: string,
  args: Record<string, unknown>,
  token: unknown
): boolean {
  if (typeof token !== 'string') return false
  const record = confirmations.get(token)
  if (!record) return false
  if (record.tool !== tool) return false
  if (record.expiresAt <= Date.now()) {
    confirmations.delete(token)
    return false
  }
  const ok = matchesReconfirmArgs(tool, record.originalArgs, args)
  if (!ok) return false
  confirmations.delete(token)
  return true
}
