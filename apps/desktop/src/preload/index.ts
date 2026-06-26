import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../main/ipc/channels";
import type { BugReportRecord } from "../main/db/database";

function createListener<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.removeListener(channel, handler); };
  };
}

contextBridge.exposeInMainWorld("testerbuddy", {
  getPairingToken: () => ipcRenderer.invoke(IPC.GET_PAIRING_TOKEN) as Promise<string>,
  getConnectionCount: () => ipcRenderer.invoke(IPC.GET_CONNECTION_COUNT) as Promise<number>,
  getSessions: () => ipcRenderer.invoke(IPC.GET_SESSIONS),
  getEvents: (sessionId: string) => ipcRenderer.invoke(IPC.GET_EVENTS, sessionId),
  captureScreenshot: () => ipcRenderer.invoke(IPC.CAPTURE_SCREENSHOT),
  saveBugReport: (report: Omit<BugReportRecord, "createdAt">) => ipcRenderer.invoke(IPC.SAVE_BUG_REPORT, report),
  getBugReports: () => ipcRenderer.invoke(IPC.GET_BUG_REPORTS),
  deleteBugReport: (id: string) => ipcRenderer.invoke(IPC.DELETE_BUG_REPORT, id),
  exportBug: (report: BugReportRecord) => ipcRenderer.invoke(IPC.EXPORT_BUG, report),
  saveVideo: (buffer: Uint8Array, meta: { tabId: string; projectId: string; ticketId: string }) => ipcRenderer.invoke(IPC.SAVE_VIDEO, buffer, meta),
  revealFile: (filepath: string) => ipcRenderer.invoke(IPC.REVEAL_FILE, filepath),
  onVideoSaved: createListener<{ filepath: string }>(IPC.SESSION_VIDEO_SAVED),
  onVideoProgress: createListener<{ progress: number }>(IPC.SESSION_VIDEO_PROGRESS),
  onEvent: createListener<unknown>(IPC.SESSION_EVENT),
  onConnectionChange: createListener<number>(IPC.BRIDGE_CONNECTION_CHANGE),
});
