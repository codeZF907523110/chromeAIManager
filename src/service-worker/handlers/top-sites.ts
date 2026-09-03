/**
 * 常用网站 SW 命令实现
 * 对应 swIntent: top_sites_observe
 */

import type { ExecutionResult } from '../../types/execution'

/** 读取浏览器最常访问网站列表（chrome.topSites） */
export async function observe(): Promise<ExecutionResult> {
  const sites = await chrome.topSites.get()
  return { success: true, sites, found: sites.length }
}
