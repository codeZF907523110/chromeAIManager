/**
 * 操作执行器 — 接收确定性命令，执行 Chrome API 操作
 * 所有处理器均为 chrome.* API 的薄封装：纯参数校验 + 错误标准化，零业务逻辑。
 */

import { isBlockedURL } from "../shared/constants.js";

// ============================================================================
// 导出 — 命令分发
// ============================================================================

export async function executeCommand(command) {
  const { intent, payload } = command;

  const handler = handlers[intent];
  if (!handler) return { success: false, error: `未知命令: ${intent}` };

  try {
    return await handler(payload);
  } catch (error) {
    return { success: false, error: error.message, intent };
  }
}

// ============================================================================
// 工具函数
// ============================================================================

function err(code, message, detail) {
  return { success: false, code, message, detail: detail || null };
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function computeTimeRangeStart(timeRange, endTime) {
  const offsets = { today: 1, yesterday: 2, week: 7, month: 30 };
  const days = offsets[timeRange];
  return days ? endTime - days * 24 * 60 * 60 * 1000 : 0;
}

async function getTabTarget(tabId) {
  if (tabId) {
    try {
      return await chrome.tabs.get(tabId);
    } catch (_) {
      return null;
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function bookmarkNodeType(node) {
  return node?.url ? "bookmark" : "folder";
}

/**
 * injectedEval — 注入到页面 MAIN world 的函数。
 * Chrome 会序列化此函数体注入目标页面。
 * 函数体内定义的所有子函数会一起被序列化，外部引用不可用。
 */
function injectedEval(code) {
  // Trusted Types 兼容：页面如果启用了 Trusted Types，预先创建默认策略
  if (typeof trustedTypes !== "undefined" && trustedTypes.createPolicy) {
    try {
      trustedTypes.createPolicy("abcDefault", {
        createHTML: function (s) {
          return s;
        },
        createScript: function (s) {
          return s;
        },
        createScriptURL: function (s) {
          return s;
        },
      });
    } catch (_) {
      // 策略已存在时忽略
    }
  }
  // code 被视为"函数体"而不是顶层脚本片段。
  // 这样 AI 可以稳定使用 return，而不会触发 Illegal return statement。
  var wrappedCode = "(function(){\n" + code + "\n})()";
  return _safeReturn(eval(wrappedCode));

  /**
   * 返回值安全转换。
   * Chrome structured cloning 无法序列化 DOM 元素、NodeList 等类型，
   * 会将它们静默转为 null。本函数将不可序列化的返回值转为可读信息。
   */
  function _safeReturn(val) {
    // undefined：AI 忘记写 return 语句
    if (val === undefined) return "(脚本无返回值，请添加 return 语句)";

    // null：透传（AI 可能有意返回 null 表示"未找到"）
    if (val === null) return null;

    // 原始类型：透传
    if (typeof val !== "object") return val;

    // DOM 元素（nodeType === 1）
    if (val.nodeType === 1) {
      var info = { tag: val.tagName ? val.tagName.toLowerCase() : "unknown" };
      if (val.id) info.id = val.id;
      if (val.className && typeof val.className === "string")
        info.className = val.className;
      if (val.name) info.name = val.name;
      if (val.value !== undefined) info.value = val.value;
      if (val.checked !== undefined) info.checked = val.checked;
      var txt = (val.textContent || "").trim().slice(0, 100);
      if (txt) info.textContent = txt;
      return info;
    }

    // DocumentFragment / ShadowRoot（nodeType === 11）
    if (val.nodeType === 11) {
      var children = val.querySelectorAll
        ? val.querySelectorAll("*")
        : { length: 0 };
      var html = val.innerHTML ? val.innerHTML.slice(0, 200) : "";
      return {
        type: val.host ? "ShadowRoot" : "DocumentFragment",
        childCount: children.length,
        html: html || "(空)",
      };
    }

    // NodeList / HTMLCollection（有 length 和 item 方法的类数组）
    if (
      typeof val.length === "number" &&
      val.length >= 0 &&
      val.item &&
      typeof val.item === "function"
    ) {
      var arr = [];
      var max = Math.min(val.length, 20);
      for (var i = 0; i < max; i++) {
        var el = val[i];
        if (el && el.nodeType === 1) {
          var item = {
            tag: el.tagName ? el.tagName.toLowerCase() : "unknown",
          };
          if (el.id) item.id = el.id;
          if (el.className && typeof el.className === "string")
            item.className = el.className;
          if (el.name) item.name = el.name;
          if (el.value !== undefined) item.value = el.value;
          var t = (el.textContent || "").trim().slice(0, 50);
          if (t) item.textContent = t;
          arr.push(item);
        }
      }
      var result = { length: val.length, items: arr };
      if (val.length > max) result.truncated = true;
      return result;
    }

    // 普通对象/数组：透传
    return val;
  }
}

// ============================================================================
// 书签快照（供 bookmarksObserveTree 等使用）
// ============================================================================

function normalizeBookmarkText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildBookmarkSnapshotFromTree(nodes, options, state) {
  const opts = options || {};
  const path = state?.path || [];
  const depth = state?.depth || 0;
  let list = [];

  if (!Array.isArray(nodes)) return list;
  if (typeof opts.maxDepth === "number" && depth > opts.maxDepth) {
    return list;
  }

  for (const node of nodes) {
    const title = node.title || "";
    const nextPath = title ? path.concat(title) : path;
    const entry = {
      id: node.id,
      title: title || null,
      nodeType: bookmarkNodeType(node),
      parentId: node.parentId || null,
      index: typeof node.index === "number" ? node.index : null,
      path: nextPath.join("/"),
      depth: depth,
      url: node.url || null,
      childCount: node.children ? node.children.length : 0,
    };

    const haystack = normalizeBookmarkText(
      [entry.title || "", entry.path, entry.url || ""].join(" "),
    );
    const matchesQuery =
      !opts.query || haystack.includes(normalizeBookmarkText(opts.query));
    const matchesType = !opts.nodeType || opts.nodeType === entry.nodeType;
    const visibleNode =
      title || node.url || node.parentId || node.children?.length;

    if (visibleNode && matchesQuery && matchesType) {
      list.push(entry);
      if (
        typeof opts.maxResults === "number" &&
        list.length >= opts.maxResults
      ) {
        return list;
      }
    }

    if (node.children?.length) {
      const children = buildBookmarkSnapshotFromTree(node.children, opts, {
        path: nextPath,
        depth: depth + 1,
      });
      list = list.concat(children);
      if (
        typeof opts.maxResults === "number" &&
        list.length >= opts.maxResults
      ) {
        return list.slice(0, opts.maxResults);
      }
    }
  }

  return list;
}

async function getBookmarkSnapshot(options) {
  const tree = await chrome.bookmarks.getTree();
  return buildBookmarkSnapshotFromTree(tree, options, { path: [], depth: 0 });
}

async function getBookmarkNodeById(nodeId) {
  if (nodeId === undefined || nodeId === null || nodeId === "") return null;
  try {
    const items = await chrome.bookmarks.get(String(nodeId));
    return items?.[0] || null;
  } catch (_) {
    return null;
  }
}

// ============================================================================
// 录制辅助
// ============================================================================

async function ensureOffscreenDocument() {
  const hasDoc = await chrome.offscreen.hasDocument();
  if (!hasDoc) {
    await chrome.offscreen.createDocument({
      url: "src/offscreen/recorder.html",
      reasons: ["USER_MEDIA"],
      justification: "录制标签页/桌面的音视频流",
    });
  }
}

// ============================================================================
// 主题辅助
// ============================================================================

async function applyThemeToAllTabs({ themeMode, themeColor }) {
  const tabs = await chrome.tabs.query({});
  const tabIds = tabs
    .filter((t) => t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("chrome-extension://"))
    .map((t) => t.id);
  await Promise.allSettled(tabIds.map((id) => injectThemeCSS(id, themeMode, themeColor)));
}

async function injectThemeCSS(tabId, themeMode, themeColor) {
  const color = themeColor || "#00e5ff";

  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: (accentColor, darkMode) => {
        const id = "__ai_theme_style__";
        let style = document.getElementById(id);
        if (!style) {
          style = document.createElement("style");
          style.id = id;
          document.head.appendChild(style);
        }
        let css = "";
        if (darkMode) {
          css += `html{filter:brightness(0.88) contrast(1.08)!important;background:#1a1a1a!important;color:#e0e0e0!important;} `;
        }
        css += `
        ::selection{background:${accentColor}40!important;}
        a{color:${accentColor}!important;}
        a:visited{color:${accentColor}99!important;}
        input:focus,textarea:focus,select:focus{border-color:${accentColor}!important;outline-color:${accentColor}40!important;box-shadow:0 0 0 2px ${accentColor}30!important;}
        ::-webkit-scrollbar-thumb{background:${accentColor}60!important;}
        button:hover,.btn:hover{box-shadow:0 0 6px ${accentColor}40!important;}
      `;
        style.textContent = css;
      },
      args: [color, themeMode === "dark"],
    })
    .catch(() => {});
}

// ============================================================================
// 权限常量
// ============================================================================

const CONTENT_SETTINGS = [
  "cookies",
  "images",
  "javascript",
  "location",
  "popups",
  "notifications",
  "microphone",
  "camera",
  "automaticDownloads",
];

// ============================================================================
// 处理器注册表
// ============================================================================

const handlers = {
  // ── 标签页 ──
  tabs_observe: handleTabsObserve,
  tabs_create: handleTabsCreate,
  tabs_update: handleTabsUpdate,
  tabs_move: handleTabsMove,
  tabs_remove: handleTabsRemove,
  tabs_group: handleTabsGroup,
  tabs_ungroup: handleTabsUngroup,
  tabs_observe_groups: handleTabsObserveGroups,
  tabs_group_by_domain: handleTabsGroupByDomain,

  // ── 书签 ──
  bookmarks_observe_tree: handleBookmarksObserveTree,
  bookmarks_move_node: handleBookmarksMoveNode,
  bookmarks_create_node: handleBookmarksCreateNode,
  bookmarks_update_node: handleBookmarksUpdateNode,
  bookmarks_open_node: handleBookmarksOpenNode,
  bookmarks_remove_node: handleBookmarksRemoveNode,
  bookmarks_add_current_page: handleBookmarksAddCurrentPage,

  // ── 窗口 ──
  windows_observe: handleWindowsObserve,
  windows_create: handleWindowsCreate,
  windows_update: handleWindowsUpdate,

  // ── 历史 ──
  history_search: handleHistorySearch,
  history_remove: handleHistoryRemove,

  // ── 导航 ──
  navigate: handleNavigate,
  screenshot: handleScreenshot,

  // ── 页面 ──
  zoom: handleZoom,
  downloads_open: handleDownloadsOpen,

  // ── 主题 ──
  theme_observe: handleThemeObserve,
  theme_update: handleThemeUpdate,

  // ── 字体 ──
  font_size_observe: handleFontSizeObserve,
  font_size_update: handleFontSizeUpdate,
  font_family_observe: handleFontFamilyObserve,
  font_family_update: handleFontFamilyUpdate,

  // ── Cookie ──
  cookies_observe: handleCookiesObserve,
  cookies_remove: handleCookiesRemove,

  // ── 常用网站 ──
  top_sites_observe: handleTopSitesObserve,

  // ── 扩展 ──
  extensions_observe: handleExtensionsObserve,
  extensions_update: handleExtensionsUpdate,
  extensions_remove: handleExtensionsRemove,

  // ── 网站权限 ──
  permissions_observe: handlePermissionsObserve,
  permissions_update: handlePermissionsUpdate,

  // ── 存储 ──
  storage_get: handleStorageGet,
  storage_set: handleStorageSet,
  storage_remove: handleStorageRemove,

  // ── 会话恢复 ──
  sessions_restore: handleSessionsRestore,

  // ── 录制 ──
  recording_start_tab: handleRecordingStartTab,
  recording_start_screen: handleRecordingStartScreen,
  recording_stop: handleRecordingStop,

  // ── DOM ──
  dom_manipulate: handleDOMManipulate,

  // ── 批量编排 ──
  batch: handleBatch,
};

// ============================================================================
// 标签页处理器
// ============================================================================

async function handleTabsObserve({
  query: queryStr,
  domain,
  currentWindow,
  pinned,
  muted,
  discarded,
  maxResults,
}) {
  const queryInfo = {};
  if (currentWindow !== undefined) queryInfo.currentWindow = currentWindow;
  if (pinned !== undefined) queryInfo.pinned = pinned;
  if (muted !== undefined) queryInfo.muted = muted;
  if (discarded !== undefined) queryInfo.discarded = discarded;

  let tabs = await chrome.tabs.query(queryInfo);

  if (domain) {
    tabs = tabs.filter((t) => t.url && extractDomain(t.url).includes(domain));
  }
  if (queryStr) {
    const q = queryStr.toLowerCase();
    tabs = tabs.filter(
      (t) =>
        (t.title || "").toLowerCase().includes(q) ||
        (t.url || "").toLowerCase().includes(q),
    );
  }

  if (maxResults && maxResults > 0) {
    tabs = tabs.slice(0, maxResults);
  }

  return {
    success: true,
    tabs: tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      active: t.active,
      pinned: t.pinned,
      muted: t.mutedInfo?.muted || false,
      discarded: t.discarded,
      groupId: t.groupId,
      windowId: t.windowId,
      index: t.index,
    })),
  };
}

