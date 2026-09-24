# 语音输入（麦克风 → 文字）

## 业界方案调研

| 方案 | 结论 |
|---|---|
| **Web Speech API（`SpeechRecognition`）** | ✅ 采用。Chrome 内置（`webkitSpeechRecognition` 前缀），免密钥、免费、支持 `zh-CN`、`continuous` + `interimResults` 可边说边出字。Google 文档语音输入、大量 Web 聊天产品的同源能力。侧边栏是带 DOM 的扩展页面，API 可用 |
| MediaRecorder 录音 → Whisper `/v1/audio/transcriptions` | 备选升级路径。需要 AI 服务商支持音频接口（当前用户配置的是纯 chat 端点），且无实时出字体验，整段录完才出结果 |
| Gemini Nano 本地 STT | Chrome 未暴露本地语音识别 API，不可行 |

## 交互设计

1. 点击麦克风 → 开始聆听：
   - 麦克风按钮变红 + 脉冲光圈动画（`box-shadow` 呼吸），title 变「点击结束聆听」；
   - 输入框 placeholder 变「正在聆听，请说话…」；
   - 输入容器内、工具栏上方出现一条语音状态栏：三根跳动的声浪条 + 「正在聆听… mm:ss」+ 「结束」按钮。
2. 说话内容**实时**流入输入框：已确定的文字（final）直接拼接；未确定的中间结果（interim）也实时显示，随识别刷新。
3. 再次点击麦克风（或点「结束」）→ 停止聆听，文字保留在输入框，用户可编辑后发送。
4. 聆听中直接按 Enter 发送：先停止聆听再发送当前文字。
5. 开始聆听时若输入框已有内容，转写文字以「空格」拼接追加在其后，不覆盖用户已输入内容。
6. 错误处理：
   - 浏览器不支持 → 不渲染麦克风按钮（能力检测）；
   - 麦克风权限被拒（`not-allowed`）→ ElMessage 报错并停止；
   - 网络错误 → ElMessage 报错并停止；
   - `no-speech`（没说话超时）→ 静默结束，不报错。
7. Chrome 会在静音或约 60s 后自动断流 → `onend` 时若仍处于「聆听中」意图，自动 `start()` 续听，保证长段落连续输入。

## 实现

### 新增 `src/composables/useSpeechRecognition.ts`

职责：封装 SpeechRecognition 生命周期，组件只消费状态。

- 状态：`isListening`（聆听意图）、`finalText`（已确定转写）、`interimText`（中间转写）、`elapsedSeconds` / `elapsedText`（计时）、`lastError`。
- 能力检测：`window.SpeechRecognition ?? window.webkitSpeechRecognition`，`isSupported` 为常量布尔。
- **麦克风权限预检**：Web Speech API 在扩展页面里可能不弹授权框、直接 `not-allowed`。`start()` 前先
  `getUserMedia({ audio: true })` 触发 Chrome 标准授权弹窗，拿到权限后立即 `track.stop()` 释放；
  被拒时写入 `lastError = 'not-allowed'`（走统一的错误提示），`start()` 为 async。
- 方法：
  - `start()`（async）：预检权限 → 重置文本/计时，`continuous = true`、`interimResults = true`、`lang = 'zh-CN'`，启动聆听并开始计时；
  - `stop()`：置空聆听意图 → `recognition.stop()`（优雅停止，冲刷最后一段 final 结果）→ 停止计时；
  - `reset()`：清空文本（下一次开始前调用）。
- 回调：
  - `onresult`：从 `event.resultIndex` 遍历，`isFinal` 累加进 `finalText`，否则汇总进 `interimText`；
  - `onend`：聆听意图仍在 → try/catch 续听；否则落回空闲态并清 interim；
  - `onerror`：按错误类型分流（`no-speech` 静默、`aborted` 忽略、其余记录 `lastError` 并终止意图）。
- 卸载（`onUnmounted`）：`abort()` + 清计时，防泄漏。
- TS 类型：lib.dom 对该 API 的声明不可靠，文件内用 `*Like` 后缀的最小接口自声明，经 `unknown` 收窄取构造器，不用 `any`。

### 麦克风权限排查（用户侧）

权限归属三层，任一层拒绝都会失败；`chrome://settings/content/microphone` 只控制**全局默认**，
扩展按 `chrome-extension://<ID>` 源单独记录授权：

1. **扩展已重载**：预检授权逻辑需重新加载扩展后才生效；首次点击麦克风应弹出 Chrome 授权框。
2. **macOS 系统层**：系统设置 → 隐私与安全性 → 麦克风 → 打开 Chrome 的开关
   （该层关闭时 getUserMedia 直接 NotAllowedError，Chrome 设置页看不出任何异常）。
3. **Chrome 全局**：`chrome://settings/content/microphone` → 检查下方「不允许使用麦克风的网站」
   列表里是否有该扩展。
