import { z } from "zod";

const base = z.object({ type: z.string() });
export const HttpHeaderSchema = z.object({ name: z.string(), value: z.string() });

export const BrowserEventSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("tab.connected"), tabId: z.number(), url: z.string(), title: z.string() }),
  base.extend({ type: z.literal("tab.updated"), tabId: z.number(), url: z.string(), title: z.string() }),
  base.extend({ type: z.literal("tab.switched"), tabId: z.number(), previousTabId: z.number().optional() }),
  base.extend({ type: z.literal("tab.closed"), tabId: z.number() }),
  base.extend({ type: z.literal("user.click"), selector: z.string(), text: z.string().optional(), x: z.number(), y: z.number() }),
  base.extend({ type: z.literal("user.input"), selector: z.string(), valuePreview: z.string() }),
  base.extend({ type: z.literal("navigation"), from: z.string(), to: z.string(), navigationType: z.enum(["reload", "back_forward", "new", "spa"]).optional(), title: z.string().optional(), referrer: z.string().optional() }),
  base.extend({ type: z.literal("console.log"), level: z.enum(["log", "warn", "error", "info", "debug", "trace"]), message: z.string(), stack: z.string().optional(), timestamp: z.number() }),
  base.extend({ type: z.literal("network.request"), requestId: z.string(), method: z.string(), url: z.string(), requestHeaders: z.array(HttpHeaderSchema).optional(), requestBody: z.string().optional(), queryParams: z.record(z.string()).optional(), mimeType: z.string().optional() }),
  base.extend({ type: z.literal("network.response"), requestId: z.string(), status: z.number(), statusText: z.string().optional(), durationMs: z.number(), responseHeaders: z.array(HttpHeaderSchema).optional(), responseBody: z.string().optional(), contentType: z.string().optional(), size: z.number().optional(), errorType: z.enum(["timeout", "abort", "cors", "network-error"]).optional() }),
  base.extend({ type: z.literal("screenshot.captured"), fileId: z.string(), dataUrl: z.string().optional() }),
]);

export const BrowserCommandSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("capture.visibleTab") }),
  base.extend({ type: z.literal("highlight.element"), selector: z.string() }),
  base.extend({ type: z.literal("click"), selector: z.string() }),
  base.extend({ type: z.literal("type"), selector: z.string(), text: z.string() }),
  base.extend({ type: z.literal("read.dom"), selector: z.string().optional() }),
  base.extend({ type: z.literal("get.pageContext") }),
]);