async function handleTabsCreate({ url, active, windowId, index, tabIds }) {
  // 支持批量创建
  if (tabIds?.length) {
    const results = await Promise.allSettled(
      tabIds.map(async () => {
        const props = { url, active, windowId, index };
        if (typeof index === 'number') props.index = index;
        try {
          const tab = await chrome.tabs.create(props);
          return { success: true, tab: { id: tab.id, title: tab.title, url: tab.url, windowId: tab.windowId, index: tab.index } };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }),
    );
    const successes = results.filter((r) => r.status === 'fulfilled' && r.value.success);
    return {
      success: true,
      created: successes.length,
      results: results.map((r) => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message }),
      failed: results.length - successes.length,
    };
  }

  const createProps = {};
  if (url !== undefined) createProps.url = url;
  if (active !== undefined) createProps.active = active;
  if (windowId !== undefined) createProps.windowId = windowId;
  if (index !== undefined) createProps.index = index;

  try {
    const tab = await chrome.tabs.create(createProps);
    return {
      success: true,
      tab: {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        windowId: tab.windowId,
        index: tab.index,
      },
    };
  } catch (e) {
    return err("ACT_BLOCKED", `创建标签失败: ${e.message}`, { url });
  }
}

async function handleTabsUpdate({
  tabId,
  url,
  active,
  muted,
  pinned,
  discarded,
  reload,
  tabIds,
}) {
  // 支持批量操作
  if (tabIds?.length) {
    const results = await Promise.allSettled(
      tabIds.map((id) => handleTabsUpdate({ tabId: id, url, active, muted, pinned, discarded, reload })),
    );
    const successes = results.filter((r) => r.status === 'fulfilled' && r.value.success);
    const failures = results.filter((r) => r.status !== 'fulfilled' || !r.value.success);
    return {
      success: true,
      updated: successes.length,
      results: results.map((r) => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message }),
      failed: failures.length,
    };
  }

  const tab = await getTabTarget(tabId);
  if (!tab) return err("ELE_NOT_FOUND", "未找到目标标签", { tabId });

  // 先应用属性更新（如有）
  const updateProps = {};
  if (url !== undefined) updateProps.url = url;
  if (active !== undefined) updateProps.active = active;
  if (muted !== undefined) updateProps.muted = muted;
  if (pinned !== undefined) updateProps.pinned = pinned;
  if (discarded !== undefined) updateProps.discarded = discarded;

  let updated = null;
  if (Object.keys(updateProps).length) {
    try {
      updated = await chrome.tabs.update(tab.id, updateProps);
    } catch (e) {
      return err("ACT_BLOCKED", `更新标签失败: ${e.message}`, { tabId });
    }
  }

  // 再刷新（如有）
  if (reload) {
    try {
      await chrome.tabs.reload(tab.id);
    } catch (e) {
      return err("ACT_BLOCKED", `刷新标签失败: ${e.message}`, { tabId });
    }
  }

  if (!updated && !reload) {
    return err("VAL_MISSING", "请提供至少一个更新属性或 reload");
  }

  if (updated) {
    return {
      success: true,
      reloaded: !!reload,
      tab: {
        id: updated.id,
        title: updated.title,
        url: updated.url,
        active: updated.active,
        pinned: updated.pinned,
        muted: updated.mutedInfo?.muted || false,
        discarded: updated.discarded,
      },
    };
  }

  return { success: true, reloaded: true, tabId: tab.id };
}

