/**
 * 安全确认中间件 — 生成危险操作的预览清单
 * 在 Side Panel 中运行，利用 contextCache 的标签数据做本地计算
 */

import { findDuplicateGroups } from '../../service-worker/utils/tab-matcher.js';

/**
 * 生成确认预览
 * @returns {Object|null} preview 对象或 null（无需确认）
 */
export function generateConfirmPreview(intent, slots, context) {
  if (!context?.tabs) return null;

  switch (intent) {
    case 'close_duplicate_tabs': {
      const duplicateGroups = findDuplicateGroups(context.tabs, slots.url);
      const totalToRemove = duplicateGroups.reduce((sum, g) => sum + g.tabs.length - 1, 0);
      if (totalToRemove === 0) return null;

      return {
        title: `将关闭 ${totalToRemove} 个重复标签页`,
        description: `检测到 ${duplicateGroups.length} 组重复 URL`,
        items: duplicateGroups.map(g => ({
          primary: g.url,
          secondary: `${g.tabs.length} 个标签页 → 保留 1 个`
        }))
      };
    }

    case 'close_tabs_by_domain': {
      const domain = (slots.domain || '').toLowerCase();
      const matching = context.tabs.filter(t => {
        try { return new URL(t.url).hostname.includes(domain); }
        catch { return false; }
      });
      if (matching.length === 0) return null;

      return {
        title: `将关闭 ${matching.length} 个标签页`,
        description: `域名匹配: ${domain}`,
        items: matching.map(t => ({
          primary: t.title || t.url,
          secondary: t.url
        }))
      };
    }

    case 'close_other_tabs': {
      const activeTab = context.tabs.find(t => t.active);
      const toClose = context.tabs.filter(
        t => !t.pinned && (!activeTab || t.id !== activeTab.id)
      );
      if (toClose.length === 0) return null;
      return {
        title: `将关闭 ${toClose.length} 个标签页（保留当前）`,
        description: activeTab ? `保留: ${activeTab.title || activeTab.url}` : '',
        items: toClose.slice(0, 10).map(t => ({
          primary: t.title || t.url,
          secondary: t.url
        }))
      };
    }

    case 'remove_bookmark': {
      const query = slots.query;
      if (!query) return null;
      return {
        title: `将删除匹配 "${query}" 的书签`,
        description: '此操作不可撤销',
        items: []
      };
    }

    case 'delete_history': {
      const timeRange = slots.timeRange || 'today';
      const label = { today: '今天', yesterday: '昨天', week: '最近一周', month: '最近一个月', all: '全部' };
      return {
        title: `将删除${label[timeRange] || timeRange}的浏览历史`,
        description: '此操作不可恢复',
        items: slots.query ? [{ primary: `匹配关键词: ${slots.query}`, secondary: timeRange }] : []
      };
    }

    case 'clear_cookies': {
      const domain = slots.domain;
      if (!domain) return null;
      return {
        title: `将清除域名 "${domain}" 下的所有 Cookie`,
        description: '此操作不可撤销，可能导致需要重新登录',
        items: []
      };
    }

    case 'uninstall_extension': {
      const query = slots.query;
      if (!query) return null;
      return {
        title: `将卸载扩展 "${query}"`,
        description: '此操作不可撤销，扩展的所有数据将被清除',
        items: []
      };
    }

    case 'storage_remove': {
      const key = slots.key;
      if (!key) return null;
      return {
        title: `将删除存储键 "${key}"`,
        description: '此操作不可撤销',
        items: []
      };
    }

    default:
      return null;
  }
}
