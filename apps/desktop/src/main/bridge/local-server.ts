import { createServer, IncomingMessage, ServerResponse } from "http";
import { existsSync, mkdirSync, writeFile } from "fs";
import { join, resolve } from "path";
import { app } from "electron";
import { cleanName } from "@testerbuddy/shared";
import { BRIDGE_PORT, BRIDGE_HOST, UPLOAD_PATH } from "@testerbuddy/protocol";
import { randomUUID } from "crypto";
import { WebSocketHub } from "./websocket-hub";
import { PairingService } from "./pairing.service";

export interface VideoUpload {
  filePath: string;
  webmPath: string;
  mp4Path: string;
  tabId: string;
  projectId: string;
  ticketId: string;
}

type UploadCallback = (upload: VideoUpload) => void;

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export class LocalServer {
  readonly pairing = new PairingService();
  readonly hub = new WebSocketHub(this.pairing);
  private uploadCallbacks: UploadCallback[] = [];

  onVideoUpload(fn: UploadCallback) {
    this.uploadCallbacks.push(fn);
  }

  async start() {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const origin = req.headers.origin;
      if (origin && this.isAllowedOrigin(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-TesterBuddy-Token");

      if (req.method === "OPTIONS") {
        if (!origin || !this.isAllowedOrigin(origin)) {
          res.writeHead(403);
          res.end();
          return;
        }
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "POST" && req.url && req.url.startsWith(UPLOAD_PATH)) {
        this.handleUpload(req, res);
        return;
      }
      res.writeHead(200);
      res.end("TesterBuddy Bridge");
    });

    this.hub.attach(server);

    await new Promise<void>((resolve) =>
      server.listen(BRIDGE_PORT, BRIDGE_HOST, resolve)
    );

    console.log(`[bridge] Listening on ${BRIDGE_HOST}:${BRIDGE_PORT}`);
    console.log(`[bridge] Pairing token: ${this.pairing.getToken()}`);
  }

  private isAllowedOrigin(origin: string) {
    return origin.startsWith("chrome-extension://");
  }

  private isAuthorized(req: IncomingMessage) {
    const headerToken = req.headers["x-testerbuddy-token"];
    const token = Array.isArray(headerToken) ? headerToken[0] : headerToken;
    return typeof token === "string" && this.pairing.validate(token);
  }

  private ensureInsideRoot(targetDir: string) {
    const root = resolve(app.getPath("documents"), "TesterBuddy");
    const resolvedTarget = resolve(targetDir);
    return resolvedTarget === root || resolvedTarget.startsWith(`${root}/`);
  }

  private handleUpload(req: IncomingMessage, res: ServerResponse) {
    if (!this.isAuthorized(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const tabId = url.searchParams.get("tabId") || "unknown";
    const projectId = url.searchParams.get("projectId") || "unknown";
    const ticketId = url.searchParams.get("ticketId") || "unknown";
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upload too large" }));
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_UPLOAD_BYTES) {
        req.destroy(new Error("Upload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const folderName = `${cleanName(tabId)}_${cleanName(projectId)}_${cleanName(ticketId)}`;
      const documentsDir = app.getPath("documents");
      const targetDir = join(documentsDir, "TesterBuddy", folderName);
      if (!this.ensureInsideRoot(targetDir)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid upload path" }));
        return;
      }

      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      const ts = Date.now();
      const rand = randomUUID().slice(0, 8);
      const webmPath = join(targetDir, `video_${ts}_${rand}.webm`);
      const mp4Path = join(targetDir, `video_${ts}_${rand}.mp4`);

      writeFile(webmPath, buffer, (err: any) => {
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
      const status = err.message === "Upload too large" ? 413 : 500;
      console.error("[upload] Request error:", err.message);
      res.writeHead(status);
      res.end(JSON.stringify({ error: err.message }));
    });
  }
}
