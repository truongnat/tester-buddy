import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { safeParseBrowserEvent } from "@testerbuddy/protocol";
import type { PairingService } from "./pairing.service";
import { ExtensionSessionRegistry } from "./extension-session-registry";

export class WebSocketHub {
  private wss?: WebSocketServer;
  readonly registry = new ExtensionSessionRegistry();

  constructor(private pairing: PairingService) {}

  attach(server: HttpServer) {
    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws, req) => this.onConnection(ws, req));
  }

  private onConnection(ws: WebSocket, req: import("http").IncomingMessage) {
    const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("token");

    if (!token || !this.pairing.validate(token)) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const sessionId = this.registry.register(ws);
    console.log(`[hub] Extension connected: ${sessionId}`);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const result = safeParseBrowserEvent(msg);
        if (result.success) {
          this.registry.handleMessage(sessionId, result.data);
        } else {
          console.log("[hub] ignoring non-BrowserEvent:", msg, result.error?.message);
        }
      } catch {
        // ignore malformed JSON
      }
    });

    ws.on("error", (err) => {
      console.error(`[hub] WebSocket error for session ${sessionId}:`, err.message);
    });

    ws.on("close", () => this.registry.unregister(sessionId));
  }

  send(sessionId: string, payload: unknown) {
    const ws = this.registry.getSocket(sessionId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}

