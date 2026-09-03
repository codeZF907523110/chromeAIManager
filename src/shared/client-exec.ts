export interface ClientExecResult {
  clientExec?: string
  tabIds?: unknown
  groupId?: unknown
  title?: unknown
  color?: unknown
  windowId?: unknown
  changes?: unknown
}

export interface ClientExecOutcome {
  success: boolean
  message: string
  code?: string
}

type ClientExecHandler = (result: ClientExecResult) => Promise<ClientExecOutcome>

/** 校验非空且不重复的数字标签页 ID。 */
function parseTabIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  if (!value.every((id) => typeof id === 'number' && Number.isInteger(id) && id >= 0)) return null
  return new Set(value).size === value.length ? value : null
}

/** 校验标签组 ID。 */
function parseGroupId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** 执行标签组属性更新并回读真实标签组。 */
async function updateGroup(result: ClientExecResult): Promise<ClientExecOutcome> {
  const groupId = parseGroupId(result.groupId)
  if (groupId === null || !isPlainObject(result.changes))
    return failure('INVALID_PARAMS', '标签组更新参数无效')
  await chrome.tabGroups.get(groupId)
  await chrome.tabGroups.update(groupId, result.changes)
  const group = await chrome.tabGroups.get(groupId)
  return success(`已更新标签组${group?.title ? `：${group.title}` : ''}`)
}

/** 创建标签组并回读成员。 */
async function createGroup(result: ClientExecResult): Promise<ClientExecOutcome> {
  const tabIds = parseTabIds(result.tabIds)
  if (!tabIds) return failure('INVALID_PARAMS', '创建标签组 tabIds 无效')
  for (const tabId of tabIds) await chrome.tabs.get(tabId)
  const windowId = result.windowId
  if (windowId !== undefined && parseGroupId(windowId) === null)
    return failure('INVALID_PARAMS', 'windowId 无效')
  const groupId = await chrome.tabs.group({
    tabIds,
    createProperties: windowId === undefined ? undefined : { windowId: windowId as number },
  })
  if (typeof result.title === 'string' || typeof result.color === 'string') {
    await chrome.tabGroups.update(groupId, {
      ...(typeof result.title === 'string' ? { title: result.title } : {}),
      ...(typeof result.color === 'string' ? { color: result.color } : {}),
    })
  }
  const group = await chrome.tabGroups.get(groupId)
  const tabs = await chrome.tabs.query({ groupId })
  return success(`已创建标签组${group?.title ? `：${group.title}` : ''}（${tabs.length} 个标签）`)
}

/** 将标签加入已有标签组并回读成员。 */
async function moveTabs(result: ClientExecResult): Promise<ClientExecOutcome> {
  const groupId = parseGroupId(result.groupId)
  const tabIds = parseTabIds(result.tabIds)
  if (groupId === null || !tabIds) return failure('INVALID_PARAMS', '加入标签组参数无效')
  await chrome.tabGroups.get(groupId)
  for (const tabId of tabIds) await chrome.tabs.get(tabId)
  await chrome.tabs.group({ groupId, tabIds })
  const tabs = await chrome.tabs.query({ groupId })
  return success(`已将 ${tabs.length} 个标签页加入标签组`)
}

/** 将标签移出标签组并回读目标标签。 */
async function ungroupTabs(result: ClientExecResult): Promise<ClientExecOutcome> {
  const tabIds = parseTabIds(result.tabIds)
  if (!tabIds) return failure('INVALID_PARAMS', '移出标签组 tabIds 无效')
  for (const tabId of tabIds) await chrome.tabs.get(tabId)
  await chrome.tabs.ungroup(tabIds)
  await Promise.all(tabIds.map((tabId) => chrome.tabs.get(tabId)))
  return success(`已将 ${tabIds.length} 个标签页移出标签组`)
}

/** ClientExec 类型到执行器的唯一映射。 */
export const CLIENT_EXEC_HANDLERS: Record<string, ClientExecHandler> = {
  tab_groups_update: updateGroup,
  tabs_group_create: createGroup,
  tabs_group_move: moveTabs,
  tabs_ungroup: ungroupTabs,
}

/** 执行一个受支持的 clientExec 请求。 */
export async function executeClientExec(
  result: ClientExecResult
): Promise<ClientExecOutcome | null> {
  if (!result.clientExec) return null
  const handler = CLIENT_EXEC_HANDLERS[result.clientExec]
  if (!handler) return null
  try {
    return await handler(result)
  } catch (error: unknown) {
    return failure('CLIENT_EXEC_FAILED', error instanceof Error ? error.message : String(error))
  }
}

/** 创建成功结果。 */
function success(message: string): ClientExecOutcome {
  return { success: true, message }
}

/** 创建失败结果。 */
function failure(code: string, message: string): ClientExecOutcome {
  return { success: false, code, message }
}

/** 判断值是否为普通对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
