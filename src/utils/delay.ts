export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getBackoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = baseMs * 2 ** attempt;
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, maxMs);
}

/** Retry-After puede venir en segundos o como fecha HTTP (RFC 7231). */
export function parseRetryAfterMs(headerValue: string | undefined): number | null {
  if (!headerValue) return null;

  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds)) return seconds * 1000;

  const date = new Date(headerValue).getTime();
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());

  return null;
}

export function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 150);
}
