# Manifest V3 权限矩阵

> 本矩阵以 `src/service-worker/handlers/index.ts` 的注册表为准。`compat` 表示仅为旧 UI/slash command 保留；`deferred/unsupported` 不进入 AI 工具清单。

| 工具范围                                      | Chrome API                                        | Manifest 权限          | Context                            | 风险  | 确认                           | 敏感输出       | 状态                          |
| --------------------------------------------- | ------------------------------------------------- | ---------------------- | ---------------------------------- | ----- | ------------------------------ | -------------- | ----------------------------- |
| `tabs_*` 查询/创建/更新/导航/截图/缩放        | `chrome.tabs.*`                                   | `tabs`, `activeTab`    | SW、extension page                 | L0-L1 | 写操作按策略                   | 截图/URL 受限  | supported                     |
| `tab_groups_*`                                | `chrome.tabGroups.*`, `chrome.tabs.group/ungroup` | `tabGroups`, `tabs`    | SW 查询、extension page clientExec | L1    | 创建/修改按策略                | 否             | supported/experimental        |
| `windows_*`                                   | `chrome.windows.*`                                | `tabs`                 | SW、extension page                 | L1-L2 | remove 必须确认                | 否             | supported                     |
| `bookmarks_*`                                 | `chrome.bookmarks.*`                              | `bookmarks`            | SW                                 | L0-L2 | 删除必须确认                   | URL 最小化     | supported/compat              |
| `history_*`                                   | `chrome.history.*`                                | `history`              | SW                                 | L0-L2 | 删除必须确认                   | URL 最小化     | supported/compat              |
| `sessions_*`                                  | `chrome.sessions.*`                               | `sessions`             | SW                                 | L1-L2 | restore 按策略                 | URL/设备摘要   | supported/compat              |
| `downloads_*`                                 | `chrome.downloads.*`                              | `downloads`            | SW                                 | L1-L2 | cancel/erase/removeFile 按策略 | 路径最小化     | supported                     |
| `browsing_data_*`                             | `chrome.browsingData.*`                           | `browsingData`         | SW                                 | L2    | 强确认                         | 不返回内容     | supported/experimental        |
| `storage_*`                                   | `chrome.storage.*`                                | `storage`              | SW                                 | L1-L2 | 写删清空按策略                 | denylist       | supported/compat              |
| `cookies_*`                                   | `chrome.cookies.*`                                | `cookies`, host access | SW                                 | L2    | set/remove 必须确认            | 永不返回 value | supported/experimental        |
| `content_settings_*` / `permissions_*`        | `chrome.contentSettings.*`                        | `contentSettings`      | SW                                 | L1-L2 | 修改/清除按策略                | 否             | supported/compat              |
| `notifications_*`                             | `chrome.notifications.*`                          | `notifications`        | SW                                 | L1-L2 | clear 必须确认                 | 文本限长       | supported                     |
| `top_sites_observe`                           | `chrome.topSites.get`                             | `topSites`             | SW                                 | L1    | 否                             | URL 摘要       | supported                     |
| `extensions_observe`                          | `chrome.management.getAll`                        | `management`           | SW                                 | L1    | 否                             | 权限摘要       | supported/compat              |
| `extensions_update/remove`                    | `chrome.management.*`                             | `management`           | SW                                 | L2    | 独立开关+强确认                | 否             | deferred，待自身/安全扩展保护 |
| `theme_*`                                     | `chrome.settings.private`                         | 非稳定 API             | SW                                 | -     | -                              | -              | unsupported                   |
| `runtime/sidePanel/offscreen/commands/action` | 固定扩展逻辑                                      | 对应 manifest 配置     | 固定上下文                         | -     | -                              | -              | not AI tools                  |

## 权限审计结论

当前 manifest 仍声明较宽的 `privacy`、`desktopCapture`、`management`、`cookies` 和 `<all_urls>`。在真实 Chrome E2E 和功能引用审计完成前，不直接删除，标记为 deferred；发布前必须按最小权限原则收敛。`web_accessible_resources` 也应只暴露扩展确实需要的资源。

## 上下文约束

- Service Worker 是唯一特权执行层。
- Content Script 不在当前版本的特权工具 context 中。
- Side Panel 的 clientExec 只能执行已注册且二次校验的标签组操作。
- Cookie value、API Key、Session Token 不进入模型、审计或确认详情。
