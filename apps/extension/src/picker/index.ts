import { safeSend } from "@testerbuddy/shared";

chrome.desktopCapture.chooseDesktopMedia(
  ["screen"],
  async (streamId: string) => {
    if (streamId) {
      safeSend(() => chrome.runtime.sendMessage({
        source: "testerbuddy:picker",
        type: "stream-selected",
        streamId
      }));
    }
    window.close();
  }
);
