let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
const chunks: Blob[] = [];
let uploadMeta: { projectId: string; ticketId: string } | null = null;

// Forward console logs to service worker
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

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        chrome.runtime.sendMessage({
          source: "testerbuddy:offscreen",
          type: "upload:done",
          base64,
          meta: uploadMeta || { projectId: "unknown", ticketId: "unknown" }
        });
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();
  } catch (err) {
    console.error("Offscreen capture failure:", err);
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
