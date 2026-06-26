import type { BrowserCommand, BrowserEvent } from "@testerbuddy/protocol";
import { getSelector } from "./dom-inspector";
import { PageBridge } from "./page-bridge";

const COMMAND_CLICK = "click";
const COMMAND_GET_PAGE_CONTEXT = "get.pageContext";
const COMMAND_HIGHLIGHT_ELEMENT = "highlight.element";
const COMMAND_READ_DOM = "read.dom";
const COMMAND_TYPE = "type";
const EVENT_DOM_HIGHLIGHTED = "dom.highlighted";
const EVENT_DOM_SNAPSHOT = "dom.snapshot";
const MAX_DEPTH = 5;
const MAX_NODES = 240;
const MAX_TEXT = 100;

function isInteractive(el: Element) {
  const tag = el.tagName.toLowerCase();
  return ["button", "a", "input", "textarea", "select", "option"].includes(tag) || el.getAttribute("role") === "button";
}

function textPreview(el: Element) {
  const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
  return txt ? txt.slice(0, MAX_TEXT) : undefined;
}

function elementAttributes(el: Element) {
  const attrs: Record<string, string> = {};
  for (const name of ["id", "class", "name", "role", "aria-label", "href", "type", "placeholder", "data-testid"]) {
    const value = el.getAttribute(name);
    if (value) attrs[name] = value;
  }
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function collectNodes(root: Element) {
  const nodes: Array<{
    depth: number;
    selector: string;
    tagName: string;
    text?: string;
    attributes?: Record<string, string>;
    childCount?: number;
    interactive?: boolean;
    truncated?: boolean;
  }> = [];

  const walk = (el: Element, depth: number) => {
    if (nodes.length >= MAX_NODES || depth > MAX_DEPTH) {
      return;
    }

    nodes.push({
      depth,
      selector: getSelector(el as HTMLElement),
      tagName: el.tagName.toLowerCase(),
      text: textPreview(el),
      attributes: elementAttributes(el),
      childCount: el.children.length,
      interactive: isInteractive(el),
      truncated: el.children.length > 0 && depth === MAX_DEPTH,
    });

    if (depth === MAX_DEPTH) return;
    Array.from(el.children).forEach((child) => walk(child, depth + 1));
  };

  walk(root, 0);
  return nodes;
}

function normalizeSelector(selector: string) {
  return selector.trim().replace(/^['"`]|['"`]$/g, "");
}

function textValue(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function tryQuerySelector(selector: string): HTMLElement | null {
  try {
    return document.querySelector(selector) as HTMLElement | null;
  } catch {
    return null;
  }
}

function resolveByHeuristics(selector: string): HTMLElement | null {
  const normalized = normalizeSelector(selector);
  if (!normalized) return null;

  const direct = tryQuerySelector(normalized);
  if (direct) return direct;

  const withoutHash = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  const byId = document.getElementById(withoutHash);
  if (byId) return byId as HTMLElement;

  const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
  const wanted = textValue(normalized);

  const exact = all.find((el) => {
    const attrs = [
      el.getAttribute("data-testid"),
      el.getAttribute("aria-label"),
      el.getAttribute("name"),
      el.getAttribute("placeholder"),
      el.id,
      textPreview(el),
    ];
    return attrs.some((attr) => textValue(attr) === wanted);
  });
  if (exact) return exact;

  const textMatch = all.find((el) => textValue(textPreview(el) ?? "").includes(wanted));
  if (textMatch) return textMatch;

  const attrMatch = all.find((el) => {
    return [el.getAttribute("data-testid"), el.getAttribute("aria-label"), el.getAttribute("name"), el.getAttribute("placeholder")]
      .some((attr) => textValue(attr).includes(wanted));
  });
  return attrMatch ?? null;
}

function resolveElement(selector?: string, fallbackToBody = true) {
  if (!selector) return fallbackToBody ? document.body : null;
  return resolveByHeuristics(selector) ?? (fallbackToBody ? document.body : null);
}

function buildSnapshot(selector?: string): BrowserEvent {
  const root = resolveElement(selector) ?? document.body;
  return {
    type: EVENT_DOM_SNAPSHOT,
    selector,
    url: location.href,
    title: document.title,
    nodes: collectNodes(root),
  };
}

function ensureHighlightOverlay() {
  let overlay = document.getElementById("testerbuddy-highlight-overlay") as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "testerbuddy-highlight-overlay";
    overlay.style.position = "fixed";
    overlay.style.zIndex = "2147483647";
    overlay.style.pointerEvents = "none";
    overlay.style.border = "2px solid #0F9F8F";
    overlay.style.borderRadius = "8px";
    overlay.style.boxShadow = "0 0 0 9999px rgba(15,159,143,0.08)";
    overlay.style.transition = "all 120ms ease";
    document.documentElement.appendChild(overlay);
  }
  return overlay;
}

function highlightSelector(selector: string) {
  const el = resolveElement(selector, false);
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const overlay = ensureHighlightOverlay();
  overlay.style.left = `${Math.max(0, rect.left + window.scrollX)}px`;
  overlay.style.top = `${Math.max(0, rect.top + window.scrollY)}px`;
  overlay.style.width = `${Math.max(0, rect.width)}px`;
  overlay.style.height = `${Math.max(0, rect.height)}px`;
  overlay.style.display = "block";
  el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  window.setTimeout(() => {
    overlay?.remove();
  }, 1400);
  return true;
}

function clickSelector(selector: string) {
  const el = resolveElement(selector, false);
  if (!el) return false;
  el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  el.click();
  return true;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
}

function typeSelector(selector: string, text: string) {
  const el = resolveElement(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
  if (!el) return false;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    setNativeValue(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    el.focus();
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}

export function handleCommand(cmd: BrowserCommand, bridge: PageBridge) {
  switch (cmd.type) {
    case COMMAND_READ_DOM: {
      bridge.send(buildSnapshot(cmd.selector));
      return { ok: true };
    }
    case COMMAND_GET_PAGE_CONTEXT: {
      bridge.send(buildSnapshot());
      return { ok: true };
    }
    case COMMAND_HIGHLIGHT_ELEMENT: {
      const ok = highlightSelector(cmd.selector);
      const event: BrowserEvent = { type: EVENT_DOM_HIGHLIGHTED, selector: cmd.selector, ok };
      bridge.send(event);
      return { ok };
    }
    case COMMAND_CLICK:
      return { ok: clickSelector(cmd.selector) };
    case COMMAND_TYPE:
      return { ok: typeSelector(cmd.selector, cmd.text) };
    default:
      return { ok: false };
  }
}