async function handleTabsMove({ tabIds, index }) {
  if (index === undefined) return err("VAL_MISSING", "请提供目标位置 index");

  let targets = tabIds;
  if (!targets || !targets.length) {
    const tab = await getTabTarget();
    if (!tab) return err("ELE_NOT_FOUND", "无活跃标签");
    targets = [tab.id];
  }

  try {
    const moved = await chrome.tabs.move(targets, { index });
    return {
      success: true,
      moved: Array.isArray(moved) ? moved.length : 1,
      index,
    };
  } catch (e) {
    return err("ACT_BLOCKED", `移动标签失败: ${e.message}`, { tabIds: targets, index });
  }
}

async function handleTabsRemove({ tabIds }) {
  if (!tabIds?.length) return { success: true, removed: 0 };

  try {
    await chrome.tabs.remove(tabIds);
    return { success: true, removed: tabIds.length };
  } catch (e) {
    return err("ACT_BLOCKED", `关闭标签失败: ${e.message}`, { tabIds });
  }
}

async function handleTabsGroup({ tabIds, groupId, title, color, groupName }) {
  // groupId === -1 means no group (falsy check handles this)
  if (groupId && groupId !== -1) {
    // 已有分组：将 tabIds 加入该组，同时可选更新标题/颜色
    if (tabIds?.length) {
      try {
        await chrome.tabs.group({ tabIds, groupId });
      } catch (e) {
        return err("ACT_BLOCKED", `加入分组失败: ${e.message}`, { tabIds, groupId });
      }
    }
    const update = {};
    if (title !== undefined) update.title = title;
    if (color !== undefined) update.color = color;
    if (Object.keys(update).length) {
      try {
        await chrome.tabGroups.update(groupId, update);
      } catch (e) {
        return err("ACT_BLOCKED", `更新分组失败: ${e.message}`, { groupId });
      }
    }
    return {
      success: true,
      groupId,
      title,
      color,
      groupedTabs: tabIds?.length || 0,
    };
  }

  if (!tabIds?.length) return err("VAL_MISSING", "请提供 tabIds 或 groupId");

  try {
    const newGroupId = await chrome.tabs.group({ tabIds });
    const finalTitle = title || groupName || `分组 ${newGroupId}`;
    if (finalTitle || color) {
      const update = {};
      if (finalTitle) update.title = finalTitle;
      if (color) update.color = color;
      await chrome.tabGroups.update(newGroupId, update);
    }
    return {
      success: true,
      groupId: newGroupId,
      title: finalTitle,
      color,
      groupedTabs: tabIds.length,
    };
  } catch (e) {
    return err("ACT_BLOCKED", `创建分组失败: ${e.message}`, { tabIds });
  }
}

async function handleTabsUngroup({ tabIds }) {
  if (!tabIds?.length) {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    tabIds = tabs.filter((t) => t.groupId !== -1).map((t) => t.id);
  }

  if (!tabIds.length) return { success: true, ungrouped: 0 };

  // 并行取消所有分组（使用正确的 API：将标签移出分组）
  const results = await Promise.allSettled(
    tabIds.map((id) => chrome.tabs.group({ tabIds: [id], groupId: -1 })),
  );
  const count = results.filter((r) => r.status === "fulfilled").length;
  return { success: true, ungrouped: count };
}

