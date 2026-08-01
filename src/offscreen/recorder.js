/**
 * Offscreen 录制文档 — 使用 MediaRecorder 录制标签/桌面
 * 此文档运行在 offscreen context，Web API 可用但 chrome.* 仅限 runtime
 */

let mediaRecorder = null;
let recordedChunks = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_TAB_RECORDING") {
    startTabRecording(message.streamId, message.tabTitle).then(() =>
      sendResponse({ success: true }),
    );
    return true;
  }
  if (message.type === "START_DESKTOP_RECORDING") {
    startDesktopRecording(message.streamId).then(() =>
      sendResponse({ success: true }),
    );
    return true;
  }
  if (message.type === "STOP_RECORDING") {
    stopRecording(sendResponse);
    return true;
  }
  // 未知消息静默忽略，避免干扰其他扩展上下文的 sendMessage
});

async function startTabRecording(streamId, tabTitle) {
  stopCurrentRecording();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
  });

  startMediaRecorder(stream);
}

async function startDesktopRecording(streamId) {
  stopCurrentRecording();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: streamId,
      },
    },
  });

  startMediaRecorder(stream);
}

function startMediaRecorder(stream) {
  recordedChunks = [];

  // 尝试使用 VP9/webm (Chrome 支持)
  let mimeType = "video/webm;codecs=vp9";
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm";
    }
  }

  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2500000, // 2.5 Mbps
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    // 停止所有轨道
    stream.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start(1000); // 每秒收集一次数据
}

function stopCurrentRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  recordedChunks = [];
}

async function stopRecording(sendResponse) {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    sendResponse({ success: false, error: "没有正在进行的录制" });
    return;
  }

  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(recordedChunks, { type: "video/webm" });
        const reader = new FileReader();

        reader.onloadend = () => {
          const dataUrl = reader.result;
          sendResponse({
            success: true,
            dataUrl,
            size: blob.size,
          });
          resolve();
        };

        reader.onerror = () => {
          sendResponse({ success: false, error: "读取录制数据失败" });
          resolve();
        };

        reader.readAsDataURL(blob);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
        resolve();
      }
    };

    mediaRecorder.stop();
  });
}
