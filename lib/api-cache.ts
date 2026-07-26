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
const LS_PREFIX = "stratix_apicache_";

// localStorage backing store for `persist: true` entries — lets the in-memory
// cache survive a hard reload, not just client-side navigation. Best-effort
// only: every access is try/caught so a full or disabled store just falls
// back to today's always-refetch behavior instead of throwing.
function lsKey(url: string): string {
  return LS_PREFIX + encodeURIComponent(url);
}

function readLS(url: string): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(lsKey(url));
    return raw ? (JSON.parse(raw) as CacheEntry) : null;
  } catch {
    return null;
  }
}

function writeLS(url: string, entry: CacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(lsKey(url), JSON.stringify(entry));
  } catch {
    // Quota exceeded / storage disabled — non-fatal, in-memory cache still works.
  }
}

// Shared lookup used by both cachedFetch and the synchronous peekApiCache
// below — checks the in-memory Map first, promoting a localStorage mirror
// into it on a cold miss when `persist` is set. Returns the entry regardless
// of age; callers that care about freshness check `ts` themselves.
function getEntry(url: string, persist: boolean): CacheEntry | null {
  let hit = cache.get(url);
  if (!hit && persist) {
    const ls = readLS(url);
    if (ls) {
      cache.set(url, ls);
      hit = ls;
    }
  }
  return hit ?? null;
}

function getFreshEntry(url: string, ttlMs: number, persist: boolean): CacheEntry | null {
  const hit = getEntry(url, persist);
  return hit && Date.now() - hit.ts < ttlMs ? hit : null;
}

/**
 * Fetch JSON from `url`, serving a cached copy if it's younger than `ttlMs`.
 * Pass `force: true` to bypass the cache and refresh it (used after mutations
 * or on an explicit user-triggered reload). Pass `persist: true` to also mirror
 * the entry to localStorage so it survives a hard reload.
 */
export async function cachedFetch<T = unknown>(
  url: string,
  opts: { ttlMs?: number; force?: boolean; init?: RequestInit; persist?: boolean } = {}
): Promise<T> {
  const { ttlMs = DEFAULT_TTL_MS, force = false, init, persist = false } = opts;

  if (!force) {
    const hit = getFreshEntry(url, ttlMs, persist);
    if (hit) return hit.data as T;
    const pending = inflight.get(url);
    if (pending) return pending as Promise<T>;
  }

  const promise = fetch(url, init)
    .then((res) => res.json())
    .then((data) => {
      const entry = { data, ts: Date.now() };
      cache.set(url, entry);
      if (persist) writeLS(url, entry);
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

/** Drop every cache entry whose URL starts with `prefix` (e.g. "/api/trade"),
 * including any persisted localStorage mirror — otherwise a stale snapshot
 * would resurrect on the next hard reload after a mutation. */
export function invalidateApiCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  if (typeof window === "undefined") return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LS_PREFIX)) continue;
      const url = decodeURIComponent(key.slice(LS_PREFIX.length));
      if (url.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    // Storage disabled — in-memory invalidation above still took effect.
  }
}

/** Synchronously check for a cached entry (in-memory, or in localStorage when
 * `persist: true`) without triggering a network request. Use this to seed
 * initial component state and to decide whether a reload needs to show a
 * loading spinner at all.
 *
 * By default this only returns entries younger than `ttlMs` (same freshness
 * rule `cachedFetch` uses to decide whether to skip the network). Pass
 * `allowStale: true` for the "show something instantly" use case — any last
 * known value, however old, so the UI never blocks on a spinner when it has
 * data to display; the paired `cachedFetch` call still runs independently
 * and will hit the network itself once that same data is stale, silently
 * swapping in the fresh copy when it resolves. */
export function peekApiCache<T = unknown>(
  url: string,
  opts: { ttlMs?: number; persist?: boolean; allowStale?: boolean } = {}
): T | null {
  const { ttlMs = DEFAULT_TTL_MS, persist = false, allowStale = false } = opts;
  const hit = allowStale ? getEntry(url, persist) : getFreshEntry(url, ttlMs, persist);
  return hit ? (hit.data as T) : null;
}

/** Seed the cache directly — used when a page already has fresh data (e.g.
 * from an optimistic update) and wants later reads to see it immediately.
 * Pass `persist: true` to also mirror it to localStorage. */
export function primeApiCache(url: string, data: unknown, persist = false): void {
  const entry = { data, ts: Date.now() };
  cache.set(url, entry);
  if (persist) writeLS(url, entry);
}
