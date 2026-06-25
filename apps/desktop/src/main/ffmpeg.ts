import { app } from "electron";
import { join } from "path";
import { existsSync, appendFileSync } from "fs";

const FILENAME = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

let logFile: string | null = null;
function ensureLogFile() {
  if (!logFile) {
    try {
      logFile = join(app.getPath("userData"), "ffmpeg-debug.log");
    } catch {}
  }
}
export function log(msg: string) {
  ensureLogFile();
  if (logFile) {
    try {
      appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    } catch {}
  }
}

function getDevPath(): string {
  const distMain = __dirname;
  const projectRoot = join(distMain, "..", "..");
  return join(projectRoot, "resources", FILENAME);
}

export function getFfmpegPath(): string {
  log(`app.isPackaged: ${app.isPackaged}`);
  log(`resourcesPath: ${process.resourcesPath}`);
  log(`__dirname: ${__dirname}`);

  if (app.isPackaged) {
    const productionPath = join(process.resourcesPath, FILENAME);
    log(`productionPath: ${productionPath} exists: ${existsSync(productionPath)}`);
    if (existsSync(productionPath)) {
      return productionPath;
    }
    log("falling back to system PATH (ffmpeg)");
    return "ffmpeg";
  }

  const devPath = getDevPath();
  log(`devPath: ${devPath} exists: ${existsSync(devPath)}`);
  if (existsSync(devPath)) {
    return devPath;
  }

  log("falling back to system PATH (ffmpeg)");
  return "ffmpeg";
}
