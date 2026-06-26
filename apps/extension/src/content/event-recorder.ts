import {
  EVENT_NAVIGATION, EVENT_USER_CLICK, EVENT_USER_INPUT,
} from "@testerbuddy/protocol";
import type { BrowserEvent } from "@testerbuddy/protocol";
import { getSelector } from "./dom-inspector";
import type { PageBridge } from "./page-bridge";
import { redactValue } from "./page-bridge";

export class EventRecorder {
  private lastSpaNavigation = 0;

  constructor(private bridge: PageBridge) {
    // Track SPA navigations from injected script's history hooks
    window.addEventListener("__testerbuddy__", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === EVENT_NAVIGATION && detail?.navigationType === "spa") {
        this.lastSpaNavigation = Date.now();
      }
    });
  }

  private sendNavigation(navigationType: "spa" | "reload" | "back_forward" | "new", to: string, from?: string) {
    const event: BrowserEvent = {
      type: EVENT_NAVIGATION,
      from: from || document.referrer || window.location.href,
      to: to || location.href,
      navigationType,
      title: document.title,
      referrer: document.referrer || undefined,
    };
    this.bridge.send(event);
  }

  start() {
    document.addEventListener("click", (e) => {
      const el = e.target as HTMLElement;
      const event: BrowserEvent = {
        type: EVENT_USER_CLICK,
        selector: getSelector(el),
        text: el.textContent?.trim().slice(0, 100),
        x: e.clientX,
        y: e.clientY,
      };
      this.bridge.send(event);
    }, { capture: true, passive: true });

    document.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      if (el.type === "password") return;
      const event: BrowserEvent = {
        type: EVENT_USER_INPUT,
        selector: getSelector(el),
        valuePreview: redactValue(el),
      };
      this.bridge.send(event);
    }, { capture: true, passive: true });

    // SPA navigation via popstate / hashchange
    window.addEventListener("popstate", () => {
      const isBackForward = (Date.now() - this.lastSpaNavigation) > 500;
      this.sendNavigation(isBackForward ? "back_forward" : "spa", location.href);
    });
    window.addEventListener("hashchange", () => this.sendNavigation("spa", location.href));

    // Full page navigation via PerformanceNavigationTiming
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const nav = entry as PerformanceNavigationTiming;
            if (nav.type === "navigate" || nav.type === "reload" || nav.type === "back_forward") {
              const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
              const from = nav.domContentLoadedEventStart && navEntry
                ? navEntry.name || ""
                : "";
              const navType = nav.type === "back_forward" ? "back_forward" : nav.type === "reload" ? "reload" : "new";
              this.sendNavigation(navType, nav.name, from);
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
