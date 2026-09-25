/**
 * i18n 词条防回归校验（零依赖 Node 脚本，`pnpm check:i18n` 串入 lint 链）
 *
 * 业界工具（vue-i18n-extract / @intlify eslint-plugin-vue-i18n）对本项目不适配，
 * 评估记录见 docs/internationalization.md §6.1。本脚本覆盖两个方向：
 *  1. 缺 key：4 语言结构对齐 + 占位符对齐 + 源码取词调用的静态 key 必须存在 + 动态 key（斜杠注册表/前缀）必须存在
 *  2. 死 key：词条 key 必须被源码命中（取词调用，或映射表中暂存的 key 字面量），或属于动态前缀/斜杠注册表
 *
 * 任一问题以退出码 1 结束并打印明细。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const LOCALES_DIR = join(ROOT, 'src', 'locales')
const SRC_DIR = join(ROOT, 'src')
const SLASH_COMMANDS_PATH = join(ROOT, 'src', 'shared', 'slash-commands.ts')
const LOCALE_FILES = ['zh-CN.json', 'en.json', 'de.json', 'es.json']
const BASE_LOCALE = 'en'

/** 动态 key 的模板字面量前缀（如 `step.event.${ev}`），这些 key 无法静态扫描，按前缀放行死键检查 */
const DYNAMIC_KEY_PREFIXES = ['step.event.', 'intent.historyRange.', 'intent.themeMode.']

/**
 * 递归展开词条对象为「扁平 key → 叶子值」映射
 * @param {Record<string, unknown>} obj 词条对象
 * @param {string} [prefix=''] 递归时的 key 前缀（含结尾点号）
 * @returns {Map<string, string | string[]>} 扁平 key 与叶子值（字符串或数组）的映射
 */
function flatten(obj, prefix = '') {
  const result = new Map()
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix + key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, path + '.')) result.set(k, v)
    } else {
      result.set(path, value)
    }
  }
  return result
}

/**
 * 提取词条文案中的插值参数名（vue-i18n 命名参数 {name}；`{'|'}` 等字面量转义不会命中）
 * @param {string} text 词条文案
 * @returns {string[]} 排序去重后的参数名列表（复数 `a | b` 各段参数相同，去重后自然对齐）
 */
function extractParams(text) {
  return [...new Set((text.match(/\{(\w+)\}/g) || []).map((s) => s.slice(1, -1)))].sort()
}

/**
 * 递归收集 src 下参与 i18n 校验的源码文件（.ts / .vue，排除词条 JSON）
 * @param {string} dir 起始目录
 * @returns {string[]} 文件绝对路径列表
 */
function collectSourceFiles(dir) {
  const files = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) files.push(...collectSourceFiles(full))
    else if (/\.tsx?$|\.vue$/.test(name.name)) files.push(full)
  }
  return files
}

/**
 * 从源码中收集词条 key 的两类使用：
 *  - calledKeys：取词调用（t / swT / $t / i18n.global.t / i18n.global.tm）的字符串字面量实参，要求必须存在于词条；
 *  - literalKeys：恰似词条 key 的其它字符串字面量（如取值映射 `full: 'shot.modeFull'`，随后会喂给 t），
 *    仅用于死键放行，不做存在性校验（普通字符串可能偶然同形）。
 * @param {string[]} files 源码文件列表
 * @returns {{ calledKeys: Set<string>, literalKeys: Set<string> }} 两类 key 集合
 */
function collectUsedKeys(files) {
  const calledKeys = new Set()
  const literalKeys = new Set()
  // 函数调用取词：\b 保证不误匹配 split( 等以 t 结尾的标识符；动态模板字面量（`a.${b}`）天然不命中
  const callRe = /(?<![\w$.])(?:swT|i18n\.global\.tm|i18n\.global\.t|\$t|t)\(\s*'([\w.]+)'/g
  // 其它点分字符串字面量（仅死键放行用）
  const strRe = /'([\w]+(?:\.[\w]+)+)'/g
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(callRe)) calledKeys.add(m[1])
    for (const m of text.matchAll(strRe)) literalKeys.add(m[1])
  }
  return { calledKeys, literalKeys }
}

/**
 * 解析斜杠命令注册表，得到各命令的 intent 与是否带参数
 * @returns {{ intent: string, hasArg: boolean }[]} 命令列表；解析失败抛出异常
 */
function loadSlashRegistry() {
  const src = readFileSync(SLASH_COMMANDS_PATH, 'utf8')
  const matches = [...src.matchAll(/intent:\s*'([a-z_]+)'/g)]
  if (matches.length === 0) throw new Error('slash-commands.ts 中未解析到任何 intent')
  return matches.map((m, i) => ({
    intent: m[1],
    hasArg: /hasArg:\s*true/.test(
      src.slice(m.index, i + 1 < matches.length ? matches[i + 1].index : src.length)
    ),
  }))
}

