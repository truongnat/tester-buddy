export function cleanName(s: string, fallback = "unknown"): string {
  const normalized = String(s || fallback)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (!normalized || normalized === "..") return fallback;
  return normalized;
}

export function safeSend<T>(fn: () => Promise<T>): void {
  fn().catch(() => {});
}