async function handleTabsObserveGroups({ maxResults }) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groupMap = new Map();

  for (const tab of tabs) {
    if (tab.groupId === -1) continue;
    if (!groupMap.has(tab.groupId)) {
      groupMap.set(tab.groupId, {
        id: tab.groupId,
        title: "",
        color: null,
        collapsed: false,
        tabs: [],
      });
    }
    groupMap.get(tab.groupId).tabs.push({
      id: tab.id,
      title: tab.title,
      url: tab.url,
    });
  }

  // 并行获取所有分组元信息
  const groupDetails = await Promise.allSettled(
    [...groupMap.keys()].map(async (id) => {
      try {
        const g = await chrome.tabGroups.get(id);
        return { id, data: g };
      } catch (_) {
        return { id, data: null };
      }
    }),
  );

  for (const { id, data } of groupDetails) {
    if (data) {
      groupMap.get(id).title = data.title || "";
      groupMap.get(id).color = data.color;
      groupMap.get(id).collapsed = data.collapsed;
    }
  }

  let groups = [...groupMap.values()];
  if (maxResults && maxResults > 0) {
    groups = groups.slice(0, maxResults);
  }

  return { success: true, groups };
}

async function handleTabsGroupByDomain() {
  const tabs = await chrome.tabs.query({ currentWindow: true });

  // 按域名分组
  const domainMap = new Map();
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      continue;
    }
    let domain = extractDomain(tab.url);
    if (!domain) continue;

    const displayName = domain.replace(/^www\./, '');
    if (!domainMap.has(displayName)) {
      domainMap.set(displayName, []);
    }
    domainMap.get(displayName).push(tab.id);
  }

  // 串行删除现有分组（避免并发删除冲突）
  const existingGroups = await chrome.tabGroups.query({});
  for (const group of existingGroups) {
    await chrome.tabGroups.remove(group.id);
  }

  // Chrome tab group 颜色索引
  const GROUP_COLORS = [
    'blue', 'cyan', 'green', 'yellow', 'orange', 'red',
    'purple', 'pink', 'grey',
  ];

  // 按域名排序，确保输出稳定
  const sortedDomains = Array.from(domainMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  // 并行创建所有分组（使用 allSettled 容错）
  const createPromises = sortedDomains.map(async ([domain, tabIds], index) => {
    try {
      const newGroupId = await chrome.tabs.group({ tabIds });
      return { domain, groupId: newGroupId, color: GROUP_COLORS[index % GROUP_COLORS.length], tabCount: tabIds.length, success: true };
    } catch (e) {
      return { domain, groupId: null, color: GROUP_COLORS[index % GROUP_COLORS.length], tabCount: tabIds.length, success: false, error: e.message };
    }
  });
  const groups = await Promise.all(createPromises);
  const successGroups = groups.filter((g) => g.success);
  const failedGroups = groups.filter((g) => !g.success);

  // 并行更新所有分组标题和颜色
  await Promise.allSettled(
    successGroups.map(({ groupId, domain, color }) =>
      chrome.tabGroups.update(groupId, { title: domain, color })
    )
  );

  return {
    success: true,
    message: `已将 ${tabs.length} 个标签页按域名分为 ${successGroups.length} 组${failedGroups.length > 0 ? `（${failedGroups.length} 个失败）` : ''}`,
    groups: successGroups,
    failed: failedGroups,
  };
}

// ============================================================================
// 书签处理器
// ============================================================================

async function handleBookmarksObserveTree(payload = {}) {
  const nodes = await getBookmarkSnapshot({
    query: payload.query,
    nodeType: payload.nodeType,
    maxDepth: typeof payload.maxDepth === "number" ? payload.maxDepth : 6,
    maxResults:
      typeof payload.maxResults === "number" ? payload.maxResults : 200,
  });
  return {
    success: true,
    observed: nodes.length,
    nodes,
    query: payload.query || null,
    nodeType: payload.nodeType || null,
  };
}

async function handleBookmarksMoveNode({ nodeId, parentId, index, beforeId }) {
  if (!nodeId) return err("VAL_MISSING", "请提供 nodeId");

  const node = await getBookmarkNodeById(nodeId);
  if (!node) return err("ELE_NOT_FOUND", `未找到节点 "${nodeId}"`);

  let targetParentId = parentId;
  let targetIndex = typeof index === "number" ? index : undefined;

  if (beforeId) {
    const beforeNode = await getBookmarkNodeById(beforeId);
    if (!beforeNode)
      return err("ELE_NOT_FOUND", `未找到参照节点 "${beforeId}"`);
    targetParentId = beforeNode.parentId;
    targetIndex = beforeNode.index;
  }

  const moveProps = {};
  if (targetParentId !== undefined) moveProps.parentId = String(targetParentId);
  if (targetIndex !== undefined) moveProps.index = targetIndex;

  if (!Object.keys(moveProps).length) {
    return err(
      "VAL_MISSING",
      "请提供 parentId、index 或 beforeId 中的至少一个",
    );
  }

  try {
    const moved = await chrome.bookmarks.move(String(nodeId), moveProps);
    return {
      success: true,
      movedNode: {
        id: moved.id,
        title: moved.title,
        nodeType: bookmarkNodeType(moved),
        parentId: moved.parentId || null,
        index: typeof moved.index === "number" ? moved.index : null,
        url: moved.url || null,
      },
    };
  } catch (e) {
    return err("ACT_BLOCKED", `移动书签失败: ${e.message}`, { nodeId });
  }
}

async function handleBookmarksCreateNode({
  nodeType,
  title,
  parentId,
  url,
  index,
  allowDuplicate,
}) {
  if (!nodeType || !["folder", "bookmark"].includes(nodeType)) {
    return err("VAL_INVALID", "nodeType 必须是 folder 或 bookmark");
  }
  if (!title) return err("VAL_MISSING", "请提供 title");
  if (!parentId) return err("VAL_MISSING", "请提供 parentId");
  if (nodeType === "bookmark" && !url) {
    return err("VAL_MISSING", "创建书签时请提供 url");
  }

  const parentNode = await getBookmarkNodeById(parentId);
  if (!parentNode || bookmarkNodeType(parentNode) !== "folder") {
    return err("ELE_NOT_FOUND", `未找到目标父文件夹 "${parentId}"`);
  }

  if (!allowDuplicate) {
    const siblings = await getBookmarkSnapshot({
      maxDepth: 20,
      maxResults: 5000,
    });
    const existing = siblings.find(
      (n) =>
        n.parentId === String(parentId) &&
        n.nodeType === nodeType &&
        n.title === title &&
        (nodeType !== "bookmark" || n.url === url),
    );
    if (existing) {
      return { success: true, created: false, existingNode: existing };
    }
  }

  const createData = {
    parentId: String(parentId),
    title: title,
  };
  if (typeof index === "number") createData.index = index;
  if (nodeType === "bookmark") createData.url = url;

  const created = await chrome.bookmarks.create(createData);
  return {
    success: true,
    created: true,
    createdNode: {
      id: created.id,
      title: created.title,
      nodeType: bookmarkNodeType(created),
      parentId: created.parentId || null,
      index: typeof created.index === "number" ? created.index : null,
      url: created.url || null,
    },
  };
}

