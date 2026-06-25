export function cleanName(s: string, fallback = "unknown"): string {
  return String(s || fallback).replace(/:/g, "_");
}

export function safeSend<T>(fn: () => Promise<T>): void {
  fn().catch(() => {});
}
