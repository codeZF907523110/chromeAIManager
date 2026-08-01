// AI Browser Commander — Service Worker 入口
// 职责：消息路由、上下文收集、操作执行、弹窗管理、显示模式切换

import { collectContext } from "./context-collector.js";
import { executeCommand } from "./executor.js";
import {
  MSG_GET_CONTEXT,
  MSG_GET_BOOKMARKS,
  MSG_EXECUTE,
  MSG_SET_DISPLAY_MODE,
  MSG_GET_DISPLAY_MODE,
} from "../shared/constants.js";

// ──── 显示模式管理 ────

async function applyDisplayMode(mode) {
  if (mode === "sidepanel") {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } else {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
}

// 启动时同步模式
chrome.runtime.onInstalled.addListener(async () => {
  const { displayMode = "popup" } =
    await chrome.storage.local.get("displayMode");
  await applyDisplayMode(displayMode);
});

// SW 唤醒时也同步（防止状态丢失）
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.displayMode) {
    await applyDisplayMode(changes.displayMode.newValue);
  }
});

// ──── 消息路由 ────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 内部录制消息 — 由 offscreen 文档处理，SW 忽略
  if (
    msg.type &&
    (msg.type.startsWith("START_") || msg.type === "STOP_RECORDING")
  ) {
    return false;
  }

  if (msg.type === MSG_GET_CONTEXT) {
    collectContext(msg.options).then(sendResponse);
    return true;
  }
  if (msg.type === MSG_GET_BOOKMARKS) {
    const { query } = msg.options || {};
    chrome.bookmarks.search(query || "").then(sendResponse);
    return true;
  }
  if (msg.type === MSG_EXECUTE) {
    executeCommand(msg.command).then(sendResponse);
    return true;
  }
  if (msg.type === MSG_SET_DISPLAY_MODE) {
    (async () => {
      await chrome.storage.local.set({ displayMode: msg.mode });
      await applyDisplayMode(msg.mode);
      sendResponse({ success: true });
    })();
    return true;
  }
  if (msg.type === MSG_GET_DISPLAY_MODE) {
    chrome.storage.local
      .get("displayMode")
      .then(({ displayMode = "popup" }) => {
        sendResponse({ mode: displayMode });
      });
    return true;
  }
  sendResponse({
    error: { code: "UNKNOWN_TYPE", message: `未知消息类型: ${msg.type}` },
  });
});

// ──── 点击扩展图标 ────

chrome.action.onClicked.addListener(async (tab) => {
  const { displayMode = "popup" } =
    await chrome.storage.local.get("displayMode");
  if (displayMode === "sidepanel") return; // setPanelBehavior 已自动打开侧边栏
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content/overlay.js"],
    });
  } catch (err) {
    console.error(
      "[AI管家] 弹窗注入失败:",
      err.message,
      "tab:",
      tab?.id,
      "url:",
      tab?.url,
    );
  }
});
