import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../main/ipc/channels";

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
  startVideo: (meta: { projectId: string; ticketId: string }) => ipcRenderer.invoke(IPC.START_VIDEO, meta),
  stopVideo: () => ipcRenderer.invoke(IPC.STOP_VIDEO),
  onVideoSaved: (cb: (payload: { filepath: string }) => void) => {
    const subscription = (_e: any, payload: { filepath: string }) => cb(payload);
    ipcRenderer.on("session:video-saved", subscription);
    return () => {
      ipcRenderer.removeListener("session:video-saved", subscription);
    };
  },
  onVideoProgress: (cb: (payload: { progress: number }) => void) => {
    const subscription = (_e: any, payload: { progress: number }) => cb(payload);
    ipcRenderer.on("session:video-progress", subscription);
    return () => {
      ipcRenderer.removeListener("session:video-progress", subscription);
    };
  },
  onVideoWaiting: (cb: () => void) => {
    const subscription = () => cb();
    ipcRenderer.on("session:video-waiting", subscription);
    return () => {
      ipcRenderer.removeListener("session:video-waiting", subscription);
    };
  },
  onVideoRecording: (cb: (payload: any) => void) => {
    const subscription = (_e: any, payload: any) => cb(payload);
    ipcRenderer.on("session:video-recording", subscription);
    return () => {
      ipcRenderer.removeListener("session:video-recording", subscription);
    };
  },
  onEvent: (cb: (payload: unknown) => void) => {
    const subscription = (_e: any, payload: unknown) => cb(payload);
    ipcRenderer.on("session:event", subscription);
    return () => {
      ipcRenderer.removeListener("session:event", subscription);
    };
  },
  onConnectionChange: (cb: (count: number) => void) => {
    const subscription = (_e: any, { count }: { count: number }) => cb(count);
    ipcRenderer.on("bridge:connection-change", subscription);
    return () => {
      ipcRenderer.removeListener("bridge:connection-change", subscription);
    };
  },
});
