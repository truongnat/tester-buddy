import { ipcRenderer } from "electron";

export function createListener<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}
