import {
  COMMAND_CAPTURE_VISIBLE_TAB, EVENT_SCREENSHOT_CAPTURED,
} from "@testerbuddy/protocol";
import type { BrowserCommand, BrowserEvent } from "@testerbuddy/protocol";
import type { TabRegistry } from "./tab-registry";
import type { WsClient, WsStatus } from "./ws-client";

export class Router {
  private ws?: WsClient;

  constructor(private tabs: TabRegistry) {}

  setWs(ws: WsClient) {
    this.ws = ws;
  }

  handleEvent(msg: { source: string; event: unknown }) {
    if (msg.source !== "testerbuddy:event") return;
    if (!this.ws) {
      console.warn("[router] ws not available, dropping event", msg.event);
      return;
    }
    this.ws.send(msg.event as BrowserEvent);
  }

  handleCommand(cmd: BrowserCommand) {
    if (cmd.type === COMMAND_CAPTURE_VISIBLE_TAB) {
      chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          console.error("[service-worker] Capture failed:", chrome.runtime.lastError?.message);
          return;
        }
        const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const event: BrowserEvent = {
          type: EVENT_SCREENSHOT_CAPTURED,
          fileId,
          dataUrl,
        };
        this.ws?.send(event);
      });
      return;
    }

    const tabId = this.tabs.getActiveTabId();
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { source: "testerbuddy:command", cmd });
  }

  handle(msg: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) {
    const m = msg as Record<string, unknown>;

    console.log("[router] message received:", m.source, m.event ? "has event" : "no event");

    if (m.source === "testerbuddy:event") {
      this.handleEvent({ source: "testerbuddy:event", event: m.event });
    }

    if (m.source === "testerbuddy:get-status") {
      const status: WsStatus = this.ws?.getStatus() ?? { state: "no-token" };
      sendResponse({ source: "testerbuddy:status", status });
      return true;
    }

    sendResponse({ ok: true });
    return true;
  }
}
