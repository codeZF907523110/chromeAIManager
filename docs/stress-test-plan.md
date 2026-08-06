# AI 浏览器管家 — 压测计划

## 测试范围

| 编号 | 测试类别 | 测试项 | 涉及文件 |
|------|---------|--------|---------|
| API-01 | Chrome API - Tabs | tabs_observe | executor.ts |
| API-02 | Chrome API - Tabs | tabs_create | executor.ts |
| API-03 | Chrome API - Tabs | tabs_update | executor.ts |
| API-04 | Chrome API - Tabs | tabs_move | executor.ts |
| API-05 | Chrome API - Tabs | tabs_remove | executor.ts |
| API-06 | Chrome API - Tabs | tabs_group | executor.ts |
| API-07 | Chrome API - Tabs | tabs_ungroup | executor.ts |
| API-08 | Chrome API - Tabs | tabs_observe_groups | executor.ts |
| API-09 | Chrome API - Tabs | tabs_group_by_domain | executor.ts |
| API-10 | Chrome API - Bookmarks | bookmarks_observe_tree | executor.ts |
| API-11 | Chrome API - Bookmarks | bookmarks_create_node | executor.ts |
| API-12 | Chrome API - Bookmarks | bookmarks_update_node | executor.ts |
| API-13 | Chrome API - Bookmarks | bookmarks_remove_node | executor.ts |
| API-14 | Chrome API - Bookmarks | bookmarks_move_node | executor.ts |
| API-15 | Chrome API - Bookmarks | bookmarks_open_node | executor.ts |
| API-16 | Chrome API - Bookmarks | bookmarks_add_current_page | executor.ts |
| API-17 | Chrome API - Windows | windows_observe | executor.ts |
| API-18 | Chrome API - Windows | windows_create | executor.ts |
| API-19 | Chrome API - Windows | windows_update | executor.ts |
| API-20 | Chrome API - History | history_search | executor.ts |
| API-21 | Chrome API - History | history_remove | executor.ts |
| API-22 | Chrome API - Navigation | navigate | executor.ts |
| API-23 | Chrome API - Navigation | screenshot | executor.ts |
| API-24 | Chrome API - Page | zoom | executor.ts |
| API-25 | Chrome API - Theme | theme_observe | executor.ts |
| API-26 | Chrome API - Theme | theme_update | executor.ts |
| API-27 | Chrome API - Font | font_size_observe/update | executor.ts |
| API-28 | Chrome API - Font | font_family_observe/update | executor.ts |
| API-29 | Chrome API - Cookies | cookies_observe/remove | executor.ts |
| API-30 | Chrome API - Top Sites | top_sites_observe | executor.ts |
| API-31 | Chrome API - Extensions | extensions_observe/update/remove | executor.ts |
| API-32 | Chrome API - Permissions | permissions_observe/update | executor.ts |
| API-33 | Chrome API - Storage | storage_get/set/remove | executor.ts |
| API-34 | Chrome API - Sessions | sessions_restore | executor.ts |
| API-35 | Chrome API - Recording | recording_start_tab/screen/stop | executor.ts |
| API-36 | Chrome API - DOM | dom_manipulate | executor.ts |
| API-37 | Chrome API - Batch | batch | executor.ts |
| DOM-01 | Content Script | PAGE_SCAN 扫描 | dom-commander.js |
| DOM-02 | Content Script | overlay 弹窗注入 | overlay.js |
| DOM-03 | Content Script | overlay 关闭/清理 | overlay.js |
| DOM-04 | Content Script | overlay 截图复制 | overlay.js |
| AI-01 | AI Engine | 后端自动选择 | engine.ts |
| AI-02 | AI Engine | Gemini Nano 适配 | gemini-nano.ts |
| AI-03 | AI Engine | OpenAI 适配器调用 | openai-adapter.ts |
| AI-04 | AI Engine | API 权限请求 | openai-adapter.ts |
| AI-05 | AI Engine | JSON 解析容错 | json-repair.ts |
| AI-06 | AI Engine | Agent 循环 | useAIEngine.ts / index.js |
| AI-07 | AI Engine | Agent 超时/失败保护 | useAIEngine.ts |
| AI-08 | AI Engine | 对话上下文管理 | useAIEngine.ts |
| AI-09 | AI Engine | 会话恢复 | useAIEngine.ts |
| AI-10 | AI Engine | 结果安全处理 | useAIEngine.ts |
| UI-01 | UI 交互 | 命令输入框 | CommandInput.vue |
| UI-02 | UI 交互 | 斜杠命令提示 | CommandInput.vue |
| UI-03 | UI 交互 | 历史导航 | useCommandHistory.ts |
| UI-04 | UI 交互 | 消息渲染 | MessageBubble.vue |
| UI-05 | UI 交互 | 确认卡片 | ConfirmCard.vue |
| UI-06 | UI 交互 | 设置面板 | App.vue |
| UI-07 | UI 交互 | 模型管理 | App.vue / useSettings.ts |
| UI-08 | UI 交互 | 显示模式切换 | useAIEngine.ts |
| UI-09 | UI 交互 | 截图显示 | useAIEngine.ts / MessageBubble.vue |
| CMD-01 | 命令系统 | 斜杠命令匹配 | slash-commands.ts |
| CMD-02 | 命令系统 | 危险操作确认 | confirm.ts |
| CMD-03 | 命令系统 | 预计算逻辑 | useAIEngine.ts |
| CMD-04 | 命令系统 | 命令映射完整性 | commands.ts |
| SW-01 | Service Worker | 消息路由 | index.ts |
| SW-02 | Service Worker | 上下文收集 | context-collector.ts |
| SW-03 | Service Worker | 显示模式管理 | index.ts |
| SW-04 | Service Worker | 快捷键处理 | index.ts |
| OFF-01 | Offscreen | 录制启动/停止 | recorder.js |