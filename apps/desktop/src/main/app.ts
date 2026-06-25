import { app, BrowserWindow, desktopCapturer, dialog } from "electron";
import { join } from "path";
import { existsSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { LocalServer, VideoUpload } from "./bridge/local-server";
import { registerIpcHandlers } from "./ipc/handlers";
import { DatabaseManager } from "./db/database";
import { convertToMp4 } from "./ffmpeg-converter";

// Redirect console logs to a file in userData
try {
  const logFilePath = join(app.getPath("userData"), "main.log");
  writeFileSync(logFilePath, `--- APP START ---\n`);
  
  const logRedirect = (type: string, ...args: any[]) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    appendFileSync(logFilePath, `[${new Date().toISOString()}] [${type}] ${msg}\n`);
  };
  
  console.log = (...args) => logRedirect("INFO", ...args);
  console.error = (...args) => logRedirect("ERROR", ...args);
} catch (e) {
  // ignore logging errors
}

async function bootstrap() {
  let win: BrowserWindow;
  const db = new DatabaseManager();
  await db.init();

  const server = new LocalServer();
  server.onVideoUpload(async (upload: VideoUpload) => {
    const finalPath = await convertToMp4(upload.webmPath, upload.mp4Path, 0, (progress) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("session:video-progress", { progress });
      }
    });
    if (win && !win.isDestroyed()) {
      win.webContents.send("session:video-saved", { filepath: finalPath });
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
      const sources = await desktopCapturer.getSources({ types: ["screen"] });

      if (sources.length === 1) {
        callback({ video: sources[0] });
        return;
      }

      const buttons = sources.map((s: Electron.DesktopCapturerSource) => `${s.name}`);
      const { response } = await dialog.showMessageBox(win, {
        type: "question",
        buttons,
        defaultId: 0,
        title: "Select Screen to Record",
        message: "Which screen would you like to capture?"
      });

      if (response >= 0) {
        callback({ video: sources[response] });
      }
    } catch (err) {
      console.error("[displayMedia] Failed to get sources:", err);
    }
  });

  server.hub.registry.onSessionRegister((session) => {
    db.insertSession(session.id, session.activeTabId, session.activeUrl);
  });

  server.hub.registry.onEvent((sessionId, event) => {
    const evt = event as any;

    if (evt.type === "offscreen:log") {
      console.log(evt.text);
      return;
    }

    if (evt.type === "offscreen:error") {
      console.error(evt.text);
      return;
    }

    const ts = Date.now();
    const eventId = db.insertEvent(sessionId, event, ts);

    if (event.type === "tab.connected" || event.type === "tab.updated") {
      db.updateSessionTab(sessionId, event.tabId, event.url);
    }

    if (event.type === "screenshot.captured") {
      const { fileId, dataUrl } = event;
      if (dataUrl) {
        try {
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
          const screenshotsDir = join(app.getPath("userData"), "screenshots");
          if (!existsSync(screenshotsDir)) {
            mkdirSync(screenshotsDir, { recursive: true });
          }
          const filepath = join(screenshotsDir, `${fileId}.png`);
          writeFileSync(filepath, base64Data, "base64");
          db.insertScreenshot(fileId, eventId, filepath, ts);
          (event as any).filepath = filepath;
        } catch (err) {
          console.error("Failed to save screenshot:", err);
        }
      }
    }

    if (!win.isDestroyed()) {
      win.webContents.send("session:event", { event, ts });
    }
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(bootstrap);
app.on("window-all-closed", () => app.quit());

