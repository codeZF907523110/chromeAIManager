# 截图受限页提示修复 + suggestion 裸 token 本地化

> 状态：已实施（2026-11-20）
> 背景：用户在受限页（chrome:// 内部页）上测 `/screenshot` → 报「截图被拒绝」；
> `/screenshot full` → 报「无法在此页面截图…切换到普通网页」（带裸 token「(RELOAD_PAGE)」）。
> 同一页面两种提示，第一种误导（不是「被拒绝」，是页面本身截不了），
> 第二种文案正确但尾缀把未翻译的英文 key 原样露给了用户。

## 1. 根因

| #   | 问题                                                                                                                                                                      | 位置                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| B1  | visible 模式对 `captureVisibleTab` 的失败**一律**吞成 `sw.shotRejected`（截图被拒绝），不区分「受限页截不了」和「真被拒」（窗口最小化等）；受限页应与 full 模式一样给出「换普通网页」指引 | `executor.ts` takeScreenshot       |
| B2  | suggestion 有两处用裸 token `'RELOAD_PAGE'` / `'SWITCH_TAB'`，与全仓其余 20+ 处「suggestion = swT() 本地化文案」的模式不一致；面板模板 `（{text}）` 原样展示英文 key             | `executor.ts`:1837、2679           |

full/area 模式的受限页识别靠「注入失败（INJECTION_FAILED）」间接推断——能出正确文案，
但属于事后 try/catch 推断而非确定性检查，且把「受限页」和「注入异常」混在一个 catch 里。

## 2. 方案

**业界做法**：在调用 API 前按 URL scheme 做确定性预检（Playwright/Puppeteer 对受限
target 的处理思路），而不是匹配 Chrome 抛错字符串——后者不稳定且随浏览器本地化变化，不可依赖。

1. 新增 `RESTRICTED_URL_RE`（`chrome:` / `edge:` / `about:` / `devtools:` /
   `view-source:` / `chrome-extension:`）+ `WEBSTORE_URL_RE`（Chrome 应用商店域名）
   与 `restrictedPageResult(tab)` helper：命中返回 `PAGE_RESTRICTED` +
   `sw.shotBlockedPage`（文案本身已含「切换到普通网页」指引，**不带** suggestion——
   刷新救不了 chrome:// 页）。
2. `takeScreenshot` 两条路径在调 API 前预检：
   - visible：解析出目标 tab 后、`captureVisibleTab` 前检查；
   - full/area：`forwardScreenshotToContent` 解析出目标 tab 后、sendMessage 前检查。
   AI 侧 `browser_take_screenshot` 特例也走 takeScreenshot（executor.ts:2642）→ 一处修复三路受益。
3. B2：新增 `sw.reloadPageHint` / `sw.switchTabHint`（×4 locale），两处裸 token 改 swT()。
4. `forwardScreenshotToContent` 的 catch 保留不动，作为预检兜底（预检后受限页基本提前拦截，
   catch 只剩普通页上的罕见注入异常，RELOAD_PAGE 对它是正确指引）。

## 3. 改动清单

| #   | 文件                            | 改动                                                                                                                         |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `executor.ts`                   | 新增受限页正则与 `restrictedPageResult`；takeScreenshot visible 路径预检；forwardScreenshotToContent 预检；两处裸 token 改 swT |
| 2   | `locales/{zh-CN,en,de,es}.json` | sw 段新增 `reloadPageHint` / `switchTabHint`（共 546 keys）                                                                   |
| 3   | 文档                            | 本文档                                                                                                                       |

## 4. 边界

- `about:blank` 归入受限（截图无意义，与 full/area 行为一致）；`file://` **不**归入
  （取决于用户「允许访问文件网址」开关，不可注入时由 INJECTION_FAILED 兜底）。
- `chrome-extension://` 归入：PDF 查看器、其他扩展页面 content script 均不可注入。
- executeBrowserTool（DOM 工具链路）**不**加预检：它的受限页检测仍靠注入失败 +
  injectBlockedPage/SWITCH_TAB 文案（本次只修截图链路行为；裸 token 属纯 i18n 问题照修）。
- 受限页预检结果不带 suggestion：`engine.opSuggestion` 尾缀不再出现，避免误导性「刷新」指引。

## 5. 验证

type-check / eslint / prettier / check-i18n / build 全绿。真机回归：

1. `chrome://` 页上 `/screenshot` → 「无法在此页面截图…切换到普通网页后重试」（不再报「截图被拒绝」，无「(RELOAD_PAGE)」尾缀）
2. 同页 `/screenshot full` → 同上文案（两模式一致）
3. 普通网页 `/screenshot`、`/screenshot full`、`/screenshot area` → 原行为不变
4. AI「截个图」→ browser_take_screenshot 在受限页同样给出受限提示，普通页正常截图
5. 窗口最小化时截图（构造真被拒场景）→ 仍报「截图被拒绝」
6. DOM 工具（如 AI「读取当前页面内容」）在 chrome:// 上 → 仍报「无法注入…切换到普通网页」（行为不变，仅 suggestion 尾缀变本地化）