4. **扩展专属站点**：`chrome://extensions` 复制扩展 ID → 打开
   `chrome://settings/content/siteDetails?site=chrome-extension://<扩展ID>` → 把「麦克风」设为「允许」。
5. 仍失败：侧边栏右键「检查」打开 DevTools，Console 中会有
   `[useSpeechRecognition] getUserMedia failed:` 日志，按 `err.name` 定位层级。

### 语音服务可达性（重要）

Web Speech API 的识别在 Chrome 里是**把音频送到 Google 语音服务器**完成的。网络到不了 Google 时，
识别器会报 `not-allowed` / `network` —— 此时麦克风权限三层全部正常（getUserMedia 预检能通过），
属于环境限制，扩展侧无法绕过。

**确认方法**（在普通网页标签页验证，与扩展无关）：
任一 https 页面打开 DevTools Console 执行：

```js
const r = new webkitSpeechRecognition()
r.onerror = (e) => console.log('err:', e.error)
r.onresult = (e) => console.log('text:', e.results[0][0].transcript)
r.start() // 说一句话后看输出
```

- 普通页面也报错 → 环境问题（Google 语音服务不可达），需切换降级方案；
- 普通页面正常、扩展里报错 → 扩展上下文限制，需把识别挪到网页上下文（content script 中继）。

### 降级方案（如环境不可达）

MediaRecorder 录音 → 用户配置的 OpenAI 兼容端点 `/v1/audio/transcriptions`（Whisper 类接口）转写。
要求服务商支持音频转写接口；无实时出字，录完才出结果（详见「业界方案调研」备选行）。

### getUserMedia 错误分流

| err.name（message 特征） | lastError | 提示 |
|---|---|---|
| `NotAllowedError`（message 含 dismissed） | `permission-dismissed` | **侧边栏无法锚定授权气泡**：权限弹窗只能挂在普通标签页的地址栏上，从侧边栏发起的请求弹不出来，Chrome 直接按 dismissed 处理 |
| `NotAllowedError`（其它） | `not-allowed` | 麦克风权限被拒绝（系统层 / Chrome 源层） |
| `NotFoundError` / `OverconstrainedError` | `no-device` | 未检测到麦克风设备 |
| `NotReadableError` | `device-busy` | 麦克风被其它应用占用 |

**授权引导（自动）**：检测到 `permission-dismissed` 时，自动用 `chrome.tabs.create` 打开本扩展的
站点设置页 `chrome://settings/content/siteDetails?site=chrome-extension://<chrome.runtime.id>`
（扩展自己知道 ID，无需用户复制），用户把「麦克风」设为「允许」后回来再点一次麦克风即可。
麦克风权限按源（chrome-extension://ID）持久化，设置一次长期有效。

### `CommandInput.vue` 接线

- `speechBaseText`：开始聆听时快照当前输入框内容；`watch([finalText, interimText], …, { flush: 'sync' })` 把
  `base + final + interim` 同步进 `inputValue`（sync 让文字逐段出现而非等 nextTick）。
- **尾句冲刷窗口**：`stop()` 后识别器会把最后一段 final 补发给 `onresult`，而此时 `isListening` 已为 false。
  - 「结束保留文字」路径（`stopVoice()`）：开启 300ms 冲刷窗口（`flushWindow`），补发尾句照常写入输入框；
  - 「发送」路径（`handleSend` → `stopSpeech()`）：不开窗口，补发尾句被拦，避免写回已清空的输入框形成幽灵文字。
- `toggleSpeech()`：聆听中 → `stopVoice()`；未开始 → 快照 base、`reset()`、`start()`。
- `handleSend()`：聆听中先 `stopSpeech()` 再发送。
- `watch(lastError)` → ElMessage 提示。
- UI：mic 按钮 `:class="{ 'mic-active': isListening }"`；语音状态栏 `v-if="isListening"`（声浪条 + 计时 + 结束按钮）；麦克风按钮不支持时 `v-if` 隐藏。

## 不改动的部分

- useAIEngine、消息渲染、发送链路（只多一步「聆听中先停」）；
- 历史输入（↑键）、斜杠命令等已有交互。

## 验证

1. 点击麦克风 → Chrome 首次弹麦克风授权 → 允许后状态栏出现、按钮脉冲、placeholder 变化。
2. 说中文 → 文字实时出现在输入框；停顿后继续说 → Chrome 自动断流但自动续听，文本连续累加。
3. 点「结束」/ 再点麦克风 → 文字保留在输入框，可编辑、可发送。
4. 输入框已有文字时开始语音 → 转写以空格追加，不覆盖。
5. 拒绝麦克风权限 → ElMessage 报错、状态栏收起。
6. 回归：↑ 历史输入、斜杠命令、Enter 发送均不受影响。
