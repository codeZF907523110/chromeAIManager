import type { AIPlan, PlanItem } from '../shared/ai/plan-types'

const MAX_PLAN_ITEMS = 50
const MAX_ID_LENGTH = 64
const MAX_THOUGHT_LENGTH = 200
const MAX_REPLY_LENGTH = 4000

/** 判断值是否为无原型污染的普通对象。 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 判断对象是否只包含允许字段，防止隐藏字段进入特权链路。 */
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

/** 校验 plan item 的字段、依赖和参数基础结构。 */
export function isValidPlanItem(value: unknown): value is PlanItem {
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value, ['id', 'tool', 'args', 'deps', 'mergedFrom', 'seededResults'])
  )
    return false
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= MAX_ID_LENGTH &&
    /^[a-zA-Z0-9_-]+$/.test(value.id) &&
    typeof value.tool === 'string' &&
    value.tool.length > 0 &&
    isPlainObject(value.args) &&
    Array.isArray(value.deps) &&
    value.deps.length <= MAX_PLAN_ITEMS &&
    value.deps.every((dependency) => typeof dependency === 'string') &&
    (value.mergedFrom === undefined ||
      (Array.isArray(value.mergedFrom) &&
        value.mergedFrom.every((item) => typeof item === 'string'))) &&
    (value.seededResults === undefined || isPlainObject(value.seededResults))
  )
}

/** 校验来自扩展页面的消息来源。 */
export function isAuthorizedSender(
  sender:
    { id?: string; url?: string; documentUrl?: string; contextType?: string } | null | undefined,
  runtimeId: string
): boolean {
  if (!sender || sender.id !== runtimeId) return false
  const sourceUrl = sender.url ?? sender.documentUrl
  if (!sourceUrl) return true
  return sourceUrl.startsWith(`chrome-extension://${runtimeId}/`)
}

/** 校验自然语言 Plan 的外层结构、互斥分支、数量和依赖引用。 */
export function isValidAIPlan(value: unknown): value is AIPlan {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ['thought', 'plan', 'chat'])) return false
  if (typeof value.thought !== 'string' || value.thought.length > MAX_THOUGHT_LENGTH) return false
  const hasPlan = value.plan !== undefined
  const hasChat = value.chat !== undefined
  if (hasPlan === hasChat) return false
  if (hasChat) {
    return (
      isPlainObject(value.chat) &&
      hasOnlyKeys(value.chat, ['reply']) &&
      typeof value.chat.reply === 'string' &&
      value.chat.reply.length <= MAX_REPLY_LENGTH
    )
  }
  if (
    !Array.isArray(value.plan) ||
    value.plan.length > MAX_PLAN_ITEMS ||
    !value.plan.every(isValidPlanItem)
  )
    return false
  const ids = new Set(value.plan.map((item) => item.id))
  return value.plan.every((item) =>
    item.deps.every((dependency) => dependency !== item.id && ids.has(dependency))
  )
}

/** 校验消息信封，按消息类型限制顶层字段和 command 结构。 */
export function validateMessageEnvelope(value: unknown): boolean {
  if (!isPlainObject(value) || typeof value.type !== 'string') return false
  if (!hasOnlyKeys(value, ['type', 'command', 'options', 'kind'])) return false
  if (value.command !== undefined && !isPlainObject(value.command)) return false
  if (value.options !== undefined && !isPlainObject(value.options)) return false
  return true
}
