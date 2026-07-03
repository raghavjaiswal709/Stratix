import type { ScoredItem } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// SEVERITY SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════════════
// Replaces a binary "is this relevant y/n" keyword filter with a graded
// 0–100 impact score. The goal: surface only news that can genuinely move
// gold/forex/crypto, sorted by how hard it can move them — not just news
// that happens to mention a currency ticker.
//
// Score components:
//  1. Source tier      — official central bank / regulator / economic
//                         calendar >> Tier-1 wire >> standard RSS >> blogs
//  2. Severity lexicon  — weighted keyword hits ("crashes" >> "edges up")
//  3. Numeric surprise  — headline contains an actual-vs-forecast number
//                         pattern (the single strongest real market mover)
//  4. CB/regulator ref  — Fed/ECB/BOJ/BOE/FOMC named even in 3rd-party text
//  5. Corroboration     — same story breaking across 3+ independent sources
//                         at once = confirmed major event, not clickbait
//  6. Recency decay     — older news matters less for "what moves markets
//                         right now"
// ═══════════════════════════════════════════════════════════════════════════

// Hard reject — these never surface regardless of any other signal
const NOISE_BLOCKLIST = [
  /\bfrustrat\w*/,
  /\bhom(e|es)\s+buyer/,
  /\bhomebuy\w+/,
  /\btips?\s+for\b/,
  /\bhow\s+to\s+(buy|save|invest|afford|get\s+rich)\b/,
  /\bshould\s+you\s+(buy|sell|invest|own)\b/,
  /\bbest\s+(stocks?|cryptos?|coins?|funds?|etfs?)\s+(to|for)\b/,
  /\b\d+\s+(stocks?|cryptos?|coins?)\s+to\s+(buy|sell|watch|own|avoid)\b/,
  /\bpassive\s+income\b/,
  /\bdividend\s+(pick|king|aristocrat|growth)\b/,
  /\bundervalued\s+stocks?\b/,
  /\bretirement\s+(pick|fund|tip|saving)\b/,
  /\bpersonal\s+finance\b/,
  /\binvesting\s+for\s+beginner/,
  /\bhoroscope\b/,
  /\brecipe\b/,
  /\bcelebrity\b/,
  /\bwedding\b/,
  /\bpregnant\b/,
  /\bdivorce\b/,
  /\blifestyle\b/,
  /\bfashion\b/,
  /\bweather\s+(forecast|update|warning)\b/,
  /\bsports?\s+(bet|score|result)\b/,
];

// EXTREME — genuine shock-magnitude language (weight 14 each, contribution capped)
const EXTREME_KEYWORDS = [
  "crash", "crashes", "crashed", "plunge", "plunges", "plunged", "collapse",
  "collapses", "collapsed", "emergency", "unprecedented", "historic",
  "record high", "record low", "all-time high", "all-time low",
  "surge", "surges", "surged", "soar", "soars", "soared", "panic",
  "meltdown", "shock", "shocks", "shocked", "crisis", "spike", "spikes",
  "halts trading", "circuit breaker", "intervention", "black swan",
  "flash crash", "bank run", "default", "bankruptcy", "insolvent",
];

// HIGH — strong directional / policy-surprise language (weight 8 each)
const HIGH_KEYWORDS = [
  "hawkish surprise", "dovish surprise", "rate hike", "rate cut",
  "beats forecast", "misses forecast", "beats expectations",
  "misses expectations", "sanctions", "war", "invasion", "nuclear",
  "missile", "airstrike", "ceasefire", "coup", "resign", "resigns",
  "resignation", "emergency meeting", "surprise decision", "shutdown",
  "downgrade", "upgrade", "credit rating", "sell-off", "selloff",
  "risk-off", "safe haven demand", "capital controls",
];

// MODERATE — ordinary directional language (weight 3 each)
const MODERATE_KEYWORDS = [
  "rises", "falls", "gains", "drops", "climbs", "slips", "increase",
  "decrease", "rebounds", "recovers", "extends losses", "extends gains",
];

// Central bank / regulator reference — matters even reported 3rd-party
const CENTRAL_BANK_RE = /\b(fed|fomc|federal reserve|ecb|boj|boe|rba|rbnz|snb|pboc|powell|lagarde|ueda|bailey|bank of japan|bank of england|european central bank)\b/i;

