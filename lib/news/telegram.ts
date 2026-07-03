import type { RawItem } from "./types";

// ─── Telegram public channel previews — reliable X/Twitter alternative ────────
// Nitter instances (community Twitter frontends) are routinely blocked for
// requests coming from cloud/datacenter IP ranges (AWS, GCP, Vercel, etc.) —
// this is exactly why an X-fetch fallback via Nitter worked from a local dev
// machine but failed once deployed. Telegram's public channel preview
// (t.me/s/<channel>) is NOT IP-blocked this way — it's the same mechanism
// link-preview bots and countless news aggregators rely on — so it works
// identically whether the request originates from a residential IP or a
// serverless function on Vercel. X/Twitter fetching has been removed
// entirely in favor of this channel.
//
// These channels were hand-verified to be ACTIVELY posting (same-day
// timestamps) and to carry the same "fast breaking market alert" content
// the original X accounts (FirstSquawk, KobeissiLetter, etc.) provided.
// Two earlier candidates (TreeNewsFeed, KobeissiLetter's Telegram mirror)
// turned out to be abandoned — last posts from weeks/over a year ago — and
// were dropped rather than silently degrading "latest news" coverage.
//   - financialjuice      : squawk-style breaking financial/macro headlines
//   - marketfeed          : breaking geopolitical/macro alerts
//   - WatcherGuru         : crypto/macro breaking alerts
//   - WalterBloomberg     : high-signal breaking geopolitical/financial news
//   - cryptoquant_official: on-chain crypto analysis (BTC/ETH specific)

export const TELEGRAM_CHANNELS = [
  "financialjuice",
  "marketfeed",
  "WatcherGuru",
  "WalterBloomberg",
  "cryptoquant_official",
];

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

interface ParsedPage {
  items: RawItem[]; // oldest → newest, as they appear in the page
  earliestId: string | null;
}

function parseTelegramHtml(html: string, channel: string): ParsedPage {
  if (!html.includes("tgme_widget_message")) return { items: [], earliestId: null };

  // Locate each message by its unique "data-post" anchor, then slice the
  // HTML between consecutive anchors to isolate that message's block.
  const postRegex = /data-post="([^/"]+)\/(\d+)"/g;
  const posts: { channel: string; id: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = postRegex.exec(html)) !== null) {
    posts.push({ channel: m[1], id: m[2], index: m.index });
  }
  if (posts.length === 0) return { items: [], earliestId: null };

  const items: RawItem[] = [];
  for (let i = 0; i < posts.length; i++) {
    const start = posts[i].index;
    const end = i + 1 < posts.length ? posts[i + 1].index : html.length;
    const block = html.slice(start, end);

    const textMatch = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/.exec(block);
    if (!textMatch) continue;
    const timeMatch = /<time datetime="([^"]+)"/.exec(block);

    const text = decodeHtmlEntities(
      textMatch[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, "")
    ).trim();

    if (text.length < 15) continue; // skip media-only / empty posts

    items.push({
      title: text.length > 300 ? text.slice(0, 300) + "…" : text,
      link: `https://t.me/${posts[i].channel}/${posts[i].id}`,
      pubDate: timeMatch ? timeMatch[1] : "",
      source: `TG/${channel}`,
    });
  }

  // Telegram's preview page lists messages oldest→newest — the first post's
  // ID is the earliest on this page, used as the `before` cursor to page
  // further back in time.
  return { items, earliestId: posts[0].id };
}

async function fetchTelegramPageOnce(channel: string, beforeId: string | undefined, timeoutMs: number): Promise<ParsedPage> {
  const url = beforeId
    ? `https://t.me/s/${channel}?before=${beforeId}`
    : `https://t.me/s/${channel}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return { items: [], earliestId: null };
  const html = await res.text();
  return parseTelegramHtml(html, channel);
}

// One retry with a short backoff — the preview endpoint occasionally times out
// or hiccups under load; a single automatic retry meaningfully cuts down how
// often a channel (or all of them) comes back empty for no real reason.
async function fetchTelegramPage(channel: string, beforeId?: string, timeoutMs = 6000): Promise<ParsedPage> {
  try {
    const first = await fetchTelegramPageOnce(channel, beforeId, timeoutMs);
    if (first.items.length > 0) return first;
    await new Promise((r) => setTimeout(r, 400));
    return await fetchTelegramPageOnce(channel, beforeId, timeoutMs);
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 400));
      return await fetchTelegramPageOnce(channel, beforeId, timeoutMs);
    } catch {
      return { items: [], earliestId: null };
    }
  }
}

/** Quick single-page fetch (~20 most recent messages per channel) for the main news list. */
export async function fetchTelegramChannel(channel: string, timeoutMs = 6000): Promise<RawItem[]> {
  const { items } = await fetchTelegramPage(channel, undefined, timeoutMs);
  return [...items].reverse(); // newest first
}

/**
 * Paginates a single channel backward in time until messages older than
 * `cutoffMs` are reached (or `maxPages` is hit as a safety cap), so a
 * strict time-window request ("all news from the last 12h") isn't silently
 * truncated to whatever fits on the first ~20-message page — high-frequency
 * channels like financialjuice can post more than that within a few hours.
 */
export async function fetchTelegramChannelSince(
  channel: string,
  cutoffMs: number,
  maxPages = 15
): Promise<RawItem[]> {
  const collected: RawItem[] = [];
  let beforeId: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const { items, earliestId } = await fetchTelegramPage(channel, beforeId);
    if (items.length === 0) break;
    collected.push(...items);

    const oldestOnPage = items[0]; // oldest→newest order
    const oldestTime = oldestOnPage.pubDate ? new Date(oldestOnPage.pubDate).getTime() : NaN;
    if (!isNaN(oldestTime) && oldestTime < cutoffMs) break; // gone far enough back
    if (!earliestId) break;
    beforeId = earliestId;
  }

  return collected
    .filter((item) => {
      const t = item.pubDate ? new Date(item.pubDate).getTime() : NaN;
      return !isNaN(t) && t >= cutoffMs;
    })
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}

export interface TelegramFetchResult {
  items: RawItem[];
  error?: string;
}

/** Quick fetch across all channels — merged and globally sorted by time (not grouped per channel). */
export async function fetchTelegramContent(): Promise<TelegramFetchResult> {
  const results = await Promise.allSettled(
    TELEGRAM_CHANNELS.map((ch) => fetchTelegramChannel(ch))
  );
  const items = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  return {
    items,
    error: items.length === 0 ? "All Telegram channels returned no content" : undefined,
  };
}

/** Full-history fetch across all channels for a strict time window (paginates as needed). */
export async function fetchTelegramContentSince(hours: number): Promise<TelegramFetchResult> {
  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;
  const results = await Promise.allSettled(
    TELEGRAM_CHANNELS.map((ch) => fetchTelegramChannelSince(ch, cutoffMs))
  );
  const items = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  return {
    items,
    error: items.length === 0 ? "All Telegram channels returned no content" : undefined,
  };
}