async function handleBookmarksUpdateNode({ nodeId, title, url }) {
  if (!nodeId) return err("VAL_MISSING", "请提供 nodeId");

  const node = await getBookmarkNodeById(nodeId);
  if (!node) return err("ELE_NOT_FOUND", `未找到节点 "${nodeId}"`);

  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (url !== undefined) updateData.url = url;

  if (!Object.keys(updateData).length) {
    return err("VAL_MISSING", "请提供 title 或 url");
  }

  const updated = await chrome.bookmarks.update(String(nodeId), updateData);
  return {
    success: true,
    updatedNode: {
      id: updated.id,
      title: updated.title,
      nodeType: bookmarkNodeType(updated),
      parentId: updated.parentId || null,
      index: typeof updated.index === "number" ? updated.index : null,
      url: updated.url || null,
    },
  };
}

async function handleBookmarksOpenNode({ nodeId }) {
  if (!nodeId) return err("VAL_MISSING", "请提供 nodeId");

  const node = await getBookmarkNodeById(nodeId);
  if (!node) return err("ELE_NOT_FOUND", `未找到节点 "${nodeId}"`);
  if (!node.url) return err("ACT_BLOCKED", `"${node.title}" 不是书签页面`);

  await chrome.tabs.create({ url: node.url, active: true });
  return {
    success: true,
    openedNode: {
      id: node.id,
      title: node.title,
      url: node.url,
    },
  };
}

async function handleBookmarksRemoveNode({ nodeId, force }) {
  if (!nodeId)
    return err("ELE_NOT_FOUND", "请提供 nodeId", { reason: "缺少 nodeId" });
  try {
    const results = await chrome.bookmarks.get(nodeId);
    if (!results || !results.length)
      return err("ELE_NOT_FOUND", `未找到节点 "${nodeId}"`, {
        reason: "节点 id 无效",
      });
    const n = results[0];

    // 检查是否是文件夹且有子节点
    if (!n.url && n.children?.length > 0 && !force) {
      const childCount = n.children.length;
      return {
        success: false,
        code: "NEEDS_CONFIRM",
        message: `确认删除？该文件夹包含 ${childCount} 个子项（书签/文件夹）将被一并删除`,
        detail: {
          nodeId: n.id,
          title: n.title,
          childCount,
          children: n.children.map((c) => ({
            id: c.id,
            title: c.title,
            nodeType: c.url ? "bookmark" : "folder",
          })),
        },
      };
    }

    // 使用 removeTree 递归删除，支持非空文件夹
    await chrome.bookmarks.removeTree(nodeId);
    return {
      success: true,
      removedNode: {
        id: n.id,
        title: n.title,
        nodeType: n.url ? "bookmark" : "folder",
      },
    };
  } catch (e) {
    return err("ACT_BLOCKED", e.message, { reason: "删除失败" });
  }
}

async function handleBookmarksAddCurrentPage({ title }) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return err("ELE_NOT_FOUND", "无活跃标签");

  const bookmark = await chrome.bookmarks.create({
    title: title || tab.title,
    url: tab.url,
  });
  return {
    success: true,
    bookmark: {
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
    },
  };
}

// ============================================================================
// 窗口处理器
// ============================================================================

async function handleWindowsObserve({ includeTabs }) {
  const [current, all] = await Promise.all([
    chrome.windows.getCurrent(),
    chrome.windows.getAll({ populate: !!includeTabs }),
  ]);

  return {
    success: true,
    current: { id: current.id, focused: current.focused },
    windows: all.map((w) => {
      const win = {
        id: w.id,
        focused: w.focused,
        state: w.state,
        incognito: w.incognito,
      };
      if (includeTabs && w.tabs) {
        win.tabs = w.tabs.map((t) => ({
          id: t.id,
          title: t.title,
          url: t.url,
          active: t.active,
        }));
      }
      return win;
    }),
  };
}

async function handleWindowsCreate({ url, incognito }) {
  const createData = { focused: true };
  if (url) {
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (isBlockedURL(url))
      return err("PAGE_BLOCKED", "无法在新窗口打开受保护页面", {
        reason: url + " 是受保护地址",
      });
    createData.url = url;
  }
  if (incognito !== undefined) createData.incognito = incognito;

  const win = await chrome.windows.create(createData);
  return {
    success: true,
    window: {
      id: win.id,
      focused: win.focused,
      state: win.state,
      incognito: win.incognito,
    },
  };
}

async function handleWindowsUpdate({ windowId, focused, state }) {
  let targetId = windowId;
  if (!targetId) {
    const current = await chrome.windows.getCurrent();
    targetId = current.id;
  }

  const updateProps = {};
  if (focused !== undefined) updateProps.focused = focused;
  if (state !== undefined) updateProps.state = state;

  if (!Object.keys(updateProps).length)
    return err("VAL_MISSING", "请提供 focused 或 state");

  const win = await chrome.windows.update(targetId, updateProps);
  return {
    success: true,
    window: {
      id: win.id,
      focused: win.focused,
      state: win.state,
    },
  };
}

// ============================================================================
// 历史处理器
// ============================================================================

async function handleHistorySearch({ query, timeRange, maxResults = 20 }) {
  const endTime = Date.now();
  const startTime = computeTimeRangeStart(timeRange, endTime);

  const results = await chrome.history.search({
    text: query || "",
    startTime,
    endTime,
    maxResults: Math.min(maxResults, 100),
  });

  return {
    success: true,
    found: results.length,
    items: results.map((h) => ({
      title: h.title,
      url: h.url,
      lastVisit: h.lastVisitTime,
      visitCount: h.visitCount || 1,
    })),
  };
}