/**
 * 校验 4 个语言文件扁平化后的 key 集合与基准语言一致
 * @param {Record<string, Map<string, unknown>>} locales 各语言的扁平词条
 * @param {string[]} errors 收集错误信息的数组（原样修改）
 * @returns {void}
 */
function checkStructuralParity(locales, errors) {
  const baseKeys = locales[BASE_LOCALE]
  for (const [code, dict] of Object.entries(locales)) {
    if (code === BASE_LOCALE) continue
    for (const key of baseKeys.keys()) {
      if (!dict.has(key)) errors.push(`[${code}] 缺少 key: ${key}`)
    }
    for (const key of dict.keys()) {
      if (!baseKeys.has(key)) errors.push(`[${code}] 多余的 key: ${key}`)
    }
  }
}

/**
 * 校验每个词条的插值参数在各语言中一致（防翻译时漏写/改写 {param}）
 * @param {Record<string, Map<string, unknown>>} locales 各语言的扁平词条
 * @param {string[]} errors 收集错误信息的数组（原样修改）
 * @returns {void}
 */
function checkPlaceholderParity(locales, errors) {
  const base = locales[BASE_LOCALE]
  for (const [key, value] of base) {
    if (typeof value !== 'string') continue
    const expected = extractParams(value).join(',')
    for (const [code, dict] of Object.entries(locales)) {
      if (code === BASE_LOCALE) continue
      const actual = extractParams(String(dict.get(key))).join(',')
      if (actual !== expected) {
        errors.push(`[${code}] ${key} 插值参数不一致: 期望 {${expected}}，实际 {${actual}}`)
      }
    }
  }
}

/**
 * 校验缺 key 的动态方向：
 *  - 斜杠命令与注册表联动（desc 必有；hasArg 命令必须有 ph）；
 *  - 前缀域（step.event.* 等）在基准词条中至少存在一个 key，防止整域被误删后静默回退到英文原文。
 * @param {Map<string, unknown>} base 基准语言的扁平词条
 * @param {string[]} errors 收集错误信息的数组（原样修改）
 * @returns {void}
 */
function checkDynamicKeys(base, errors) {
  const registry = loadSlashRegistry()
  for (const { intent, hasArg } of registry) {
    const descKey = `slash.${intent}.desc`
    if (!base.has(descKey)) errors.push(`缺少斜杠命令词条: ${descKey}`)
    if (hasArg) {
      const phKey = `slash.${intent}.ph`
      if (!base.has(phKey)) errors.push(`缺少斜杠命令词条: ${phKey}`)
    }
  }
  for (const prefix of DYNAMIC_KEY_PREFIXES) {
    const hasAny = [...base.keys()].some((k) => k.startsWith(prefix))
    if (!hasAny) errors.push(`动态 key 前缀域为空: ${prefix}*`)
  }
}

/**
 * 校验词条死键：既未被源码命中、也不属动态前缀/斜杠注册表的 key
 * @param {Map<string, unknown>} base 基准语言的扁平词条
 * @param {{ calledKeys: Set<string>, literalKeys: Set<string> }} usedKeys 源码收集到的 key 使用
 * @param {{ intent: string, hasArg: boolean }[]} slashRegistry 斜杠命令注册表
 * @param {string[]} errors 收集错误信息的数组（原样修改）
 * @returns {void}
 */
function checkDeadKeys(base, usedKeys, slashRegistry, errors) {
  const slashIntents = new Set(slashRegistry.map((c) => c.intent))
  for (const key of base.keys()) {
    if (usedKeys.calledKeys.has(key) || usedKeys.literalKeys.has(key)) continue
    if (key.startsWith('slash.')) {
      // 注册表内的 desc/ph 走动态取词，按注册表放行；其余 slash.* 未被静态命中即为死键
      const m = key.match(/^slash\.([a-z_]+)\.(desc|ph)$/)
      if (m && slashIntents.has(m[1])) continue
    }
    if (DYNAMIC_KEY_PREFIXES.some((p) => key.startsWith(p))) continue
    errors.push(`死 key（源码未使用）: ${key}`)
  }
}

// ──── 主流程 ────
const locales = {}
for (const file of LOCALE_FILES) {
  locales[file.replace(/\.json$/, '')] = flatten(
    JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'))
  )
}

const errors = []
checkStructuralParity(locales, errors)
checkPlaceholderParity(locales, errors)
checkDynamicKeys(locales[BASE_LOCALE], errors)

const sourceFiles = collectSourceFiles(SRC_DIR)
const usedKeys = collectUsedKeys(sourceFiles)
for (const key of usedKeys.calledKeys) {
  if (!locales[BASE_LOCALE].has(key)) errors.push(`源码取词使用了不存在的 key: ${key}`)
}
checkDeadKeys(locales[BASE_LOCALE], usedKeys, loadSlashRegistry(), errors)

if (errors.length > 0) {
  console.error(`i18n 校验失败，共 ${errors.length} 处问题：`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(
  `i18n 校验通过：${LOCALE_FILES.join(' / ')} 共 ${locales[BASE_LOCALE].size} 个 key，源码文件 ${sourceFiles.length} 个`
)
