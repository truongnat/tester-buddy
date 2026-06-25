export {};

declare global {
  interface Window {
    testerbuddy?: {
      getPairingToken: () => Promise<string>;
      getConnectionCount: () => Promise<number>;
      getSessions: () => Promise<any[]>;
      getEvents: (sessionId: string) => Promise<any[]>;
      captureScreenshot: () => Promise<void>;
      saveBugReport: (report: any) => Promise<void>;
      getBugReports: () => Promise<any[]>;
      deleteBugReport: (id: string) => Promise<void>;
      exportBug: (report: any) => Promise<{ success: boolean; filePath?: string }>;
      saveVideo: (buffer: Uint8Array, meta: { tabId: string; projectId: string; ticketId: string }) => Promise<string>;
      revealFile: (filepath: string) => Promise<void>;
      onVideoSaved: (cb: (payload: { filepath: string }) => void) => (() => void);
      onVideoProgress: (cb: (payload: { progress: number }) => void) => (() => void);
      onEvent: (cb: (payload: any) => void) => (() => void);
      onConnectionChange: (cb: (count: number) => void) => (() => void);
    };
  }
}
