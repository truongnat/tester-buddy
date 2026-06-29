import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../main/ipc/channels";
import type { BrowserCommand } from "@testerbuddy/protocol";
import type {
  ActiveCaptureContext,
  BugReportRecord,
  BugReportUpsert,
  MediaRecord,
  ProjectRecord,
  TicketRecord,
} from "../main/db/database";

type BugExportFormat = "markdown" | "html" | "jira" | "github";

function createListener<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

contextBridge.exposeInMainWorld("testerbuddy", {
  getPairingToken: () => ipcRenderer.invoke(IPC.GET_PAIRING_TOKEN) as Promise<string>,
  getConnectionCount: () => ipcRenderer.invoke(IPC.GET_CONNECTION_COUNT) as Promise<number>,
  getSessions: () => ipcRenderer.invoke(IPC.GET_SESSIONS),
  getEvents: (sessionId: string) => ipcRenderer.invoke(IPC.GET_EVENTS, sessionId),
  getActiveCaptureContext: () => ipcRenderer.invoke(IPC.GET_ACTIVE_CAPTURE_CONTEXT) as Promise<ActiveCaptureContext | null>,
  setActiveCaptureContext: (context: ActiveCaptureContext | null) => ipcRenderer.invoke(IPC.SET_ACTIVE_CAPTURE_CONTEXT, context) as Promise<ActiveCaptureContext | null>,
  captureScreenshot: (context?: ActiveCaptureContext) => ipcRenderer.invoke(IPC.CAPTURE_SCREENSHOT, context),
  saveBugReport: (report: BugReportUpsert) => ipcRenderer.invoke(IPC.SAVE_BUG_REPORT, report) as Promise<BugReportRecord | null>,
  getBugReports: (filters?: { projectId?: string; ticketId?: string }) => ipcRenderer.invoke(IPC.GET_BUG_REPORTS, filters) as Promise<BugReportRecord[]>,
  deleteBugReport: (id: string) => ipcRenderer.invoke(IPC.DELETE_BUG_REPORT, id),
  generateBugDraft: (input: unknown) => ipcRenderer.invoke(IPC.GENERATE_BUG_DRAFT, input),
  exportBug: (report: BugReportRecord, format?: BugExportFormat, options?: unknown) => ipcRenderer.invoke(IPC.EXPORT_BUG, report, format, options),
  getSecureConfig: (key: string) => ipcRenderer.invoke(IPC.GET_SECURE_CONFIG, key),
  setSecureConfig: (key: string, value: unknown) => ipcRenderer.invoke(IPC.SET_SECURE_CONFIG, key, value),
  getProjects: () => ipcRenderer.invoke(IPC.GET_PROJECTS) as Promise<ProjectRecord[]>,
  createProject: (input: Pick<ProjectRecord, "name" | "key" | "url" | "description">) => ipcRenderer.invoke(IPC.CREATE_PROJECT, input) as Promise<ProjectRecord | null>,
  updateProject: (id: string, input: Partial<Pick<ProjectRecord, "name" | "key" | "url" | "description">>) => ipcRenderer.invoke(IPC.UPDATE_PROJECT, id, input) as Promise<ProjectRecord | null>,
  deleteProject: (id: string) => ipcRenderer.invoke(IPC.DELETE_PROJECT, id),
  getTickets: (projectId?: string) => ipcRenderer.invoke(IPC.GET_TICKETS, projectId) as Promise<TicketRecord[]>,
  createTicket: (input: Pick<TicketRecord, "projectId" | "code" | "title" | "description" | "status" | "externalUrl">) => ipcRenderer.invoke(IPC.CREATE_TICKET, input) as Promise<TicketRecord | null>,
  updateTicket: (id: string, input: Partial<Pick<TicketRecord, "code" | "title" | "description" | "status" | "externalUrl">>) => ipcRenderer.invoke(IPC.UPDATE_TICKET, id, input) as Promise<TicketRecord | null>,
  deleteTicket: (id: string) => ipcRenderer.invoke(IPC.DELETE_TICKET, id),
  getMedia: (filters?: { ids?: string[]; projectId?: string; ticketId?: string; bugId?: string }) => ipcRenderer.invoke(IPC.GET_MEDIA, filters) as Promise<MediaRecord[]>,
  attachMediaToBug: (mediaId: string, bugId: string) => ipcRenderer.invoke(IPC.ATTACH_MEDIA_TO_BUG, mediaId, bugId),
  detachMediaFromBug: (mediaId: string, bugId?: string) => ipcRenderer.invoke(IPC.DETACH_MEDIA_FROM_BUG, mediaId, bugId),
  sendCommand: (cmd: BrowserCommand) => ipcRenderer.invoke(IPC.SEND_COMMAND, cmd),
  executeAgentCommand: (input: unknown) => ipcRenderer.invoke(IPC.EXECUTE_AGENT_COMMAND, input),
  saveVideo: (buffer: Uint8Array, meta: ActiveCaptureContext & { tabId: string }) => ipcRenderer.invoke(IPC.SAVE_VIDEO, buffer, meta) as Promise<{ filepath: string; media: MediaRecord | null }>,
  revealFile: (filepath: string) => ipcRenderer.invoke(IPC.REVEAL_FILE, filepath),
  readImageFile: (filepath: string) => ipcRenderer.invoke(IPC.READ_IMAGE_FILE, filepath) as Promise<{ bytes: Uint8Array; mimeType: string } | null>,
  readImageAsDataUrl: async (filepath: string) => {
    const payload = await ipcRenderer.invoke(IPC.READ_IMAGE_FILE, filepath) as { bytes: Uint8Array; mimeType: string } | null;
    if (!payload) return null;
    const bytes = new Uint8Array(payload.bytes.byteLength);
    bytes.set(payload.bytes);
    const chunkSize = 0x8000;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return `data:${payload.mimeType};base64,${btoa(binary)}`;
  },
  onVideoSaved: createListener<{ filepath: string }>(IPC.SESSION_VIDEO_SAVED),
  onVideoProgress: createListener<{ progress: number }>(IPC.SESSION_VIDEO_PROGRESS),
  onEvent: createListener<unknown>(IPC.SESSION_EVENT),
  onConnectionChange: createListener<number>(IPC.BRIDGE_CONNECTION_CHANGE),
});
