/**
 * DOM Commander — 常驻 content script。纯数据收集，零业务判断。
 * PAGE_SCAN: 返回页面前 80 个元素的原始属性。
 * 不做过滤、排序、隐藏判断。AI 自己写脚本做定制扫描。
 * AI 的脚本通过 SW 的 chrome.scripting.executeScript 注入执行。
 */

var MAX_ELEMENTS_COUNT = 300;
var MAX_ELEMENT_TEXT_LENGTH = 200;

function scanPage() {
  var all = document.querySelectorAll("*");
  var total = all.length;
  var truncated = total > MAX_ELEMENTS_COUNT;
  var elements = [];
  for (var i = 0; i < Math.min(all.length, MAX_ELEMENTS_COUNT); i++) {
    var el = all[i];
    var attrs = {};
    for (var j = 0; j < (el.attributes || []).length; j++) {
      var a = el.attributes[j];
      attrs[a.name] = a.value;
    }
    elements.push({
      tag: el.tagName.toLowerCase(),
      text:
        (el.textContent || "").trim().slice(0, MAX_ELEMENT_TEXT_LENGTH) || null,
      attrs: Object.keys(attrs).length > 0 ? attrs : null,
    });
  }

  // iframe 信息收集
  var iframes = [];
  var frameEls = document.querySelectorAll("iframe");
  for (var k = 0; k < frameEls.length; k++) {
    var f = frameEls[k];
    iframes.push({
      src: f.src || "(无 src)",
      id: f.id || null,
      name: f.name || null,
    });
  }

  return {
    url: location.href,
    title: document.title,
    count: elements.length,
    totalCount: total,
    truncated: truncated,
    elements: elements,
    iframes: iframes.length > 0 ? iframes : null,
  };
}

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (msg.type === "PAGE_SCAN") {
    try {
      sendResponse(scanPage());
    } catch (e) {
      sendResponse({ error: "扫描失败: " + e.message });
    }
    return true;
  }
  return false;
});
