import { COMMAND_CAPTURE_VISIBLE_TAB } from "@testerbuddy/protocol";
import type { BrowserEvent, BrowserCommand } from "@testerbuddy/protocol";
import { ipcMain, BrowserWindow, app, dialog, shell } from "electron";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { cleanName } from "@testerbuddy/shared";
import { IPC } from "./channels";
import type { WebSocketHub } from "../bridge/websocket-hub";
import type { PairingService } from "../bridge/pairing.service";
import type {
  DatabaseManager,
  BugReportRecord,
  BugReportUpsert,
  ActiveCaptureContext,
  MediaRecord,
} from "../db/database";
import { convertToMp4 } from "../ffmpeg-converter";
import { AgentCommandService } from "../agent/agent-command.service";
import { BrowserControlService } from "../agent/browser-control.service";
import { AgentRunnerService } from "../agent/agent-runner.service";
import { exportToGitHub, exportToJira, type GitHubExportConfig, type JiraExportConfig } from "../issue-export.service";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, "\\$&");
}

function summarizeEvent(event: BrowserEvent): string {
  switch (event.type) {
    case "user.click":
      return `Click ${event.text ? `\"${event.text}\"` : event.selector}`;
    case "user.input":
      return `Type \"${event.valuePreview}\" on ${event.selector}`;
    case "navigation":
      return `Navigate to ${event.to}`;
    case "console.log":
      return `${event.level.toUpperCase()}: ${event.message}`;
    case "network.request":
      return `${event.method} ${event.url}`;
    case "network.response":
      return `${event.status} response`;
    case "screenshot.captured":
      return "Screenshot captured";
    case "tab.connected":
      return `Tab connected: ${event.title ?? event.url}`;
    case "tab.updated":
      return `Tab updated: ${event.title ?? event.url}`;
    case "tab.switched":
      return `Tab switched: ${event.title ?? String(event.tabId)}`;
    case "tab.closed":
      return `Tab closed #${event.tabId}`;
    default:
      return "unknown";
  }
}

function getEvidence(report: BugReportRecord) {
  const evidence = report.evidence ?? [];
  const screenshots = evidence.filter((item) => item.kind === "screenshot");
  const videos = evidence.filter((item) => item.kind === "video");
  return { evidence, screenshots, videos };
}

function formatContext(report: BugReportRecord, db: DatabaseManager) {
  const project = report.projectId ? db.getProject(report.projectId) : null;
  const ticket = report.ticketId ? db.getTicket(report.ticketId) : null;
  return {
    project,
    ticket,
    lines: [
      project ? `Project: ${project.name} (${project.key})` : null,
      ticket ? `Ticket: ${ticket.title} (${ticket.code})` : null,
      ticket?.externalUrl ? `External Ticket: ${ticket.externalUrl}` : null,
    ].filter(Boolean) as string[],
  };
}

