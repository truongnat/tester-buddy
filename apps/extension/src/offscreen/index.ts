import { BRIDGE_UPLOAD_URL } from "@testerbuddy/protocol";
import { safeSend } from "@testerbuddy/shared";

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
const chunks: Blob[] = [];
let uploadMeta: { projectId: string; ticketId: string } | null = null;

const originalLog = console.log;
const originalError = console.error;

function sendToSw(msg: Record<string, unknown>) {
  safeSend(() => chrome.runtime.sendMessage({ source: "testerbuddy:offscreen", ...msg }));
}

console.log = (...args) => {
  originalLog(...args);
  sendToSw({ type: "offscreen:log", text: args.join(" ") });
};

console.error = (...args) => {
  originalError(...args);
  sendToSw({ type: "offscreen:error", text: args.join(" ") });
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

        const response = await fetch(`${BRIDGE_UPLOAD_URL}?${params}`, {
          method: "POST",
          body: blob
        });

        if (!response.ok) {
          console.error(`Upload failed: HTTP ${response.status}`);
        }
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        sendToSw({ type: "upload:done" });
      }
    };

    mediaRecorder.start();

    sendToSw({ type: "recording:started" });
  } catch (err) {
    console.error("Screen capture failed:", err);
    sendToSw({ type: "recording:cancelled" });
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
