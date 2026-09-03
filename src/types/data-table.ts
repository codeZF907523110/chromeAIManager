/**
 * DataTable 组件类型定义
 *
 * 为什么不放在 DataTable.vue 里：
 *   - Vue SFC 的 <script setup> 导出的类型在 .ts 里 import 不友好（TS 没法解析 .vue 类型）
 *   - 把接口放到专门的 types 文件，组件 + 调用方都可以干净地引用
 */

/** DataTable 列定义 */
export interface DataTableColumn {
  /** 字段名（行对象的 key） */
  key: string
  /** 表头文本 */
  title: string
  /** 列宽（px / % / 其它 CSS 长度） */
  width?: number | string
  /** 超过 N 字符截断 + tooltip 显示完整值 */
  ellipsis?: number
  /** 自定义格式化（返回值 =字符串文本，避免 HTML）） */
  format?: (row: Record<string, unknown>) => string
}