function buildMarkdown(report: BugReportRecord, db: DatabaseManager) {
  const { screenshots, videos } = getEvidence(report);
  const context = formatContext(report, db);
  const lines: string[] = [];
  lines.push(`# ${report.title || "Untitled Bug"}`);
  lines.push("");
  lines.push(`**Severity:** ${report.severity.toUpperCase()}`);
  lines.push(`**Created At:** ${new Date(report.createdAt).toLocaleString()}`);
  if (context.lines.length > 0) {
    lines.push(...context.lines.map((line) => `**${line.split(":")[0]}:** ${line.slice(line.indexOf(":") + 2)}`));
  }
  lines.push("");

  if (report.description?.trim()) {
    lines.push("## Description");
    lines.push(report.description.trim());
    lines.push("");
  }

  lines.push("## Steps to Reproduce");
  if (report.stepsToReproduce.trim()) {
    lines.push(report.stepsToReproduce.trim());
    lines.push("");
  }
  if (report.steps.length > 0) {
    lines.push("### Linked Timeline Events");
    report.steps.forEach((step, index) => {
      const summary = `${summarizeEvent(step.event)}${step.ts ? ` (${new Date(step.ts).toLocaleString()})` : ""}`;
      lines.push(`${index + 1}. ${escapeMarkdown(summary)}`);
    });
    lines.push("");
  }

  if (report.expectedResult?.trim()) {
    lines.push("## Expected Result");
    lines.push(report.expectedResult.trim());
    lines.push("");
  }

  if (report.actualResult?.trim()) {
    lines.push("## Actual Result");
    lines.push(report.actualResult.trim());
    lines.push("");
  }

  if (screenshots.length > 0) {
    lines.push("## Attached Screenshots");
    screenshots.forEach((item, index) => lines.push(`- Screenshot ${index + 1}: ${item.filepath}`));
    lines.push("");
  } else if (report.screenshots.length > 0) {
    lines.push("## Attached Screenshots");
    report.screenshots.forEach((src, index) => lines.push(`- Screenshot ${index + 1}: ${src}`));
    lines.push("");
  }

  if (videos.length > 0) {
    lines.push("## Attached Video");
    videos.forEach((item) => lines.push(`- ${item.filepath}`));
    lines.push("");
  } else if (report.video) {
    lines.push("## Attached Video");
    lines.push(`- ${report.video}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildHtml(report: BugReportRecord, db: DatabaseManager) {
  const { screenshots, videos } = getEvidence(report);
  const context = formatContext(report, db);
  const contextBlock = context.lines.length > 0
    ? `<div class="meta">${context.lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>`
    : "";
  const screenshotBlocks = screenshots.length > 0
    ? screenshots.map((item, index) => `
      <figure class="screenshot">
        <figcaption>Screenshot ${index + 1}</figcaption>
        <div class="path">${escapeHtml(item.filepath)}</div>
      </figure>`).join("")
    : report.screenshots.length > 0
      ? report.screenshots.map((src, index) => `
      <figure class="screenshot">
        <figcaption>Screenshot ${index + 1}</figcaption>
        <div class="path">${escapeHtml(src)}</div>
      </figure>`).join("")
      : `<div class="muted">No screenshots attached.</div>`;

  const videoBlock = videos.length > 0
    ? videos.map((item) => `<p><a href="file:///${escapeHtml(item.filepath.replace(/\\/g, "/"))}">${escapeHtml(item.filepath)}</a></p>`).join("")
    : report.video
      ? `<p><a href="file:///${escapeHtml(report.video.replace(/\\/g, "/"))}">${escapeHtml(report.video)}</a></p>`
      : `<div class="muted">No video evidence attached.</div>`;

  const stepBlocks = report.steps.length > 0
    ? report.steps.map((step, index) => `
      <li>
        <div class="step-index">${index + 1}</div>
        <div class="step-body">
          <div class="step-summary">${escapeHtml(summarizeEvent(step.event))}</div>
          <div class="step-meta">${escapeHtml(new Date(step.ts).toLocaleString())}</div>
        </div>
      </li>`).join("")
    : `<li class="muted">No structured steps captured.</li>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.title || "Bug Report")}</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 0; padding: 32px; background: #f5f7f8; color: #182024; }
    .card { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #d9e1e4; border-radius: 18px; padding: 28px; }
    h1 { margin: 0 0 12px; font-size: 30px; }
    h2 { margin: 28px 0 12px; font-size: 18px; }
    p, li { line-height: 1.5; }
    .meta { display: flex; gap: 12px; flex-wrap: wrap; color: #687378; font-size: 14px; margin-bottom: 12px; }
    .pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px; background: #edf2f4; border: 1px solid #d9e1e4; font-weight: 600; }
    .steps, .screenshots { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
    .steps li { display: grid; grid-template-columns: 36px 1fr; gap: 12px; align-items: start; padding: 12px; border: 1px solid #d9e1e4; border-radius: 14px; background: #fdfefe; }
    .step-index { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: #0f9f8f; color: #fff; font-weight: 700; }
    .step-summary { font-weight: 600; }
    .step-meta, .path { color: #687378; font-size: 12px; margin-top: 4px; word-break: break-all; }
    .muted { color: #687378; background: #edf2f4; padding: 12px; border-radius: 12px; border: 1px dashed #d9e1e4; }
    .screenshot { margin: 0; padding: 12px; border: 1px solid #d9e1e4; border-radius: 14px; background: #fff; }
    pre { white-space: pre-wrap; word-break: break-word; background: #f5f7f8; border: 1px solid #d9e1e4; padding: 14px; border-radius: 14px; }
    a { color: #0f9f8f; }
  </style>
</head>
<body>
  <article class="card">
    <h1>${escapeHtml(report.title || "Untitled Bug")}</h1>
    <div class="meta">
      <span class="pill">Severity: ${escapeHtml(report.severity.toUpperCase())}</span>
      <span>Created: ${escapeHtml(new Date(report.createdAt).toLocaleString())}</span>
    </div>
    ${contextBlock}
    ${report.description?.trim() ? `<section><h2>Description</h2><p>${escapeHtml(report.description.trim())}</p></section>` : ""}
    <section>
      <h2>Steps to Reproduce</h2>
      ${report.stepsToReproduce.trim() ? `<pre>${escapeHtml(report.stepsToReproduce.trim())}</pre>` : `<div class="muted">No written reproduction steps.</div>`}
      ${report.steps.length > 0 ? `<h3>Linked Timeline Events</h3><ol class="steps">${stepBlocks}</ol>` : ""}
    </section>
    ${report.expectedResult?.trim() ? `<section><h2>Expected Result</h2><p>${escapeHtml(report.expectedResult.trim())}</p></section>` : ""}
    ${report.actualResult?.trim() ? `<section><h2>Actual Result</h2><p>${escapeHtml(report.actualResult.trim())}</p></section>` : ""}
    <section>
      <h2>Evidence</h2>
      <div class="screenshots">${screenshotBlocks}</div>
      <h3>Video</h3>
      ${videoBlock}
    </section>
  </article>
</body>
</html>`;
}

function exportPathAndContent(report: BugReportRecord, db: DatabaseManager, format: "markdown" | "html") {
  const content = format === "html" ? buildHtml(report, db) : buildMarkdown(report, db);
  const extension = format === "html" ? "html" : "md";
  return {
    content,
    defaultPath: `bug-report-${report.id || Date.now()}.${extension}`,
    filters: format === "html"
      ? [{ name: "HTML", extensions: ["html"] }, { name: "All Files", extensions: ["*"] }]
      : [{ name: "Markdown", extensions: ["md"] }, { name: "All Files", extensions: ["*"] }],
  };
}

function hydrateReport(db: DatabaseManager, report: BugReportRecord) {
  if (report.evidence && report.evidence.length > 0) return report;
  if (report.mediaIds.length === 0) return report;
  return { ...report, evidence: db.getMedia({ ids: report.mediaIds }) };
}

function getMediaDirectory(db: DatabaseManager, context: ActiveCaptureContext) {
  const project = db.getProject(context.projectId);
  const ticket = db.getTicket(context.ticketId);
  if (!project || !ticket) {
    throw new Error("Active project/ticket no longer exists.");
  }

  return {
    project,
    ticket,
    dir: join(
      app.getPath("documents"),
      "TesterBuddy",
      "Project",
      cleanName(project.key || project.id),
      "Ticket",
      cleanName(ticket.code || ticket.id),
      "media"
    ),
  };
}

async function exportBugReport(
  win: BrowserWindow,
  report: BugReportRecord,
  format: string,
  options: unknown,
  db: DatabaseManager
): Promise<{ success: boolean; filePath?: string; issueUrl?: string; reason?: string }> {
  const hydrated = hydrateReport(db, report);

  if (format === "jira") {
    const result = await exportToJira(hydrated, options as JiraExportConfig);
    if (!result.success) return { success: false, reason: result.reason };
    return { success: true, issueUrl: result.issueUrl };
  }

  if (format === "github") {
    const result = await exportToGitHub(hydrated, options as GitHubExportConfig);
    if (!result.success) return { success: false, reason: result.reason };
    return { success: true, issueUrl: result.issueUrl };
  }

  const { content, defaultPath, filters } = exportPathAndContent(hydrated, db, format === "html" ? "html" : "markdown");
  const { filePath } = await dialog.showSaveDialog(win, {
    title: format === "html" ? "Export Bug Report as HTML" : "Export Bug Report",
    defaultPath,
    filters,
  });

  if (!filePath) return { success: false };
  writeFileSync(filePath, content, "utf-8");
  return { success: true, filePath };
}

export function registerIpcHandlers(
  hub: WebSocketHub,
  pairing: PairingService,
  win: BrowserWindow,
  db: DatabaseManager
) {
  const agentCommands = new AgentCommandService();
  const browserControl = new BrowserControlService(hub);
  const agentRunner = new AgentRunnerService(agentCommands, browserControl);

  ipcMain.handle(IPC.GET_PAIRING_TOKEN, () => pairing.getToken());
  ipcMain.handle(IPC.GET_CONNECTION_COUNT, () => hub.registry.connectionCount);
  ipcMain.handle(IPC.GET_SESSIONS, () => db.getSessions());
  ipcMain.handle(IPC.GET_EVENTS, (_e, sessionId: string) => db.getEvents(sessionId).map((ev) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data);
    } catch {
      parsed = { raw: ev.data };
    }
    return { id: ev.id, ts: ev.timestamp, event: parsed };
  }));

  ipcMain.handle(IPC.GET_ACTIVE_CAPTURE_CONTEXT, () => db.getActiveCaptureContext());
  ipcMain.handle(IPC.SET_ACTIVE_CAPTURE_CONTEXT, (_e, context: ActiveCaptureContext | null) => {
    db.setActiveCaptureContext(context);
    return db.getActiveCaptureContext();
  });

  ipcMain.handle(IPC.CAPTURE_SCREENSHOT, (_e, context?: ActiveCaptureContext) => {
    const nextContext = context ?? db.getActiveCaptureContext();
    if (!nextContext?.projectId || !nextContext?.ticketId) {
      throw new Error("Select an active project and ticket before capturing evidence.");
    }
    db.setActiveCaptureContext(nextContext);
    const sessions = hub.registry.getAllSessions();
    if (sessions.length === 0) {
      throw new Error("No live browser session connected.");
    }
    sessions.sort((a, b) => b.connectedAt.getTime() - a.connectedAt.getTime());
    hub.send(sessions[0].id, { type: COMMAND_CAPTURE_VISIBLE_TAB });
    return { ok: true };
  });

  ipcMain.handle(IPC.SAVE_BUG_REPORT, (_e, report: BugReportUpsert) => db.insertBugReport(report));
  ipcMain.handle(IPC.GET_BUG_REPORTS, (_e, filters?: { projectId?: string; ticketId?: string }) => db.getBugReports(filters));
  ipcMain.handle(IPC.DELETE_BUG_REPORT, (_e, id: string) => db.deleteBugReport(id));

  ipcMain.handle(IPC.GET_PROJECTS, () => db.getProjects());
  ipcMain.handle(IPC.CREATE_PROJECT, (_e, input) => db.createProject(input));
  ipcMain.handle(IPC.UPDATE_PROJECT, (_e, id: string, input) => db.updateProject(id, input));
  ipcMain.handle(IPC.DELETE_PROJECT, (_e, id: string) => db.deleteProject(id));

  ipcMain.handle(IPC.GET_TICKETS, (_e, projectId?: string) => db.getTickets(projectId));
  ipcMain.handle(IPC.CREATE_TICKET, (_e, input) => db.createTicket(input));
  ipcMain.handle(IPC.UPDATE_TICKET, (_e, id: string, input) => db.updateTicket(id, input));
  ipcMain.handle(IPC.DELETE_TICKET, (_e, id: string) => db.deleteTicket(id));

  ipcMain.handle(IPC.GET_MEDIA, (_e, filters?: { ids?: string[]; projectId?: string; ticketId?: string; bugId?: string }) => db.getMedia(filters));
  ipcMain.handle(IPC.ATTACH_MEDIA_TO_BUG, (_e, mediaId: string, bugId: string) => db.attachMediaToBug(mediaId, bugId));
  ipcMain.handle(IPC.DETACH_MEDIA_FROM_BUG, (_e, mediaId: string, bugId?: string) => db.detachMediaFromBug(mediaId, bugId));

  ipcMain.handle(IPC.SAVE_VIDEO, async (_e, arrayBuffer: Uint8Array, meta: ActiveCaptureContext & { tabId: string }) => {
    if (!meta.projectId || !meta.ticketId) {
      throw new Error("Select an active project and ticket before recording video.");
    }
    db.setActiveCaptureContext({ projectId: meta.projectId, ticketId: meta.ticketId });
    const storage = getMediaDirectory(db, meta);
    if (!existsSync(storage.dir)) {
      mkdirSync(storage.dir, { recursive: true });
    }

    const stamp = Date.now();
    const baseName = `video-${stamp}-${cleanName(meta.tabId || "tab")}`;
    const webmPath = join(storage.dir, `${baseName}.webm`);
    const mp4Path = join(storage.dir, `${baseName}.mp4`);
    writeFileSync(webmPath, Buffer.from(arrayBuffer));
    const finalPath = await convertToMp4(webmPath, mp4Path);
    const media = db.createMedia({
      projectId: meta.projectId,
      ticketId: meta.ticketId,
      kind: "video",
      filepath: finalPath,
      sourceSessionId: undefined,
      sourceEventId: undefined,
      thumbnailPath: undefined,
      bugId: undefined,
    });
    return { filepath: finalPath, media };
  });

  ipcMain.handle(IPC.SEND_COMMAND, (_e, command: BrowserCommand) => browserControl.sendToLatestSession(command));
  ipcMain.handle(IPC.EXECUTE_AGENT_COMMAND, (_e, input: unknown) => agentRunner.run(input));
  ipcMain.handle(IPC.EXPORT_BUG, (_e, report: BugReportRecord, format: string = "markdown", options: unknown = undefined) => {
    return exportBugReport(win, report, format, options, db);
  });
  ipcMain.handle(IPC.REVEAL_FILE, (_e, filepath: string) => shell.showItemInFolder(filepath));

  hub.registry.onConnectionChange((count: number) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.BRIDGE_CONNECTION_CHANGE, count);
    }
  });
}
