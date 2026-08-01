import "server-only";

type Entry = { count: number; resetAt: number };

const globalForRateLimit = globalThis as typeof globalThis & {
  __argusRateLimits?: Map<string, Entry>;
};

const store =
  globalForRateLimit.__argusRateLimits ??
  (globalForRateLimit.__argusRateLimits = new Map<string, Entry>());

function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRateLimit(
  request: Request,
  namespace: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();

  // Avoid unbounded growth in long-running development/server processes.
  if (store.size > 5_000) {
    for (const [storedKey, entry] of store) {
      if (entry.resetAt <= now) store.delete(storedKey);
    }
  }

  const key = `${namespace}:${clientAddress(request)}`;
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfter: 0,
  };
}
