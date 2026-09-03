# AI 操作浏览器能力 - 自然语言测试用例集

> 本文档聚焦 **自然语言（Natural Language）** 输入路径。  
> AI Plan-First 协议：用户输入 → AI 解析为 JSON plan → SW DAG 调度 → 渲染结果。  
> 用例按能力域分组，从简单到复杂，每条都标注预期工具链与边界。

---

## 用例分类索引

| 类别 | 章节 |
|---|---|
| 基础会话 / 闲聊 | 一 |
| 标签页单步操作 | 二 |
| 标签页批量操作 | 三 |
| 标签分组 | 四 |
| 书签 | 五 |
| 历史 | 六 |
| 窗口 | 七 |
| 导航 / 截图 / 缩放 | 八 |
| 下载 | 九 |
| 通知 | 十 |
| 清理（缓存 / Cookie / 历史） | 十一 |
| 存储 | 十二 |
| Cookie / 权限 / 内容设置 | 十三 |
| 扩展 | 十四 |
| 主题 / 字体 / 缩放 | 十五 |
| 录制 | 十六 |
| 组合 / 多步任务 | 十七 |
| 闲聊 / 边界 / 异常 | 十八 |
| 半成品 plan 兜底 | 十九 |
| 稳定性 / 回归 | 二十 |
| 调试与日志 | 二十一 |

---

## 一. 基础会话测试

### 用例 1.1：简单问候
- **输入**：`你好`
- **预期**：AI 闲聊回复（chat 路径），不调用任何工具；气泡展示问候语

### 用例 1.2：自我介绍
- **输入**：`你是谁？你能做什么？`
- **预期**：chat 路径；AI 介绍可执行的浏览器能力（标签、书签、历史、窗口、导航、截图、清理等）

### 用例 1.3：明确告知"不操作"
- **输入**：`今天天气真好`
- **预期**：chat 路径；AI 不调用工具，仅文字回复

### 用例 1.4：追问上下文
- **输入**：`你刚才帮我做了什么？`
- **预期**：chat 路径；AI 复述上一轮操作（无工具调用）

### 用例 1.5：空 query 但有 chat
- **输入**：`嗯`
- **预期**：chat 路径；AI 询问用户具体要做什么

---

## 二. 标签页单步操作

### 用例 2.1：刷新当前页
- **输入**：`刷新一下当前页面`
- **预期**：调用 `tabs_reload`（当前 active tab），返回新 tab 对象

### 用例 2.2：刷新当前窗口所有标签
- **输入**：`把当前窗口的所有标签都刷新一遍`
- **预期**：调用 `tabs_reload`（all=true / batch）；当前窗口非 pinned 标签全部 reload

### 用例 2.3：激活指定标签
- **输入**：`切换到 GitHub 那个标签`
- **预期**：调用 `find_tab` query=GitHub → 返回匹配 tab → `tabs_update` active=true

### 用例 2.4：固定 / 取消固定当前标签
- **输入**：`把这个标签固定住`
- **预期**：调用 `pin_tab`（toggle：未固定→固定；已固定→取消固定）

### 用例 2.5：复制当前标签
- **输入**：`复制一下当前这个标签`
- **预期**：调用 `duplicate_tab`；在当前标签右侧创建副本

### 用例 2.6：休眠非活动标签
- **输入**：`把当前窗口的非活动标签都休眠了`
- **预期**：调用 `tabs_discard` all=false（默认仅非活动标签）；返回 discarded 数

### 用例 2.7：休眠某域名所有非活动标签
- **输入**：`把 jira.atlassian.com 的非活动标签休眠一下`
- **预期**：调用 `tabs_discard` domain=…；前端 precompute 解析 → 仅休眠非 pinned、非 active 的匹配标签

### 用例 2.8：返回 / 前进
- **输入**：`后退一下`
- **预期**：调用 `tabs_go_back`

- **输入**：`前进`
- **预期**：调用 `tabs_go_forward`

### 用例 2.9：移动标签到指定位置
- **输入**：`把这个标签移到第 3 位`
- **预期**：调用 `move_tab` index=3（1-based）；前端转为 0-based 后下发

### 用例 2.10：恢复最近关闭的标签
- **输入**：`恢复我刚刚关掉的那个标签`
- **预期**：调用 `sessions_restore`（最近一个）；返回 restored tab

### 用例 2.11：标签缩放
- **输入**：`把这个页面的缩放比例调到 150%`
- **预期**：调用 `tabs_set_zoom` zoomFactor=1.5

