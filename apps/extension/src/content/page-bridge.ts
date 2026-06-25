import type { BrowserEvent } from "@testerbuddy/protocol";

export function redactValue(el: HTMLInputElement): string {
  if (el.type === "password") return "[redacted]";
  return el.value.slice(0, 80);
}

export class PageBridge {
  send(event: Omit<BrowserEvent, never>) {
    try {
      chrome.runtime.sendMessage({ source: "testerbuddy:event", event });
    } catch {
      // Extension reloaded — context invalidated, ignore until tab refreshes
    }
  }
}
