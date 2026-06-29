import type { BrowserEvent } from "@testerbuddy/protocol";

export function redactValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLElement): string {
  if (el instanceof HTMLInputElement && el.type === "password") return "[redacted]";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value.slice(0, 80);
  }
  if (el.isContentEditable) {
    return (el.textContent || "").slice(0, 80);
  }
  return "";
}

export class PageBridge {
  send(event: BrowserEvent) {
    try {
      console.log("[trace:content->runtime] sending event", {
        type: event.type,
        tabId: "tabId" in event ? event.tabId : undefined,
      });
      chrome.runtime.sendMessage({ source: "testerbuddy:event", event }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.warn("[TesterBuddy] Failed to send content event", event.type, error.message);
        } else {
          console.log("[trace:content->runtime] delivered event", event.type);
        }
      });
    } catch (error) {
      console.warn("[TesterBuddy] Content bridge unavailable", event.type, error);
    }
  }
}