### 用例 2.12：列出当前所有打开的标签
- **输入**：`看看我现在打开了哪些标签`
- **预期**：调用 `tabs_observe` currentWindow=true；表格渲染

### 用例 2.13：查找带 URL 子串的标签
- **输入**：`找到带有 docs.google.com 的标签`
- **预期**：调用 `tabs_observe` query=docs.google.com；表格展示匹配结果

---

## 三. 标签页批量操作

### 用例 3.1：按域名关闭（核心场景）
- **输入**：`把当前窗口 baidu.com 的所有标签都关了`
- **预期**：
  - 1 阶段：AI 返回 plan（`tabs_observe` 预查 → `tabs_remove` domain=baidu.com）
  - 2 阶段：执行 observe → 触发 `NEEDS_CONFIRM`（危险工具）
  - 3 阶段：弹确认卡，列出匹配 tab（带 title/url，默认勾选）
  - 4 阶段：用户取消部分勾选 → 确认 → SW 收到 `tabIds=[用户勾选]` → 仅关闭选中
  - 注意：必须用 `explicit tabIds` 模式，不再二次按 domain 扩展

### 用例 3.2：按域名关闭（带 currentWindow 修饰）
- **输入**：`关掉所有 chrome 窗口里 google.com 的标签`
- **预期**：调用 `tabs_remove` domain=google.com currentWindow=false；弹确认卡

### 用例 3.3：按 URL 子串关闭
- **输入**：`关闭所有标题含"调试"的标签`
- **预期**：调用 `close_tabs_by_url` query=调试；前端 precompute 解析 → 弹确认卡 → 勾选 → 关闭

### 用例 3.4：关闭重复 URL 的标签
- **输入**：`把所有重复的标签都关掉`
- **预期**：调用 `close_duplicate_tabs`；前端 precompute 找重复 URL → 弹确认卡（一组 = 一行） → 确认 → 关闭

### 用例 3.5：仅关闭重复 URL 中的指定关键词
- **输入**：`关掉所有重复的 jira.atlassian.com 标签`
- **预期**：调用 `close_duplicate_tabs` url=jira.atlassian.com；仅匹配 URL 含该子串的重复组

### 用例 3.6：按域名静音
- **输入**：`把 youtube.com 的标签都静音`
- **预期**：调用 `mute_tabs_by_domain` domain=youtube.com；前端 precompute 解析 → 批量 `tabs_update` muted=true

### 用例 3.7：按域名取消静音
- **输入**：`恢复 baidu.com 标签的声音`
- **预期**：调用 `unmute_tabs_by_domain`；批量 muted=false

### 用例 3.8：按域名分组（clientExec）
- **输入**：`帮我把当前窗口的标签按域名分一下组`
- **预期**：调用 `group_by_domain` → SW 返回 clientExec='tabs_group_by_domain' + groups → 前端调 `chrome.tabs.group`；回复「已创建 N 个分组」

### 用例 3.9：按域名排序
- **输入**：`把当前窗口的标签按域名字母顺序排一下`
- **预期**：调用 `sort_tabs` order=domain；批量 move

### 用例 3.10：按标题排序
- **输入**：`按标题把标签页排个序`
- **预期**：调用 `sort_tabs` order=title

### 用例 3.11：一次性关闭多个域名
- **输入**：`把 baidu.com 和 zhihu.com 的标签都关了`
- **预期**：plan 中两次 `tabs_remove`，每次独立弹确认卡

---

## 四. 标签分组

### 用例 4.1：创建分组并移动标签
- **输入**：`把所有 GitHub 相关的标签放进一个叫"工作"的组里`
- **预期**：调用 `tabs_observe` query=github → `tab_groups_find_or_create_by_title` title=工作 → `tab_groups_move_tabs`；输出"已创建标签组：工作 / 已将 N 个标签加入"

### 用例 4.2：移动已有标签到现有分组
- **输入**：`把 jira 那个标签挪到工作分组里`
- **预期**：调 `find_tab` query=jira → `tab_groups_move_tabs`

### 用例 4.3：列出当前所有分组
- **输入**：`我有哪些标签分组？`
- **预期**：调用 `tabs_observe_groups` / `list_groups`；表格展示 groupId、title、color、tab 数

### 用例 4.4：取消所有分组（弹确认）
- **输入**：`把所有标签分组都取消了`
- **预期**：调用 `ungroup_all`；弹确认卡（每个分组一行） → 勾选 → 解除（标签保留，分组关系删除）

