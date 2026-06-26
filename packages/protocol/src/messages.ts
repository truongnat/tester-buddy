import { z } from "zod";
import { BrowserEventSchema, BrowserCommandSchema, HttpHeaderSchema } from "./schemas";

export type HttpHeader = z.infer<typeof HttpHeaderSchema>;
export type BrowserEvent = z.infer<typeof BrowserEventSchema>;
export type BrowserCommand = z.infer<typeof BrowserCommandSchema>;

export function validateBrowserEvent(data: unknown): BrowserEvent {
  return BrowserEventSchema.parse(data);
}

export function validateBrowserCommand(data: unknown): BrowserCommand {
  return BrowserCommandSchema.parse(data);
}

export function safeParseBrowserEvent(data: unknown): z.SafeParseReturnType<unknown, BrowserEvent> {
  return BrowserEventSchema.safeParse(data);
}

export function safeParseBrowserCommand(data: unknown): z.SafeParseReturnType<unknown, BrowserCommand> {
  return BrowserCommandSchema.safeParse(data);
}
