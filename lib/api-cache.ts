// Tiny in-memory GET-response cache shared across pages within a session.
// Lives at module scope so it survives client-side navigation (Next.js keeps
// the JS module alive across route changes) but resets on a hard reload —
// exactly the lifetime we want for "instant on revisit, never stale forever".
interface CacheEntry {
  data: unknown;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
// Dedupe concurrent requests for the same key (e.g. StrictMode double-effects,
// or two components mounting at once) so we never fire the same GET twice.
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 30_000;

/**
 * Fetch JSON from `url`, serving a cached copy if it's younger than `ttlMs`.
 * Pass `force: true` to bypass the cache and refresh it (used after mutations
 * or on an explicit user-triggered reload).
 */
export async function cachedFetch<T = unknown>(
  url: string,
  opts: { ttlMs?: number; force?: boolean; init?: RequestInit } = {}
): Promise<T> {
  const { ttlMs = DEFAULT_TTL_MS, force = false, init } = opts;

  if (!force) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.ts < ttlMs) {
      return hit.data as T;
    }
    const pending = inflight.get(url);
    if (pending) return pending as Promise<T>;
  }

  const promise = fetch(url, init)
    .then((res) => res.json())
    .then((data) => {
      cache.set(url, { data, ts: Date.now() });
      inflight.delete(url);
      return data as T;
    })
    .catch((err) => {
      inflight.delete(url);
      throw err;
    });

  inflight.set(url, promise);
  return promise;
}

/** Drop every cache entry whose URL starts with `prefix` (e.g. "/api/trade"). */
export function invalidateApiCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Seed the cache directly — used when a page already has fresh data (e.g.
 * from an optimistic update) and wants later reads to see it immediately. */
export function primeApiCache(url: string, data: unknown): void {
  cache.set(url, { data, ts: Date.now() });
}
