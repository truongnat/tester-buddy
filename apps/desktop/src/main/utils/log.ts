import { app } from "electron";
import { join } from "path";
import {
  existsSync,
  writeFileSync,
  appendFileSync,
  statSync,
  renameSync,
} from "fs";

try {
  const logFilePath = join(app.getPath("userData"), "main.log");
  const MAX_LOG_SIZE = 1024 * 1024;
  try {
    if (existsSync(logFilePath) && statSync(logFilePath).size > MAX_LOG_SIZE) {
      renameSync(logFilePath, `${logFilePath}-${Date.now()}.old`);
    }
  } catch {}
  writeFileSync(logFilePath, "--- APP START ---\n");

  const logRedirect = (type: string, ...args: any[]) => {
    const msg = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
    appendFileSync(
      logFilePath,
      `[${new Date().toISOString()}] [${type}] ${msg}\n`,
    );
  };

  console.log = (...args) => logRedirect("INFO", ...args);
  console.error = (...args) => logRedirect("ERROR", ...args);
} catch {}
