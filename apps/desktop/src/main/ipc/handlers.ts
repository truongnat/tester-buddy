import { ipcMain, BrowserWindow } from "electron";
import { IPC } from "./channels";
import type { WebSocketHub } from "../bridge/websocket-hub";
import type { PairingService } from "../bridge/pairing.service";
import type { DatabaseManager } from "../db/database";
import { getFfmpegPath } from "../ffmpeg";

export function registerIpcHandlers(
  hub: WebSocketHub,
  pairing: PairingService,
  win: BrowserWindow,
  db: DatabaseManager
) {
  ipcMain.handle(IPC.GET_PAIRING_TOKEN, () => pairing.getToken());

  ipcMain.handle(IPC.GET_CONNECTION_COUNT, () =>
    (hub.registry as any).sessions.size
  );

  ipcMain.handle(IPC.GET_SESSIONS, () => db.getSessions());

  ipcMain.handle(IPC.GET_EVENTS, (_e, sessionId: string) => {
    const events = db.getEvents(sessionId);
    return events.map((ev) => ({
      ts: ev.timestamp,
      event: JSON.parse(ev.data),
    }));
  });

  ipcMain.handle(IPC.CAPTURE_SCREENSHOT, () => {
    const sessions = Array.from((hub.registry as any).sessions.values());
    if (sessions.length > 0) {
      // Sort sessions by connection time (most recent first) to avoid sending commands to stale connections
      sessions.sort((a: any, b: any) => b.connectedAt.getTime() - a.connectedAt.getTime());
      hub.send((sessions[0] as any).id, { type: "capture.visibleTab" });
    }
  });

  ipcMain.handle(IPC.SAVE_BUG_REPORT, (_e, report: any) => {
    return db.insertBugReport(report);
  });

  ipcMain.handle(IPC.GET_BUG_REPORTS, () => {
    return db.getBugReports();
  });

  ipcMain.handle(IPC.DELETE_BUG_REPORT, (_e, id: string) => {
    return db.deleteBugReport(id);
  });

  ipcMain.handle(IPC.SAVE_VIDEO, (_e, arrayBuffer: Uint8Array, meta: { tabId: string; projectId: string; ticketId: string }) => {
    const fs = require("fs");
    const path = require("path");
    const { app } = require("electron");
    const { exec } = require("child_process");

    const { tabId, projectId, ticketId } = meta;
    const documentsDir = app.getPath("documents");
    
    // Replace illegal Windows folder characters like colons with underscores
    const cleanTabId = String(tabId || "unknown").replace(/:/g, "_");
    const cleanProjectId = String(projectId || "unknown").replace(/:/g, "_");
    const cleanTicketId = String(ticketId || "unknown").replace(/:/g, "_");

    const folderName = `${cleanTabId}_${cleanProjectId}_${cleanTicketId}`;
    const targetDir = path.join(documentsDir, "TesterBuddy", folderName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const webmPath = path.join(targetDir, "video.webm");
    const mp4Path = path.join(targetDir, "video.mp4");

    // Write raw WebM first
    fs.writeFileSync(webmPath, Buffer.from(arrayBuffer));

    console.log(`[ffmpeg] Starting manual save conversion of ${webmPath} to ${mp4Path}...`);
    const startTime = Date.now();
    return new Promise((resolve) => {
      // Execute ffmpeg conversion
      exec(`"${getFfmpegPath()}" -y -i "${webmPath}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${mp4Path}"`, (error: any, stdout: string, stderr: string) => {
        console.log(`[ffmpeg] stdout:\n${stdout}`);
        console.log(`[ffmpeg] stderr:\n${stderr}`);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        if (error) {
          console.error(`[ffmpeg] Conversion failed after ${duration}s or ffmpeg not in PATH. Error:`, error);
          resolve(webmPath);
        } else {
          console.log(`[ffmpeg] Conversion succeeded in ${duration}s`);
          // Cleanup webm upon successful conversion to mp4
          try {
            fs.unlinkSync(webmPath);
          } catch (e) {}
          resolve(mp4Path);
        }
      });
    });
  });

  ipcMain.handle(IPC.EXPORT_BUG, async (_e, report: any) => {
    const { dialog } = require("electron");
    const fs = require("fs");

    const { filePath } = await dialog.showSaveDialog(win, {
      title: "Export Bug Report",
      defaultPath: `bug-report-${report.id || Date.now()}.md`,
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (filePath) {
      let md = `# ${report.title}\n\n`;
      md += `**Severity:** ${report.severity.toUpperCase()}\n`;
      if (report.createdAt) {
        md += `**Created At:** ${new Date(report.createdAt).toLocaleString()}\n`;
      }
      md += `\n`;

      if (report.description) {
        md += `## Description\n${report.description}\n\n`;
      }

      md += `## Steps to Reproduce\n${report.stepsToReproduce}\n\n`;

      if (report.expectedResult) {
        md += `## Expected Result\n${report.expectedResult}\n\n`;
      }

      if (report.actualResult) {
        md += `## Actual Result\n${report.actualResult}\n\n`;
      }

      if (report.screenshots && report.screenshots.length > 0) {
        md += `## Screenshots\n`;
        report.screenshots.forEach((src: string, index: number) => {
          // If screenshot is a base64 data url, we can embed it directly or reference it.
          // Since it's Markdown, standard markdown processors handle base64 data URLs in img tags perfectly!
          // We can use both standard Markdown image or HTML tag. HTML tag is safer for long base64.
          if (src.startsWith("data:image/")) {
            md += `### Screenshot ${index + 1}\n`;
            md += `<img src="${src}" alt="Screenshot ${index + 1}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 4px;" />\n\n`;
          } else {
            md += `- ![Screenshot ${index + 1}](${src})\n`;
          }
        });
      }
      if (report.video) {
        md += `## Video Evidence\n`;
        md += `- [Session Video File](file:///${report.video.replace(/\\/g, "/")})\n\n`;
      }

      fs.writeFileSync(filePath, md, "utf-8");
      return { success: true, filePath };
    }

    return { success: false };
  });

  ipcMain.handle(IPC.REVEAL_FILE, (_e, filepath: string) => {
    const { shell } = require("electron");
    shell.showItemInFolder(filepath);
  });

  ipcMain.handle(IPC.START_VIDEO, (_e, meta: { projectId: string; ticketId: string }) => {
    const sessions = Array.from((hub.registry as any).sessions.values());
    if (sessions.length > 0) {
      sessions.sort((a: any, b: any) => b.connectedAt.getTime() - a.connectedAt.getTime());
      hub.send((sessions[0] as any).id, {
        type: "video.request",
        projectId: meta.projectId,
        ticketId: meta.ticketId
      });
    }
  });

  ipcMain.handle(IPC.STOP_VIDEO, () => {
    const sessions = Array.from((hub.registry as any).sessions.values());
    if (sessions.length > 0) {
      sessions.sort((a: any, b: any) => b.connectedAt.getTime() - a.connectedAt.getTime());
      hub.send((sessions[0] as any).id, { type: "video.stop" });
    }
  });

  hub.registry.onConnectionChange((count: number) => {
    if (!win.isDestroyed()) {
      win.webContents.send("bridge:connection-change", { count });
    }
  });
}

