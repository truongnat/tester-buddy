import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketHub } from "./websocket-hub";
import { PairingService } from "./pairing.service";

const PORT = 17393;

export interface VideoUpload {
  filePath: string;
  webmPath: string;
  mp4Path: string;
  tabId: string;
  projectId: string;
  ticketId: string;
}

type UploadCallback = (upload: VideoUpload) => void;

export class LocalServer {
  readonly pairing = new PairingService();
  readonly hub = new WebSocketHub(this.pairing);
  private uploadCallbacks: UploadCallback[] = [];

  onVideoUpload(fn: UploadCallback) {
    this.uploadCallbacks.push(fn);
  }

  async start() {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "POST" && req.url && req.url.startsWith("/api/upload-video")) {
        this.handleUpload(req, res);
        return;
      }
      res.writeHead(200);
      res.end("TesterBuddy Bridge");
    });

    this.hub.attach(server);

    await new Promise<void>((resolve) =>
      server.listen(PORT, "127.0.0.1", resolve)
    );

    console.log(`[bridge] Listening on 127.0.0.1:${PORT}`);
    console.log(`[bridge] Pairing token: ${this.pairing.getToken()}`);
  }

  private handleUpload(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const tabId = url.searchParams.get("tabId") || "unknown";
    const projectId = url.searchParams.get("projectId") || "unknown";
    const ticketId = url.searchParams.get("ticketId") || "unknown";

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const fs = require("fs");
      const path = require("path");
      const { app } = require("electron");

      const buffer = Buffer.concat(chunks);
      const cleanTabId = String(tabId).replace(/:/g, "_");
      const cleanProjectId = String(projectId).replace(/:/g, "_");
      const cleanTicketId = String(ticketId).replace(/:/g, "_");

      const folderName = `${cleanTabId}_${cleanProjectId}_${cleanTicketId}`;
      const documentsDir = app.getPath("documents");
      const targetDir = path.join(documentsDir, "TesterBuddy", folderName);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const webmPath = path.join(targetDir, "video.webm");
      const mp4Path = path.join(targetDir, "video.mp4");

      fs.writeFile(webmPath, buffer, (err: any) => {
        if (err) {
          console.error("[upload] Failed to save video:", err);
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ webmPath, mp4Path }));

        this.uploadCallbacks.forEach((fn) =>
          fn({ filePath: webmPath, webmPath, mp4Path, tabId, projectId, ticketId })
        );
      });
    });

    req.on("error", (err) => {
      console.error("[upload] Request error:", err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });
  }
}
