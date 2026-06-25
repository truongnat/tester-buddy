import type { BrowserEvent, BrowserCommand } from "@testerbuddy/protocol";
import type { Router } from "./router";

const BRIDGE_HOST = "ws://127.0.0.1:17393";
const RECONNECT_DELAY_MS = 3000;

export class WsClient {
  private ws?: WebSocket;
  private token?: string;
  private router: Router;
  private queue: BrowserEvent[] = [];

  constructor({ router }: { router: Router }) {
    this.router = router;
    this.init();

    // Reconnect when user saves a new token in popup
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.pairingToken) {
        this.token = changes.pairingToken.newValue;
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

  private connect() {
    if (!this.token) return;

    this.ws = new WebSocket(`${BRIDGE_HOST}?token=${this.token}`);

    this.ws.onopen = () => {
      console.log("[TesterBuddy] Connected to bridge");
      this.flushQueue();
    };
    this.ws.onclose = () => {
      console.log("[TesterBuddy] Bridge disconnected, retrying...");
      setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
    };
    this.ws.onerror = (e) => {
      console.error("[TesterBuddy] WebSocket error:", e);
    };
    this.ws.onmessage = (e) => {
      try {
        const cmd: BrowserCommand = JSON.parse(e.data);
        console.log("[ws] received command:", cmd.type);
        this.router.handleCommand(cmd);
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

  send(event: BrowserEvent) {
    console.log("[ws] send, readyState=", this.ws?.readyState, event);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      this.queue.push(event);
    }
  }
}

