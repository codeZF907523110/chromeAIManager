# MV3 Unsupported Catalog

以下能力当前明确不开放为普通 AI 工具，避免模型通过猜测 API 名称获得特权能力：

- 任意 JavaScript、`eval`、字符串脚本和远程代码执行。
- `debugger`、完整网络抓包和任意网络拦截。
- 向模型返回 Cookie `value`、Session Token、API Key、密码或完整敏感 URL。
- 将手写 DOM 快照宣称为 Chrome 原生 Accessibility Tree。
- 依赖非公开 `chrome.settings.private` 的主题能力。
- 未完成安全评审的 `privacy` 修改、任意 `scripting` 注入、任意 DNR 规则。
- `desktopCapture` 的后台录屏；必须保留 Chrome 用户选择界面和可见停止控制。
- 不满足幂等、取消和生命周期约束的 `alarms` 驱动 AI 循环。
- 未实现的 `pageCapture`、`tts`、`webNavigation` 等扩展能力。
- 当前 DOM/browser_* 方案；`docs/dom-operation-architecture.md` 仅作为冻结设计资料。

## 行为约定

- unsupported 能力不写入 system prompt 工具清单。
- 若外部调用显式请求未注册工具，返回 `UNKNOWN_TOOL` 或 `UNSUPPORTED_TOOL`，不得猜测执行。
- 任何新能力必须先完成权限、上下文、风险、确认、脱敏、回滚和 E2E 评审。
