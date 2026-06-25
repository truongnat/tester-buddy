const UPLOAD_URL = "http://127.0.0.1:17393/api/upload-video";

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
const chunks: Blob[] = [];
let uploadMeta: { projectId: string; ticketId: string } | null = null;

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  originalLog(...args);
  chrome.runtime.sendMessage({
    source: "testerbuddy:offscreen",
    type: "offscreen:log",
    text: args.join(" ")
  }).catch(() => {});
};

console.error = (...args) => {
  originalError(...args);
  chrome.runtime.sendMessage({
    source: "testerbuddy:offscreen",
    type: "offscreen:error",
    text: args.join(" ")
  }).catch(() => {});
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return false;

  if (message.type === "start") {
    uploadMeta = { projectId: message.projectId, ticketId: message.ticketId };
    startRecording(message.streamId);
    sendResponse({ ok: true });
  } else if (message.type === "stop") {
    stopRecording();
    sendResponse({ ok: true });
  }
  return true;
});

async function startRecording(streamId: string) {
  try {
    chunks.length = 0;

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080
        }
      } as any
    });

    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: "video/webm" });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "video/webm" });

      try {
        const params = new URLSearchParams();
        if (uploadMeta) {
          params.set("projectId", uploadMeta.projectId);
          params.set("ticketId", uploadMeta.ticketId);
        }

        const response = await fetch(`${UPLOAD_URL}?${params}`, {
          method: "POST",
          body: blob
        });

        if (!response.ok) {
          console.error(`Upload failed: HTTP ${response.status}`);
        }
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        chrome.runtime.sendMessage({
          source: "testerbuddy:offscreen",
          type: "upload:done"
        }).catch(() => {});
      }
    };

    mediaRecorder.start();

    chrome.runtime.sendMessage({
      source: "testerbuddy:offscreen",
      type: "recording:started"
    }).catch(() => {});
  } catch (err) {
    console.error("Screen capture failed:", err);
    chrome.runtime.sendMessage({
      source: "testerbuddy:offscreen",
      type: "recording:cancelled"
    }).catch(() => {});
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }
}
