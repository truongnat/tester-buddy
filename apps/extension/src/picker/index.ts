chrome.desktopCapture.chooseDesktopMedia(
  ["screen"],
  async (streamId: string) => {
    if (streamId) {
      await chrome.runtime.sendMessage({
        source: "testerbuddy:picker",
        type: "stream-selected",
        streamId
      }).catch(() => {});
    }
    window.close();
  }
);
