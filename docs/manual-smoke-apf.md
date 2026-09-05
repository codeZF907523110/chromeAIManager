# APF 手动 Smoke 用例

> 用途：验证 AI 在强化 system prompt 后，第一轮直接输出完整 plan；不应触发客户端文本匹配或半成品 plan 补全。
>
> 执行前：`yarn build`，将构建产物加载到 `chrome://extensions`，配置可用 AI 后打开侧边栏。
>
> 每条用例记录：原始输入、AI 返回 JSON、实际执行结果、是否需要确认。危险操作出现确认卡是预期行为；重点检查 `plan` 的工具、参数和 `deps`，不要只看最终文案。

## 通过标准

- plan 是合法 JSON 对象，且每个 item 都有唯一 `id`、合法 `tool`、对象 `args`、数组 `deps`。
- 多个用户动作对应多个原子 item；不存在只返回 observe/query 的半成品 plan。
- 需要真实 ID 的操作先 observe/query，后续 mutation 通过 `deps` 引用；可直接按域名批量处理的工具不强制添加 observe。
- 危险工具正常进入确认流程；用户取消后不产生对应副作用。
- Service Worker 日志中不出现 `detectHalfPlan`、`half-plan detected` 或二次补发计划。

## 7 个用例

### 1. 单步关闭域名标签

- **输入**：`关闭 baidu.com 标签`
- **预期 plan**：一个 `tabs_remove` item，`args.domain = "baidu.com"`。
- **预期结果**：关闭匹配的非固定标签；危险工具显示确认卡；不应只有 `tabs_observe`。

### 2. 需要查询后关闭

- **输入**：`关闭 github 的标签`
- **预期 plan**：按 COMMANDS 的参数要求，生成 `tabs_observe` → `tabs_remove`，后者 `deps` 包含前者；如果批量工具可直接接收 domain，也可直接使用对应批量 mutation。
- **预期结果**：确认通过后关闭目标标签；不猜测 tabId。

### 3. 三步任务拆分

- **输入**：`关闭 baidu 标签，然后关闭 youtube 标签，最后截图`
- **预期 plan**：至少包含两个关闭 mutation 与一个 `screenshot`；两个关闭动作各自带正确域名，截图依赖关闭动作（或按用户语义安全地独立执行）。
- **预期结果**：每个动作只出现一次，plan 中没有由客户端补出的 item。

### 4. 清 Cookie 后刷新

- **输入**：`把 github 的 cookie 清掉然后刷新`
- **预期 plan**：`clear_cookies` + `reload_tab` 两个原子 item；如清 Cookie 工具要求先查询，则查询 item 作为依赖前置；刷新依赖清理完成。
- **预期结果**：清理操作显示确认卡；确认后刷新；失败时不执行后续依赖项。

### 5. 多域名并行静音

- **输入**：`静音 baidu 和 zhihu 的标签`
- **预期 plan**：两个 `mute_tabs_by_domain` item，分别为 `baidu.com`、`zhihu.com`，二者均可 `deps: []` 并行执行。
- **预期结果**：两个域名均被静音，不能只处理一个域名。

### 6. 只读历史查询

- **输入**：`查一下今天看了哪些网站`
- **预期 plan**：使用工具清单中实际存在的历史查询工具，或返回 `chat`；不得凭空创建 mutation，也不得把查询误判为导航/删除。
- **预期结果**：返回查询结果或合理说明，不改变浏览器状态。

### 7. 打开网站

- **输入**：`打开 bilibili`
- **预期 plan**：一个 `tabs_create` item，`args.url` 为合法完整 URL。
- **预期结果**：新建标签页；不需要客户端从中文动词推断工具。

### 8. `/close-domain` + pinned 显式勾选（C5 新增）

- **前置**：固定（pin）1 个 `baidu.com` 标签，确保当前窗口还有非 pinned 的 baidu 标签若干。
- **输入**：`/close-domain baidu.com`
- **预期行为**：
  - 命中 slash `close-domain` → intent `close_tabs_by_domain` → `dispatchTool('tabs_remove', {domain, tabIds: precompute 合并集, confirmationToken})`
  - confirm 卡显示全部候选（含 pinned，灰底但默认勾选），用户可单独取消 pinned；勾选保持时 SW 在 `__preConfirmed === true` 路径下不再过滤 pinned。
- **预期结果**：取消 pinned 勾选 → 只关非 pinned；保留 pinned 勾选 → pinned 也被关闭；不再出现「明明勾了 pinned 却关不掉」的体验偏差。

## 记录模板

```text
用例：
输入：
AI JSON：
确认：通过 / 取消 / 不需要
执行结果：
是否出现客户端兜底：是 / 否（通过标准必须为“否”）
备注：
```
