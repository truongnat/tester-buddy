import { app, BrowserWindow } from "electron";
import { join } from "path";
import { existsSync, writeFileSync, mkdirSync, appendFileSync, statSync, renameSync } from "fs";
import {
  EVENT_TAB_CONNECTED,
  EVENT_TAB_SWITCHED,
  EVENT_TAB_UPDATED,
  EVENT_SCREENSHOT_CAPTURED,
} from "@testerbuddy/protocol";
import type { BrowserEvent } from "@testerbuddy/protocol";
import { IPC } from "./ipc/channels";
import { LocalServer, VideoUpload } from "./bridge/local-server";
import { registerIpcHandlers } from "./ipc/handlers";
import { DatabaseManager } from "./db/database";
import { convertToMp4 } from "./ffmpeg-converter";
import { pickScreen } from "./screen-picker";
import { cleanName } from "@testerbuddy/shared";
import { loadEnvFromWorkspace } from "./config/env";

try {
  const logFilePath = join(app.getPath("userData"), "main.log");
  const MAX_LOG_SIZE = 1024 * 1024;
  const SENSITIVE_KEY_PATTERN = /authorization|cookie|set-cookie|token|secret|password|api[-_]?key/i;
  try {
    if (existsSync(logFilePath) && statSync(logFilePath).size > MAX_LOG_SIZE) {
      renameSync(logFilePath, `${logFilePath}.old`);
    }
  } catch {}
  writeFileSync(logFilePath, "--- APP START ---\n");

  const redactForLog = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(redactForLog);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
        [key, SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactForLog(entry)]
      )));
    }
    if (typeof value === "string" && value.length > 500) {
      return `${value.slice(0, 500)}...[truncated]`;
    }
    return value;
  };

  const logRedirect = (type: string, ...args: any[]) => {
    const msg = args.map((a) => typeof a === "object" ? JSON.stringify(redactForLog(a)) : String(a)).join(" ");
    appendFileSync(logFilePath, `[${new Date().toISOString()}] [${type}] ${msg}\n`);
  };

  console.log = (...args) => logRedirect("INFO", ...args);
  console.error = (...args) => logRedirect("ERROR", ...args);
} catch {}

async function bootstrap() {
  loadEnvFromWorkspace();
  let win: BrowserWindow;
  const db = new DatabaseManager();
  await db.init();

  const server = new LocalServer();
  server.onVideoUpload(async (upload: VideoUpload) => {
    const finalPath = await convertToMp4(upload.webmPath, upload.mp4Path, 0, (progress) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.SESSION_VIDEO_PROGRESS, { progress });
      }
    });
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.SESSION_VIDEO_SAVED, { filepath: finalPath });
    }
  });
  await server.start();

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  registerIpcHandlers(server.hub, server.pairing, win, db);

  win.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const source = await pickScreen();
      if (source) callback({ video: source });
    } catch (err) {
      console.error("[displayMedia] Failed to get sources:", err);
    }
  });

  server.hub.registry.onSessionRegister((session) => {
    db.insertSession(session.id, session.activeTabId, session.activeUrl);
  });

  server.hub.registry.onEvent((sessionId, event: BrowserEvent) => {
    const ts = Date.now();
    console.log("[desktop] event received", {
      sessionId,
      type: event.type,
      tabId: "tabId" in event ? event.tabId : undefined,
    });

    if (
      event.type === EVENT_TAB_CONNECTED
      || event.type === EVENT_TAB_SWITCHED
      || event.type === EVENT_TAB_UPDATED
    ) {
      db.updateSessionTab(sessionId, event.tabId, event.url);
    }

    if (event.type === EVENT_SCREENSHOT_CAPTURED) {
      const { fileId, dataUrl } = event;
      if (dataUrl) {
        try {
          const mimeMatch = dataUrl.match(/^data:(image\/\w+);base64,/);
          if (!mimeMatch) {
            throw new Error("Failed to parse screenshot dataUrl");
          }

          const ext = mimeMatch[1].split("/")[1];
          const base64Data = dataUrl.slice(dataUrl.indexOf(",") + 1);
          const context = db.getActiveCaptureContext();
          const project = context?.projectId ? db.getProject(context.projectId) : null;
          const ticket = context?.ticketId ? db.getTicket(context.ticketId) : null;
          const mediaDir = project && ticket
            ? join(
              app.getPath("documents"),
              "TesterBuddy",
              "Project",
              cleanName(project.key || project.id),
              "Ticket",
              cleanName(ticket.code || ticket.id),
              "media"
            )
            : join(app.getPath("documents"), "TesterBuddy", "images");
          if (!existsSync(mediaDir)) {
            mkdirSync(mediaDir, { recursive: true });
          }

          const filepath = join(mediaDir, `screenshot-${ts}-${cleanName(fileId)}.${ext}`);
          writeFileSync(filepath, base64Data, "base64");
          const dbEvent = { ...event, dataUrl: undefined, filepath };
          const eventId = db.insertEvent(sessionId, dbEvent, ts);
          db.insertScreenshot(fileId, eventId, filepath, ts);
          const media = project && ticket
            ? db.createMedia({
              projectId: project.id,
              ticketId: ticket.id,
              kind: "screenshot",
              filepath,
              bugId: undefined,
              thumbnailPath: undefined,
              sourceSessionId: sessionId,
              sourceEventId: eventId,
            })
            : null;

          if (!win.isDestroyed()) {
            win.webContents.send(IPC.SESSION_EVENT, {
              id: eventId,
              event: dbEvent,
              ts,
              media,
            });
          }
          return;
        } catch (err) {
          console.error("Failed to save screenshot:", err);
        }
      }
    }

    const eventId = db.insertEvent(sessionId, event, ts);

    if (!win.isDestroyed()) {
      win.webContents.send(IPC.SESSION_EVENT, { id: eventId, event, ts });
    }
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  app.on("before-quit", () => db.close());
}

app.whenReady().then(bootstrap);
app.on("window-all-closed", () => app.quit());
