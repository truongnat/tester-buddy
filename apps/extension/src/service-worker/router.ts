import {
  COMMAND_CAPTURE_VISIBLE_TAB, EVENT_SCREENSHOT_CAPTURED, EVENT_TAB_CONNECTED, safeParseBrowserEvent,
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
    console.log("[trace:runtime-recv] raw event message", msg.event);
    const parsed = safeParseBrowserEvent(msg.event);
    if (!parsed.success) {
      console.warn("[router] dropping invalid browser event", parsed.error.flatten());
      return;
    }
    console.log("[trace:runtime-accept] parsed event", {
      type: parsed.data.type,
      tabId: "tabId" in parsed.data ? parsed.data.tabId : undefined,
    });
    this.ws.send(parsed.data);
  }

  private enrichEvent(
    event: BrowserEvent,
    sender: chrome.runtime.MessageSender,
  ): BrowserEvent {
    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url;
    const tabTitle = sender.tab?.title;
    if (tabId === undefined) {
      return {
        ...event,
        tabUrl: event.tabUrl ?? tabUrl,
        tabTitle: event.tabTitle ?? tabTitle,
      };
    }
    return {
      ...event,
      tabId: "tabId" in event && event.tabId !== undefined ? event.tabId : tabId,
      tabUrl: event.tabUrl ?? tabUrl,
      tabTitle: event.tabTitle ?? tabTitle,
    };
  }

  handleContentReady(
    msg: { source: string; url?: unknown; title?: unknown },
    sender: chrome.runtime.MessageSender,
  ) {
    if (msg.source !== "testerbuddy:content-ready" || !this.ws) return;
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    const url = typeof msg.url === "string" ? msg.url : sender.tab?.url ?? "";
    const title = typeof msg.title === "string" ? msg.title : sender.tab?.title ?? "";
    if (sender.tab?.active) {
      this.tabs.setActive(tabId);
      void chrome.tabs.sendMessage(tabId, { source: "testerbuddy:set-active", active: true });
    }
    this.tabs.updateMeta(tabId, { url, title });
    console.log("[trace:content-ready]", {
      tabId,
      active: sender.tab?.active ?? false,
      url,
      title,
    });
    const event: BrowserEvent = {
      type: EVENT_TAB_CONNECTED,
      tabId,
      url,
      title,
      tabUrl: url,
      tabTitle: title,
    };
    this.ws.send(event);
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

    console.log("[router] message received:", m.source, m.event ? "has event" : "no event", {
      senderTabId: _sender.tab?.id,
      senderActive: _sender.tab?.active,
    });

    if (m.source === "testerbuddy:event") {
      const enriched = this.enrichEvent(m.event as BrowserEvent, _sender);
      this.handleEvent({ source: "testerbuddy:event", event: enriched });
    }

    if (m.source === "testerbuddy:content-ready") {
      this.handleContentReady(
        { source: "testerbuddy:content-ready", url: m.url, title: m.title },
        _sender
      );
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
