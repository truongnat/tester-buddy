import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../main/ipc/channels";

function createListener<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.removeListener(channel, handler); };
  };
}

contextBridge.exposeInMainWorld("testerbuddy", {
  getPairingToken: () => ipcRenderer.invoke(IPC.GET_PAIRING_TOKEN),
  getConnectionCount: () => ipcRenderer.invoke(IPC.GET_CONNECTION_COUNT),
  getSessions: () => ipcRenderer.invoke(IPC.GET_SESSIONS),
  getEvents: (sessionId: string) => ipcRenderer.invoke(IPC.GET_EVENTS, sessionId),
  captureScreenshot: () => ipcRenderer.invoke(IPC.CAPTURE_SCREENSHOT),
  saveBugReport: (report: any) => ipcRenderer.invoke(IPC.SAVE_BUG_REPORT, report),
  getBugReports: () => ipcRenderer.invoke(IPC.GET_BUG_REPORTS),
  deleteBugReport: (id: string) => ipcRenderer.invoke(IPC.DELETE_BUG_REPORT, id),
  exportBug: (report: any) => ipcRenderer.invoke(IPC.EXPORT_BUG, report),
  saveVideo: (buffer: Uint8Array, meta: any) => ipcRenderer.invoke(IPC.SAVE_VIDEO, buffer, meta),
  revealFile: (filepath: string) => ipcRenderer.invoke(IPC.REVEAL_FILE, filepath),
  onVideoSaved: createListener<{ filepath: string }>("session:video-saved"),
  onVideoProgress: createListener<{ progress: number }>("session:video-progress"),
  onEvent: createListener<unknown>("session:event"),
  onConnectionChange: createListener<number>("bridge:connection-change"),
});
