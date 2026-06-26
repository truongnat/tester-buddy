import { EventRecorder } from "./event-recorder";
import { PageBridge } from "./page-bridge";
import { injectScript } from "./dom-inspector";
import { handleCommand } from "./command-handler";

declare const __TESTERBUDDY_BUILD_VERSION__: string;
declare const __TESTERBUDDY_INJECTED_FILE__: string;

const CONTENT_VERSION = __TESTERBUDDY_BUILD_VERSION__;
const PAGE_EVENT_CHANNEL = `__testerbuddy__:${CONTENT_VERSION}`;

declare global {
  interface Window {
    __testerbuddy_content_initialized__?: boolean;
    __testerbuddy_content_version__?: string;
  }
}

if (window.__testerbuddy_content_version__ !== CONTENT_VERSION) {
  window.__testerbuddy_content_initialized__ = true;
  window.__testerbuddy_content_version__ = CONTENT_VERSION;

  const bridge = new PageBridge();
  const recorder = new EventRecorder(bridge, PAGE_EVENT_CHANNEL);
  recorder.start();

  injectScript(chrome.runtime.getURL(__TESTERBUDDY_INJECTED_FILE__));

  window.addEventListener(PAGE_EVENT_CHANNEL, (e) => {
    const event = (e as CustomEvent).detail;
    bridge.send(event);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const m = msg as { source?: string; cmd?: unknown };

    if (m.source === "testerbuddy:ping") {
      sendResponse({ source: "testerbuddy:pong", version: CONTENT_VERSION });
      return true;
    }

    if (m.source !== "testerbuddy:command" || !m.cmd) return false;
    try {
      const result = handleCommand(m.cmd as any, bridge);
      sendResponse({ ok: true, result });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  });
}
