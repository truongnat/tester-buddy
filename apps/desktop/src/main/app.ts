import { app, BrowserWindow } from "electron";
import { join } from "path";
import { existsSync, writeFileSync, appendFileSync } from "fs";
import { LocalServer, VideoUpload } from "./bridge/local-server";
import { registerIpcHandlers } from "./ipc/handlers";
import { DatabaseManager } from "./db/database";
import { getFfmpegPath, log as logFfmpeg } from "./ffmpeg";

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

function convertToMp4(win: BrowserWindow | undefined, webmPath: string, mp4Path: string, estimatedDurationSec?: number) {
  const fs = require("fs");
  const { spawn } = require("child_process");

  console.log(`[ffmpeg] Starting conversion of ${webmPath} to ${mp4Path}...`);
  logFfmpeg(`Starting conversion of ${webmPath} to ${mp4Path} with estimated duration: ${estimatedDurationSec}`);
  const startTime = Date.now();
  const ffmpegPath = getFfmpegPath();
  let totalDurationSec = estimatedDurationSec || 0;

  try {
    const ffmpeg = spawn(ffmpegPath, [
      "-y",
      "-i", webmPath,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      mp4Path
    ], { stdio: ["ignore", "ignore", "pipe"] });

    ffmpeg.stderr.on("data", (data: Buffer) => {
      const output = data.toString();
      process.stdout.write(`[ffmpeg] ${output}`);
      logFfmpeg(`[stderr] ${output.trim()}`);

      if (!totalDurationSec) {
        const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/i);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseInt(durationMatch[3], 10);
          const msStr = durationMatch[4] || "0";
          const ms = parseFloat("0." + msStr);
          totalDurationSec = hours * 3600 + minutes * 60 + seconds + ms;
          console.log(`[ffmpeg] Parsed total duration: ${totalDurationSec}s`);
          logFfmpeg(`Parsed total duration: ${totalDurationSec}s`);
        }
      }

      const timeMatch = output.match(/time=\s*(-?\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/i);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseInt(timeMatch[3], 10);
        const msStr = timeMatch[4] || "0";
        const ms = parseFloat("0." + msStr);
        const currentSec = Math.abs(hours) * 3600 + minutes * 60 + seconds + ms;

        if (totalDurationSec > 0) {
          const percent = Math.min(99, Math.round((currentSec / totalDurationSec) * 100));
          if (win && !win.isDestroyed()) {
            win.webContents.send("session:video-progress", { progress: percent });
          }
        }
      }
    });

    ffmpeg.on("close", (code: number) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      let finalPath = mp4Path;

      if (code !== 0) {
        console.error(`[ffmpeg] Conversion failed after ${duration}s with exit code ${code}`);
        logFfmpeg(`Conversion failed after ${duration}s with exit code ${code}`);
        finalPath = webmPath;
      } else {
        console.log(`[ffmpeg] Conversion succeeded in ${duration}s`);
        logFfmpeg(`Conversion succeeded in ${duration}s`);
        try { fs.unlinkSync(webmPath); } catch {}
      }

      if (win && !win.isDestroyed()) {
        win.webContents.send("session:video-progress", { progress: 100 });
        win.webContents.send("session:video-saved", { filepath: finalPath });
      }
    });

    ffmpeg.on("error", (spawnError: any) => {
      console.error(`[ffmpeg] Failed to start conversion:`, spawnError);
      logFfmpeg(`Failed to start conversion error: ${spawnError?.message || spawnError}`);
      if (win && !win.isDestroyed()) {
        win.webContents.send("session:video-saved", { filepath: webmPath });
      }
    });
  } catch (spawnErr: any) {
    console.error(`[ffmpeg] spawn() threw:`, spawnErr);
    logFfmpeg(`spawn() threw error: ${spawnErr?.message || spawnErr}`);
    if (win && !win.isDestroyed()) {
      win.webContents.send("session:video-saved", { filepath: webmPath });
    }
  }
}

async function bootstrap() {
  let win: BrowserWindow;
  const db = new DatabaseManager();
  await db.init();

  const server = new LocalServer();
  server.onVideoUpload((upload: VideoUpload) => {
    convertToMp4(win, upload.webmPath, upload.mp4Path, 0);
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
    const { desktopCapturer, dialog } = require("electron");
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen"] });

      if (sources.length === 1) {
        callback({ video: sources[0] });
        return;
      }

      const buttons = sources.map(s => `${s.name}`);
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

    if (event.type === "tab.connected") {
      db.updateSessionTab(sessionId, event.tabId, event.url);
    }

    if (event.type === "screenshot.captured") {
      const { fileId, dataUrl } = event;
      if (dataUrl) {
        try {
          const fs = require("fs");
          const path = require("path");
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
          const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
          if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
          }
          const filepath = path.join(screenshotsDir, `${fileId}.png`);
          fs.writeFileSync(filepath, base64Data, "base64");
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

