import type { BrowserEvent } from "@testerbuddy/protocol";
import { getSelector } from "./dom-inspector";
import type { PageBridge } from "./page-bridge";
import { redactValue } from "./page-bridge";

const EVENT_NAVIGATION = "navigation";
const EVENT_USER_CLICK = "user.click";
const EVENT_USER_INPUT = "user.input";

export class EventRecorder {
  private lastSpaNavigation = 0;
  private active = false;

  constructor(private bridge: PageBridge, private channel: string) {
    // Track SPA navigations from injected script's history hooks.
    window.addEventListener(this.channel, (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === EVENT_NAVIGATION && detail?.navigationType === "spa") {
        this.lastSpaNavigation = Date.now();
      }
    });
  }

  private sendNavigation(navigationType: "spa" | "reload" | "back_forward" | "new", to: string, from?: string) {
    if (!this.active) return;
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
      if (!this.active) return;
      const el = e.target;
      const event: BrowserEvent = {
        type: EVENT_USER_CLICK,
        selector: getSelector(el),
        text: el instanceof Node ? el.textContent?.trim().slice(0, 100) : undefined,
        x: e.clientX,
        y: e.clientY,
      };
      this.bridge.send(event);
    }, { capture: true, passive: true });

    document.addEventListener("input", (e) => {
      if (!this.active) return;
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (el instanceof HTMLInputElement && el.type === "password") return;
      const event: BrowserEvent = {
        type: EVENT_USER_INPUT,
        selector: getSelector(el),
        valuePreview: redactValue(el),
      };
      this.bridge.send(event);
    }, { capture: true, passive: true });

    window.addEventListener("popstate", () => {
      const isBackForward = (Date.now() - this.lastSpaNavigation) > 500;
      this.sendNavigation(isBackForward ? "back_forward" : "spa", location.href);
    });
    window.addEventListener("hashchange", () => this.sendNavigation("spa", location.href));

    if (typeof PerformanceObserver !== "undefined") {
      try {
        const observer = new PerformanceObserver((list) => {
          if (!this.active) return;
          for (const entry of list.getEntries()) {
            const nav = entry as PerformanceNavigationTiming;
            if (nav.type === "navigate" || nav.type === "reload" || nav.type === "back_forward") {
              const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
              const from = nav.domContentLoadedEventStart && navEntry ? navEntry.name || "" : "";
              const navType = nav.type === "back_forward" ? "back_forward" : nav.type === "reload" ? "reload" : "new";
              this.sendNavigation(navType, nav.name, from);
            }
          }
        });
        observer.observe({ type: "navigation", buffered: true });
      } catch {
        // PerformanceObserver may not be available in all contexts.
      }
    }
  }

  setActive(active: boolean) {
    this.active = active;
  }
}
