import type { BrowserCommand } from "@testerbuddy/protocol";
import type { TabRegistry } from "./tab-registry";
import type { WsClient } from "./ws-client";

export class Router {
  private ws?: WsClient;

  constructor(private tabs: TabRegistry) {}

  setWs(ws: WsClient) {
    this.ws = ws;
  }

  private log(...args: any[]) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    this.ws?.send({ type: "ext:log", text: `[service-worker] ${msg}` } as any);
  }

  handleEvent(msg: { source: string; event: unknown }) {
    if (msg.source !== "testerbuddy:event") return;
    this.ws?.send(msg.event as never);
  }

  handleCommand(cmd: BrowserCommand) {
    if (cmd.type === "capture.visibleTab") {
      chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          this.log("Capture failed:", chrome.runtime.lastError?.message);
          return;
        }
        const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        this.ws?.send({
          type: "screenshot.captured",
          fileId,
          dataUrl
        });
      });
      return;
    }

    const tabId = this.tabs.getActiveTabId();
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { source: "testerbuddy:command", cmd });
  }

  async handle(msg: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) {
    const m = msg as any;

    if (m.source === "testerbuddy:event") {
      this.log("received event from content script", m.event);
      this.handleEvent(m as { source: string; event: unknown });
    }

    sendResponse({ ok: true });
    return true;
  }
}