// Numeric-surprise pattern: a number/percentage near a comparison word.
// This is the single strongest real-world predictor — "actual vs forecast".
const SURPRISE_RE = /(\d+(\.\d+)?\s?%|\$[\d,]+(\.\d+)?[kmb]?|\b\d+(\.\d+)?[kmb]\b).{0,40}\b(vs\.?|versus|expected|forecast|estimate|consensus|beat|miss|exceeds?|below|above)\b/i;
const SURPRISE_RE_REVERSED = /\b(vs\.?|versus|expected|forecast|estimate|consensus|beat|miss|exceeds?|below|above)\b.{0,40}(\d+(\.\d+)?\s?%|\$[\d,]+(\.\d+)?[kmb]?|\b\d+(\.\d+)?[kmb]\b)/i;

// Source tier weights
const TIER1_WIRE_NAMES = new Set(["Bloomberg", "Reuters", "WSJ Markets", "AP Business", "MarketWatch", "CNBC"]);

export function isHardNoise(title: string): boolean {
  const lower = title.toLowerCase();
  return NOISE_BLOCKLIST.some((p) => p.test(lower));
}

function countWeighted(text: string, keywords: string[], weight: number, cap: number): { score: number; hits: string[] } {
  const lower = text.toLowerCase();
  let score = 0;
  const hits: string[] = [];
  for (const kw of keywords) {
    if (lower.includes(kw)) {
      score += weight;
      hits.push(kw);
      if (score >= cap) break;
    }
  }
  return { score: Math.min(score, cap), hits };
}

export interface ScoreOptions {
  isPrimarySource?: boolean;  // official central bank feed
  isCalendarEvent?: boolean;
  calendarImpact?: "High" | "Medium" | "Low" | "Holiday" | string;
  isTier1Wire?: boolean;
  isXAlert?: boolean; // known fast-breaking X/Twitter accounts
}

export function scoreArticle(
  title: string,
  description: string,
  pubDate: string,
  opts: ScoreOptions = {}
): { score: number; breakdown: string[] } {
  const breakdown: string[] = [];
  let score = 0;

  const text = `${title} ${description || ""}`;

  // ── 1. Source tier ──────────────────────────────────────────────────────
  if (opts.isCalendarEvent) {
    if (opts.calendarImpact === "High") { score += 35; breakdown.push("calendar:high-impact(+35)"); }
    else if (opts.calendarImpact === "Medium") { score += 20; breakdown.push("calendar:medium-impact(+20)"); }
  } else if (opts.isPrimarySource) {
    score += 35;
    breakdown.push("source:central-bank-primary(+35)");
  } else if (opts.isTier1Wire) {
    score += 20;
    breakdown.push("source:tier1-wire(+20)");
  } else if (opts.isXAlert) {
    score += 18;
    breakdown.push("source:x-breaking-alert(+18)");
  } else {
    score += 8;
    breakdown.push("source:standard-rss(+8)");
  }

  // ── 2. Severity lexicon ─────────────────────────────────────────────────
  const extreme = countWeighted(text, EXTREME_KEYWORDS, 14, 30);
  if (extreme.score > 0) { score += extreme.score; breakdown.push(`extreme-lang:${extreme.hits.slice(0, 3).join(",")}(+${extreme.score})`); }

  const high = countWeighted(text, HIGH_KEYWORDS, 8, 24);
  if (high.score > 0) { score += high.score; breakdown.push(`high-lang:${high.hits.slice(0, 3).join(",")}(+${high.score})`); }

  const moderate = countWeighted(text, MODERATE_KEYWORDS, 3, 9);
  if (moderate.score > 0) { score += moderate.score; breakdown.push(`moderate-lang(+${moderate.score})`); }

  // ── 3. Numeric surprise (actual vs forecast pattern) ───────────────────
  if (!opts.isCalendarEvent && (SURPRISE_RE.test(text) || SURPRISE_RE_REVERSED.test(text))) {
    score += 20;
    breakdown.push("numeric-surprise-detected(+20)");
  }

  // ── 4. Central bank / regulator named ──────────────────────────────────
  if (!opts.isPrimarySource && !opts.isCalendarEvent && CENTRAL_BANK_RE.test(text)) {
    score += 10;
    breakdown.push("central-bank-mentioned(+10)");
  }

  // ── 5. Recency decay ────────────────────────────────────────────────────
  if (!opts.isCalendarEvent && pubDate) {
    const t = new Date(pubDate).getTime();
    if (!isNaN(t)) {
      const ageHours = (Date.now() - t) / (1000 * 60 * 60);
      if (ageHours > 48) { score -= 20; breakdown.push("stale:>48h(-20)"); }
      else if (ageHours > 24) { score -= 10; breakdown.push("stale:24-48h(-10)"); }
      else if (ageHours > 6) { score -= 5; breakdown.push("aging:6-24h(-5)"); }
    }
  }

  return { score: Math.max(0, Math.round(score)), breakdown };
}

