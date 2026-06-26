import type { BrowserEvent } from "@testerbuddy/protocol";
import { BRIDGE_WS_URL, safeParseBrowserCommand } from "@testerbuddy/protocol";
import type { Router } from "./router";

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export type WsStatus =
  | { state: "no-token" }
  | { state: "connecting"; token: string; attempt: number }
  | { state: "connected"; token: string }
  | { state: "disconnected"; token: string; attempt: number; delay: number };

export class WsClient {
  private ws?: WebSocket;
  private token?: string;
  private router: Router;
  private queue: BrowserEvent[] = [];
  private connecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor({ router }: { router: Router }) {
    this.router = router;
    this.init();

    // Reconnect when user saves a new token in popup
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.pairingToken) {
        this.token = changes.pairingToken.newValue;
        this.cancelReconnect();
        this.ws?.close();
        this.connect();
      }
    });
  }

  private async init() {
    const { pairingToken } = await chrome.storage.local.get("pairingToken");
    this.token = pairingToken;
    if (this.token) this.connect();
  }

  private cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.reconnectAttempts = 0;
  }

  private connect() {
    if (this.connecting || !this.token) return;
    this.connecting = true;

    this.ws = new WebSocket(`${BRIDGE_WS_URL}?token=${this.token}`);

    this.ws.onopen = () => {
      console.log("[TesterBuddy] Connected to bridge");
      this.connecting = false;
      this.reconnectAttempts = 0;
      this.flushQueue();
    };
    this.ws.onclose = () => {
      this.connecting = false;
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
        MAX_RECONNECT_DELAY_MS
      );
      this.reconnectAttempts++;
      console.log(`[TesterBuddy] Bridge disconnected, retrying in ${delay}ms (attempt ${this.reconnectAttempts})...`);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
    this.ws.onerror = (e) => {
      console.error("[TesterBuddy] WebSocket error:", e);
    };
    this.ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        const result = safeParseBrowserCommand(parsed);
        if (result.success) {
          console.log("[ws] received command:", result.data.type);
          this.router.handleCommand(result.data);
        } else {
          console.warn("[ws] ignoring invalid command:", result.error);
        }
      } catch (err) {
        console.error("[ws] failed to parse message:", err);
      }
    };
  }

  private flushQueue() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      while (this.queue.length > 0) {
        const event = this.queue.shift();
        if (event) {
          this.ws.send(JSON.stringify(event));
        }
      }
    }
  }

  getStatus(): WsStatus {
    if (!this.token) return { state: "no-token" };
    if (this.ws?.readyState === WebSocket.OPEN) return { state: "connected", token: this.token };
    if (this.connecting) return { state: "connecting", token: this.token, attempt: this.reconnectAttempts };
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );
    return { state: "disconnected", token: this.token, attempt: this.reconnectAttempts, delay };
  }

  send(event: BrowserEvent) {
    console.log("[ws] send, readyState=", this.ws?.readyState, event);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      this.queue.push(event);
    }
  }
}

