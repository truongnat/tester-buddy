export type HttpHeader = { name: string; value: string };

export type BrowserEvent =
  | { type: "tab.connected"; tabId: number; url: string; title: string }
  | { type: "tab.updated"; tabId: number; url: string; title: string }
  | { type: "tab.switched"; tabId: number; previousTabId?: number }
  | { type: "tab.closed"; tabId: number }
  | { type: "user.click"; selector: string; text?: string; x: number; y: number }
  | { type: "user.input"; selector: string; valuePreview: string }
  | { type: "navigation"; from: string; to: string; navigationType?: "reload" | "back_forward" | "new" | "spa"; title?: string; referrer?: string }
  | { type: "console.log"; level: "log" | "warn" | "error" | "info" | "debug" | "trace"; message: string; stack?: string; timestamp: number }
  | { type: "network.request"; requestId: string; method: string; url: string; requestHeaders?: HttpHeader[]; requestBody?: string; queryParams?: Record<string, string>; mimeType?: string }
  | { type: "network.response"; requestId: string; status: number; statusText?: string; durationMs: number; responseHeaders?: HttpHeader[]; responseBody?: string; contentType?: string; size?: number; errorType?: "timeout" | "abort" | "cors" | "network-error" }
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
