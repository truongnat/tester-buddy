export type BrowserEvent =
  | { type: "tab.connected"; tabId: number; url: string; title: string }
  | { type: "user.click"; selector: string; text?: string; x: number; y: number }
  | { type: "user.input"; selector: string; valuePreview: string }
  | { type: "navigation"; from: string; to: string }
  | { type: "console.error"; message: string; stack?: string }
  | { type: "network.request"; requestId: string; method: string; url: string }
  | { type: "network.response"; requestId: string; status: number; durationMs: number }
  | { type: "screenshot.captured"; fileId: string; dataUrl?: string };

export type BrowserCommand =
  | { type: "capture.visibleTab" }
  | { type: "highlight.element"; selector: string }
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; text: string }
  | { type: "read.dom"; selector?: string }
  | { type: "get.pageContext" };

export type WsMessage =
  | { direction: "event"; payload: BrowserEvent }
  | { direction: "command"; payload: BrowserCommand };
