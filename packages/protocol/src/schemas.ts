import { z } from "zod";
import {
  EVENT_TAB_CONNECTED, EVENT_TAB_UPDATED, EVENT_TAB_SWITCHED, EVENT_TAB_CLOSED,
  EVENT_USER_CLICK, EVENT_USER_INPUT, EVENT_NAVIGATION, EVENT_CONSOLE_LOG,
  EVENT_NETWORK_REQUEST, EVENT_NETWORK_RESPONSE, EVENT_SCREENSHOT_CAPTURED, EVENT_DOM_SNAPSHOT, EVENT_DOM_HIGHLIGHTED,
  COMMAND_CAPTURE_VISIBLE_TAB, COMMAND_HIGHLIGHT_ELEMENT, COMMAND_CLICK,
  COMMAND_TYPE, COMMAND_READ_DOM, COMMAND_GET_PAGE_CONTEXT,
} from "./constants";

const base = z.object({
  type: z.string(),
  tabId: z.number().optional(),
  tabUrl: z.string().optional(),
  tabTitle: z.string().optional(),
});
export const HttpHeaderSchema = z.object({ name: z.string(), value: z.string() });

export const BrowserEventSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal(EVENT_TAB_CONNECTED), tabId: z.number(), url: z.string(), title: z.string() }),
  base.extend({ type: z.literal(EVENT_TAB_UPDATED), tabId: z.number(), url: z.string(), title: z.string() }),
  base.extend({ type: z.literal(EVENT_TAB_SWITCHED), tabId: z.number(), previousTabId: z.number().optional(), url: z.string(), title: z.string() }),
  base.extend({ type: z.literal(EVENT_TAB_CLOSED), tabId: z.number() }),
  base.extend({ type: z.literal(EVENT_USER_CLICK), selector: z.string(), text: z.string().optional(), x: z.number(), y: z.number() }),
  base.extend({ type: z.literal(EVENT_USER_INPUT), selector: z.string(), valuePreview: z.string() }),
  base.extend({ type: z.literal(EVENT_NAVIGATION), from: z.string(), to: z.string(), navigationType: z.enum(["reload", "back_forward", "new", "spa"]).optional(), title: z.string().optional(), referrer: z.string().optional() }),
  base.extend({ type: z.literal(EVENT_CONSOLE_LOG), level: z.enum(["log", "warn", "error", "info", "debug", "trace"]), message: z.string(), stack: z.string().optional(), timestamp: z.number() }),
  base.extend({ type: z.literal(EVENT_NETWORK_REQUEST), requestId: z.string(), method: z.string(), url: z.string(), requestHeaders: z.array(HttpHeaderSchema).optional(), requestBody: z.string().optional(), queryParams: z.record(z.string()).optional(), mimeType: z.string().optional() }),
  base.extend({ type: z.literal(EVENT_NETWORK_RESPONSE), requestId: z.string(), status: z.number(), statusText: z.string().optional(), durationMs: z.number(), responseHeaders: z.array(HttpHeaderSchema).optional(), responseBody: z.string().optional(), contentType: z.string().optional(), size: z.number().optional(), errorType: z.enum(["timeout", "abort", "cors", "network-error"]).optional() }),
  base.extend({
    type: z.literal(EVENT_SCREENSHOT_CAPTURED),
    fileId: z.string(),
    dataUrl: z.string().optional(),
    filepath: z.string().optional(),
  }),
  base.extend({ type: z.literal(EVENT_DOM_HIGHLIGHTED), selector: z.string(), ok: z.boolean().default(true) }),
  base.extend({
    type: z.literal(EVENT_DOM_SNAPSHOT),
    selector: z.string().optional(),
    url: z.string(),
    title: z.string(),
    nodes: z.array(z.object({
      depth: z.number(),
      selector: z.string(),
      tagName: z.string(),
      text: z.string().optional(),
      attributes: z.record(z.string()).optional(),
      childCount: z.number().optional(),
      interactive: z.boolean().optional(),
      truncated: z.boolean().optional(),
    })),
  }),
]);

export const BrowserCommandSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal(COMMAND_CAPTURE_VISIBLE_TAB) }),
  base.extend({ type: z.literal(COMMAND_HIGHLIGHT_ELEMENT), selector: z.string() }),
  base.extend({ type: z.literal(COMMAND_CLICK), selector: z.string() }),
  base.extend({ type: z.literal(COMMAND_TYPE), selector: z.string(), text: z.string() }),
  base.extend({ type: z.literal(COMMAND_READ_DOM), selector: z.string().optional() }),
  base.extend({ type: z.literal(COMMAND_GET_PAGE_CONTEXT) }),
]);