async function handleHistoryRemove({ timeRange = "today", query }) {
  const endTime = Date.now();
  const startTime = computeTimeRangeStart(timeRange, endTime);

  if (query) {
    const results = await chrome.history.search({
      text: query,
      startTime,
      endTime,
      maxResults: 10000,
    });
    if (results.length === 0)
      return { success: false, error: "没有匹配的历史记录" };

    let deleted = 0;
    const deleteResults = await Promise.allSettled(
      results.map((item) => chrome.history.deleteUrl({ url: item.url })),
    );
    for (const r of deleteResults) {
      if (r.status === "fulfilled") deleted++;
    }
    return { success: true, deleted, timeRange };
  }

  await chrome.browsingData.remove({ since: startTime }, { history: true });
  return { success: true, timeRange };
}

// ============================================================================
// 导航处理器
// ============================================================================

async function handleNavigate({ url, newTab }) {
  if (!url) return err("VAL_MISSING", "请提供目标 URL");

  // 先检查受保护页面，再规范化 URL
  if (isBlockedURL(url))
    return err("PAGE_BLOCKED", "无法导航到受保护页面", {
      reason: url + " 是受保护地址",
    });

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  if (newTab !== false) {
    await chrome.tabs.create({ url, active: true });
  } else {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab) {
      await chrome.tabs.update(tab.id, { url });
    } else {
      await chrome.tabs.create({ url, active: true });
    }
  }
  return { success: true, navigated: url };
}

async function handleScreenshot({ tabId }) {
  const tab = await getTabTarget(tabId);
  if (!tab) return err("ELE_NOT_FOUND", "未找到目标标签");

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  return { success: true, screenshot: dataUrl };
}

// ============================================================================
// 页面处理器
// ============================================================================

async function handleZoom({ direction, tabId }) {
  if (!direction)
    return err("VAL_MISSING", "请提供缩放方向 (in / out / reset)");

  const tab = await getTabTarget(tabId);
  if (!tab) return err("ELE_NOT_FOUND", "未找到目标标签");

  if (direction === "reset") {
    await chrome.tabs.setZoom(tab.id, 0);
    return { success: true, zoomFactor: 1 };
  }

  const current = await chrome.tabs.getZoom(tab.id);
  const step = direction === "in" ? 0.25 : -0.25;
  const newZoom = Math.round((current + step) * 100) / 100;
  const clamped = Math.max(0.25, Math.min(5, newZoom));
  await chrome.tabs.setZoom(tab.id, clamped);
  return { success: true, zoomFactor: clamped };
}

async function handleDownloadsOpen() {
  const tabs = await chrome.tabs.query({ url: "chrome://downloads/" });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    return { success: true, focused: true };
  }
  await chrome.tabs.create({ url: "chrome://downloads/", active: true });
  return { success: true, opened: true };
}

// ============================================================================
// 主题处理器
// ============================================================================

async function handleThemeObserve() {
  const data = await chrome.storage.local.get({
    themeMode: "device",
    themeColor: "#00e5ff",
  });
  return {
    success: true,
    themeMode: data.themeMode,
    themeColor: data.themeColor,
  };
}

async function handleThemeUpdate({ mode, color }) {
  if (!mode && !color) return err("VAL_MISSING", "请提供主题模式或颜色");

  const data = await chrome.storage.local.get({
    themeMode: "device",
    themeColor: "#00e5ff",
  });

  if (mode) {
    if (!["light", "dark", "device"].includes(mode))
      return err(
        "VAL_INVALID",
        `不支持的模式: ${mode}，可用: light/dark/device`,
      );
    data.themeMode = mode;
  }

  if (color) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return err("VAL_INVALID", `无效颜色格式: ${color}，请使用 #RRGGBB 格式`);
    }
    data.themeColor = color;
  }

  await chrome.storage.local.set(data);
  await applyThemeToAllTabs(data);

  const modeLabel = { light: "浅色", dark: "深色", device: "跟随设备" };
  return {
    success: true,
    themeMode: data.themeMode,
    themeColor: data.themeColor,
    applied: true,
    message: `已将主题设置为 ${modeLabel[data.themeMode] || data.themeMode} 模式，主题色 ${data.themeColor}\n（已应用到所有网页的链接、选中、输入框等样式）`,
  };
}

// ============================================================================
// 字体处理器
// ============================================================================

async function handleFontSizeObserve() {
  const [size, fixedSize] = await Promise.all([
    chrome.fontSettings.getDefaultFontSize({}),
    chrome.fontSettings.getDefaultFixedFontSize({}),
  ]);
  const label = { 9: "特小", 12: "小", 16: "中", 20: "大", 24: "特大" };
  return {
    success: true,
    fontSize: size.pixelSize,
    fontSizeLabel: label[size.pixelSize] || "自定义",
    fixedFontSize: fixedSize.pixelSize,
  };
}

async function handleFontSizeUpdate({ size }) {
  const px = typeof size === "number" ? size : parseInt(size);
  if (!px || px < 9 || px > 72)
    return err("VAL_INVALID", `无效字号: ${size}，请提供 9-72 之间的像素值`);

  await Promise.all([
    chrome.fontSettings.setDefaultFontSize({ pixelSize: px }),
    chrome.fontSettings.setDefaultFixedFontSize({ pixelSize: px }),
  ]);

  const label = { 9: "特小", 12: "小", 16: "中", 20: "大", 24: "特大" };
  return { success: true, fontSize: px, fontSizeLabel: label[px] || `${px}px` };
}

async function handleFontFamilyObserve() {
  const [standard, serif, sans, fixed] = await Promise.all([
    chrome.fontSettings.getFont({ genericFamily: "standard" }),
    chrome.fontSettings.getFont({ genericFamily: "serif" }),
    chrome.fontSettings.getFont({ genericFamily: "sansserif" }),
    chrome.fontSettings.getFont({ genericFamily: "fixed" }),
  ]);
  return {
    success: true,
    fonts: {
      standard: standard.fontId,
      serif: serif.fontId,
      sansSerif: sans.fontId,
      fixed: fixed.fontId,
    },
  };
}

async function handleFontFamilyUpdate({ family, genericFamily = "standard" }) {
  try {
    await chrome.fontSettings.setFont({
      genericFamily,
      fontId: family,
    });
    return { success: true, font: family, genericFamily };
  } catch (e) {
    return err("ACT_BLOCKED", `字体 "${family}" 不支持: ${e.message}`);
  }
}

// ============================================================================
// Cookie 处理器
// ============================================================================

async function handleCookiesObserve({ domain }) {
  if (!domain) return err("VAL_MISSING", "请提供域名");

  const cookies = await chrome.cookies.getAll({ domain });
  return {
    success: true,
    found: cookies.length,
    domain,
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value
        ? c.value.slice(0, 30) + (c.value.length > 30 ? "..." : "")
        : "",
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      expirationDate: c.expirationDate,
    })),
  };
}

