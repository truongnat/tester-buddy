import {
  safeParseBrowserCommand,
  COMMAND_CLICK,
  COMMAND_GET_PAGE_CONTEXT,
  COMMAND_HIGHLIGHT_ELEMENT,
  COMMAND_READ_DOM,
  COMMAND_TYPE,
} from "@testerbuddy/protocol";
import type { BrowserCommand } from "@testerbuddy/protocol";

export type AgentCommandInput =
  | BrowserCommand
  | BrowserCommand[]
  | string
  | {
      action?: string;
      type?: string;
      selector?: string;
      text?: string;
      input?: string;
      command?: string;
    }
  | Array<unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeArray(input: unknown[]): BrowserCommand[] | null {
  const commands: BrowserCommand[] = [];

  for (const item of input) {
    const normalized = normalizeInput(item);
    if (!normalized) {
      return null;
    }
    if (Array.isArray(normalized)) {
      commands.push(...normalized);
    } else {
      commands.push(normalized);
    }
  }

  return commands;
}

function fromObject(input: Record<string, unknown>): BrowserCommand | null {
  const type = String(input.type || input.action || input.command || "");
  const selector =
    typeof input.selector === "string" ? input.selector : undefined;
  const text =
    typeof input.text === "string"
      ? input.text
      : typeof input.input === "string"
        ? input.input
        : undefined;

  switch (type) {
    case COMMAND_READ_DOM:
    case "readDom":
      return selector
        ? { type: COMMAND_READ_DOM, selector }
        : { type: COMMAND_GET_PAGE_CONTEXT };
    case COMMAND_GET_PAGE_CONTEXT:
    case "getPageContext":
    case "pageContext":
      return { type: COMMAND_GET_PAGE_CONTEXT };
    case COMMAND_HIGHLIGHT_ELEMENT:
    case "highlight":
      return selector ? { type: COMMAND_HIGHLIGHT_ELEMENT, selector } : null;
    case COMMAND_CLICK:
    case "click":
      return selector ? { type: COMMAND_CLICK, selector } : null;
    case COMMAND_TYPE:
    case "type":
      return selector && typeof text === "string"
        ? { type: COMMAND_TYPE, selector, text }
        : null;
    default:
      return null;
  }
}

function fromString(raw: string): BrowserCommand | BrowserCommand[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 && !line.startsWith("#") && !line.startsWith("//"),
    );

  if (lines.length > 1) {
    const commands: BrowserCommand[] = [];
    for (const line of lines) {
      const command = fromString(line);
      if (!command) {
        return null;
      }
      if (Array.isArray(command)) {
        commands.push(...command);
      } else {
        commands.push(command);
      }
    }
    return commands;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const result = safeParseBrowserCommand(parsed);
    if (result.success) return result.data;
    if (Array.isArray(parsed)) return normalizeArray(parsed);
    if (isPlainObject(parsed)) return fromObject(parsed);
  } catch {
    // Fall through to the lightweight text parser below.
  }

  const normalized = trimmed.replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();

  if (lower.startsWith("read-dom")) {
    const selector = normalized.slice("read-dom".length).trim();
    return selector
      ? { type: COMMAND_READ_DOM, selector }
      : { type: COMMAND_GET_PAGE_CONTEXT };
  }

  if (lower.startsWith("highlight ")) {
    const selector = normalized.slice("highlight ".length).trim();
    if (selector) return { type: COMMAND_HIGHLIGHT_ELEMENT, selector };
  }

  if (lower.startsWith("click ")) {
    const selector = normalized.slice("click ".length).trim();
    if (selector) return { type: COMMAND_CLICK, selector };
  }

  if (lower.startsWith("type ")) {
    const rest = normalized.slice("type ".length).trim();
    const selectorMatch = rest.match(/^(\S+)\s+(.*)$/);
    if (selectorMatch && selectorMatch[1] && selectorMatch[2]) {
      return {
        type: COMMAND_TYPE,
        selector: selectorMatch[1],
        text: selectorMatch[2],
      };
    }
  }

  if (lower === "page-context" || lower === "context") {
    return { type: COMMAND_GET_PAGE_CONTEXT };
  }

  return null;
}

function normalizeInput(
  input: unknown,
): BrowserCommand | BrowserCommand[] | null {
  const direct = safeParseBrowserCommand(input);
  if (direct.success) return direct.data;

  if (Array.isArray(input)) {
    return normalizeArray(input);
  }

  if (typeof input === "string") return fromString(input);
  if (isPlainObject(input)) return fromObject(input);
  return null;
}

export class AgentCommandService {
  normalize(input: unknown): BrowserCommand | BrowserCommand[] | null {
    return normalizeInput(input);
  }
}
