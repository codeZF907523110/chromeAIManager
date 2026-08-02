/**
 * AI 浏览器管家 — 内容脚本
 * 注入全屏覆盖层 + 居中 iframe 弹窗
 * 每次执行自动切换开/关
 */

(function () {
  // 方式 1: 用 data 属性标记是否已注入（更可靠）
  if (document.body && document.body.dataset.__aiOverlayOpen === "1") {
    // 已在当前注入周期打开，关闭
    closeExisting();
    return;
  }

  // 方式 2: 查找已有的 overlay DOM（兜底）
  const existing = document.getElementById("__ai_commander_overlay__");
  if (existing) {
    closeExisting();
    return;
  }

  // ── 打开弹窗 ──

  document.body.dataset.__aiOverlayOpen = "1";

  const overlay = document.createElement("div");
  overlay.id = "__ai_commander_overlay__";

  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "rgba(0, 0, 0, 0.65)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "__ai_fade_in__ 0.2s ease",
  });

  // 居中弹窗容器
  const dialog = document.createElement("div");
  Object.assign(dialog.style, {
    width: "860px",
    height: "600px",
    borderRadius: "14px",
    overflow: "hidden",
    boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
    animation: "__ai_dialog_in__ 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
  });

  // iframe 加载扩展页面
  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("sidepanel.html");
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: "none",
    background: "#0a0a14",
  });
  dialog.appendChild(iframe);
  overlay.appendChild(dialog);

  // 动画关键帧
  const style = document.createElement("style");
  style.textContent = `
    @keyframes __ai_fade_in__  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes __ai_fade_out__ { from { opacity: 1; } to { opacity: 0; } }
    @keyframes __ai_dialog_in__  { from { opacity:0; transform:scale(0.92) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes __ai_dialog_out__ { from { opacity:1; transform:scale(1) translateY(0); } to { opacity:0; transform:scale(0.92) translateY(12px); } }
  `;
  overlay.appendChild(style);
  document.body.appendChild(overlay);

  // 关闭方法
  function closeOverlay() {
    overlay.style.animation = "__ai_fade_out__ 0.2s ease forwards";
    dialog.style.animation = "__ai_dialog_out__ 0.2s ease forwards";
    setTimeout(() => {
      overlay.remove();
      document.body.dataset.__aiOverlayOpen = "0";
    }, 200);
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });

  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") {
      closeOverlay();
      document.removeEventListener("keydown", handler);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "CLOSE_OVERLAY") {
      closeOverlay();
      return true;
    }
    return false; // 不处理的消息，让其他 content script 接管
  });

  // 监听 iframe 的 postMessage（截图复制等）
  window.addEventListener("message", async (e) => {
    if (e.data?.type === "COPY_SCREENSHOT" && e.data.dataUrl) {
      try {
        const response = await fetch(e.data.dataUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
        console.log("[AI管家] 截图已复制到剪贴板");
      } catch (err) {
        console.warn("[AI管家] 复制截图失败:", err.message);
      }
    }
  });

  // 兜底：DOM 被外部移除时清理标记
  new MutationObserver(() => {
    if (!document.getElementById("__ai_commander_overlay__")) {
      document.body.dataset.__aiOverlayOpen = "0";
    }
  }).observe(document.body, { childList: true });
})();

// 关闭已存在的 overlay（带动画）
function closeExisting() {
  const el = document.getElementById("__ai_commander_overlay__");
  if (!el) return;
  const dialog = el.querySelector("div");
  el.style.animation = "__ai_fade_out__ 0.2s ease forwards";
  if (dialog) dialog.style.animation = "__ai_dialog_out__ 0.2s ease forwards";
  setTimeout(() => {
    el.remove();
    document.body.dataset.__aiOverlayOpen = "0";
  }, 200);
}

// 监听来自 sidepanel iframe 的关闭请求（切换到侧边栏模式时）
window.addEventListener("message", (e) => {
  if (e.data?.type === "CLOSE_OVERLAY") {
    closeExisting();
  }
});
