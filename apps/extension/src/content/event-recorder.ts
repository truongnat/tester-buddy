import type { PageBridge } from "./page-bridge";
import { getSelector } from "./dom-inspector";
import { redactValue } from "./page-bridge";

export class EventRecorder {
  constructor(private bridge: PageBridge) {}

  start() {
    document.addEventListener("click", (e) => {
      const el = e.target as HTMLElement;
      this.bridge.send({
        type: "user.click",
        selector: getSelector(el),
        text: el.textContent?.trim().slice(0, 100),
        x: e.clientX,
        y: e.clientY,
      });
    }, { capture: true, passive: true });

    document.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      if (el.type === "password") return; // never record passwords
      this.bridge.send({
        type: "user.input",
        selector: getSelector(el),
        valuePreview: redactValue(el),
      });
    }, { capture: true, passive: true });

    const nav = (type: string) => (e: Event) => {
      this.bridge.send({ type: "navigation", from: document.referrer, to: location.href });
    };
    window.addEventListener("popstate", nav("popstate"));
    window.addEventListener("hashchange", nav("hashchange"));
  }
}
