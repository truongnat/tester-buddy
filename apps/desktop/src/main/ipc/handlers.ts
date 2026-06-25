import { ipcMain, BrowserWindow, app, dialog, shell } from "electron";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { IPC } from "./channels";
import type { WebSocketHub } from "../bridge/websocket-hub";
import type { PairingService } from "../bridge/pairing.service";
import type { DatabaseManager } from "../db/database";
import { convertToMp4 } from "../ffmpeg-converter";

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

  ipcMain.handle(IPC.SAVE_VIDEO, async (_e, arrayBuffer: Uint8Array, meta: { tabId: string; projectId: string; ticketId: string }) => {
    const { tabId, projectId, ticketId } = meta;
    const documentsDir = app.getPath("documents");
    
    const cleanName = (s: string) => String(s || "unknown").replace(/:/g, "_");
    const folderName = `${cleanName(tabId)}_${cleanName(projectId)}_${cleanName(ticketId)}`;
    const targetDir = join(documentsDir, "TesterBuddy", folderName);

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const webmPath = join(targetDir, "video.webm");
    const mp4Path = join(targetDir, "video.mp4");

    writeFileSync(webmPath, Buffer.from(arrayBuffer));

    return convertToMp4(webmPath, mp4Path);
  });

  ipcMain.handle(IPC.EXPORT_BUG, async (_e, report: any) => {

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

      writeFileSync(filePath, md, "utf-8");
      return { success: true, filePath };
    }

    return { success: false };
  });

  ipcMain.handle(IPC.REVEAL_FILE, (_e, filepath: string) => {
    shell.showItemInFolder(filepath);
  });

  hub.registry.onConnectionChange((count: number) => {
    if (!win.isDestroyed()) {
      win.webContents.send("bridge:connection-change", count);
    }
  });
}

