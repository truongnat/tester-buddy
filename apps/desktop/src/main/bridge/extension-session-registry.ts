import { EVENT_TAB_CONNECTED, EVENT_TAB_SWITCHED, EVENT_TAB_UPDATED } from "@testerbuddy/protocol";
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

  get connectionCount(): number {
    return this.sessions.size;
  }

  getAllSessions(): ExtensionSession[] {
    return Array.from(this.sessions.values());
  }

  handleMessage(sessionId: string, msg: BrowserEvent) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (msg.type === EVENT_TAB_CONNECTED || msg.type === EVENT_TAB_SWITCHED) {
      session.activeTabId = msg.tabId;
      session.activeUrl = msg.url;
    }
    if (msg.type === EVENT_TAB_UPDATED && session.activeTabId === msg.tabId) {
      session.activeUrl = msg.url;
    }
    this.eventListeners.forEach(fn => fn(sessionId, msg));
  }

  onEvent(fn: (sessionId: string, event: BrowserEvent) => void) {
    this.eventListeners.push(fn);
  }

  onConnectionChange(fn: (count: number) => void) {
    this.connListeners.push(fn);
  }
}
