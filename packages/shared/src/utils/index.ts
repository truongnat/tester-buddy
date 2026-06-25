export function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

export function redactSensitive(headers: Record<string, string>): Record<string, string> {
  const REDACT = ["authorization", "cookie", "set-cookie", "x-auth-token"];
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) =>
      REDACT.includes(k.toLowerCase()) ? [k, "[redacted]"] : [k, v]
    )
  );
}
