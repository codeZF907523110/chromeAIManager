/**
 * findDuplicateGroups — 查找重复标签组（URL 标准化后完全相同）
 */
export function findDuplicateGroups(tabs, targetUrl) {
  const urlMap = new Map();

  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://')) continue;
    const normalized = normalizeUrl(tab.url);
    if (targetUrl && normalized !== normalizeUrl(targetUrl)) continue;

    if (!urlMap.has(normalized)) urlMap.set(normalized, []);
    urlMap.get(normalized).push(tab);
  }

  return Array.from(urlMap.entries())
    .filter(([_, tabs]) => tabs.length > 1)
    .map(([url, tabs]) => ({ url, tabs }));
}

/**
 * searchTabs — 模糊搜索标签（多关键词 AND 匹配标题 + URL）
 */
export function searchTabs(tabs, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return tabs
    .filter(t => {
      if (!t.url || t.url.startsWith('chrome://')) return false;
      const title = (t.title || '').toLowerCase();
      const url = (t.url || '').toLowerCase();
      return terms.every(term => title.includes(term) || url.includes(term));
    })
    .sort((a, b) => {
      const aTitle = terms.every(t => (a.title || '').toLowerCase().includes(t));
      const bTitle = terms.every(t => (b.title || '').toLowerCase().includes(t));
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      if (a.active) return -1;
      if (b.active) return 1;
      return 0;
    });
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return `${u.protocol}//${u.hostname}${path}${u.search}`;
  } catch { return url; }
}
