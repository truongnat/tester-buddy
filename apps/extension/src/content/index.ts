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
    __testerbuddy_content_active__?: boolean;
    __testerbuddy_page_capture_active__?: boolean;
  }
}

if (window.__testerbuddy_content_version__ !== CONTENT_VERSION) {
  window.__testerbuddy_content_initialized__ = true;
  window.__testerbuddy_content_version__ = CONTENT_VERSION;

  const bridge = new PageBridge();
  const recorder = new EventRecorder(bridge, PAGE_EVENT_CHANNEL);
  window.__testerbuddy_content_active__ = false;
  window.__testerbuddy_page_capture_active__ = false;
  recorder.start();

  injectScript(chrome.runtime.getURL(__TESTERBUDDY_INJECTED_FILE__));

  window.addEventListener(PAGE_EVENT_CHANNEL, (e) => {
    if (!window.__testerbuddy_content_active__) return;
    const detail = (e as CustomEvent).detail;
    if (typeof detail === "string") {
      try {
        bridge.send(JSON.parse(detail));
      } catch (error) {
        console.warn("[TesterBuddy] Failed to parse page event payload", error);
      }
      return;
    }
    bridge.send(detail);
  });

  try {
    chrome.runtime.sendMessage({
      source: "testerbuddy:content-ready",
      url: location.href,
      title: document.title,
    });
  } catch (error) {
    console.warn("[TesterBuddy] Failed to notify content-ready", error);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const m = msg as { source?: string; cmd?: unknown; active?: boolean };

    if (m.source === "testerbuddy:ping") {
      sendResponse({ source: "testerbuddy:pong", version: CONTENT_VERSION });
      return true;
    }

    if (m.source === "testerbuddy:set-active") {
      const active = m.active === true;
      window.__testerbuddy_content_active__ = active;
      window.__testerbuddy_page_capture_active__ = active;
      recorder.setActive(active);
      sendResponse({ ok: true, active });
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
