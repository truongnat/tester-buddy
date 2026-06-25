import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { BrowserEvent } from "@testerbuddy/protocol";

export interface ExtensionSession {
  id: string;
  ws: WebSocket;
  activeTabId?: number;
  activeUrl?: string;
  connectedAt: Date;
}

export class ExtensionSessionRegistry {
  private sessions = new Map<string, ExtensionSession>();
  private eventListeners: Array<(sessionId: string, event: BrowserEvent) => void> = [];
  private connListeners: Array<(count: number) => void> = [];
  private regListeners: Array<(session: ExtensionSession) => void> = [];

  register(ws: WebSocket): string {
    const id = randomUUID();
    const session = { id, ws, connectedAt: new Date() };
    this.sessions.set(id, session);
    this.connListeners.forEach(fn => fn(this.sessions.size));
    this.regListeners.forEach(fn => fn(session));
    return id;
  }

  unregister(id: string) {
    this.sessions.delete(id);
    this.connListeners.forEach(fn => fn(this.sessions.size));
  }

  onSessionRegister(fn: (session: ExtensionSession) => void) {
    this.regListeners.push(fn);
  }

  getSocket(id: string): WebSocket | undefined {
    return this.sessions.get(id)?.ws;
  }


  handleMessage(sessionId: string, msg: BrowserEvent) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (msg.type === "tab.connected") {
      session.activeTabId = msg.tabId;
      session.activeUrl = msg.url;
    }
    console.log(`[registry] firing ${this.eventListeners.length} listeners for`, msg.type);
    this.eventListeners.forEach(fn => fn(sessionId, msg));
  }

  onEvent(fn: (sessionId: string, event: BrowserEvent) => void) {
    this.eventListeners.push(fn);
  }

  onConnectionChange(fn: (count: number) => void) {
    this.connListeners.push(fn);
  }
}
