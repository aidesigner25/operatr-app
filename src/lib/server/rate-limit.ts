import "server-only";
import { createHash } from "node:crypto";

type Counter = { count: number; resetAt: number };
const counters = new Map<string, Counter>();
const SCRIPT = `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n`;

/** Local development fallback only. Production requires the shared Redis service. */
function allowLocal(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    // Remove expired entries to avoid unbounded growth in long-lived development servers.
    if (counters.size > 1000) for (const [name, counter] of counters) if (counter.resetAt <= now) counters.delete(name);
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

/** Atomic fixed-window limit shared by all instances. Production fails closed. */
export async function allowRequest(key: string, limit = 12, windowMs = 60_000): Promise<boolean> {
  const url = process.env.OPERATR_REDIS_REST_URL?.trim();
  const token = process.env.OPERATR_REDIS_REST_TOKEN?.trim();
  if (!url && !token && process.env.NODE_ENV !== "production") return allowLocal(key, limit, windowMs);
  if (!url || !token || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) return false;
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return false;
    // Keep user IDs and other identifiers out of the Redis keyspace.
    const digest = createHash("sha256").update(key).digest("hex");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", SCRIPT, "1", `operatr:rate:${digest}`, String(windowMs)]),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    if (!response.ok) return false;
    const payload = await response.json() as { result?: unknown };
    return Number.isSafeInteger(payload.result) && (payload.result as number) > 0 && (payload.result as number) <= limit;
  } catch {
    return false;
  }
}