### 用例 4.5：仅取消选中的分组
- **输入**：`把"工作"和"娱乐"这两个组解掉，其它保留`
- **预期**：plan 中 `tab_groups_ungroup_tabs` 两次或一次 groupId 列表

### 用例 4.6：修改分组标题 / 颜色
- **输入**：`把"工作"组改成"日常工作"并标成蓝色`
- **预期**：调 `tabs_observe_groups` 找 groupId → `tab_groups_update` title + color

### 用例 4.7：折叠 / 展开分组
- **输入**：`把工作分组折叠起来`
- **预期**：调 `tab_groups_update` collapsed=true

---

## 五. 书签

### 用例 5.1：把当前页加为书签
- **输入**：`把当前页面加到书签`
- **预期**：调用 `add_bookmark`（当前页）；弹气泡 `已添加书签：xxx`

### 用例 5.2：添加指定 URL 书签
- **输入**：`帮我收藏一下 https://github.com`
- **预期**：调用 `add_bookmark` url=github.com；标题缺省为页面 title 或 URL

### 用例 5.3：按关键词删除书签
- **输入**：`把标题里有 React 的书签都删了`
- **预期**：调用 `remove_bookmark` query=React；前端拉书签 → 弹确认卡 → 勾选 → 删除

### 用例 5.4：删除指定 URL 书签
- **输入**：`删除 https://example.com/old 这个书签`
- **预期**：调用 `remove_bookmark`；精确匹配 URL

### 用例 5.5：按文件夹删除
- **输入**：`把"工具"文件夹下的所有书签删了`
- **预期**：调用 `bookmarks_remove_node`（按文件夹）→ 弹确认卡

### 用例 5.6：查看书签树
- **输入**：`看看我的书签结构`
- **预期**：调用 `bookmarks_observe_tree`；表格展示文件夹与 URL

### 用例 5.7：在书签栏打开
- **输入**：`打开"前端学习"文件夹下的所有书签`
- **预期**：调用 `bookmarks_open_node`（folderId）→ 批量 `tabs_create`

---

## 六. 历史

### 用例 6.1：今天浏览历史
- **输入**：`看看我今天访问了哪些网站`
- **预期**：调用 `history_search` timeRange=today；表格展示

### 用例 6.2：最近一周历史
- **输入**：`看看我最近一周访问的网站`
- **预期**：调用 `history_search` timeRange=week

### 用例 6.3：搜索关键词历史
- **输入**：`找一下我昨天访问过的 GitHub 页面`
- **预期**：调用 `history_search` query=github timeRange=yesterday

### 用例 6.4：删除今天历史
- **输入**：`把今天的浏览记录都删了`
- **预期**：调用 `delete_history` timeRange=today；弹确认卡

### 用例 6.5：删除指定关键词历史
- **输入**：`把今天关于 b站的浏览记录都删了`
- **预期**：调用 `history_remove` query=b站；弹确认卡

### 用例 6.6：删除所有历史
- **输入**：`清空我的所有浏览记录`
- **预期**：调用 `history_remove` query='' timeRange=all；弹确认卡

### 用例 6.7：最近访问 top 站点
- **输入**：`我最常访问的网站有哪些？`
- **预期**：调用 `get_top_sites` / `top_sites_observe`；表格展示

---

## 七. 窗口

### 用例 7.1：在新窗口打开
- **输入**：`在新窗口打开 https://github.com`
- **预期**：调用 `windows_create` url=https://github.com

### 用例 7.2：创建空白新窗口
- **输入**：`开一个新窗口`
- **预期**：调用 `windows_create`（无 url）

### 用例 7.3：关闭所有窗口
- **输入**：`关闭所有 chrome 窗口`
- **预期**：调用 `windows_remove`（dangerous）→ 弹确认卡

### 用例 7.4：窗口最大化
- **输入**：`把当前窗口最大化`
- **预期**：调用 `windows_update` state=maximized

### 用例 7.5：最小化 / 还原 / 全屏
- **输入**：`把窗口最小化`
- **预期**：windows_update state=minimized

- **输入**：`全屏显示`
- **预期**：windows_update state=fullscreen

### 用例 7.6：聚焦指定窗口
- **输入**：`切到第 2 个窗口`
- **预期**：调用 `windows_update` windowId focused=true

### 用例 7.7：关闭窗口但保留标签
- **输入**：`关闭当前窗口但保留这些标签`
- **预期**：windows_remove；标签由 Chrome 自动恢复机制处理（提示用户）

---

## 八. 导航 / 截图 / 缩放

