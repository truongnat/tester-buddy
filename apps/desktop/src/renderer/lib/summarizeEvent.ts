import type { BrowserEvent } from "@testerbuddy/protocol";

export function summarizeEvent(event: BrowserEvent): string {
  switch (event.type) {
    case "user.click":
      return `Click ${event.text ? `"${event.text}"` : event.selector}`;
    case "user.input":
      return `Type "${event.valuePreview}" on ${event.selector}`;
    case "navigation":
      return `Navigate to ${event.to}`;
    case "console.log":
      return event.level === "error" ? event.message : `[${event.level}] ${event.message}`;
    case "network.request":
      return `${event.method} ${event.url}`;
    case "network.response":
      return `${event.status} response in ${event.durationMs}ms`;
    case "tab.connected":
      return `Connected ${event.title || event.url}`;
    case "tab.updated":
      return `Updated ${event.title || event.url}`;
    case "tab.switched":
      return `Switched to ${event.title || event.url || `tab #${event.tabId}`}`;
    case "tab.closed":
      return `Closed tab #${event.tabId}`;
    case "screenshot.captured":
      return "Screenshot captured";
    case "dom.snapshot":
      return `DOM snapshot for ${event.title}`;
    case "dom.highlighted":
      return `Highlighted ${event.selector}`;
    default:
      return "Unknown event";
  }
}
