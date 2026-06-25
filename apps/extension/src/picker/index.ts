chrome.desktopCapture.chooseDesktopMedia(
  ["tab", "window"],
  (streamId: string) => {
    if (streamId) {
      chrome.runtime.sendMessage({
        source: "testerbuddy:picker",
        type: "stream-selected",
        streamId
      });
    }
    window.close();
  }
);
