export {};

declare global {
  interface Window {
    testerbuddy?: {
      getPairingToken: () => Promise<string>;
      getConnectionCount: () => Promise<number>;
      getSessions: () => Promise<unknown[]>;
      getEvents: (sessionId: string) => Promise<{ id?: string; ts: number; event: unknown; media?: unknown }[]>;
      getActiveCaptureContext: () => Promise<{ projectId: string; ticketId: string } | null>;
      setActiveCaptureContext: (context: { projectId: string; ticketId: string } | null) => Promise<{ projectId: string; ticketId: string } | null>;
      captureScreenshot: (context?: { projectId: string; ticketId: string }) => Promise<unknown>;
      saveBugReport: (report: unknown) => Promise<unknown>;
      getBugReports: (filters?: { projectId?: string; ticketId?: string }) => Promise<unknown[]>;
      deleteBugReport: (id: string) => Promise<void>;
      exportBug: (report: unknown, format?: "markdown" | "html" | "jira" | "github", options?: unknown) => Promise<{ success: boolean; filePath?: string; issueUrl?: string; reason?: string }>;
      getProjects: () => Promise<unknown[]>;
      createProject: (input: unknown) => Promise<unknown>;
      updateProject: (id: string, input: unknown) => Promise<unknown>;
      deleteProject: (id: string) => Promise<void>;
      getTickets: (projectId?: string) => Promise<unknown[]>;
      createTicket: (input: unknown) => Promise<unknown>;
      updateTicket: (id: string, input: unknown) => Promise<unknown>;
      deleteTicket: (id: string) => Promise<void>;
      getMedia: (filters?: { ids?: string[]; projectId?: string; ticketId?: string; bugId?: string }) => Promise<unknown[]>;
      attachMediaToBug: (mediaId: string, bugId: string) => Promise<void>;
      detachMediaFromBug: (mediaId: string, bugId?: string) => Promise<void>;
      sendCommand: (cmd: unknown) => Promise<unknown>;
      executeAgentCommand: (input: unknown) => Promise<unknown>;
      readDom: (selector?: string) => Promise<unknown>;
      highlightElement: (selector: string) => Promise<unknown>;
      clickElement: (selector: string) => Promise<unknown>;
      typeElement: (selector: string, text: string) => Promise<unknown>;
      saveVideo: (buffer: Uint8Array, meta: { tabId: string; projectId: string; ticketId: string }) => Promise<{ filepath: string; media: unknown }>;
      revealFile: (filepath: string) => Promise<void>;
      onVideoSaved: (cb: (payload: { filepath: string }) => void) => (() => void);
      onVideoProgress: (cb: (payload: { progress: number }) => void) => (() => void);
      onEvent: (cb: (payload: unknown) => void) => (() => void);
      onConnectionChange: (cb: (count: number) => void) => (() => void);
    };
  }
}
