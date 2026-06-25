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
      } as any);
    }, { capture: true, passive: true });

    document.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      if (el.type === "password") return;
      this.bridge.send({
        type: "user.input",
        selector: getSelector(el),
        valuePreview: redactValue(el),
      } as any);
    }, { capture: true, passive: true });

    // SPA navigation via popstate / hashchange
    window.addEventListener("popstate", () => {
      this.bridge.send({
        type: "navigation",
        from: document.referrer || window.location.href,
        to: location.href,
        navigationType: "spa",
        title: document.title,
        referrer: document.referrer || undefined,
      } as any);
    });

    window.addEventListener("hashchange", () => {
      this.bridge.send({
        type: "navigation",
        from: document.referrer || window.location.href,
        to: location.href,
        navigationType: "spa",
        title: document.title,
        referrer: document.referrer || undefined,
      } as any);
    });

    // Full page navigation via PerformanceNavigationTiming
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const nav = entry as PerformanceNavigationTiming;
            if (nav.type === "navigate" || nav.type === "reload" || nav.type === "back_forward") {
              this.bridge.send({
                type: "navigation",
                from: nav.domContentLoadedEventStart
                  ? (performance.getEntriesByType("navigation")[0] as any)?.name || ""
                  : "",
                to: nav.name || location.href,
                navigationType: nav.type === "back_forward" ? "back_forward" : nav.type === "reload" ? "reload" : "new",
                title: document.title,
                referrer: document.referrer || undefined,
              } as any);
            }
          }
        });
        observer.observe({ type: "navigation", buffered: true });
      } catch {
        // PerformanceObserver may not be available in all contexts
      }
    }
  }
}