### 用例 8.1：打开指定 URL
- **输入**：`打开百度`
- **预期**：调用 `navigate` url=baidu.com；激活标签 / 新建标签

### 用例 8.2：模糊导航（关键词 → 搜索）
- **输入**：`帮我搜一下 Vue3 的最佳实践`
- **预期**：AI 调 `navigate` url=https://www.google.com/search?q=Vue3+最佳实践 或 baidu

### 用例 8.3：截当前页
- **输入**：`截个图给我看看当前页面`
- **预期**：调用 `screenshot`；截图与闲聊合并到一条 ai-chat 气泡（带图）

### 用例 8.4：截指定标签
- **输入**：`截一下 GitHub 那个标签的图`
- **预期**：调用 `find_tab` query=GitHub → `screenshot`；合并到一条消息

### 用例 8.5：页面缩放
- **输入**：`把页面放大一点`
- **预期**：调用 `zoom` direction=in / zoomFactor=1.1

- **输入**：`恢复默认缩放`
- **预期**：调用 `tabs_set_zoom_settings` mode=automatic / scope=per-tab

### 用例 8.6：导航 + 截图合并
- **输入**：`打开 GitHub 然后截个图给我看`
- **预期**：
  - plan: `navigate` → `screenshot`
  - 执行后截图与 AI 闲聊合并为一条 ai-chat 气泡，文字 + 图片

