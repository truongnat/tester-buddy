import { z } from "zod";
import { BrowserEventSchema, BrowserCommandSchema, HttpHeaderSchema } from "./schemas";

export type HttpHeader = z.infer<typeof HttpHeaderSchema>;
export type BrowserEvent = z.infer<typeof BrowserEventSchema>;
export type BrowserCommand = z.infer<typeof BrowserCommandSchema>;
