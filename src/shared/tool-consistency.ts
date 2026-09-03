import { COMMANDS } from './commands'
import { REGISTRY, DANGEROUS_TOOLS } from '../service-worker/handlers'

export interface ConsistencyIssue {
  kind:
    'missing-handler' | 'missing-command' | 'duplicate-intent' | 'duplicate-tool' | 'risk-mismatch'
  name: string
  message: string
}

/** 检查命令定义、handler 注册表和危险策略是否保持一致。 */
export function findToolConsistencyIssues(): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const publicCommands = COMMANDS.filter((command) => !command.aiHidden && command.swIntent)
  const tools = new Map<string, number>()
  const intents = new Map<string, number>()
  for (const command of publicCommands) {
    tools.set(command.swIntent!, (tools.get(command.swIntent!) ?? 0) + 1)
    intents.set(command.intent, (intents.get(command.intent) ?? 0) + 1)
    if (!REGISTRY[command.swIntent!]) {
      issues.push({
        kind: 'missing-handler',
        name: command.swIntent!,
        message: '命令没有对应 handler',
      })
    }
    if (command.dangerous !== DANGEROUS_TOOLS.has(command.swIntent!)) {
      issues.push({
        kind: 'risk-mismatch',
        name: command.swIntent!,
        message: '危险标记与执行策略不一致',
      })
    }
  }
  for (const [name, count] of tools) {
    if (count > 1) issues.push({ kind: 'duplicate-tool', name, message: '公开工具重复定义' })
  }
  for (const [name, count] of intents) {
    if (count > 1) issues.push({ kind: 'duplicate-intent', name, message: 'intent 重复定义' })
  }
  return issues
}
