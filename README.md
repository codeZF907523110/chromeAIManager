# AI Browser Commander

键盘驱动的 AI 浏览器命令中心。使用 Vue 3、TypeScript 和 Manifest V3，通过 Plan-First DAG 管理标签、书签、历史和浏览器数据。

## 技术栈

- **Vue 3** + **TypeScript**
- **Vite** 构建
- **Tailwind CSS** 样式
- **Chrome Extension** (Manifest V3)

## 开发与构建

```bash
npm install
npm run dev
npm run type-check
npm run lint
npm test
npm run build
```

构建产物输出到 `dist/`。在 Chrome 中打开 `chrome://extensions`，启用开发者模式后选择“加载已解压的扩展程序”，选择 `dist/` 目录。

## 当前能力

- Plan-First：AI 输出严格 JSON plan，由 Service Worker 按依赖 DAG 调度。
- 标签页、窗口、标签组、书签、历史、会话、下载、浏览数据、Storage、Cookie、Content Settings 和通知的已注册能力。
- 斜杠命令作为兼容入口保留。
- Side Panel 负责需要用户激活上下文的 clientExec，并在执行前后校验状态。

## 安全边界

- Service Worker 是唯一特权 Chrome API 执行层。
- 危险操作需要用户确认和一次性 confirmation token，不能使用裸 `force: true` 绕过。
- Cookie value、API Key、Session Token、密码和完整敏感 URL 不进入 AI 上下文或审计记录。
- Storage 禁止 AI 全量读取和访问敏感配置键。
- 不支持任意 JavaScript、`eval`、debugger、远程代码、完整抓包、任意网络拦截和伪 Accessibility Tree。
- 详细权限见 `docs/mv3-permission-matrix.md`，不支持能力见 `docs/mv3-unsupported-catalog.md`。

## 权限说明

扩展使用 tabs、bookmarks、history、sessions、downloads、storage、tabGroups、browsingData、cookies、contentSettings、notifications 等权限来提供对应的浏览器管理能力。当前 manifest 仍包含部分待审计的宽权限；发布前会按最小权限原则收敛，详见权限矩阵。

## AI 配置

在设置面板中配置模型服务：

- DeepSeek：https://platform.deepseek.com
- OpenAI
- Gemini Nano（离线，需 Chrome AI 支持）
- Ollama / LM Studio 等本地模型

API Key 只用于 Service Worker/扩展内部调用，不会作为工具结果传给模型。

## 已知限制

- 真实 Chrome E2E 需要在安装扩展的 Chrome 环境中执行，当前仓库的 Vitest 仅覆盖 handler 和协议 mock。
- 部分高风险扩展 API 和 DOM/browser_* 能力仍处于 deferred/unsupported 状态。
- 生产构建可能提示 bundle 较大和静态/动态导入优化建议，不影响构建成功。
