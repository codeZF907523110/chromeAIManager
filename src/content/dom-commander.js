// DOM Commander
// 扫描页面 DOM 并提供交互能力
// 注意：Content Script 运行在页面 context，可以访问页面 DOM

// 非交互元素标签黑名单
const NON_INTERACTIVE_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'HEAD',
  'BASE',
  'TITLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SOURCE',
  'FRAMESET',
])

// 可交互元素标签白名单（用于快速判断）
const INTERACTIVE_TAGS = new Set([
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'A',
  'LABEL',
  'SUMMARY',
  'DETAILS',
  'FIELDSET',
  'LEGEND',
])

function isVisible(el) {
  if (!el || el.nodeType !== 1) return false
  // 检查隐藏属性
  if (el.hasAttribute('hidden') || el.getAttribute('hidden') !== null) return false
  // 检查 display:none
  const cs = window.getComputedStyle(el)
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
  // 检查尺寸为零
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return false
  return true
}

function isInteractive(el) {
  if (!el || el.nodeType !== 1) return false
  // 标签在白名单中
  if (INTERACTIVE_TAGS.has(el.tagName)) return true
  // 有可点击事件
  if (el.onclick !== null || el.getAttribute('onclick') !== null) return true
  // 可聚焦
  if (el.tabIndex >= 0 || el.hasAttribute('tabindex')) return true
  // 有 role 属性
  const role = el.getAttribute('role')
  if (role) {
    const INTERACTIVE_ROLES = new Set([
      'button',
      'link',
      'tab',
      'menuitem',
      'checkbox',
      'radio',
      'switch',
      'textbox',
      'combobox',
      'listbox',
      'slider',
      'treeitem',
      'dialog',
      'alertdialog',
      'toolbar',
      'navigation',
      'main',
      'article',
    ])
    if (INTERACTIVE_ROLES.has(role)) return true
  }
  return false
}

function getVisibleAncestors(el) {
  const ancestors = []
  let parent = el.parentElement
  while (parent && parent !== document.body) {
    ancestors.push(parent)
    parent = parent.parentElement
  }
  return ancestors
}

// 只收集有意义的属性
const USEFUL_ATTRS = new Set([
  'id',
  'class',
  'type',
  'name',
  'value',
  'placeholder',
  'title',
  'alt',
  'href',
  'src',
  'for',
  'label',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'role',
  'disabled',
  'readonly',
  'checked',
  'selected',
])

async function scanCurrentPage() {
  const MAX_ITEMS = 300

  // 获取所有 DOM 元素
  const allElements = Array.from(document.querySelectorAll('*'))
    .filter((el) => {
      // 排除非交互元素标签
      if (NON_INTERACTIVE_TAGS.has(el.tagName)) return false
      // 检查是否可见（自身及所有祖先元素）
      if (!isVisible(el)) return false
      // 检查是否有任意祖先不可见
      for (const anc of getVisibleAncestors(el)) {
        if (!isVisible(anc)) return false
      }
      return true
    })
    .slice(0, MAX_ITEMS)

  // 收集可交互元素（优先展示）
  const interactiveElements = allElements.filter((el) => isInteractive(el))
  // 其他可见但非交互元素
  const otherElements = allElements.filter((el) => !isInteractive(el))

  // 组合：先展示可交互元素，再展示其他可见元素
  const orderedElements = [...interactiveElements, ...otherElements]

  const elements = orderedElements.slice(0, MAX_ITEMS).map((el, i) => {
    // 只收集有用属性
    const attrs = {}
    for (const attr of el.attributes) {
      if (
        USEFUL_ATTRS.has(attr.name) ||
        attr.name.startsWith('data-') ||
        attr.name.startsWith('aria-')
      ) {
        attrs[attr.name] = attr.value
      }
    }

    return {
      index: i,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 80),
      attrs,
      // 可交互标记
      isInteractive: isInteractive(el),
      // 位置信息
      rect: {
        top: Math.round(el.getBoundingClientRect().top),
        left: Math.round(el.getBoundingClientRect().left),
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      },
      // 父元素信息（用于定位）
      parentId: el.parentElement?.id || null,
      parentTag: el.parentElement?.tagName?.toLowerCase() || null,
    }
  })

  return {
    elements,
    count: elements.length,
    interactiveCount: interactiveElements.length,
  }
}

async function queryElements(query) {
  const results = document.querySelectorAll(query)
  return Array.from(results).map((el, i) => ({
    index: i,
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    text: (el.textContent || '').trim().slice(0, 80),
    rect: {
      top: Math.round(el.getBoundingClientRect().top),
      left: Math.round(el.getBoundingClientRect().left),
    },
  }))
}

async function getElementInfo(index) {
  const allElements = Array.from(document.querySelectorAll('*')).filter(isVisible)
  const el = allElements[index]
  if (!el) return { error: 'Element not found' }

  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    className: el.className || null,
    text: (el.textContent || '').trim().slice(0, 200),
    rect: {
      top: Math.round(el.getBoundingClientRect().top),
      left: Math.round(el.getBoundingClientRect().left),
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    },
    attributes: Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value])),
    children: el.children.length,
  }
}

