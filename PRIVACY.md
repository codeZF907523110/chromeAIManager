# 隐私权政策 / Privacy Policy

**最后更新 / Last Updated: 2026-10-12**

`AI 浏览器管家`（以下简称"本扩展"）是一款浏览器 AI 助手扩展。我们非常重视你的隐私。本政策说明本扩展处理哪些数据、如何处理这些数据，以及你的权利。

`AI Browser Manager` (the "Extension") is a browser AI assistant extension. We take your privacy seriously. This policy explains what data the Extension processes, how it is processed, and your rights.

---

## 一、我们收集的数据 / 1. Data We Process

本扩展**不设开发者自有服务器**，不进行任何遥测、统计分析或广告追踪。以下数据仅在你使用对应功能时，由扩展在你的浏览器本地读取：

The Extension has **no developer-owned server** and performs no telemetry, analytics, or ad tracking. The following data is read locally in your browser only when you use the corresponding feature:

| 数据类型 / Data | 用途 / Purpose |
| --- | --- |
| 标签页信息 / Tabs | 查找、切换、分组、排序、关闭标签页 / Find, switch, group, sort, and close tabs |
| 书签 / Bookmarks | 浏览、搜索、整理、删除书签 / Browse, search, organize, and delete bookmarks |
| 浏览历史 / History | 搜索历史记录、按需清理 / Search and clean browsing history |
| Cookie | 按你的指令查看与清理 / View and clear cookies on your command |
| 页面内容 / Page content | 按你的指令读取当前页面以总结、翻译或执行页面操作 / Read the current page on your command to summarize, translate, or operate on it |
| 截图与录屏 / Screenshots & recordings | 仅在你主动发起时捕获，保存在本地 / Captured only when you trigger it, stored locally |
| 下载记录 / Downloads | 管理下载任务 / Manage downloads |
| AI 对话记录 / Chat history | 保存在浏览器本地（IndexedDB），用于延续对话 / Stored locally (IndexedDB) to keep conversation context |

## 二、数据如何被处理 / 2. How Data Is Processed

- **本地处理 / Local processing**：上述数据的读取、存储与展示均发生在你的浏览器内，不会上传到开发者的任何服务器。
  All reading, storage, and display of the above data happens inside your browser; it is never uploaded to any developer server.
- **AI 服务商 / AI provider**：当需要 AI 能力时，扩展会把对话上下文（可能包含你要求处理的页面内容）发送到**你自己配置的 AI 服务提供商**（你在设置中填写的 API 端点与密钥，例如 DeepSeek、OpenAI 等）。该服务商对其收到的数据的处理适用其自身的隐私政策。
  When AI capabilities are needed, the Extension sends the conversation context (possibly including page content you asked to process) to the **AI provider you configure yourself** (the API endpoint and key you enter in Settings, e.g. DeepSeek, OpenAI, etc.). That provider's own privacy policy governs its handling of the data it receives.
- **不出售数据 / No selling**：我们不出售、不出租、不与你未主动选择的第三方共享任何数据。
  We never sell, rent, or share your data with any third party you have not actively chosen.

## 三、数据的存储与保留 / 3. Storage & Retention

- 所有数据（设置、AI 端点与 API 密钥、对话记录、截图）仅存储在你浏览器的本地存储（`chrome.storage.local` 与 IndexedDB）中。
  All data (settings, AI endpoint and API key, chat history, screenshots) is stored only in your browser's local storage (`chrome.storage.local` and IndexedDB).
- 你可随时使用"清空对话"功能删除聊天记录；卸载本扩展将删除全部本地数据。
  You can delete chat history at any time via the "clear chat" feature; uninstalling the Extension removes all local data.

## 四、权限用途说明 / 4. Permissions

| 权限 / Permission | 用途 / Purpose |
| --- | --- |
| `tabs` / `tabGroups` | 标签页与标签组管理 / Tab and tab-group management |
| `bookmarks` | 书签读取与管理 / Bookmark access and management |
| `history` | 历史记录搜索与清理 / History search and cleanup |
| `sessions` | 恢复最近关闭的标签页 / Restore recently closed tabs |
| `cookies` | 按指令查看与清理 Cookie / View and clear cookies on command |
| `storage` | 保存设置与配置 / Persist settings and configuration |
| `scripting` / `host_permissions` | 在你指令触达的页面上执行点击、填表等操作 / Perform clicks, form fills, etc. on pages you act on |
| `downloads` | 下载管理 / Download management |
| `topSites` | 常用网站速览 / Show top sites |
| `management` | 查询与管理其它扩展 / Query and manage other extensions |
| `contentSettings` | 网站内容设置查询 / Query site content settings |
| `offscreen` | 离屏执行屏幕录制 / Run screen recording offscreen |
| `sidePanel` | 提供侧边栏界面 / Provide the side panel UI |
| `unlimitedStorage` | 本地保存聊天记录与截图 / Store chat history and screenshots locally |

## 五、儿童隐私 / 5. Children's Privacy

本扩展不面向 13 岁以下儿童，不有意收集儿童的个人信息。
The Extension is not directed to children under 13 and does not knowingly collect their personal information.

## 六、政策变更 / 6. Changes to This Policy

政策更新后会在此页面发布并更新"最后更新"日期。重大变更会尽合理努力予以标注。
Updates will be posted on this page with a revised date. Significant changes will be highlighted where feasible.

## 七、联系我们 / 7. Contact

如有隐私相关问题，请通过以下方式联系：
For privacy questions, contact us via:

- GitHub Issues: https://github.com/codeZF907523110/chromeAIManager/issues
- 邮箱 / Email: <!-- TODO: 替换为你的邮箱 / replace with your email -->
