import type { BrowserEvent } from "@testerbuddy/protocol";

export function redactValue(el: HTMLInputElement): string {
  if (el.type === "password") return "[redacted]";
  return el.value.slice(0, 80);
}

export class PageBridge {
  send(event: BrowserEvent) {
    try {
      chrome.runtime.sendMessage({ source: "testerbuddy:event", event }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.warn("[TesterBuddy] Failed to send content event", event.type, error.message);
        }
      });
    } catch (error) {
      console.warn("[TesterBuddy] Content bridge unavailable", event.type, error);
    }
  }
}
