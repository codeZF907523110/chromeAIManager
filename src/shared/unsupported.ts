export const UNSUPPORTED_TOOLS: Record<string, string> = {
  theme_observe: '依赖非公开 chrome.settings.private API',
  theme_update: '依赖非公开 chrome.settings.private API',
  font_size_observe: '依赖非公开或不稳定字体设置 API',
  font_size_update: '依赖非公开或不稳定字体设置 API',
  font_family_observe: '依赖非公开或不稳定字体设置 API',
  font_family_update: '依赖非公开或不稳定字体设置 API',
  browser_execute: '任意页面脚本执行未开放',
  debugger: 'Debugger 能力未开放',
}

/** 返回工具是否属于明确不支持的能力。 */
export function getUnsupportedReason(tool: string): string | undefined {
  return UNSUPPORTED_TOOLS[tool]
}
