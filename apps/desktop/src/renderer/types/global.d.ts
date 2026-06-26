export {};

declare global {
  interface Window {
    testerbuddy?: {
      getPairingToken: () => Promise<string>;
      getConnectionCount: () => Promise<number>;
      getSessions: () => Promise<unknown[]>;
      getEvents: (sessionId: string) => Promise<{ ts: number; event: unknown }[]>;
      captureScreenshot: () => Promise<void>;
      saveBugReport: (report: unknown) => Promise<void>;
      getBugReports: () => Promise<unknown[]>;
      deleteBugReport: (id: string) => Promise<void>;
      exportBug: (report: unknown) => Promise<{ success: boolean; filePath?: string }>;
      saveVideo: (buffer: Uint8Array, meta: { tabId: string; projectId: string; ticketId: string }) => Promise<string>;
      revealFile: (filepath: string) => Promise<void>;
      onVideoSaved: (cb: (payload: { filepath: string }) => void) => (() => void);
      onVideoProgress: (cb: (payload: { progress: number }) => void) => (() => void);
      onEvent: (cb: (payload: unknown) => void) => (() => void);
      onConnectionChange: (cb: (count: number) => void) => (() => void);
    };
  }
}