### 用例 8.7：返回首页
- **输入**：`回到主页`
- **预期**：若当前页是搜索引擎 → navigate；否则 chrome.tabs.update(url=chrome://newtab)

---

## 九. 下载

### 用例 9.1：下载文件
- **输入**：`下载 https://example.com/file.zip`
- **预期**：调用 `downloads_download` url=…

### 用例 9.2：搜索下载记录
- **输入**：`看看最近的下载记录`
- **预期**：调用 `downloads_search`；表格展示

### 用例 9.3：按关键词搜索下载
- **输入**：`找一下我下载过的 PDF`
- **预期**：调用 `downloads_search` query=pdf

### 用例 9.4：删除下载
- **输入**：`把那个 test.zip 下载删了`
- **预期**：调用 `downloads_erase` query=test.zip

### 用例 9.5：打开下载页面
- **输入**：`打开下载页面`
- **预期**：调用 `downloads_open` 或直接 `navigate` url=chrome://downloads

### 用例 9.6：取消正在下载
- **输入**：`把正在下载的那个文件取消掉`
- **预期**：调用 `downloads_cancel`

---

## 十. 通知

### 用例 10.1：创建通知
- **输入**：`给我发个通知，标题是"测试"，内容是"你好"`
- **预期**：调用 `notifications_create` title=测试 message=你好

### 用例 10.2：清除所有通知
- **输入**：`清除所有通知`
- **预期**：调用 `notifications_clear`（dangerous）→ 弹确认卡

### 用例 10.3：列出当前通知
- **输入**：`看看我有哪些通知`
- **预期**：调用 `notifications_list` / `notifications_get_all`；表格展示

---

## 十一. 浏览数据清理

### 用例 11.1：清理缓存
- **输入**：`清理一下浏览器缓存`
- **预期**：调用 `browsing_data_remove` dataTypes=['cache'] → 弹确认卡

### 用例 11.2：清理全部浏览数据
- **输入**：`把浏览数据全部清掉`
- **预期**：调用 `browsing_data_remove` dataTypes=['cache','cookies','history','downloads',...] → 弹确认卡

### 用例 11.3：清理指定域名 Cookie
- **输入**：`把 b站 的 Cookie 都清了`
- **预期**：调用 `clear_cookies` domain=bilibili.com → 弹确认卡 → 勾选 → 删除

### 用例 11.4：清理当前页 Cookie
- **输入**：`把当前网站的 Cookie 清掉`
- **预期**：调用 `clear_cookies` domain=当前页 hostname → 弹确认卡

### 用例 11.5：只清缓存保留 Cookie
- **输入**：`清理一下缓存，但保留登录态`
- **预期**：调用 `browsing_data_remove_cache`（仅 cache）→ 弹确认卡

---

## 十二. 存储

### 用例 12.1：读 local 全部
- **输入**：`看看本地存储里有什么`
- **预期**：调用 `storage_area_get` area=local；表格展示键值

### 用例 12.2：读指定 key
- **输入**：`读一下 local 里 user_token 这个键`
- **预期**：调用 `storage_area_get` area=local key=user_token

### 用例 12.3：写入存储
- **输入**：`在 session 里存一下 theme=dark`
- **预期**：调用 `storage_area_set` area=session key=theme value=dark

### 用例 12.4：删除存储
- **输入**：`把 local 里的过期缓存删了`
- **预期**：调用 `storage_remove` / `storage_area_remove`（dangerous）→ 弹确认卡

### 用例 12.5：清空 session
- **输入**：`清空 session 存储`
- **预期**：调用 `storage_area_clear` area=session（dangerous）→ 弹确认卡

---

## 十三. Cookie / 权限 / 内容设置

### 用例 13.1：查看当前页 Cookie
- **输入**：`看看当前页有哪些 Cookie`
- **预期**：调用 `get_cookies`（当前页域名）→ 表格展示（仅元数据，无 value）

### 用例 13.2：查看指定域 Cookie
- **输入**：`查一下 baidu.com 下的 Cookie`
- **预期**：调用 `cookies_get_all` domain=baidu.com

### 用例 13.3：清除指定域 Cookie
- **输入**：`清除 github.com 的所有 Cookie`
- **预期**：调用 `cookies_remove` domain=github.com → 弹确认卡

### 用例 13.4：设置站点权限
- **输入**：`禁止 b站 的弹窗`
- **预期**：调用 `permissions_update` site=bilibili.com permission=popups setting=block

### 用例 13.5：允许某站通知
- **输入**：`允许 example.com 给我发通知`
- **预期**：调用 `permissions_update` site=example.com permission=notifications setting=allow

### 用例 13.6：查看权限
- **输入**：`看看当前页都有什么权限设置`
- **预期**：调用 `permissions_observe`；表格展示

### 用例 13.7：清理内容设置
- **输入**：`重置所有站点的 Cookie 设置`
- **预期**：调用 `content_settings_clear`（dangerous）→ 弹确认卡

---

## 十四. 扩展管理

### 用例 14.1：列出所有扩展
- **输入**：`我装了哪些扩展？`
- **预期**：调用 `list_extensions` / `extensions_observe`；表格展示

### 用例 14.2：按名称过滤
- **输入**：`有没有 adblock 相关的扩展？`
- **预期**：调用 `list_extensions` query=adblock

### 用例 14.3：启用扩展
- **输入**：`把 Screenity 启用一下`
- **预期**：调用 `enable_extension` query=Screenity；前端 precompute 解析 name → id

### 用例 14.4：禁用扩展
- **输入**：`把 Vue devtools 关了`
- **预期**：调用 `disable_extension` query=Vue devtools

### 用例 14.5：卸载扩展（MV3 限制）
- **输入**：`把 Octotree 卸了`
- **预期**：提示「MV3 SW 限制：卸载扩展需要到 chrome://extensions 页面手动操作」

### 用例 14.6：启用 / 禁用失败回退
- **输入**：`启用一个不存在的扩展叫 xxx`
- **预期**：返回「未找到匹配 xxx 的扩展」

---

## 十五. 主题 / 字体 / 缩放

### 用例 15.1：切换深色
- **输入**：`切换到深色模式`
- **预期**：调用 `theme_update` mode=dark

### 用例 15.2：跟随系统
- **输入**：`主题跟随系统设置`
- **预期**：调用 `theme_update` mode=device

### 用例 15.3：调整字号
- **输入**：`把字号调大一点`
- **预期**：调用 `font_size_update` size=large

### 用例 15.4：指定具体字号
- **输入**：`把全局字号设为 18`
- **预期**：调用 `font_size_update` size=18

### 用例 15.5：调整字体
- **输入**：`把字体换成思源黑体`
- **预期**：调用 `font_family_update` family='Source Han Sans'

### 用例 15.6：恢复默认
- **输入**：`字号恢复默认`
- **预期**：调用 `font_size_update` size=default

---

## 十六. 录制

### 用例 16.1：开始录屏
- **输入**：`开始录屏吧`
- **预期**：调用 `record_screen` → 唤起 Chrome 录制选择 UI → 用户选区域 → 录制中

### 用例 16.2：停止录制
- **输入**：`停`
- **预期**：调用 `stop_recording` → 保存视频文件

### 用例 16.3：录完后自动播放
- **输入**：`录个 10 秒视频给我看看效果`
- **预期**：record_screen → 等用户停止 → 视频气泡插入到聊天

---

## 十七. 组合 / 多步任务

### 用例 17.1：导航 + 截图合并
- **输入**：`打开 GitHub 然后截个图给我看`
- **预期**：plan: navigate → screenshot；截图与文字合并到一条 ai-chat 气泡

### 用例 17.2：清理 + 重置
- **输入**：`把今天的 Cookie 都清掉，然后刷新页面`
- **预期**：plan: cookies_remove → tabs_reload；先弹确认卡，确认后刷新

### 用例 17.3：批量操作多个域名
- **输入**：`把 baidu.com 和 zhihu.com 的标签都静音了`
- **预期**：plan 两次 `mute_tabs_by_domain`；每步独立状态

### 用例 17.4：复合查询（历史 + 搜索）
- **输入**：`看看我今天访问的所有 github 相关页面，然后搜索相关代码`
- **预期**：plan: history_search → navigate（搜索结果页）

### 用例 17.5：先观察再决策
- **输入**：`看看当前窗口有哪些重复标签，然后关掉前 3 组`
- **预期**：plan: tabs_observe → close_duplicate_tabs selectedIds=[…]；前端根据 observe 结果算 selected

### 用例 17.6：标签分组 + 改名
- **输入**：`按域名分组，然后把"工作"分组改成蓝色`
- **预期**：plan: group_by_domain → tab_groups_update color=blue

### 用例 17.7：关闭一组，关闭另一组，开一个新窗口
- **输入**：`关掉所有 baidu.com 标签，然后关掉 youtube 的，最后新开个窗口打开 github`
- **预期**：plan 三步：tabs_remove → tabs_remove → windows_create；分别弹确认

### 用例 17.8：保存当前页 + 整理标签
- **输入**：`把当前页加书签，然后按域名分组`
- **预期**：plan: add_bookmark → group_by_domain；add_bookmark 直接执行，分组弹确认

### 用例 17.9：搜索 + 打开 + 截图
- **输入**：`搜一下"Chrome MV3"，把搜索结果页截个图`
- **预期**：plan: navigate → screenshot

### 用例 17.10：清理 + 验证
- **输入**：`清掉所有缓存，然后告诉我现在打开了多少个标签`
- **预期**：plan: browsing_data_remove_cache → tabs_observe

---

## 十八. 闲聊 / 边界 / 异常

### 用例 18.1：闲聊无操作
- **输入**：`随便说说`
- **预期**：chat 路径；不调工具

### 用例 18.2：模糊意图 → 询问
- **输入**：`帮我弄一下`
- **预期**：chat 路径；AI 反问"你想弄什么"

### 用例 18.3：超长指令
- **输入**：（一段 200+ 字的任务描述）
- **预期**：AI 仍能解析为合法 plan；超过 thought 长度上限（200 字）应截断

### 用例 18.4：连续多轮
- **输入**：连续发 5 条简单指令
- **预期**：每条独立调度，不卡顿、不丢消息

### 用例 18.5：危险操作中途取消
- **输入**：`把当前窗口所有标签都关了` → 在确认卡点取消
- **预期**：气泡「好嘞，已帮你取消啦~」

### 用例 18.6：AI 不可用降级
- **输入**：`清空所有标签`（未配置 API Key）
- **预期**：气泡「抱歉，AI 服务暂时不可用，请稍后再试喵~」；斜杠命令仍可用

### 用例 18.7：plan 结构非法
- **输入**：构造使 AI 返回的 plan 缺 `deps` 字段（mock）
- **预期**：前端 usePlanRunner 兜底补 `[]`，SW 仍能执行；不再出现「plan item 结构无效」

### 用例 18.8：SW 返回非 plan 结构
- **输入**：构造 SW 异常返回
- **预期**：usePlanRunner 解析 `.error / .message / .code`；气泡展示具体错误

### 用例 18.9：MV3 不可执行工具
- **输入**：`录屏`
- **预期**：调用 `record_screen`；如果 offscreen document 不可用 → 提示用户授权

### 用例 18.10：批量操作零匹配
- **输入**：`关闭 xxx-not-exist-domain.com 的所有标签`
- **预期**：弹确认卡显示「没有匹配的标签」/ 直接返回成功 removed=0

### 用例 18.11：敏感数据保护
- **输入**：`看看我的 Cookie`
- **预期**：表格仅展示 name/domain/path/secure 等元数据；**绝不展示 value**

### 用例 18.12：危险工具未确认
- **输入**：`关掉 github.com 所有标签` → 直接发（用户跳过确认）
- **预期**：SW 不会在没有 force/确认 token 的情况下执行 dangerous；必须经前端 confirm 卡

### 用例 18.13：前后端字段不一致
- **输入**：`关闭 baidu.com 的标签`（前端 precompute 出 tabIds=[1,2,3]）
- **预期**：merge 到 args.tabIds；SW 用 explicit tabIds 模式，不再二次按 domain 扩展

---

## 十九. 半成品 plan 兜底测试

> 针对 AI 偶发只返回 observe/query 而不追加 mutation 的兜底（src/shared/ai/intent-rules.ts detectHalfPlan）。
> 每条用例都是「AI 返回不完整 plan」模拟；测试方式为 mock aiEngine 返回 observe-only plan。

### 用例 19.1：基础关闭（核心场景）
- **输入**：`把 baidu.com 的所有标签都关了`
- **AI mock 返回**：`plan=[{tabs_observe domain=baidu.com}]`
- **预期**：
  - detectHalfPlan 命中 `close_tabs_by_domain` 规则
  - 合成 item：`{tool: close_tabs_by_domain, args: {domain: baidu.com}, deps: [p1]}`
  - 弹确认卡 → 用户勾选 → 真关闭

### 用例 19.2：按域名静音
- **输入**：`把 youtube.com 的标签都静音`
- **AI mock 返回**：`plan=[{tabs_observe domain=youtube.com}]`
- **预期**：合成 `{mute_tabs_by_domain, args: {domain: youtube.com}, deps: [p1]}`；批量 muted=true

### 用例 19.3：清 cookie
- **输入**：`清除 github.com 的所有 Cookie`
- **AI mock 返回**：`plan=[{cookies_observe}]`
- **预期**：合成 `{clear_cookies, args: {domain: github.com}, deps: [p1]}`；弹确认卡

### 用例 19.4：清缓存
- **输入**：`清理一下浏览器缓存`
- **AI mock 返回**：`plan=[{browsing_data_settings}]`
- **预期**：合成 `{browsing_data_remove, args: {dataTypes: [cache]}, deps: [p1]}`；弹确认卡

### 用例 19.5：加书签
- **输入**：`帮我收藏一下 https://github.com`
- **AI mock 返回**：`plan=[{bookmarks_observe_tree}]`
- **预期**：合成 `{add_bookmark, args: {url: https://github.com}, deps: [p1]}`；不弹确认卡（add_bookmark 非 dangerous）

### 用例 19.6：录屏
- **输入**：`开始录屏吧`
- **AI mock 返回**：`plan=[{tabs_observe}]`
- **预期**：合成 `{record_screen, deps: [p1]}`；不走 confirm card（clientExec 路径）；唤起 Chrome 录制 UI

### 用例 19.7：多步链 X 然后 Y
- **输入**：`关闭 baidu.com 然后截图`
- **AI mock 返回**：`plan=[{tabs_observe}]`
- **预期**：合成 2 个 items：`close_tabs_by_domain`（依赖 p1）+ `screenshot`（standalone, 依赖 p1）；截图渲染为 ai-chat 气泡

### 用例 19.8：多步链 X 然后 Y 然后 Z
- **输入**：`关掉 baidu.com 然后关掉 youtube 的最后开新窗口打开 github`
- **AI mock 返回**：`plan=[{tabs_observe}]`
- **预期**：合成 3 个 mutations；分别弹确认卡；最后新窗口

### 用例 19.9：拿不到必需参数（防御）
- **输入**：`关闭所有标签`（无 domain）
- **AI mock 返回**：`plan=[{tabs_observe}]`
- **预期**：detectHalfPlan 不合成（completed:false）；fall through 到 AI 原结果；不会乱关标签

### 用例 19.10：idempotency
- **输入**：连续两次相同 query
- **预期**：第二次不会重复合成 mutation（已 augmented 的 plan 不再被检测为半成品）

### 用例 19.11：英文 verb
- **输入**：`close all github tabs`
- **AI mock 返回**：`plan=[{tabs_observe domain=github.com}]`
- **预期**：命中英文 verb "close" → 合成 close_tabs_by_domain

### 用例 19.12：seededResults 注入
- **输入**：第一轮 SW 已 observe 成功，第二轮 detectHalfPlan 合成 mutation
- **预期**：合成 mutation 携带 seededResults：第一轮 observe 的 id 与 result 都在种子 map 中；SW 端不会重复 observe

### 用例 19.13：confirm card augmented plan
- **输入**：合成 mutation 是 dangerous（tabs_remove）→ 弹 confirm card
- **预期**：confirm card 接收 augmentedPlan 而非原 parsed；item.id 在 augmented 中可查；标题为「将关闭 baidu.com 下的 N 个标签页」而非「确认操作」

---

## 二十. 稳定性 / 回归

### 用例 20.1：长命令不超时
- **输入**：（输入 200+ 字的复杂任务描述）
- **预期**：AI 解析 → 合法 plan → SW DAG 执行不超时

### 用例 19.2：连续多次操作
- **输入**：连续发 5 条简单指令
- **预期**：依次执行，无卡顿、无消息丢失

### 用例 19.3：刷新侧边栏后保持
- **输入**：先发送消息 → 刷新侧边栏 → 再发消息
- **预期**：历史消息持久化；新消息正常显示

### 用例 19.4：toolPolicy 缺失
- **输入**：构造一个 swIntent 在 policy 中不存在的工具（mock）
- **预期**：dispatchTool 返回 `TOOL_POLICY_MISSING`

---

## 二十一. 调试与日志

### 用例 21.1：观察完整 AI 决策链路
- **输入**：任意自然语言
- **预期**：控制台出现以下链路日志（按顺序）：
  - `[usePlanRunner] precompute tool=...`
  - `[usePlanRunner] -> SW MSG_EXECUTE_PLAN items=...`
  - `[SW][rx] type=EXECUTE_PLAN`
  - `[SW][MSG_EXECUTE_PLAN] plan items: ...`
  - `[PlanRunner] enter / round N / dispatch done`
  - `[AI管家] dispatchTool / handler invoke / handler done`
  - `[usePlanRunner] <- SW report`

### 用例 21.2：定位 "SW 返回结构无效"
- **输入**：构造一个 SW 返回值不带 `items` 的场景
- **预期**：usePlanRunner 的 fallback 解析 `.error / .message / .code` 三选一，给出具体错误而非「SW 返回结构无效」

### 用例 21.3：定位 "plan item 结构无效"
- **输入**：让 AI 返回一个缺 `deps` 字段的 plan
- **预期**：前端兜底补 `[]`；如仍失败 SW 端日志输出 `itemKeys / argsType / depsType / rawItem`

---

## 测试建议流程

1. **基础会话**：先确认 chat 路径通畅（第一节）
2. **标签单步**：单条刷新 / 复制 / 固定 / 休眠（第二节）
3. **标签批量**：核心 domain / url / 重复标签（第三节）；重点验证「显式 tabIds 不被 domain 二次扩展」
4. **分组 / 书签 / 历史**：按域分组、删除书签、清理历史（第四、五、六节）
5. **窗口 / 导航 / 截图**：组合 chat+screenshot 合并消息（第七、八节）
6. **清理 / 存储 / Cookie / 权限**：每条都触发确认卡（第十一、十二、十三节）
7. **扩展 / 主题 / 录制**：验证 MV3 限制下的降级（第十四、十五、十六节）
8. **组合任务**：连续多步 plan（第十七节）
9. **边界 / 异常**：取消、不可用、字段缺失（第十八、十九、二十、二十一节）
10. **回归**：每个用例执行后记录实际结果与期望的差异，沉淀到 bug 池

---

## 常见问题排查

| 现象 | 可能原因 |
|---|---|
| 报"未知工具" | AI 返回的 tool 名不在 REGISTRY；或 aiHidden=true 工具被误用 |
| 报"plan item 结构无效" | AI 返回的 plan item 缺 `deps` 或 `args`（前端已兜底补 `[]` / `{}`） |
| 报"重复的 item id" | 同一 plan 内 id 重复（前端应保证唯一） |
| 报"找不到依赖步骤" | deps 引用了不存在的 id |
| 报"plan 存在循环依赖" | deps 形成环 |
| 报"缺少网站访问目标" | storage_/cookies_ 类工具没传 url/domain |
| 报"禁止修改本扩展" | 命令尝试操作扩展自身 |
| 报"id 必须是合法扩展 id" | precompute 没把 query 转为 id |
| 截图与文字分两条气泡 | 旧问题，现在 chat+screenshot 必须合并 |
| AI 不返回结果 | API Key 未配置 / Gemini Nano 未启用 / 网络异常 |
| 批量操作零匹配 | `browsing_data_remove` 等 dataTypes 为空数组；或 domain 没匹配到 |
| 二次确认后只关了一个 | 旧 bug：tabIds 与 domain 重复合并；已修 |
| 二次确认后出现 thought | 旧 bug：emitFinalChat 用 thought 作为用户气泡；已修 |

---

**所有用例覆盖了 AI 操作浏览器的主要能力边界，按节执行可逐步排查定位问题**。