async function handleCookiesRemove({ domain }) {
  if (!domain) return err("VAL_MISSING", "请提供域名");

  const cookies = await chrome.cookies.getAll({ domain });
  if (cookies.length === 0)
    return err("ELE_NOT_FOUND", `域名 "${domain}" 下没有 Cookie`);

  // 并行删除所有 Cookie
  const domains = cookies.map((c) => c.domain.replace(/^\./, ""));
  const paths = cookies.map((c) => c.path);
  const names = cookies.map((c) => c.name);

  const httpsCalls = domains.map((d, i) =>
    chrome.cookies.remove({ url: `https://${d}${paths[i]}`, name: names[i] }),
  );
  const httpCalls = domains.map((d, i) =>
    chrome.cookies.remove({ url: `http://${d}${paths[i]}`, name: names[i] }),
  );

  const [httpsResults, httpResults] = await Promise.allSettled([
    Promise.allSettled(httpsCalls),
    Promise.allSettled(httpCalls),
  ]);

  const httpsDeleted = httpsResults.status === "fulfilled"
    ? httpsResults.value.filter((r) => r.status === "fulfilled").length
    : 0;
  const httpDeleted = httpResults.status === "fulfilled"
    ? httpResults.value.filter((r) => r.status === "fulfilled").length
    : 0;

  return { success: true, deleted: httpsDeleted + httpDeleted, domain };
}

// ============================================================================
// 常用网站处理器
// ============================================================================

async function handleTopSitesObserve() {
  const sites = await chrome.topSites.get();
  return {
    success: true,
    found: sites.length,
    sites: sites.map((s) => ({ title: s.title, url: s.url })),
  };
}

// ============================================================================
// 扩展处理器
// ============================================================================

async function handleExtensionsObserve({ query }) {
  const exts = await chrome.management.getAll();
  const filtered = query
    ? exts.filter(
        (e) =>
          e.name.toLowerCase().includes(query.toLowerCase()) ||
          e.id.toLowerCase().includes(query.toLowerCase()),
      )
    : exts;
  return {
    success: true,
    found: filtered.length,
    extensions: filtered.map((e) => ({
      id: e.id,
      name: e.name,
      enabled: e.enabled,
      mayDisable: e.mayDisable,
      installType: e.installType,
      shortName: e.shortName,
      description: e.description?.slice(0, 80),
    })),
  };
}

async function handleExtensionsUpdate({ id, enabled }) {
  if (!id) return err("VAL_MISSING", "请提供扩展 ID");
  if (enabled === undefined) return err("VAL_MISSING", "请提供 enabled 状态");

  await chrome.management.setEnabled(id, enabled);
  return { success: true, id, enabled };
}

async function handleExtensionsRemove({ id }) {
  if (!id) return err("VAL_MISSING", "请提供扩展 ID");

  await chrome.management.uninstall(id);
  return { success: true, id, uninstalled: true };
}

// ============================================================================
// 网站权限处理器
// ============================================================================

async function handlePermissionsObserve({ domain }) {
  if (!domain) return err("VAL_MISSING", "请提供域名");

  const results = await Promise.allSettled(
    CONTENT_SETTINGS.map(async (setting) => {
      try {
        const result = await chrome.contentSettings[setting].get({
          primaryUrl: `https://${domain}/`,
        });
        return { setting, value: result.setting };
      } catch (_) {
        return { setting, value: "unknown" };
      }
    }),
  );

  const perms = {};
  for (const r of results) {
    if (r.status === "fulfilled") perms[r.value.setting] = r.value.value;
  }

  return {
    success: true,
    domain,
    pattern: `*://*.${domain}/*`,
    permissions: perms,
  };
}

async function handlePermissionsUpdate({ domain, setting, value }) {
  if (!domain || !setting) return err("VAL_MISSING", "请提供域名和权限类型");
  if (!value || !["allow", "block", "default"].includes(value))
    return err(
      "VAL_INVALID",
      `无效的权限值: "${value}"，可用: allow/block/default`,
    );

  const settingKey = CONTENT_SETTINGS.find(
    (s) =>
      s === setting.toLowerCase() ||
      s.includes(setting.toLowerCase()) ||
      setting.toLowerCase().includes(s),
  );
  if (!settingKey)
    return err(
      "VAL_INVALID",
      `不支持的权限类型: "${setting}"，可用: ${CONTENT_SETTINGS.join("/")}`,
    );

  const pattern = `*://*.${domain}/*`;
  await chrome.contentSettings[settingKey].set({
    primaryPattern: pattern,
    setting: value,
  });

  const label = { allow: "允许", block: "阻止", default: "默认" };
  return {
    success: true,
    domain,
    setting: settingKey,
    value,
    message: `已将 ${domain} 的 ${settingKey} 权限设置为 ${label[value] || value}`,
  };
}

// ============================================================================
// 存储处理器
// ============================================================================

async function handleStorageGet({ key }) {
  if (!key) return err("VAL_MISSING", "请提供存储键名");

  const data = await chrome.storage.local.get(key);
  const value = data[key];
  if (value === undefined) return err("ELE_NOT_FOUND", `键 "${key}" 不存在`);

  return { success: true, key, value };
}

async function handleStorageSet({ key, value }) {
  if (!key) return err("VAL_MISSING", "请提供存储键名");

  let parsedValue = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch (_) {
      // 保持原始字符串
    }
  }

  await chrome.storage.local.set({ [key]: parsedValue });
  return { success: true, key, value: parsedValue };
}

async function handleStorageRemove({ key }) {
  if (!key) return err("VAL_MISSING", "请提供存储键名");

  const data = await chrome.storage.local.get(key);
  if (data[key] === undefined)
    return err("ELE_NOT_FOUND", `键 "${key}" 不存在`);

  await chrome.storage.local.remove(key);
  return { success: true, storageRemoved: key };
}

// ============================================================================
// 会话恢复处理器
// ============================================================================

async function handleSessionsRestore({ query }) {
  const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 20 });
  const tabSessions = sessions.filter((s) => s.tab);

  if (tabSessions.length === 0) {
    return { success: false, error: "没有最近关闭的标签" };
  }

  let target;
  if (query) {
    const q = query.toLowerCase();
    target = tabSessions.find(
      (s) =>
        s.tab.title?.toLowerCase().includes(q) ||
        s.tab.url?.toLowerCase().includes(q),
    );
  } else {
    target = tabSessions[0];
  }

  if (!target) return { success: false, error: "没有匹配的已关闭标签" };

  await chrome.sessions.restore(target.tab.sessionId);
  return { success: true, restored: target.tab.title };
}

// ============================================================================
// 录制处理器
// ============================================================================

