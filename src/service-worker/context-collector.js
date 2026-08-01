/**
 * 上下文收集器 — 收集浏览器当前状态
 * 返回给 Side Panel 用于 AI 推理或本地计算。
 * 支持分层传输：summary（摘要）和 detailed（详情）
 */

export async function collectContext(options = {}) {
  const { mode = 'detailed', query = '' } = options;

  const [allTabs, bookmarks, currentWindow] = await Promise.all([
    chrome.tabs.query({}),
    chrome.bookmarks.getTree(),
    chrome.windows.getCurrent({ populate: true })
  ]);

  const activeTab = currentWindow.tabs?.find(t => t.active) || null;

  if (mode === 'summary') {
    return buildSummary(allTabs, activeTab, bookmarks);
  }

  return buildDetailed(allTabs, activeTab, bookmarks, query);
}

// ──── 摘要模式 ────

function buildSummary(tabs, activeTab, bookmarks) {
  const domainCounts = new Map();
  const groups = new Map();

  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://')) continue;
    const domain = extractDomain(tab.url);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    if (tab.groupId !== -1) {
      groups.set(tab.groupId, (groups.get(tab.groupId) || 0) + 1);
    }
  }

  return {
    mode: 'summary',
    tabCount: tabs.length,
    activeTab: activeTab ? { id: activeTab.id, title: activeTab.title, url: activeTab.url } : null,
    domainDistribution: Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([domain, count]) => ({ domain, count })),
    groupCount: groups.size,
    bookmarkFolders: extractFolders(bookmarks),
    timestamp: Date.now()
  };
}

// ──── 详情模式 ────

function buildDetailed(tabs, activeTab, bookmarks, query) {
  const MAX_TABS = 120;

  let filteredTabs = tabs;
  if (query) {
    const q = query.toLowerCase();
    filteredTabs = tabs.filter(t =>
      t.url && !t.url.startsWith('chrome://') &&
      ((t.title || '').toLowerCase().includes(q) ||
       (t.url || '').toLowerCase().includes(q))
    );
  }

  let tabsInfo;
  let truncated = false;

  if (filteredTabs.length > MAX_TABS) {
    truncated = true;
    const activeWindowId = activeTab?.windowId;
    const currentWin = filteredTabs.filter(t => t.windowId === activeWindowId);
    const others = filteredTabs.filter(t => t.windowId !== activeWindowId);

    const quotaCurrent = Math.floor(MAX_TABS * 0.6);
    const quotaOthers = MAX_TABS - Math.min(currentWin.length, quotaCurrent);

    tabsInfo = [
      ...currentWin.slice(0, quotaCurrent),
      ...others.slice(0, quotaOthers)
    ].map(formatTab);
  } else {
    tabsInfo = filteredTabs.map(formatTab);
  }

  return {
    mode: 'detailed',
    tabCount: tabsInfo.length,
    totalTabCount: tabs.length,
    activeTab: activeTab ? { id: activeTab.id, title: activeTab.title, url: activeTab.url } : null,
    tabs: tabsInfo,
    bookmarkFolders: extractFolders(bookmarks),
    _truncated: truncated,
    timestamp: Date.now()
  };
}

// ──── 辅助函数 ────

function formatTab(t) {
  return {
    id: t.id,
    title: (t.title || '').slice(0, 100),
    url: t.url,
    windowId: t.windowId,
    active: t.active,
    groupId: t.groupId ?? -1,
    index: t.index,
    muted: t.mutedInfo?.muted || false
  };
}

function extractDomain(url) {
  try { return new URL(url).hostname; }
  catch { return ''; }
}

function extractFolders(bookmarkTree) {
  const folders = [];
  function walk(nodes, path) {
    for (const node of nodes) {
      if (node.children) {
        const fullPath = path ? `${path}/${node.title}` : node.title;
        folders.push(fullPath);
        walk(node.children, fullPath);
      }
    }
  }
  walk(bookmarkTree, '');
  return folders;
}
