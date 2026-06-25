import type { BrowserCommand } from "@testerbuddy/protocol";
import type { TabRegistry } from "./tab-registry";
import type { WsClient } from "./ws-client";

export class Router {
  private ws?: WsClient;
  private isRecording = false;
  private activeRecordMeta?: { projectId: string; ticketId: string };

  constructor(private tabs: TabRegistry) {}

  setWs(ws: WsClient) {
    this.ws = ws;
  }

  private async startRecordingWithStream(streamId: string, projectId: string, ticketId: string) {
    const hasOffscreen = await (chrome as any).offscreen.hasDocument?.().catch(() => false);
    if (!hasOffscreen) {
      await (chrome as any).offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification: "Record tab content video silently"
      });
    }

    this.isRecording = true;

    this.ws?.send({ type: "video.recording", projectId, ticketId } as any);

    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "start",
      streamId,
      projectId,
      ticketId
    });
  }

  handleEvent(msg: { source: string; event: unknown }) {
    if (msg.source !== "testerbuddy:event") return;
    this.ws?.send(msg.event as never);
  }

  handleCommand(cmd: BrowserCommand) {
    if (cmd.type === "capture.visibleTab") {
      chrome.tabs.captureVisibleTab(null as any, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          console.error("Capture failed:", chrome.runtime.lastError?.message);
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

    if ((cmd as any).type === "video.request") {
      const { projectId, ticketId } = cmd as any;
      this.activeRecordMeta = { projectId, ticketId };

      chrome.storage.local.set({ pendingVideoRequest: { projectId, ticketId } });

      this.ws?.send({ type: "video.waiting" } as any);
      return;
    }

    if ((cmd as any).type === "video.stop") {
      chrome.storage.local.remove("pendingVideoRequest");
      this.isRecording = false;
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "stop"
      }).catch(() => {});
      return;
    }

    const tabId = this.tabs.getActiveTabId();
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { source: "testerbuddy:command", cmd });
  }

  async handle(msg: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) {
    const m = msg as any;

    if (m.source === "testerbuddy:event") {
      console.log("[router] received event from content script", m.event);
      this.handleEvent(m as { source: string; event: unknown });
    }

    if (m.source === "testerbuddy:offscreen" && m.type === "offscreen:log") {
      this.ws?.send({ type: "offscreen:log", text: `[offscreen] ${m.text}` } as any);
      sendResponse({ ok: true });
      return;
    }

    if (m.source === "testerbuddy:offscreen" && m.type === "offscreen:error") {
      this.ws?.send({ type: "offscreen:error", text: `[offscreen] ${m.text}` } as any);
      sendResponse({ ok: true });
      return;
    }

    if (m.source === "testerbuddy:picker" && m.type === "stream-selected") {
      const streamId = m.streamId as string;
      const meta = this.activeRecordMeta;

      if (streamId && meta) {
        this.startRecordingWithStream(streamId, meta.projectId, meta.ticketId);
      }
      this.activeRecordMeta = undefined;
      sendResponse({ ok: true });
      return;
    }

    if (m.source === "testerbuddy:offscreen" && m.type === "upload:done") {
      const base64 = m.base64 as string;
      const meta = m.meta as { projectId: string; ticketId: string };

      this.ws?.send({
        type: "video.captured",
        base64,
        projectId: meta.projectId,
        ticketId: meta.ticketId
      } as any);

      (chrome as any).offscreen.closeDocument();
      this.isRecording = false;
      this.activeRecordMeta = undefined;
    }

    sendResponse({ ok: true });
    return true;
  }
}