// Common words that carry no distinguishing signal for story-matching
const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "at", "for", "and", "or", "is",
  "are", "was", "were", "be", "been", "with", "as", "by", "from", "after",
  "over", "amid", "into", "than", "its", "it", "this", "that", "will",
  "has", "have", "had", "not", "but", "up", "down", "out", "new", "says",
  "say", "said", "amp",
]);

// Deliberately crude suffix-stripping — doesn't need to be linguistically
// correct, just needs to normalize the SAME word to the SAME token across
// different headlines ("cuts"/"cut", "rates"/"rate", "announces"/"announced")
// so paraphrased coverage of one story actually overlaps in word-set space.
function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ing") && word.length > 6) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 5) return word.slice(0, -2);
  // "es" is only a plural marker after a sibilant (boxes, glasses, watches,
  // dishes) — otherwise the "e" belongs to the stem (rates → rate, not rat).
  if (/(?:[sxz]|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// Aliases that unify common financial-news abbreviations/synonyms so
// paraphrased coverage of the same event still overlaps ("Fed" vs
// "Federal Reserve", "slashes" vs "cuts").
const TOKEN_ALIASES: Record<string, string> = {
  fed: "federal", fomc: "federal",
  slash: "cut", lower: "cut", trim: "cut",
  hike: "raise", boost: "raise", jump: "raise",
};

function significantWords(title: string): Set<string> {
  // Split digits away from adjacent letters first ("50bps" → "50 bps",
  // "10yr" → "10 yr") so numeric figures — often the strongest signal that
  // multiple outlets are covering the exact same release — become their
  // own tokens instead of being buried inside a unit suffix.
  const spaced = title
    .toLowerCase()
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/[^a-z0-9 ]/g, " ");

  return new Set(
    spaced
      .split(/\s+/)
      .filter((w) => /^\d+$/.test(w) || (w.length >= 3 && !STOPWORDS.has(w)))
      .map((w) => (/^\d+$/.test(w) ? w : TOKEN_ALIASES[stem(w)] ?? stem(w)))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const CORROBORATION_SIMILARITY_THRESHOLD = 0.45;
const CORROBORATION_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h — same news cycle

/**
 * Applies corroboration boost across a whole batch: when the same story
 * — even paraphrased differently by each outlet — appears from 3+ distinct
 * sources within the same news cycle, that's strong evidence of a real,
 * major, confirmed event rather than a single outlet's clickbait. Boost
 * every copy. Uses Jaccard similarity over significant words rather than a
 * rigid title prefix, since real headlines rarely share exact wording.
 */
export function applyCorroborationBoost(items: ScoredItem[]): ScoredItem[] {
  const wordSets = items.map((item) => significantWords(item.title));
  const times = items.map((item) => {
    const t = new Date(item.pubDate).getTime();
    return isNaN(t) ? Date.now() : t;
  });

  // Union-find style clustering: group items whose word-sets overlap enough
  // and whose publish times fall within the same news cycle.
  const clusterOf = new Array(items.length).fill(-1);
  let nextCluster = 0;

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (Math.abs(times[i] - times[j]) > CORROBORATION_WINDOW_MS) continue;
      if (jaccard(wordSets[i], wordSets[j]) < CORROBORATION_SIMILARITY_THRESHOLD) continue;

      if (clusterOf[i] === -1 && clusterOf[j] === -1) {
        clusterOf[i] = clusterOf[j] = nextCluster++;
      } else if (clusterOf[i] === -1) {
        clusterOf[i] = clusterOf[j];
      } else if (clusterOf[j] === -1) {
        clusterOf[j] = clusterOf[i];
      } else if (clusterOf[i] !== clusterOf[j]) {
        // Merge the two clusters
        const from = clusterOf[j];
        const to = clusterOf[i];
        for (let k = 0; k < items.length; k++) if (clusterOf[k] === from) clusterOf[k] = to;
      }
    }
  }

  const sourcesByCluster = new Map<number, Set<string>>();
  clusterOf.forEach((c, i) => {
    if (c === -1) return;
    if (!sourcesByCluster.has(c)) sourcesByCluster.set(c, new Set());
    sourcesByCluster.get(c)!.add(items[i].source);
  });

  return items.map((item, i) => {
    const c = clusterOf[i];
    const sourceCount = c === -1 ? 1 : (sourcesByCluster.get(c)?.size ?? 1);
    if (sourceCount >= 3) {
      return {
        ...item,
        impactScore: item.impactScore + 15,
        scoreBreakdown: [...item.scoreBreakdown, `corroborated:${sourceCount}-sources(+15)`],
      };
    }
    return item;
  });
}

/** Default minimum score for an article to be considered "signal" vs "noise". */
export const DEFAULT_IMPACT_THRESHOLD = 30;

export { TIER1_WIRE_NAMES };
