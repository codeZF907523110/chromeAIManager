# AI Browser Commander

键盘驱动的 AI 浏览器命令中心。用自然语言管理标签、书签和浏览会话。

## 技术栈

- **Vue 3** + **TypeScript**
- **Vite** 构建
- **Tailwind CSS** 样式
- **Chrome Extension** (Manifest V3)

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录，在 Chrome 中通过 `chrome://extensions` 加载即可。

## 功能

- 自然语言控制浏览器标签页、书签、历史记录
- AI Agent 循环执行复杂任务
- 支持 DeepSeek / OpenAI / Gemini Nano 等后端
- 侧边栏 / 弹窗双模式

## AI 配置

在设置面板中配置 API Key：
- DeepSeek（推荐）：https://platform.deepseek.com
- OpenAI
- Gemini Nano（离线，需 Chrome AI 支持）
- Ollama / LM Studio 等本地模型