async function handleRecordingStartTab({ tabId }) {
  let targetTab;
  if (tabId) {
    targetTab = await chrome.tabs.get(tabId);
  } else {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    targetTab = tab;
  }
  if (!targetTab) return err("ELE_NOT_FOUND", "未找到目标标签");

  const { recordingState } = await chrome.storage.session.get("recordingState");
  if (recordingState === "recording" || recordingState === "starting")
    return err("ACT_BLOCKED", "已有录制正在进行中，请先停止后再试");

  await chrome.storage.session.set({ recordingState: "starting" });

  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: targetTab.id,
    });

    await ensureOffscreenDocument();

    await chrome.runtime.sendMessage({
      type: "START_TAB_RECORDING",
      streamId,
      tabId: targetTab.id,
      tabTitle: targetTab.title,
    });

    await chrome.storage.session.set({ recordingState: "recording" });

    return {
      success: true,
      recording: targetTab.title || `标签 ${targetTab.id}`,
      message: `正在录制 "${targetTab.title}" ✨\n完成后使用 /stop-record 停止录制`,
    };
  } catch (e) {
    await chrome.storage.session.set({ recordingState: "idle" });
    try {
      await chrome.offscreen.closeDocument();
    } catch (_) {}
    return err("ACT_BLOCKED", `启动录制失败: ${e.message}`);
  }
}

async function handleRecordingStartScreen() {
  const { recordingState } = await chrome.storage.session.get("recordingState");
  if (recordingState === "recording" || recordingState === "starting")
    return err("ACT_BLOCKED", "已有录制正在进行中，请先停止后再试");

  await chrome.storage.session.set({ recordingState: "starting" });

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const streamId = await new Promise((resolve, reject) => {
      chrome.desktopCapture.chooseDesktopMedia(
        ["screen", "window"],
        tab,
        (id) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!id) {
            reject(new Error("用户取消了选择"));
          } else {
            resolve(id);
          }
        },
      );
    });

    await ensureOffscreenDocument();

    await chrome.runtime.sendMessage({
      type: "START_DESKTOP_RECORDING",
      streamId,
    });

    await chrome.storage.session.set({ recordingState: "recording" });

    return {
      success: true,
      recording: "桌面/窗口",
      message: "正在录制桌面/窗口 ✨\n完成后使用 /stop-record 停止录制",
    };
  } catch (e) {
    await chrome.storage.session.set({ recordingState: "idle" });
    try {
      await chrome.offscreen.closeDocument();
    } catch (_) {}
    return err("ACT_BLOCKED", `启动录制失败: ${e.message}`);
  }
}

async function handleRecordingStop() {
  const { recordingState } = await chrome.storage.session.get("recordingState");
  if (recordingState !== "recording")
    return err("ACT_BLOCKED", "当前没有正在进行的录制");

  await chrome.storage.session.set({ recordingState: "stopping" });

  try {
    const result = await chrome.runtime.sendMessage({
      type: "STOP_RECORDING",
    });

    // 检查 offscreen 是否成功停止
    if (!result || !result.success) {
      await chrome.storage.session.set({ recordingState: "idle" });
      try {
        await chrome.offscreen.closeDocument();
      } catch (_) {}
      const errMsg = result?.error || result?.message || "录制停止失败";
      return err("REC_STOP_FAILED", errMsg);
    }

    await chrome.storage.session.set({ recordingState: "idle" });

    try {
      await chrome.offscreen.closeDocument();
    } catch (_) {}

    if (result.dataUrl) {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const filename = `recording_${timestamp}.webm`;
      try {
        await chrome.downloads.download({
          url: result.dataUrl,
          filename,
          saveAs: true,
        });
        return {
          success: true,
          saved: filename,
          size: result.size,
          message: "录制已停止并弹出保存对话框 ✓",
        };
      } catch (e) {
        return {
          success: true,
          saved: false,
          message: `录制已停止，但保存失败: ${e.message}`,
        };
      }
    }
    return { success: true, stopped: true, message: "录制已停止 ✓" };
  } catch (e) {
    await chrome.storage.session.set({ recordingState: "idle" });
    try {
      await chrome.offscreen.closeDocument();
    } catch (_) {}
    return err("REC_STOP_ERROR", `录制时发生错误: ${e.message}`);
  }
}

// ============================================================================
// DOM 操作处理器
// ============================================================================

async function handleDOMManipulate(payload) {
  if (!payload.code)
    return err("ELE_NOT_FOUND", "code 为空", {
      reason: "缺少要执行的 JavaScript 代码",
    });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab)
    return err("PAGE_BLOCKED", "无活跃标签", {
      reason: "当前窗口无活跃标签页",
    });
  if (isBlockedURL(tab.url))
    return err("PAGE_BLOCKED", "无法在受保护页面操作 DOM", {
      reason: tab.url + " 是 Chrome 内部页面或受保护页面",
    });

  try {
    var results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: injectedEval,
      args: [payload.code],
    });

    var frameResult = results?.[0];
    if (!frameResult) {
      return err("COM_DISCONNECTED", "脚本注入失败", {
        reason: "executeScript 返回空结果",
      });
    }
    if (frameResult.error) {
      return err("ACT_BLOCKED", "脚本执行错误", {
        reason: frameResult.error.message || String(frameResult.error),
        code: payload.code.slice(0, 500),
      });
    }
    return { success: true, result: frameResult.result };
  } catch (e) {
    return err("ELE_STALE", e.message, {
      reason: e.message,
      code: payload.code.slice(0, 500),
    });
  }
}

// ============================================================================
// 批量编排 — 纯委托，零业务逻辑
// ============================================================================

async function handleBatch({ calls }) {
  if (!calls || !Array.isArray(calls) || calls.length === 0)
    return err("INVALID_ARG", "calls 必须是非空数组");

  // 使用 Promise.allSettled 确保单个调用失败不影响其他调用
  const results = await Promise.allSettled(
    calls.map(async (call, i) => {
      const { tool, args } = call;
      if (!tool) return { index: i, success: false, error: `缺少 tool 字段` };
      const handler = handlers[tool];
      if (!handler) return { index: i, success: false, error: `未知工具: ${tool}` };
      try {
        return { index: i, ... (await handler(args || {})) };
      } catch (e) {
        return { index: i, success: false, error: e.message, tool };
      }
    }),
  );

  // 恢复原始顺序并处理 rejected 结果
  const sorted = [...results].sort((a, b) => {
    const ai = a.status === 'fulfilled' ? a.value.index : a.index;
    const bi = b.status === 'fulfilled' ? b.value.index : b.index;
    return ai - bi;
  });
  const cleanResults = sorted.map((r) =>
    r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message || '执行失败' }
  );

  const failed = cleanResults.filter((r) => !r.success).length;
  return {
    success: true,
    results: cleanResults,
    total: cleanResults.length,
    failed,
  };
}
