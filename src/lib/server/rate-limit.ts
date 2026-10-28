import "server-only";

type Counter = { count: number; resetAt: number };

const counters = new Map<string, Counter>();

/** Process-local guard for this POC. Replace with shared storage before horizontal scaling. */
export function allowRequest(key: string, limit = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