async function getElementBySelector(selector) {
  const el = document.querySelector(selector)
  if (!el) return null
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    text: (el.textContent || '').trim().slice(0, 100),
    rect: {
      top: Math.round(el.getBoundingClientRect().top),
      left: Math.round(el.getBoundingClientRect().left),
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    },
  }
}

async function executeJavaScript(code) {
  try {
    const result = await eval(code)
    // 序列化结果
    if (result instanceof Element) {
      return {
        _type: 'element',
        tag: result.tagName.toLowerCase(),
        text: (result.textContent || '').trim().slice(0, 100),
        rect: {
          top: Math.round(result.getBoundingClientRect().top),
          left: Math.round(result.getBoundingClientRect().left),
        },
      }
    }
    if (result instanceof NodeList || Array.isArray(result)) {
      return {
        _type: 'collection',
        length: result.length,
        items: Array.from(result)
          .map((item) => {
            if (item instanceof Element) {
              return {
                _type: 'element',
                tag: item.tagName.toLowerCase(),
                text: (item.textContent || '').trim().slice(0, 50),
              }
            }
            return String(item).slice(0, 100)
          })
          .slice(0, 10),
      }
    }
    return result
  } catch (error) {
    return { error: error.message }
  }
}

// 暴露到全局
window.__domCommander = {
  scanCurrentPage,
  queryElements,
  getElementInfo,
  getElementBySelector,
  executeJavaScript,
}

// ═══════════════════════════════════════════════════════
// Performance Shim — content script 中可用，用于 MAIN world CSP 阻止时的降级
// ═══════════════════════════════════════════════════════
function getPerformanceData() {
  try {
    // 获取导航记录
    const navEntries = performance.getEntriesByType('navigation')
    const nav = navEntries && navEntries.length > 0 ? navEntries[0] : null

    // 获取资源记录（限制数量避免数据过大）
    const resourceEntries = performance.getEntriesByType('resource') || []
    const marks = performance.getEntriesByType('mark') || []
    const measures = performance.getEntriesByType('measure') || []

    const result = {
      _source: 'content_script_shim',
      navigation: null,
      resourceCount: resourceEntries.length,
      markCount: marks.length,
      measureCount: measures.length,
    }

    // 只提取基本数值，避免循环引用
    if (nav) {
      try {
        result.navigation = {
          type: 'navigation',
          name: nav.name,
          url: nav.href,
          startTime: nav.startTime,
          duration: nav.duration,
          domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
          loadComplete: nav.loadEventEnd - nav.loadEventStart,
          dns: nav.domainLookupEnd - nav.domainLookupStart,
          tcp: nav.connectEnd - nav.connectStart,
          tls: nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0,
          ttfb: nav.responseStart - nav.requestStart,
          response: nav.responseEnd - nav.responseStart,
          domParse: nav.domInteractive - nav.responseEnd,
          domComplete: nav.domComplete - nav.domInteractive,
        }
      } catch (e) {
        result.navigation = { _error: e.message }
      }
    }

    // 资源摘要
    result.resources = resourceEntries.slice(0, 30).map((r) => {
      try {
        return {
          name: r.name,
          type: r.entryType,
          duration: r.duration,
          size: r.encodedBodySize,
          transferSize: r.transferSize,
        }
      } catch {
        return { name: r.name, type: r.entryType }
      }
    })

    result.marks = marks.slice(0, 10).map((m) => ({
      name: m.name,
      startTime: m.startTime,
      duration: m.duration,
    }))

    result.measures = measures.slice(0, 10).map((m) => ({
      name: m.name,
      startTime: m.startTime,
      duration: m.duration,
    }))

    // JS 堆内存（部分浏览器不支持）
    try {
      const mem = performance.memory
      if (mem) {
        result.jsHeap = {
          usedJSHeapSize: mem.usedJSHeapSize,
          totalJSHeapSize: mem.totalJSHeapSize,
          usableJSHeapSize: mem.usableJSHeapSize,
        }
      }
    } catch {
      // performance.memory 不可用，忽略
    }

    result.maxTime = Date.now() - performance.timeOrigin

    return result
  } catch (e) {
    return { _source: 'content_script_shim', _error: e.message }
  }
}

window.__aiPerformance = getPerformanceData

// 监听消息
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'DOM_COMMANDER') return
  const { action, params } = event.data
  let result

  switch (action) {
    case 'scan':
      result = scanCurrentPage()
      break
    case 'query':
      result = queryElements(params?.query)
      break
    case 'getElement':
      result = getElementInfo(params?.index)
      break
    case 'getBySelector':
      result = getElementBySelector(params?.selector)
      break
    case 'executeScript':
      result = executeJavaScript(params?.code)
      break
    default:
      result = { error: `Unknown action: ${action}` }
  }

  event.source.postMessage({ type: 'DOM_COMMANDER_RESULT', action, result })
})

console.log('🧹 DOM Commander loaded')
