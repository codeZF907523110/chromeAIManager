/**
 * 消息内容块协议 — Markdown-first，组件嵌入 Markdown 中
 *
 * 两种模式由调用方按需选择：
 *   - 纯 Markdown：components 不填，markdown 走 marked + DOMPurify 渲染
 *   - 嵌入组件：在 markdown 中放 `<tag data-id="..." />` 占位符，components[id] 挂载真实 Vue 组件
 *
 * 占位符语法：
 *   - lowercase 标签名 + 连字符，如 <history-table />
 *   - 必须包含 data-id 属性
 *   - 必须自闭合
 *   - 仅在 src/components/blocks/registry.ts 白名单内的标签会被识别，其它按普通文本处理
 *
 * 第一版没有"老 string 兼容"——MessageBody 是消息正文的唯一形态。
 */

import type { Component } from 'vue'

/** 嵌入到 Markdown 中的组件占位解析结果 */
export interface EmbeddedComponent {
  /** 与 markdown 中 <tag data-id="<id>" /> 的 data-id 对应 */
  id: string
  component: Component
  props: Record<string, unknown>
}

/** 消息正文：纯文本模式 + 嵌入组件模式统一一个类型 */
export interface MessageBody {
  markdown: string
  components?: EmbeddedComponent[]
}
